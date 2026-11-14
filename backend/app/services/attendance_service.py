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
)
from app.models.attendance import AttendanceRecord, AttendanceEventType
from app.models.audit import AttendanceAuditLog, AuditAction
from app.models.user import User
from app.schemas.attendance import (
    AttendanceStatusSummary,
    AttendanceEventSchema,
)
from app.services.qr_service import QRCodeService


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
        db: Session, user: User, qr_token: str
    ) -> Tuple[Optional[AttendanceEventSchema], Optional[str]]:
        """
        Executes an attendance scan:
        1. Determines today's working date (Asia/Kolkata).
        2. Resolves state machine & next expected event.
        3. Enforces debounce/rapid-scan protection.
        4. Validates & claims the rotating QR token.
        5. Persists the new AttendanceRecord transactionally.
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

        # Validate QR token
        is_valid, nonce, error_msg = QRCodeService.validate_and_claim_token(
            db, qr_token, user, next_event.value
        )
        if not is_valid:
            db.rollback()
            return None, error_msg

        # Record attendance event
        new_record = AttendanceRecord(
            user_id=user.id,
            organization_id=user.organization_id,
            event_type=next_event.value,
            event_date=today_date,
            scanned_at=now,
            source_qr_nonce=nonce,
            is_manually_corrected=False,
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
        """
        target_user = db.query(User).filter(User.id == target_user_id).first()
        if not target_user:
            return None, "Target staff member not found."

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

        new_record = AttendanceRecord(
            user_id=target_user_id,
            organization_id=target_user.organization_id,
            event_type=event_type.value,
            event_date=event_date,
            scanned_at=scanned_at,
            is_manually_corrected=True,
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
            record.scanned_at = new_scanned_at

        record.is_manually_corrected = True

        new_state = {
            "event_type": record.event_type,
            "event_date": str(record.event_date),
            "scanned_at": record.scanned_at.isoformat(),
            "is_manually_corrected": record.is_manually_corrected,
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
