import uuid
from datetime import timedelta, datetime
from typing import Tuple, Optional, Dict, Any
from jose import jwt, JWTError
from sqlalchemy.orm import Session
from app.core.config import settings
from app.core.timezone import utc_now
from app.models.qr import QRCodeToken, QRCodeScanTrack
from app.models.user import User
from app.schemas.qr import QRTokenResponse


class QRCodeService:
    @staticmethod
    def generate_rotating_qr_token(db: Session, admin_user: User) -> QRTokenResponse:
        """
        Generates an HMAC-SHA256 signed, short-lived rotating QR token.
        Records the issued token nonce in `qr_tokens` table.
        """
        now = utc_now()
        expires_at = now + timedelta(seconds=settings.QR_TOKEN_EXPIRE_SECONDS)
        nonce = str(uuid.uuid4())

        payload: Dict[str, Any] = {
            "jti": nonce,
            "org_id": str(admin_user.organization_id),
            "iat": int(now.timestamp()),
            "exp": int(expires_at.timestamp()),
            "type": "OFFICE_ROTATING_QR",
        }

        # Sign token with dedicated QR_SIGNING_SECRET
        token = jwt.encode(payload, settings.QR_SIGNING_SECRET, algorithm=settings.ALGORITHM)

        # Store record in database
        qr_entry = QRCodeToken(
            nonce=nonce,
            organization_id=admin_user.organization_id,
            created_by_user_id=admin_user.id,
            issued_at=now,
            expires_at=expires_at,
            is_revoked=False,
        )
        db.add(qr_entry)
        db.commit()
        db.refresh(qr_entry)

        return QRTokenResponse(
            token=token,
            expires_at=expires_at,
            remaining_seconds=settings.QR_TOKEN_EXPIRE_SECONDS,
            nonce=nonce,
        )

    @staticmethod
    def validate_and_claim_token(
        db: Session, qr_token_str: str, user: User, event_type: str
    ) -> Tuple[bool, Optional[str], Optional[str]]:
        """
        Validates the QR token's signature, expiry, and single-use per user.
        Returns: (is_valid, nonce, error_message)
        """
        try:
            payload = jwt.decode(
                qr_token_str,
                settings.QR_SIGNING_SECRET,
                algorithms=[settings.ALGORITHM],
                options={"verify_exp": False},  # We verify with tolerance manually
            )
        except JWTError:
            return False, None, "Invalid QR code signature or corrupt code."

        if payload.get("type") != "OFFICE_ROTATING_QR":
            return False, None, "QR code is not a valid attendance verification code."

        # Verify Organization scope
        if payload.get("org_id") != str(user.organization_id):
            return False, None, "QR code belongs to a different organization."

        nonce = payload.get("jti")
        if not nonce:
            return False, None, "Malformed QR code: missing nonce identifier."

        # Check expiration with clock tolerance
        exp_timestamp = payload.get("exp", 0)
        now_timestamp = int(utc_now().timestamp())
        if now_timestamp > (exp_timestamp + settings.QR_CLOCK_TOLERANCE_SECONDS):
            return False, nonce, "QR code has expired. Please scan the current rotating code on the office screen."

        # Check if the token was administratively revoked
        token_record = db.query(QRCodeToken).filter(QRCodeToken.nonce == nonce).first()
        if token_record and token_record.is_revoked:
            return False, nonce, "This QR code has been revoked."

        # Check if THIS user already redeemed this nonce
        already_scanned = (
            db.query(QRCodeScanTrack)
            .filter(
                QRCodeScanTrack.qr_nonce == nonce,
                QRCodeScanTrack.user_id == user.id,
            )
            .first()
        )
        if already_scanned:
            return False, nonce, "You have already used this QR code. Please wait for the next rotating code."

        # Record this redemption by the user
        scan_track = QRCodeScanTrack(
            qr_nonce=nonce,
            user_id=user.id,
            event_type=event_type,
            scanned_at=utc_now(),
        )
        db.add(scan_track)
        db.flush()

        return True, nonce, None

