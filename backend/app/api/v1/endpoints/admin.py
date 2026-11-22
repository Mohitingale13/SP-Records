import uuid
from typing import List, Optional, Dict, Any
from datetime import date, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.api.v1.deps import require_admin, require_super_admin
from app.models.user import User
from app.models.role import Role, RoleName
from app.models.organization import Organization
from app.models.attendance import AttendanceRecord, AttendanceEventType
from app.models.audit import AttendanceAuditLog
from app.schemas.auth import AdminResetPinRequest
from app.schemas.user import UserSchema, UserUpdateRoleRequest
from app.schemas.attendance import (
    AttendanceManualCreateRequest,
    AttendanceCorrectionRequest,
    AttendanceEventSchema,
    AttendanceStatusSummary,
    OfficeLocationResponse,
    OfficeLocationUpdateRequest,
)
from app.schemas.audit import AuditLogSchema
from app.services.attendance_service import AttendanceService
from app.services.auth_service import AuthService
from app.services.report_service import ReportService, format_report_date
from app.services.location_service import LocationService
from app.core.config import settings
from app.core.timezone import get_current_kolkata_date, format_kolkata_time

router = APIRouter(prefix="/admin", tags=["Administration"])


@router.get("/staff", response_model=List[UserSchema], summary="List all staff members in the organization")
def list_staff(
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    # Super Admin is purely for executive settings and is completely excluded from operational staff lists
    query = (
        db.query(User)
        .join(Role, User.role_id == Role.id)
        .filter(
            User.organization_id == current_admin.organization_id,
            Role.name != RoleName.SUPER_ADMIN.value,
        )
    )

    return query.order_by(User.full_name.asc()).all()


@router.get("/daily-monitor", summary="View live real-time attendance matrix for all staff")
def get_daily_monitor(
    target_date: Optional[date] = Query(None, description="Date to inspect (default: today)"),
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    """
    Returns the attendance overview for all staff on target_date,
    categorizing present, on break, completed, and not started.
    Excludes Super Admin since Super Admin personal attendance is exempt.
    """
    if target_date is None:
        target_date = get_current_kolkata_date()

    staff_members = (
        db.query(User)
        .join(Role, User.role_id == Role.id)
        .filter(
            User.organization_id == current_admin.organization_id,
            User.is_active == True,
            Role.name != RoleName.SUPER_ADMIN.value,
        )
        .order_by(User.full_name.asc())
        .all()
    )

    results = []
    summary_counts = {
        "total_staff": len(staff_members),
        "present": 0,
        "on_break": 0,
        "completed": 0,
        "not_started": 0,
    }

    for staff in staff_members:
        status_info = AttendanceService.get_daily_status(db, staff, target_date)
        if status_info.status == "NOT_STARTED":
            summary_counts["not_started"] += 1
        elif status_info.status in ["CHECKED_IN", "RETURNED_FROM_LUNCH"]:
            summary_counts["present"] += 1
        elif status_info.status == "ON_LUNCH_BREAK":
            summary_counts["on_break"] += 1
        elif status_info.status == "COMPLETED":
            summary_counts["completed"] += 1

        results.append({
            "user": {
                "id": str(staff.id),
                "full_name": staff.full_name,
                "phone_number": staff.phone_number,
                "role": staff.role.name,
            },
            "status": status_info.status,
            "next_expected_event": status_info.next_expected_event,
            "is_completed": status_info.is_completed,
            "events": status_info.events,
        })

    return {
        "date": target_date,
        "counts": summary_counts,
        "staff_attendance": results,
    }


@router.get("/irregularities", summary="List all attendance irregularities across past days")
def list_irregularities(
    days: int = Query(30, ge=1, le=90, description="Number of past days to check for irregularities"),
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    """
    Returns an audit list of all attendance irregularities across staff members:
    - Missing Check-Out: Staff checked in, but never checked out of the day.
    - Day Not Marked: Staff member has 0 attendance records on a date when the office operated.
    - Incomplete Break: Staff member left for lunch break, but never marked lunch return.
    """
    today = get_current_kolkata_date()
    start_date = today - timedelta(days=days)

    staff_members = (
        db.query(User)
        .join(Role, User.role_id == Role.id)
        .filter(
            User.organization_id == current_admin.organization_id,
            User.is_active == True,
            Role.name != RoleName.SUPER_ADMIN.value,
        )
        .order_by(User.full_name.asc())
        .all()
    )

    if not staff_members:
        return {
            "total_irregularities": 0,
            "missing_checkouts_count": 0,
            "not_marked_count": 0,
            "irregularities": [],
        }

    records = (
        db.query(AttendanceRecord)
        .filter(
            AttendanceRecord.organization_id == current_admin.organization_id,
            AttendanceRecord.event_date >= start_date,
            AttendanceRecord.event_date <= today,
        )
        .order_by(AttendanceRecord.event_date.desc(), AttendanceRecord.scanned_at.asc())
        .all()
    )

    # Group records by (user_id, event_date) -> dict of event_type: AttendanceRecord
    day_user_events: Dict[tuple, Dict[str, AttendanceRecord]] = {}
    for r in records:
        key = (r.user_id, r.event_date)
        if key not in day_user_events:
            day_user_events[key] = {}
        day_user_events[key][r.event_type] = r

    # Determine which dates had office activity (at least one staff punch)
    active_dates = set(r.event_date for r in records)

    irregularities = []
    missing_checkouts_count = 0
    not_marked_count = 0

    candidate_dates = sorted(list(active_dates), reverse=True)

    # Also include recent working weekdays in the last 7 days even if no records yet
    for i in range(min(days, 7)):
        past_d = today - timedelta(days=i)
        if past_d.weekday() < 6 and past_d not in active_dates:
            candidate_dates.append(past_d)
    candidate_dates = sorted(list(set(candidate_dates)), reverse=True)

    for check_date in candidate_dates:
        is_past_day = check_date < today
        date_records_exist = check_date in active_dates

        # If it's a past date with 0 records across the entire organization, it was a closed holiday
        if is_past_day and not date_records_exist:
            continue

        for staff in staff_members:
            punches = day_user_events.get((staff.id, check_date), {})
            in_evt = punches.get(AttendanceEventType.OFFICE_IN.value)
            l_out_evt = punches.get(AttendanceEventType.LUNCH_BREAK_OUT.value)
            l_in_evt = punches.get(AttendanceEventType.LUNCH_BREAK_IN.value)
            out_evt = punches.get(AttendanceEventType.OFFICE_OUT.value)

            events_payload = [
                {
                    "id": str(e.id),
                    "event_type": e.event_type,
                    "scanned_at": e.scanned_at.isoformat(),
                    "scanned_at_ist": format_kolkata_time(e.scanned_at),
                    "is_manually_corrected": e.is_manually_corrected,
                }
                for e in sorted(punches.values(), key=lambda x: x.scanned_at)
            ]

            # Case 1: Staff member has NO records on this active working day
            if len(punches) == 0:
                if is_past_day and date_records_exist:
                    not_marked_count += 1
                    irregularities.append({
                        "id": f"{staff.id}_{check_date.isoformat()}_NOT_MARKED",
                        "date": check_date.isoformat(),
                        "date_formatted": check_date.strftime("%d %b %Y (%a)"),
                        "date_formatted_mr": format_report_date(check_date, is_marathi=True),
                        "user_id": str(staff.id),
                        "user_name": staff.full_name,
                        "user_phone": staff.phone_number,
                        "user_role": staff.role.name,
                        "type": "NOT_MARKED",
                        "severity": "warning",
                        "title": "Day Not Marked",
                        "title_mr": "दिवसाची हजेरी नोंद नाही (गैरहजर)",
                        "description": "No attendance was recorded on this working day.",
                        "description_mr": "या दिवशी कर्मचाऱ्याची कोणतीही हजेरी नोंद झालेली नाही.",
                        "in_time": None,
                        "out_time": None,
                        "events": [],
                    })
                continue

            # Case 2: Checked in, but missing checkout
            if in_evt and not out_evt:
                if is_past_day:
                    missing_checkouts_count += 1
                    in_time_str = format_kolkata_time(in_evt.scanned_at)
                    irregularities.append({
                        "id": f"{staff.id}_{check_date.isoformat()}_MISSING_CHECKOUT",
                        "date": check_date.isoformat(),
                        "date_formatted": check_date.strftime("%d %b %Y (%a)"),
                        "date_formatted_mr": format_report_date(check_date, is_marathi=True),
                        "user_id": str(staff.id),
                        "user_name": staff.full_name,
                        "user_phone": staff.phone_number,
                        "user_role": staff.role.name,
                        "type": "MISSING_CHECKOUT",
                        "severity": "danger",
                        "title": "Missing Check-Out",
                        "title_mr": "निर्गमन नोंद नाही (Check-Out विसरले)",
                        "description": f"Checked in at {in_time_str}, but forgot to check out.",
                        "description_mr": f"सकाळी {in_time_str} वाजता आगमन नोंदवले, पण जाताना निर्गमन नोंद नाही.",
                        "in_time": in_time_str,
                        "out_time": None,
                        "events": events_payload,
                    })

            # Case 3: Incomplete lunch break (went on lunch, never marked return, but punched out)
            elif l_out_evt and not l_in_evt and out_evt:
                l_out_time_str = format_kolkata_time(l_out_evt.scanned_at)
                irregularities.append({
                    "id": f"{staff.id}_{check_date.isoformat()}_INCOMPLETE_BREAK",
                    "date": check_date.isoformat(),
                    "date_formatted": check_date.strftime("%d %b %Y (%a)"),
                    "date_formatted_mr": format_report_date(check_date, is_marathi=True),
                    "user_id": str(staff.id),
                    "user_name": staff.full_name,
                    "user_phone": staff.phone_number,
                    "user_role": staff.role.name,
                    "type": "INCOMPLETE_BREAK",
                    "severity": "warning",
                    "title": "Incomplete Lunch Break",
                    "title_mr": "जेवण ब्रेक अपूर्ण (परत नोंद नाही)",
                    "description": f"Went on lunch break at {l_out_time_str}, but return punch was missing.",
                    "description_mr": f"दुपारी {l_out_time_str} वाजता जेवण ब्रेक नोंदवला, पण परत आल्याची नोंद नाही.",
                    "in_time": format_kolkata_time(in_evt.scanned_at) if in_evt else None,
                    "out_time": format_kolkata_time(out_evt.scanned_at),
                    "events": events_payload,
                })

    return {
        "total_irregularities": len(irregularities),
        "missing_checkouts_count": missing_checkouts_count,
        "not_marked_count": not_marked_count,
        "irregularities": irregularities,
    }


@router.get("/staff/{user_id}/history", response_model=List[AttendanceEventSchema], summary="View attendance history of a specific staff member")
def get_staff_history(
    user_id: uuid.UUID,
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    query = (
        db.query(AttendanceRecord)
        .filter(
            AttendanceRecord.user_id == user_id,
            AttendanceRecord.organization_id == current_admin.organization_id,
        )
    )
    if start_date:
        query = query.filter(AttendanceRecord.event_date >= start_date)
    if end_date:
        query = query.filter(AttendanceRecord.event_date <= end_date)

    records = query.order_by(AttendanceRecord.event_date.desc(), AttendanceRecord.scanned_at.desc()).all()

    return [
        AttendanceEventSchema(
            id=r.id,
            event_type=r.event_type,
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


@router.post("/attendance/manual-add", response_model=AttendanceEventSchema, summary="Admin manual injection of missing attendance event")
def manual_add_event(
    payload: AttendanceManualCreateRequest,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    record, err = AttendanceService.admin_manual_add_event(
        db,
        admin_user=current_admin,
        target_user_id=payload.user_id,
        event_type=payload.event_type,
        event_date=payload.event_date,
        scanned_at=payload.scanned_at,
        reason=payload.reason,
    )
    if err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=err)

    return AttendanceEventSchema(
        id=record.id,
        event_type=record.event_type,
        event_date=record.event_date,
        scanned_at=record.scanned_at,
        scanned_at_ist=format_kolkata_time(record.scanned_at),
        is_manually_corrected=record.is_manually_corrected,
        verified_distance_meters=record.verified_distance_meters,
        reported_accuracy_meters=record.reported_accuracy_meters,
        verification_method=record.verification_method,
    )


@router.put("/attendance/correct", response_model=AttendanceEventSchema, summary="Admin correction of existing attendance record")
def correct_event(
    payload: AttendanceCorrectionRequest,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    record, err = AttendanceService.admin_correct_event(
        db,
        admin_user=current_admin,
        record_id=payload.record_id,
        new_event_type=payload.new_event_type,
        new_scanned_at=payload.new_scanned_at,
        reason=payload.reason,
    )
    if err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=err)

    return AttendanceEventSchema(
        id=record.id,
        event_type=record.event_type,
        event_date=record.event_date,
        scanned_at=record.scanned_at,
        scanned_at_ist=format_kolkata_time(record.scanned_at),
        is_manually_corrected=record.is_manually_corrected,
        verified_distance_meters=record.verified_distance_meters,
        reported_accuracy_meters=record.reported_accuracy_meters,
        verification_method=record.verification_method,
    )


@router.get("/office-location", response_model=OfficeLocationResponse, summary="Get official office coordinates & geofence radius")
def get_office_location(
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    lat, lon, radius = LocationService.get_office_geofence(db, str(current_admin.organization_id))
    return OfficeLocationResponse(
        office_latitude=lat,
        office_longitude=lon,
        geofence_radius_meters=radius,
        preferred_accuracy_meters=settings.PREFERRED_LOCATION_ACCURACY_METERS,
        max_accuracy_meters=settings.MAX_ACCEPTABLE_LOCATION_ACCURACY_METERS,
        wifi_restriction_enabled=settings.OFFICE_WIFI_RESTRICTION_ENABLED,
    )


@router.patch("/office-location", response_model=OfficeLocationResponse, summary="Super Admin updates official office coordinates")
def update_office_location(
    payload: OfficeLocationUpdateRequest,
    db: Session = Depends(get_db),
    current_super_admin: User = Depends(require_super_admin),
):
    org = db.query(Organization).filter(Organization.id == current_super_admin.organization_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    old_lat, old_lon, old_radius = LocationService.get_office_geofence(db, str(current_super_admin.organization_id))

    org.office_latitude = payload.office_latitude
    org.office_longitude = payload.office_longitude
    org.geofence_radius_meters = payload.geofence_radius_meters

    # Audit log
    audit_log = AttendanceAuditLog(
        attendance_record_id=None,
        actor_user_id=current_super_admin.id,
        action="UPDATE_OFFICE_GEOFENCE",
        reason=payload.reason.strip(),
        previous_state={"latitude": old_lat, "longitude": old_lon, "radius": old_radius},
        new_state={"latitude": payload.office_latitude, "longitude": payload.office_longitude, "radius": payload.geofence_radius_meters},
    )
    db.add(audit_log)
    db.commit()

    return OfficeLocationResponse(
        office_latitude=org.office_latitude,
        office_longitude=org.office_longitude,
        geofence_radius_meters=org.geofence_radius_meters,
        preferred_accuracy_meters=settings.PREFERRED_LOCATION_ACCURACY_METERS,
        max_accuracy_meters=settings.MAX_ACCEPTABLE_LOCATION_ACCURACY_METERS,
        wifi_restriction_enabled=settings.OFFICE_WIFI_RESTRICTION_ENABLED,
    )


@router.get("/audit-logs", response_model=List[AuditLogSchema], summary="Inspect administrative correction audit logs")
def list_audit_logs(
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    logs = (
        db.query(AttendanceAuditLog)
        .order_by(AttendanceAuditLog.created_at.desc())
        .limit(100)
        .all()
    )
    return [
        AuditLogSchema(
            id=log.id,
            attendance_record_id=log.attendance_record_id,
            actor_user_id=log.actor_user_id,
            actor_name=log.actor_user.full_name if log.actor_user else "System",
            action=log.action,
            reason=log.reason,
            previous_state=log.previous_state,
            new_state=log.new_state,
            created_at=log.created_at,
        )
        for log in logs
    ]


@router.put("/users/{user_id}/role", response_model=UserSchema, summary="Super Admin promotion or revocation of Admin privileges")
def update_user_role(
    user_id: uuid.UUID,
    payload: UserUpdateRoleRequest,
    db: Session = Depends(get_db),
    current_super_admin: User = Depends(require_super_admin),
):
    user, err = AuthService.update_user_role(db, user_id, payload.role_name)
    if err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=err)

    return user


@router.post("/users/{user_id}/reset-pin", response_model=UserSchema, summary="Admin recovery: reset a staff member's 6-digit PIN")
def admin_reset_pin(
    user_id: uuid.UUID,
    payload: AdminResetPinRequest,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    user, err = AuthService.admin_reset_pin(
        db,
        admin_user=current_admin,
        target_user_id=user_id,
        new_pin=payload.new_pin,
        reason=payload.reason,
    )
    if err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=err)

    return user


@router.delete("/users/{user_id}", summary="Admin deletion of staff member from database")
def delete_staff_user(
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    target_user = (
        db.query(User)
        .filter(User.id == user_id, User.organization_id == current_admin.organization_id)
        .first()
    )
    if not target_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Staff member not found.")

    if target_user.id == current_admin.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You cannot delete your own account.")

    if target_user.role and target_user.role.name == RoleName.SUPER_ADMIN.value:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Super Administrator account cannot be deleted.")

    if current_admin.role.name != RoleName.SUPER_ADMIN.value and target_user.role.name == RoleName.ADMIN.value:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only Super Admin can delete an Administrator.")

    # Record audit log before deletion
    audit_log = AttendanceAuditLog(
        attendance_record_id=None,
        actor_user_id=current_admin.id,
        action="STAFF_DELETION",
        reason=f"Admin {current_admin.full_name} permanently deleted staff account {target_user.full_name} ({target_user.phone_number}).",
        previous_state={
            "id": str(target_user.id),
            "full_name": target_user.full_name,
            "phone_number": target_user.phone_number,
            "role": target_user.role.name if target_user.role else "STAFF",
        },
        new_state=None,
    )
    db.add(audit_log)
    db.delete(target_user)
    db.commit()

    return {"message": f"Staff member '{target_user.full_name}' permanently deleted."}


@router.get("/reports/weekly.pdf", summary="Download weekly attendance PDF report")
def download_weekly_report(
    start_date: Optional[date] = Query(None, description="Any date in the target week"),
    week_date: Optional[date] = Query(None, description="Alias for start_date"),
    lang: str = Query("en", description="Language: 'en' or 'mr'"),
    language: Optional[str] = Query(None, description="Alias for lang"),
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    target_date = start_date or week_date or get_current_kolkata_date()
    target_lang = language or lang or "en"
    monday, sunday = ReportService.get_weekly_date_range(target_date)
    pdf_bytes = ReportService.generate_attendance_pdf(
        db, start_date=monday, end_date=sunday, report_type="WEEKLY", lang=target_lang
    )
    filename = f"Shivam_Patsanstha_Weekly_Attendance_{monday.isoformat()}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-cache, no-store, must-revalidate, max-age=0",
            "Pragma": "no-cache",
            "Expires": "0",
        },
    )


@router.get("/reports/monthly.pdf", summary="Download monthly attendance PDF report")
def download_monthly_report(
    year: Optional[int] = Query(None, description="Year (e.g. 2026)"),
    month: Optional[int] = Query(None, description="Month (1-12)"),
    lang: str = Query("en", description="Language: 'en' or 'mr'"),
    language: Optional[str] = Query(None, description="Alias for lang"),
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    today = get_current_kolkata_date()
    target_year = year or today.year
    target_month = month or today.month
    target_lang = language or lang or "en"

    start_date, end_date = ReportService.get_monthly_date_range(target_year, target_month)
    pdf_bytes = ReportService.generate_attendance_pdf(
        db, start_date=start_date, end_date=end_date, report_type="MONTHLY", lang=target_lang
    )
    filename = f"Shivam_Patsanstha_Monthly_Attendance_{target_year}-{target_month:02d}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-cache, no-store, must-revalidate, max-age=0",
            "Pragma": "no-cache",
            "Expires": "0",
        },
    )
