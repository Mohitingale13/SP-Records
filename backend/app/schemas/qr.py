from datetime import datetime
from pydantic import BaseModel, Field


class QRTokenResponse(BaseModel):
    token: str = Field(..., description="HMAC-signed short-lived token to render in QR graphic")
    expires_at: datetime
    remaining_seconds: int
    nonce: str


class QRValidateResponse(BaseModel):
    is_valid: bool
    nonce: str
    message: str

