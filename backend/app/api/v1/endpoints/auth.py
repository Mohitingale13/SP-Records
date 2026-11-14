from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.schemas.auth import (
    RegisterRequest,
    LoginRequest,
    TokenResponse,
    BootstrapSuperAdminRequest,
)
from app.schemas.user import UserSchema
from app.services.auth_service import AuthService
from app.api.v1.deps import get_current_user
from app.models.user import User

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/register", response_model=TokenResponse, summary="Register a new staff member with a 6-digit PIN")
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    token_response, err = AuthService.register_staff(
        db,
        full_name=payload.full_name,
        phone_number=payload.phone_number,
        pin=payload.pin,
    )
    if err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=err)

    return token_response


@router.post("/login", response_model=TokenResponse, summary="Authenticate staff member using phone number and 6-digit PIN")
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    token_response, err = AuthService.login_staff(
        db,
        phone_number=payload.phone_number,
        pin=payload.pin,
    )
    if err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=err)

    return token_response


@router.post(
    "/bootstrap-super-admin",
    response_model=TokenResponse,
    summary="One-time or protected provisioning of the Super Admin role",
)
def bootstrap_super_admin(payload: BootstrapSuperAdminRequest, db: Session = Depends(get_db)):
    token_response, err = AuthService.bootstrap_super_admin(
        db,
        bootstrap_token=payload.bootstrap_token,
        phone_number=payload.phone_number,
        full_name=payload.full_name,
        pin=payload.pin,
    )
    if err:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=err)

    return token_response


@router.get("/me", response_model=UserSchema, summary="Get current authenticated user profile")
def get_me(current_user: User = Depends(get_current_user)):
    return current_user
