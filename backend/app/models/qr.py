from __future__ import annotations
import uuid
from datetime import datetime
from sqlalchemy import String, Boolean, DateTime, ForeignKey, Uuid, UniqueConstraint, Index
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base
from app.core.timezone import utc_now


class QRCodeToken(Base):
    """Tracks issued rotating QR codes to detect validity and prevent forged nonces."""
    __tablename__ = "qr_tokens"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    nonce: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_by_user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    issued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    is_revoked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class QRCodeScanTrack(Base):
    """
    Tracks which users have redeemed a particular QR nonce.
    Ensures that multiple employees can use the same rotating QR code,
    but no single employee can scan/replay the same QR code more than once.
    """
    __tablename__ = "qr_scan_tracks"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    qr_nonce: Mapped[str] = mapped_column(String(100), index=True, nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    event_type: Mapped[str] = mapped_column(String(30), nullable=False)
    scanned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)

    __table_args__ = (
        UniqueConstraint("qr_nonce", "user_id", name="uq_qr_user_scan"),
        Index("ix_qr_user_scan", "qr_nonce", "user_id"),
    )

