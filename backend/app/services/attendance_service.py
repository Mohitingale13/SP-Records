import uuid
from datetime import date, datetime
from typing import Optional, Tuple, List
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from app.core.config import settings
from app.core.timezone import (
    utc_now,
    get_current_kolkata_date,
    format_kolkata_time,
    KOLKATA_TZ,
)
from app.models.attendance import AttendanceRecord, AttendanceEventType
from app.models.audit import AttendanceAuditLog, AuditAction
from app.models.user import User
from app.schemas.attendance import (
    AttendanceStatusSummary,
    AttendanceEventSchema,
    OfflineAttendanceItem,
    OfflineSyncResultItem,
    OfflineSyncResponse,
)
from app.services.qr_service import QRCodeService
from app.services.location_service import LocationService


class AttendanceService:
    @staticmethod
    def get_today_records(db: Session, user_id: uuid.UUID, event_date: date) -> List[AttendanceRecord]:
        """Fetches all attendance events recorded for a given staff member on a specific date."""
        return (
            db.query(AttendanceRecord)
            .filter(
                AttendanceRecord.user_id == user_id,
                AttendanceRecord.event_date == event_date,
            )
            .order_by(AttendanceRecord.scanned_at.asc())
            .all()
        )

    @staticmethod
    def resolve_attendance_state(records: List[AttendanceRecord]) -> Tuple[str, Optional[AttendanceEventType]]:
        """
        State Machine Resolver:
        Evaluates existing events for the day and determines:
        1. Current Status (NOT_STARTED, CHECKED_IN, ON_LUNCH_BREAK, RETURNED_FROM_LUNCH, COMPLETED)
        2. Next Expected Event
        """
        event_types = {r.event_type for r in records}

        if AttendanceEventType.OFFICE_OUT.value in event_types:
            return "COMPLETED", None

        if AttendanceEventType.LUNCH_BREAK_IN.value in event_types:
            return "RETURNED_FROM_LUNCH", AttendanceEventType.OFFICE_OUT

        if AttendanceEventType.LUNCH_BREAK_OUT.value in event_types:
            return "ON_LUNCH_BREAK", AttendanceEventType.LUNCH_BREAK_IN

        if AttendanceEventType.OFFICE_IN.value in event_types:
            return "CHECKED_IN", AttendanceEventType.LUNCH_BREAK_OUT

        return "NOT_STARTED", AttendanceEventType.OFFICE_IN

    @staticmethod
    def get_daily_status(
        db: Session, user: User, target_date: Optional[date] = None
    ) -> AttendanceStatusSummary:
        """Computes the full daily status summary for a staff member."""
        if target_date is None:
            target_date = get_current_kolkata_date()

        records = AttendanceService.get_today_records(db, user.id, target_date)
        status, next_event = AttendanceService.resolve_attendance_state(records)

        events_schema = [
            AttendanceEventSchema(
                id=r.id,
                event_type=AttendanceEventType(r.event_type),
                event_date=r.event_date,
                scanned_at=r.scanned_at,
                scanned_at_ist=format_kolkata_time(r.scanned_at),
                is_manually_corrected=r.is_manually_corrected,
                verified_distance_meters=r.verified_distance_meters,
                reported_accuracy_meters=r.reported_accuracy_meters,
                verification_method=r.verification_method,
            )
            for r in records
        ]

        return AttendanceStatusSummary(
            date=target_date,
            status=status,
            next_expected_event=next_event,
            events=events_schema,
            is_completed=(status == "COMPLETED"),
        )

    @staticmethod
    def process_qr_scan(
        db: Session,
        user: User,
        qr_token: str,
        latitude: float,
        longitude: float,
        accuracy: float,
        location_timestamp: Optional[datetime] = None,
        client_ip: Optional[str] = None,
    ) -> Tuple[Optional[AttendanceEventSchema], Optional[str]]:
        """
        Executes an attendance scan with server-side physical presence verification:
        1. Determines today's working date (Asia/Kolkata).
        2. Resolves state machine & next expected event.
        3. Enforces debounce/rapid-scan protection.
        4. Validates GPS geofence against registered Shivam Patsanstha office.
        5. Validates optional office Wi-Fi allowlist if enabled.
        6. Validates & claims the rotating QR token.
        7. Persists the new AttendanceRecord transactionally with verification metadata.
        """
        today_date = get_current_kolkata_date()
        today_records = AttendanceService.get_today_records(db, user.id, today_date)
        current_status, next_event = AttendanceService.resolve_attendance_state(today_records)

        if current_status == "COMPLETED" or next_event is None:
            return None, "You have already completed your daily attendance cycle for today."

        now = utc_now()

        # Rapid scan protection: Check spacing against the most recent event today
        if today_records:
            last_record = today_records[-1]
            last_scanned = last_record.scanned_at
            if last_scanned.tzinfo is None:
                last_scanned = last_scanned.replace(tzinfo=now.tzinfo)
            elapsed_seconds = (now - last_scanned).total_seconds()
            if elapsed_seconds < settings.SCAN_MIN_INTERVAL_SECONDS:
                return None, f"Rapid scan detected. Please wait {int(settings.SCAN_MIN_INTERVAL_SECONDS - elapsed_seconds)} more seconds."

        # Physical presence geofencing validation (Server-Side Authority)
        office_lat, office_lon, radius = LocationService.get_office_geofence(
            db, str(user.organization_id)
        )
        loc_valid, distance, loc_err = LocationService.validate_location(
            latitude=latitude,
            longitude=longitude,
            accuracy=accuracy,
            location_timestamp=location_timestamp,
            office_lat=office_lat,
            office_lon=office_lon,
            geofence_radius=radius,
        )
        if not loc_valid:
            return None, loc_err

        # Optional Office Wi-Fi / IP restriction check
        if client_ip:
            ip_valid, ip_err = LocationService.validate_client_ip(client_ip)
            if not ip_valid:
                return None, ip_err

        # Validate rotating HMAC QR token
        is_valid, nonce, error_msg = QRCodeService.validate_and_claim_token(
            db, qr_token, user, next_event.value
        )
        if not is_valid:
            db.rollback()
            return None, error_msg

        # Record attendance event with physical presence metadata
        new_record = AttendanceRecord(
            user_id=user.id,
            organization_id=user.organization_id,
            event_type=next_event.value,
            event_date=today_date,
            scanned_at=now,
            source_qr_nonce=nonce,
            is_manually_corrected=False,
            verified_distance_meters=round(distance, 1) if distance is not None else None,
            reported_accuracy_meters=round(accuracy, 1),
            client_ip=client_ip,
            verification_method="QR_GPS",
        )
        db.add(new_record)

        try:
            db.commit()
            db.refresh(new_record)
        except IntegrityError:
            db.rollback()
            return None, "A conflict occurred while recording your attendance event. Please refresh and check your status."

        event_schema = AttendanceEventSchema(
            id=new_record.id,
            event_type=AttendanceEventType(new_record.event_type),
            event_date=new_record.event_date,
            scanned_at=new_record.scanned_at,
            scanned_at_ist=format_kolkata_time(new_record.scanned_at),
            is_manually_corrected=new_record.is_manually_corrected,
            verified_distance_meters=new_record.verified_distance_meters,
            reported_accuracy_meters=new_record.reported_accuracy_meters,
            verification_method=new_record.verification_method,
        )

        return event_schema, None

    @staticmethod
    def admin_manual_add_event(
        db: Session,
        admin_user: User,
        target_user_id: uuid.UUID,
        event_type: AttendanceEventType,
        event_date: date,
        scanned_at: datetime,
        reason: str,
    ) -> Tuple[Optional[AttendanceRecord], Optional[str]]:
        """
        Allows an Admin to manually add an attendance event with mandatory reason.
        Enforces composite uniqueness and records an audit log.
        Marks verification_method as MANUAL_ADMIN.
        """
        target_user = db.query(User).filter(User.id == target_user_id).first()
        if not target_user:
            return None, "Target staff member not found."

        if target_user.role and target_user.role.name == "SUPER_ADMIN":
            return None, "Super Administrators are exempt from personal attendance recording."

        # Check for existing record
        existing = (
            db.query(AttendanceRecord)
            .filter(
                AttendanceRecord.user_id == target_user_id,
                AttendanceRecord.event_date == event_date,
                AttendanceRecord.event_type == event_type.value,
            )
            .first()
        )
        if existing:
            return None, f"An attendance event of type '{event_type.value}' already exists for this date."

        # Defensive timezone normalization: if naive, treat as Kolkata time (IST)
        if scanned_at.tzinfo is None:
            scanned_at = scanned_at.replace(tzinfo=KOLKATA_TZ)

        new_record = AttendanceRecord(
            user_id=target_user_id,
            organization_id=target_user.organization_id,
            event_type=event_type.value,
            event_date=event_date,
            scanned_at=scanned_at,
            is_manually_corrected=True,
            verified_distance_meters=None,
            reported_accuracy_meters=None,
            client_ip=None,
            verification_method="MANUAL_ADMIN",
        )
        db.add(new_record)
        db.flush()

        # Audit Log
        audit_log = AttendanceAuditLog(
            attendance_record_id=new_record.id,
            actor_user_id=admin_user.id,
            action=AuditAction.MANUAL_ADDITION.value,
            reason=reason.strip(),
            previous_state=None,
            new_state={
                "event_type": new_record.event_type,
                "event_date": str(new_record.event_date),
                "scanned_at": new_record.scanned_at.isoformat(),
                "verification_method": "MANUAL_ADMIN",
            },
        )
        db.add(audit_log)
        db.commit()
        db.refresh(new_record)

        return new_record, None

    @staticmethod
    def admin_correct_event(
        db: Session,
        admin_user: User,
        record_id: uuid.UUID,
        new_event_type: Optional[AttendanceEventType],
        new_scanned_at: Optional[datetime],
        reason: str,
    ) -> Tuple[Optional[AttendanceRecord], Optional[str]]:
        """
        Allows an Admin to adjust an existing attendance record with mandatory reason.
        Captures full before/after snapshots in the audit log.
        """
        record = db.query(AttendanceRecord).filter(AttendanceRecord.id == record_id).first()
        if not record:
            return None, "Attendance record not found."

        previous_state = {
            "event_type": record.event_type,
            "event_date": str(record.event_date),
            "scanned_at": record.scanned_at.isoformat(),
            "is_manually_corrected": record.is_manually_corrected,
            "verification_method": record.verification_method,
        }

        if new_event_type:
            # Check for conflict if changing event type
            if new_event_type.value != record.event_type:
                conflict = (
                    db.query(AttendanceRecord)
                    .filter(
                        AttendanceRecord.user_id == record.user_id,
                        AttendanceRecord.event_date == record.event_date,
                        AttendanceRecord.event_type == new_event_type.value,
                        AttendanceRecord.id != record.id,
                    )
                    .first()
                )
                if conflict:
                    return None, f"An event of type '{new_event_type.value}' already exists on this date."
                record.event_type = new_event_type.value

        if new_scanned_at:
            # Defensive timezone normalization: if naive, treat as Kolkata time (IST)
            if new_scanned_at.tzinfo is None:
                new_scanned_at = new_scanned_at.replace(tzinfo=KOLKATA_TZ)
            record.scanned_at = new_scanned_at

        record.is_manually_corrected = True

        new_state = {
            "event_type": record.event_type,
            "event_date": str(record.event_date),
            "scanned_at": record.scanned_at.isoformat(),
            "is_manually_corrected": record.is_manually_corrected,
            "verification_method": record.verification_method,
        }

        audit_log = AttendanceAuditLog(
            attendance_record_id=record.id,
            actor_user_id=admin_user.id,
            action=AuditAction.CORRECTION.value,
            reason=reason.strip(),
            previous_state=previous_state,
            new_state=new_state,
        )
        db.add(audit_log)
        db.commit()
        db.refresh(record)

        return record, None

    @staticmethod
    def process_offline_sync(
        db: Session,
        user: User,
        events: List[OfflineAttendanceItem],
        client_ip: Optional[str] = None,
    ) -> OfflineSyncResponse:
        """
        Batch-processes offline attendance events queued while the client device had no internet:
        1. Chronologically sorts incoming offline events by scanned_at.
        2. Validates physical presence via Haversine distance against registered office coordinates.
        3. Enforces GPS accuracy and location freshness relative to the scan timestamp.
        4. Validates state machine order and deduplicates already synced events.
        5. Persists records with verification_method='OFFLINE_GPS'.
        """
        sorted_events = sorted(events, key=lambda e: e.scanned_at)

        office_lat, office_lon, radius = LocationService.get_office_geofence(
            db, str(user.organization_id)
        )

        results: List[OfflineSyncResultItem] = []
        synced_count = 0
        already_exists_count = 0
        failed_count = 0

        for item in sorted_events:
            # 1. Determine calendar date in IST
            scan_time = item.scanned_at
            if scan_time.tzinfo is None:
                scan_time = scan_time.replace(tzinfo=KOLKATA_TZ)
            event_date = scan_time.astimezone(KOLKATA_TZ).date()

            # 2. Check if this exact event type is already recorded on this date
            existing = (
                db.query(AttendanceRecord)
                .filter(
                    AttendanceRecord.user_id == user.id,
                    AttendanceRecord.event_date == event_date,
                    AttendanceRecord.event_type == item.event_type.value,
                )
                .first()
            )
            if existing:
                results.append(
                    OfflineSyncResultItem(
                        offline_id=item.offline_id,
                        status="ALREADY_EXISTS",
                        message=f"{item.event_type.value} was already recorded for {event_date}.",
                        event=AttendanceEventSchema(
                            id=existing.id,
                            event_type=AttendanceEventType(existing.event_type),
                            event_date=existing.event_date,
                            scanned_at=existing.scanned_at,
                            scanned_at_ist=format_kolkata_time(existing.scanned_at),
                            is_manually_corrected=existing.is_manually_corrected,
                            verified_distance_meters=existing.verified_distance_meters,
                            reported_accuracy_meters=existing.reported_accuracy_meters,
                            verification_method=existing.verification_method,
                        ),
                    )
                )
                already_exists_count += 1
                continue

            # 3. Validate GPS physical presence at the time of the scan
            loc_valid, distance, loc_err = LocationService.validate_location(
                latitude=item.latitude,
                longitude=item.longitude,
                accuracy=item.accuracy,
                location_timestamp=item.location_timestamp,
                office_lat=office_lat,
                office_lon=office_lon,
                geofence_radius=radius,
                reference_time=scan_time,
            )
            if not loc_valid:
                results.append(
                    OfflineSyncResultItem(
                        offline_id=item.offline_id,
                        status="REJECTED",
                        message=loc_err or "GPS location verification failed.",
                    )
                )
                failed_count += 1
                continue

            # 4. Enforce state machine ordering
            today_records = AttendanceService.get_today_records(db, user.id, event_date)
            status, next_expected = AttendanceService.resolve_attendance_state(today_records)

            if next_expected is not None and item.event_type != next_expected:
                results.append(
                    OfflineSyncResultItem(
                        offline_id=item.offline_id,
                        status="REJECTED",
                        message=f"Sequence conflict: expected '{next_expected.value}', but received '{item.event_type.value}'.",
                    )
                )
                failed_count += 1
                continue

            # 5. Persist the attendance record
            record = AttendanceRecord(
                user_id=user.id,
                organization_id=user.organization_id,
                event_type=item.event_type.value,
                event_date=event_date,
                scanned_at=scan_time,
                source_qr_nonce=item.qr_token[:50] if item.qr_token else "OFFLINE_SYNC",
                is_manually_corrected=False,
                verified_distance_meters=round(distance, 1) if distance is not None else None,
                reported_accuracy_meters=round(item.accuracy, 1),
                client_ip=client_ip,
                verification_method="OFFLINE_GPS",
            )
            db.add(record)
            try:
                db.commit()
                db.refresh(record)
            except IntegrityError:
                db.rollback()
                results.append(
                    OfflineSyncResultItem(
                        offline_id=item.offline_id,
                        status="ALREADY_EXISTS",
                        message=f"{item.event_type.value} was already recorded for {event_date}.",
                    )
                )
                already_exists_count += 1
                continue

            event_schema = AttendanceEventSchema(
                id=record.id,
                event_type=AttendanceEventType(record.event_type),
                event_date=record.event_date,
                scanned_at=record.scanned_at,
                scanned_at_ist=format_kolkata_time(record.scanned_at),
                is_manually_corrected=record.is_manually_corrected,
                verified_distance_meters=record.verified_distance_meters,
                reported_accuracy_meters=record.reported_accuracy_meters,
                verification_method=record.verification_method,
            )

            results.append(
                OfflineSyncResultItem(
                    offline_id=item.offline_id,
                    status="SYNCED",
                    message="Attendance successfully synced from offline buffer.",
                    event=event_schema,
                )
            )
            synced_count += 1

        return OfflineSyncResponse(
            synced_count=synced_count,
            already_exists_count=already_exists_count,
            failed_count=failed_count,
            results=results,
        )
