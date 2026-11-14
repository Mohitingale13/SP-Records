from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.api.v1.deps import require_admin
from app.models.user import User
from app.schemas.qr import QRTokenResponse
from app.services.qr_service import QRCodeService

router = APIRouter(prefix="/qr", tags=["QR Code"])


@router.post("/rotate", response_model=QRTokenResponse, summary="Generate a new rotating QR code for office display")
def generate_rotating_qr(
    current_admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """
    Called by the authorized office kiosk display to generate an HMAC-signed,
    short-lived token encoded into the displayed QR code.
    """
    return QRCodeService.generate_rotating_qr_token(db, current_admin)

