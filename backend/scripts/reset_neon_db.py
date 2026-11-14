import os
import sys

# Ensure backend directory is in sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from app.core.config import settings
from app.db.session import engine, SessionLocal
from app.db.base import Base
from app.models import (
    Organization,
    Role,
    RoleName,
    User,
    AttendanceRecord,
    AttendanceAuditLog,
    QRCodeToken,
    QRCodeScanTrack,
)
from app.core.security import hash_pin
from app.services.auth_service import AuthService

def flash_and_init_neon_db():
    print(f"Connecting to Neon PostgreSQL Database at: {settings.DATABASE_URL.split('@')[-1]}...")

    with engine.connect() as conn:
        print("Dropping existing tables to flash fresh schema...")
        conn.execute(text("DROP TABLE IF EXISTS attendance_audit_logs CASCADE;"))
        conn.execute(text("DROP TABLE IF EXISTS attendance_records CASCADE;"))
        conn.execute(text("DROP TABLE IF EXISTS qr_code_scan_tracks CASCADE;"))
        conn.execute(text("DROP TABLE IF EXISTS qr_code_tokens CASCADE;"))
        conn.execute(text("DROP TABLE IF EXISTS rotating_qr_tokens CASCADE;"))
        conn.execute(text("DROP TABLE IF EXISTS users CASCADE;"))
        conn.execute(text("DROP TABLE IF EXISTS roles CASCADE;"))
        conn.execute(text("DROP TABLE IF EXISTS organizations CASCADE;"))
        conn.commit()

    print("Creating all fresh database tables...")
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        print("Seeding base roles (SUPER_ADMIN, ADMIN, STAFF)...")
        AuthService.ensure_roles_seeded(db)

        print("Seeding Shivam Patsanstha organization with official 100m GPS coordinates...")
        org = AuthService.get_or_create_organization(db)
        org.office_latitude = settings.OFFICE_LATITUDE
        org.office_longitude = settings.OFFICE_LONGITUDE
        org.geofence_radius_meters = settings.ATTENDANCE_GEOFENCE_RADIUS_METERS
        db.commit()
        db.refresh(org)

        print("Seeding default Super Admin user (+919999999999, PIN: 999999)...")
        super_admin_role = db.query(Role).filter(Role.name == RoleName.SUPER_ADMIN.value).first()
        super_admin = User(
            organization_id=org.id,
            role_id=super_admin_role.id,
            full_name=settings.SUPER_ADMIN_NAME,
            phone_number=settings.SUPER_ADMIN_PHONE,
            pin_hash=hash_pin("999999"),
            failed_login_attempts=0,
            is_active=True,
        )
        db.add(super_admin)
        db.commit()
        db.refresh(super_admin)

        print(f"Neon Database initialized successfully!")
        print(f"Organization: {org.name} (Coords: {org.office_latitude}, {org.office_longitude}, Radius: {org.geofence_radius_meters}m)")
        print(f"Super Admin created: {super_admin.full_name} ({super_admin.phone_number}), PIN: 999999")

    finally:
        db.close()

if __name__ == "__main__":
    flash_and_init_neon_db()
