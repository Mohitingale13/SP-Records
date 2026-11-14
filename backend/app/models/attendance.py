from __future__ import annotations
import enum
import uuid
from datetime import datetime, date
from typing import TYPE_CHECKING, List, Optional
from sqlalchemy import (
    String, Boolean, DateTime, Date, ForeignKey, Uuid,
    UniqueConstraint, Index
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base
from app.core.timezone import utc_now

if TYPE_CHECKING:
    from app.models.user import User
    from app.models.organization import Organization
    from app.models.audit import AttendanceAuditLog


class AttendanceEventType(str, enum.Enum):
    OFFICE_IN = "OFFICE_IN"
    LUNCH_BREAK_OUT = "LUNCH_BREAK_OUT"
    LUNCH_BREAK_IN = "LUNCH_BREAK_IN"
    OFFICE_OUT = "OFFICE_OUT"


class AttendanceRecord(Base):
    __tablename__ = "attendance_records"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    organization_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    event_type: Mapped[str] = mapped_column(String(30), nullable=False)
    event_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    scanned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    source_qr_nonce: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    is_manually_corrected: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="attendance_records")
    organization: Mapped["Organization"] = relationship("Organization", back_populates="attendance_records")
    audit_logs: Mapped[List["AttendanceAuditLog"]] = relationship("AttendanceAuditLog", back_populates="attendance_record", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("user_id", "event_date", "event_type", name="uq_user_date_event"),
        Index("ix_attendance_user_date", "user_id", "event_date"),
        Index("ix_attendance_org_date", "organization_id", "event_date"),
    )
