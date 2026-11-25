from __future__ import annotations
import enum
import uuid
from datetime import datetime, date
from sqlalchemy import (
    String, DateTime, Date, ForeignKey, Uuid, UniqueConstraint
)
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base
from app.core.timezone import utc_now


class IrregularityActionStatus(str, enum.Enum):
    REPORTED = "REPORTED"
    IGNORED = "IGNORED"


class IrregularityAction(Base):
    __tablename__ = "irregularity_actions"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    event_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    irregularity_id: Mapped[str] = mapped_column(String(120), nullable=False)
    irregularity_type: Mapped[str] = mapped_column(String(40), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    __table_args__ = (
        UniqueConstraint("user_id", "irregularity_id", name="uq_user_irregularity_id"),
    )

