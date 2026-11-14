from typing import List, Optional
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.api.v1.deps import get_current_user
from app.models.user import User
from app.models.attendance import AttendanceRecord
from app.schemas.attendance import (
    AttendanceScanRequest,
    AttendanceEventSchema,
    AttendanceStatusSummary,
)
from app.services.attendance_service import AttendanceService
from app.core.timezone import format_kolkata_time

router = APIRouter(prefix="/attendance", tags=["Attendance"])


@router.get("/today-status", response_model=AttendanceStatusSummary, summary="Get today's attendance status & next expected event")
def get_today_status(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Returns the staff member's live attendance lifecycle state for the current working day,
    including already logged events and the next action required.
    """
    return AttendanceService.get_daily_status(db, current_user)


@router.post("/scan", response_model=AttendanceEventSchema, summary="Submit a scanned rotating QR code")
def submit_qr_scan(
    payload: AttendanceScanRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Validates the rotating QR token and automatically triggers the next attendance event
    (OFFICE_IN, LUNCH_BREAK_OUT, LUNCH_BREAK_IN, or OFFICE_OUT).
    """
    event, err = AttendanceService.process_qr_scan(db, current_user, payload.qr_token)
    if err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=err)

    return event


@router.get("/history", response_model=List[AttendanceEventSchema], summary="View personal attendance event history")
def get_own_history(
    start_date: Optional[date] = Query(None, description="Start date filter (YYYY-MM-DD)"),
    end_date: Optional[date] = Query(None, description="End date filter (YYYY-MM-DD)"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Returns chronological attendance records belonging strictly to the requesting staff member."""
    query = db.query(AttendanceRecord).filter(AttendanceRecord.user_id == current_user.id)

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
        )
        for r in records
    ]

