import uuid
from typing import Tuple, Optional, Dict, Any
from jose import jwt, JWTError
from sqlalchemy.orm import Session
from app.core.config import settings
from app.models.user import User


class QRCodeService:
    @staticmethod
    def get_permanent_office_token(organization_id: uuid.UUID) -> str:
        """
        Returns a cryptographically signed, permanent attendance QR token
        bound to this organization. Designed for printed counter posters/standees.
        Physical presence is enforced by 100m GPS geofencing.
        """
        payload: Dict[str, Any] = {
            "jti": f"PERM_OFFICE_QR_{settings.ORGANIZATION_CODE}",
            "org_id": str(organization_id),
            "org_code": settings.ORGANIZATION_CODE,
            "type": "PERMANENT_OFFICE_QR",
        }
        return jwt.encode(payload, settings.QR_SIGNING_SECRET, algorithm=settings.ALGORITHM)

    @staticmethod
    def validate_and_claim_token(
        db: Session, qr_token_str: str, user: User, event_type: str
    ) -> Tuple[bool, Optional[str], Optional[str]]:
        """
        Validates the permanent printed office QR token.
        Physical presence is anchored to the 100m GPS geofence.
        Returns: (is_valid, nonce, error_message)
        """
        # 1. Check for recognized static office identifiers / offline presence flags
        cleaned_token = qr_token_str.strip()
        if cleaned_token in [
            f"SP_OFFICE_STATIC_QR:{settings.ORGANIZATION_CODE}",
            "SP_OFFICE_STATIC_QR",
            "OFFLINE_GPS_PRESENCE",
        ]:
            return True, f"STATIC_QR_{settings.ORGANIZATION_CODE}", None

        # 2. Decode HMAC token if signed JWT is passed
        try:
            payload = jwt.decode(
                qr_token_str,
                settings.QR_SIGNING_SECRET,
                algorithms=[settings.ALGORITHM],
                options={"verify_exp": False},
            )
        except JWTError:
            return False, None, "Invalid QR code signature or corrupt code."

        qr_type = payload.get("type")
        if qr_type != "PERMANENT_OFFICE_QR":
            return False, None, "QR code is not a valid permanent office attendance code."

        # Verify Organization scope
        if payload.get("org_id") != str(user.organization_id):
            return False, None, "QR code belongs to a different organization."

        nonce = payload.get("jti") or f"STATIC_QR_{settings.ORGANIZATION_CODE}"
        return True, nonce, None
