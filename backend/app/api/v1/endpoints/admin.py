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
    AttendanceMarkAbsentRequest,
    AttendanceCorrectionRequest,
    AttendanceEventSchema,
    AttendanceStatusSummary,
    OfficeLocationResponse,
    OfficeLocationUpdateRequest,
)
from app.schemas.audit import AuditLogSchema
from app.services.attendance_service import AttendanceService
from app.services.auth_service import AuthService
from app.services.irregularity_service import IrregularityService
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
    - Missing Check-Out
    - Day Not Marked
    - Incomplete Break
    - Uncommon Timestamps (+- 1-2 mins apart, with Admin lunch break exception)
    Includes member_status (REPORTED / IGNORED / NONE) and reported_count.
    """
    return IrregularityService.get_irregularities(
        db=db,
        organization_id=current_admin.organization_id,
        days=days,
        for_member=False,
    )


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


@router.post("/attendance/mark-absent", response_model=AttendanceEventSchema, summary="Mark staff member as absent for a date")
def mark_staff_absent(
    payload: AttendanceMarkAbsentRequest,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    """
    Records an authorized ABSENT entry for the staff member on the specified date.
    Removes any unresolved irregularity for this date and logs an admin audit trail.
    """
    record, err = AttendanceService.admin_mark_staff_absent(
        db,
        admin_user=current_admin,
        target_user_id=payload.user_id,
        event_date=payload.event_date,
        reason=payload.reason or "Confirmed absent by administrator",
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
        reason=(payload.reason or "").strip() or "Office location update by administrator",
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
