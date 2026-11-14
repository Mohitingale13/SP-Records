import bcrypt
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from jose import jwt, JWTError
from app.core.config import settings
from app.core.timezone import utc_now


def hash_pin(pin: str) -> str:
    """Hashes a 6-digit numeric PIN securely using native bcrypt with standard work factor."""
    pin_bytes = pin.encode("utf-8")
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(pin_bytes, salt).decode("utf-8")


def verify_pin(plain_pin: str, hashed_pin: str) -> bool:
    """Verifies a plain 6-digit PIN against the stored bcrypt hash."""
    try:
        return bcrypt.checkpw(plain_pin.encode("utf-8"), hashed_pin.encode("utf-8"))
    except Exception:
        return False


def create_access_token(
    subject: str,
    role: str,
    org_id: str,
    expires_delta: Optional[timedelta] = None
) -> str:
    """Creates a signed JWT access token."""
    now = utc_now()
    if expires_delta:
        expire = now + expires_delta
    else:
        expire = now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode: Dict[str, Any] = {
        "sub": subject,
        "role": role,
        "org_id": org_id,
        "iat": int(now.timestamp()),
        "exp": int(expire.timestamp()),
    }
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt


def decode_access_token(token: str) -> Optional[Dict[str, Any]]:
    """Decodes and validates a JWT access token."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        return payload
    except JWTError:
        return None
