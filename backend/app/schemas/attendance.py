import uuid
from datetime import datetime, date
from typing import Optional, List
from pydantic import BaseModel, Field
from app.models.attendance import AttendanceEventType


class AttendanceScanRequest(BaseModel):
    qr_token: str = Field(..., description="The signed rotating QR token scanned by the mobile camera")
    latitude: float = Field(..., ge=-90.0, le=90.0, description="Device latitude from native Geolocation API")
    longitude: float = Field(..., ge=-180.0, le=180.0, description="Device longitude from native Geolocation API")
    accuracy: float = Field(..., gt=0.0, description="Reported device GPS accuracy in meters")
    location_timestamp: Optional[datetime] = Field(None, description="Timestamp when the GPS coordinate fix was captured")


class AttendanceEventSchema(BaseModel):
    id: uuid.UUID
    event_type: AttendanceEventType
    event_date: date
    scanned_at: datetime
    scanned_at_ist: str
    is_manually_corrected: bool
    verified_distance_meters: Optional[float] = None
    reported_accuracy_meters: Optional[float] = None
    verification_method: Optional[str] = "QR_GPS"

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


class AttendanceMarkAbsentRequest(BaseModel):
    user_id: uuid.UUID
    event_date: date
    reason: Optional[str] = Field("Employee absent on this date (Confirmed by Admin)", min_length=3)


class AttendanceCorrectionRequest(BaseModel):
    record_id: uuid.UUID
    new_event_type: Optional[AttendanceEventType] = None
    new_scanned_at: Optional[datetime] = None
    reason: str = Field(..., min_length=5, description="Mandatory audit justification for correction")


class OfficeLocationResponse(BaseModel):
    office_latitude: float
    office_longitude: float
    geofence_radius_meters: float
    preferred_accuracy_meters: float
    max_accuracy_meters: float
    wifi_restriction_enabled: bool


class OfficeLocationUpdateRequest(BaseModel):
    office_latitude: float = Field(..., ge=-90.0, le=90.0)
    office_longitude: float = Field(..., ge=-180.0, le=180.0)
    geofence_radius_meters: float = Field(..., gt=0.0, le=10000.0)
    reason: str = Field(..., min_length=5, description="Audit justification for altering official office geofence")


class OfflineAttendanceItem(BaseModel):
    offline_id: str = Field(..., description="Client-generated unique ID for offline record correlation")
    event_type: AttendanceEventType = Field(..., description="Attendance event type")
    qr_token: Optional[str] = Field(None, description="Optional scanned token or office code")
    latitude: float = Field(..., ge=-90.0, le=90.0, description="Device latitude captured at scan time")
    longitude: float = Field(..., ge=-180.0, le=180.0, description="Device longitude captured at scan time")
    accuracy: float = Field(..., gt=0.0, description="Device GPS accuracy in meters")
    scanned_at: datetime = Field(..., description="Offline scan timestamp")
    location_timestamp: Optional[datetime] = Field(None, description="GPS fix acquisition timestamp")


class OfflineSyncRequest(BaseModel):
    events: List[OfflineAttendanceItem] = Field(..., min_length=1, max_length=50)


class OfflineSyncResultItem(BaseModel):
    offline_id: str
    status: str  # "SYNCED", "ALREADY_EXISTS", "REJECTED"
    message: str
    event: Optional[AttendanceEventSchema] = None


class OfflineSyncResponse(BaseModel):
    synced_count: int
    already_exists_count: int
    failed_count: int
    results: List[OfflineSyncResultItem]
