import uuid
from datetime import datetime, date
from typing import Optional, List
from pydantic import BaseModel, Field
from app.models.attendance import AttendanceEventType


class AttendanceScanRequest(BaseModel):
    qr_token: str = Field(..., description="The signed rotating QR token scanned by the mobile camera")


class AttendanceEventSchema(BaseModel):
    id: uuid.UUID
    event_type: AttendanceEventType
    event_date: date
    scanned_at: datetime
    scanned_at_ist: str
    is_manually_corrected: bool

    model_config = {"from_attributes": True}


class AttendanceStatusSummary(BaseModel):
    date: date
    status: str  # NOT_STARTED, CHECKED_IN, ON_LUNCH_BREAK, RETURNED_FROM_LUNCH, COMPLETED
    next_expected_event: Optional[AttendanceEventType]
    events: List[AttendanceEventSchema]
    is_completed: bool


class AttendanceManualCreateRequest(BaseModel):
    user_id: uuid.UUID
    event_type: AttendanceEventType
    event_date: date
    scanned_at: datetime
    reason: str = Field(..., min_length=5, description="Mandatory audit justification for manual attendance entry")


class AttendanceCorrectionRequest(BaseModel):
    record_id: uuid.UUID
    new_event_type: Optional[AttendanceEventType] = None
    new_scanned_at: Optional[datetime] = None
    reason: str = Field(..., min_length=5, description="Mandatory audit justification for correction")

