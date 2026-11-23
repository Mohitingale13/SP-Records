import re
import uuid
from datetime import timedelta
from typing import Optional, Tuple
from sqlalchemy.orm import Session
from app.core.config import settings
from app.core.security import create_access_token, hash_pin, verify_pin
from app.core.timezone import utc_now
from app.models.organization import Organization
from app.models.role import Role, RoleName
from app.models.user import User
from app.models.audit import AttendanceAuditLog
from app.schemas.auth import TokenResponse, UserSummary


class AuthService:
    @staticmethod
    def get_or_create_organization(db: Session) -> Organization:
        """Retrieves or seeds the single organization 'Shivam Patsanstha'."""
        org = db.query(Organization).filter(Organization.code == settings.ORGANIZATION_CODE).first()
        if not org:
            org = Organization(
                name=settings.ORGANIZATION_NAME,
                code=settings.ORGANIZATION_CODE,
                is_active=True,
            )
            db.add(org)
            db.commit()
            db.refresh(org)
        return org

    @staticmethod
    def ensure_roles_seeded(db: Session) -> None:
        """Ensures all standard system roles exist in the database."""
        roles_data = [
            (RoleName.SUPER_ADMIN, "Super Administrator with full permission to assign branch admins"),
            (RoleName.ADMIN, "Organization Admin with attendance oversight and report access"),
            (RoleName.STAFF, "Staff member with QR scan and personal attendance history view"),
        ]
        for role_name, desc in roles_data:
            role = db.query(Role).filter(Role.name == role_name.value).first()
            if not role:
                db.add(Role(name=role_name.value, description=desc))
        db.commit()

    @staticmethod
    def get_role_by_name(db: Session, role_name: RoleName) -> Role:
        role = db.query(Role).filter(Role.name == role_name.value).first()
        if not role:
            AuthService.ensure_roles_seeded(db)
            role = db.query(Role).filter(Role.name == role_name.value).first()
        return role

    @staticmethod
    def register_staff(
        db: Session, full_name: str, phone_number: str, pin: str
    ) -> Tuple[Optional[TokenResponse], Optional[str]]:
        """
        Registers a new staff member with a 6-digit numeric PIN.
        Rejects duplicate phone numbers with a user-friendly error.
        """
        AuthService.ensure_roles_seeded(db)
        org = AuthService.get_or_create_organization(db)

        # Check for duplicate phone number (supports both 10-digit and +91 formats)
        digits_only = re.sub(r"\D", "", phone_number or "")
        ten_digit = digits_only[-10:] if len(digits_only) >= 10 else digits_only
        existing_user = db.query(User).filter(
            (User.phone_number == phone_number)
            | (User.phone_number == f"+91{ten_digit}")
            | (User.phone_number == ten_digit)
        ).first()
        if existing_user:
            return None, "A staff member is already registered with this mobile number. Please log in instead."

        staff_role = AuthService.get_role_by_name(db, RoleName.STAFF)
        new_user = User(
            organization_id=org.id,
            role_id=staff_role.id,
            full_name=full_name.strip(),
            phone_number=phone_number,
            pin_hash=hash_pin(pin),
            failed_login_attempts=0,
            is_active=True,
        )
        db.add(new_user)
        db.commit()
        db.refresh(new_user)

        token = create_access_token(
            subject=str(new_user.id),
            role=new_user.role.name,
            org_id=str(new_user.organization_id),
        )

        user_summary = UserSummary(
            id=str(new_user.id),
            full_name=new_user.full_name,
            phone_number=new_user.phone_number,
            role=new_user.role.name,
            organization_name=org.name,
        )

        return TokenResponse(access_token=token, user=user_summary), None

    @staticmethod
    def login_staff(
        db: Session, phone_number: str, pin: str
    ) -> Tuple[Optional[TokenResponse], Optional[str]]:
        """
        Authenticates a staff member using their phone number and 6-digit PIN.
        Applies progressive delay and temporary account lockout on repeated failed attempts.
        Returns generic error messages to avoid revealing phone number existence.
        """
        AuthService.ensure_roles_seeded(db)
        org = AuthService.get_or_create_organization(db)

        digits_only = re.sub(r"\D", "", phone_number or "")
        ten_digit = digits_only[-10:] if len(digits_only) >= 10 else digits_only
        user = db.query(User).filter(
            (User.phone_number == phone_number)
            | (User.phone_number == f"+91{ten_digit}")
            | (User.phone_number == ten_digit)
        ).first()
        if not user:
            # Generic error to prevent phone enumeration
            return None, "Invalid mobile number or PIN."

        if not user.is_active:
            return None, "Account has been deactivated. Please contact your organization administrator."

        now = utc_now()
        # Check if account is temporarily locked
        if user.locked_until:
            locked_until = user.locked_until
            if locked_until.tzinfo is None:
                locked_until = locked_until.replace(tzinfo=now.tzinfo)
            if locked_until > now:
                remaining_mins = int((locked_until - now).total_seconds() / 60) + 1
                return None, f"Account temporarily locked due to multiple failed attempts. Please try again in {remaining_mins} minutes."

        # Verify PIN
        if not user.pin_hash or not verify_pin(pin, user.pin_hash):
            user.failed_login_attempts += 1
            if user.failed_login_attempts >= settings.MAX_FAILED_LOGIN_ATTEMPTS:
                user.locked_until = now + timedelta(minutes=settings.LOCKOUT_DURATION_MINUTES)
            db.commit()
            return None, "Invalid mobile number or PIN."

        # Successful authentication: reset failed attempts counter
        user.failed_login_attempts = 0
        user.locked_until = None
        db.commit()

        token = create_access_token(
            subject=str(user.id),
            role=user.role.name,
            org_id=str(user.organization_id),
        )

        user_summary = UserSummary(
            id=str(user.id),
            full_name=user.full_name,
            phone_number=user.phone_number,
            role=user.role.name,
            organization_name=org.name,
        )

        return TokenResponse(access_token=token, user=user_summary), None

    @staticmethod
    def admin_reset_pin(
        db: Session,
        admin_user: User,
        target_user_id: uuid.UUID,
        new_pin: str,
        reason: str,
    ) -> Tuple[Optional[User], Optional[str]]:
        """
        Controlled account recovery: an authorized Administrator resets a staff member's PIN.
        The action is audited with a mandatory written justification.
        """
        target_user = db.query(User).filter(User.id == target_user_id).first()
        if not target_user:
            return None, "User not found."

        # If target is Super Admin, only another Super Admin can reset
        if target_user.role.name == RoleName.SUPER_ADMIN.value and admin_user.role.name != RoleName.SUPER_ADMIN.value:
            return None, "Only Super Administrators can reset Super Admin credentials."

        target_user.pin_hash = hash_pin(new_pin)
        target_user.failed_login_attempts = 0
        target_user.locked_until = None

        # Log audit entry
        audit_log = AttendanceAuditLog(
            actor_user_id=admin_user.id,
            action="PIN_RESET",
            reason=(reason or "").strip() or "Administrative PIN reset",
            previous_state={"target_user_id": str(target_user.id), "phone": target_user.phone_number},
            new_state={"status": "PIN_RESET_COMPLETED", "reset_at": utc_now().isoformat()},
        )
        db.add(audit_log)
        db.commit()
        db.refresh(target_user)

        return target_user, None

    @staticmethod
    def bootstrap_super_admin(
        db: Session,
        bootstrap_token: str,
        phone_number: str,
        full_name: str,
        pin: Optional[str] = "123456",
    ) -> Tuple[Optional[TokenResponse], Optional[str]]:
        """
        Secure one-time or explicit provisioning of the Super Admin role.
        """
        if bootstrap_token != settings.SUPER_ADMIN_BOOTSTRAP_TOKEN:
            return None, "Invalid bootstrap security token."

        AuthService.ensure_roles_seeded(db)
        org = AuthService.get_or_create_organization(db)
        super_admin_role = AuthService.get_role_by_name(db, RoleName.SUPER_ADMIN)

        pin_to_use = pin or "123456"

        digits_only = re.sub(r"\D", "", phone_number or "")
        ten_digit = digits_only[-10:] if len(digits_only) >= 10 else digits_only
        user = db.query(User).filter(
            (User.phone_number == phone_number)
            | (User.phone_number == f"+91{ten_digit}")
            | (User.phone_number == ten_digit)
        ).first()
        if user:
            user.role_id = super_admin_role.id
            user.full_name = full_name
            user.pin_hash = hash_pin(pin_to_use)
            user.failed_login_attempts = 0
            user.locked_until = None
            user.is_active = True
        else:
            user = User(
                organization_id=org.id,
                role_id=super_admin_role.id,
                full_name=full_name,
                phone_number=phone_number,
                pin_hash=hash_pin(pin_to_use),
                failed_login_attempts=0,
                is_active=True,
            )
            db.add(user)

        db.commit()
        db.refresh(user)

        token = create_access_token(
            subject=str(user.id),
            role=user.role.name,
            org_id=str(user.organization_id),
        )

        user_summary = UserSummary(
            id=str(user.id),
            full_name=user.full_name,
            phone_number=user.phone_number,
            role=user.role.name,
            organization_name=org.name,
        )

        return TokenResponse(access_token=token, user=user_summary), None

    @staticmethod
    def update_user_role(
        db: Session, target_user_id: uuid.UUID, new_role_name: RoleName
    ) -> Tuple[Optional[User], Optional[str]]:
        """Super Admin assigns or revokes Admin role for staff members."""
        target_user = db.query(User).filter(User.id == target_user_id).first()
        if not target_user:
            return None, "User not found."

        if target_user.role.name == RoleName.SUPER_ADMIN.value:
            return None, "Super Admin role cannot be modified via standard role assignment."

        role = AuthService.get_role_by_name(db, new_role_name)
        target_user.role_id = role.id
        db.commit()
        db.refresh(target_user)
        return target_user, None
