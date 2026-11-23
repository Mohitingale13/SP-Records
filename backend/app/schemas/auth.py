import re
import uuid
from typing import Optional
from pydantic import BaseModel, Field, field_validator, model_validator


def normalize_phone_number(v: str) -> str:
    cleaned = re.sub(r"[\s\-\(\)]", "", v.strip())
    if cleaned.startswith("+"):
        if not re.match(r"^\+[1-9]\d{7,14}$", cleaned):
            raise ValueError("Invalid international phone number format.")
        return cleaned
    elif len(cleaned) == 10 and cleaned.isdigit():
        return f"+91{cleaned}"
    elif len(cleaned) == 12 and cleaned.startswith("91") and cleaned.isdigit():
        return f"+{cleaned}"
    raise ValueError("Invalid phone number. Please enter a valid 10-digit Indian mobile number.")


def validate_pin_format(v: str) -> str:
    cleaned = v.strip()
    if not (len(cleaned) == 6 and cleaned.isdigit()):
        raise ValueError("PIN must be exactly 6 numeric digits.")
    return cleaned


class RegisterRequest(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=120, description="Full name of staff member")
    phone_number: str = Field(..., description="10-digit mobile phone number")
    pin: str = Field(..., description="Six-digit numeric PIN")
    confirm_pin: str = Field(..., description="Confirm six-digit numeric PIN")

    @field_validator("phone_number")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        return normalize_phone_number(v)

    @field_validator("pin", "confirm_pin")
    @classmethod
    def validate_pins(cls, v: str) -> str:
        return validate_pin_format(v)

    @model_validator(mode="after")
    def verify_pin_match(self):
        if self.pin != self.confirm_pin:
            raise ValueError("PINs do not match. Please verify and re-enter.")
        return self


class LoginRequest(BaseModel):
    phone_number: str = Field(..., description="10-digit mobile phone number")
    pin: str = Field(..., description="Six-digit numeric PIN")

    @field_validator("phone_number")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        return normalize_phone_number(v)

    @field_validator("pin")
    @classmethod
    def validate_pin(cls, v: str) -> str:
        return validate_pin_format(v)


class AdminResetPinRequest(BaseModel):
    user_id: uuid.UUID
    new_pin: str = Field(..., description="New six-digit numeric PIN")
    confirm_pin: str = Field(..., description="Confirm new six-digit numeric PIN")
    reason: Optional[str] = Field("Administrative PIN reset", description="Audit justification for PIN reset")

    @field_validator("new_pin", "confirm_pin")
    @classmethod
    def validate_pins(cls, v: str) -> str:
        return validate_pin_format(v)

    @model_validator(mode="after")
    def verify_pin_match(self):
        if self.new_pin != self.confirm_pin:
            raise ValueError("New PINs do not match.")
        return self


class UserSummary(BaseModel):
    id: str
    full_name: str
    phone_number: str
    role: str
    organization_name: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserSummary


class BootstrapSuperAdminRequest(BaseModel):
    bootstrap_token: str
    phone_number: str
    full_name: str = "Super Admin"
    pin: Optional[str] = "123456"

    @field_validator("phone_number")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        return normalize_phone_number(v)

    @field_validator("pin")
    @classmethod
    def validate_pin(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            return validate_pin_format(v)
        return "123456"
