from __future__ import annotations
import enum
import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Dict, Any, Optional
from sqlalchemy import String, Text, DateTime, ForeignKey, Uuid, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base
from app.core.timezone import utc_now

if TYPE_CHECKING:
    from app.models.attendance import AttendanceRecord
    from app.models.user import User


class AuditAction(str, enum.Enum):
    MANUAL_ADDITION = "MANUAL_ADDITION"
    CORRECTION = "CORRECTION"
    INVALIDATION = "INVALIDATION"


class AttendanceAuditLog(Base):
    __tablename__ = "attendance_audit_logs"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    attendance_record_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid, ForeignKey("attendance_records.id", ondelete="SET NULL"), nullable=True, index=True)
    actor_user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    action: Mapped[str] = mapped_column(String(50), nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    previous_state: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, nullable=True)
    new_state: Mapped[Dict[str, Any]] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)

    # Relationships
    attendance_record: Mapped[Optional["AttendanceRecord"]] = relationship("AttendanceRecord", back_populates="audit_logs")
    actor_user: Mapped["User"] = relationship("User", back_populates="audit_logs_authored")
