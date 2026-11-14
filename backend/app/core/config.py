import os
from typing import List, Optional
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    PROJECT_NAME: str = "Shivam Patsanstha Digital Attendance Management System"
    ORGANIZATION_NAME: str = "Shivam Patsanstha"
    ORGANIZATION_CODE: str = "SHIVAM_PAT"
    API_V1_STR: str = "/api/v1"

    # Security
    SECRET_KEY: str = "sp-attendance-secret-key-change-in-production-2026-super-secure"
    QR_SIGNING_SECRET: str = "sp-qr-hmac-signing-secret-change-in-production-2026"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 30  # 30 days for persistent staff mobile session

    # QR Code Lifecycle
    QR_TOKEN_EXPIRE_SECONDS: int = 25
    QR_CLOCK_TOLERANCE_SECONDS: int = 5
    SCAN_MIN_INTERVAL_SECONDS: int = 10  # Minimum delay between scans for debounce / rapid protection

    # Database
    DATABASE_URL: str = "sqlite:///./sp_records.db"

    # Super Admin Bootstrap
    SUPER_ADMIN_PHONE: str = "+919999999999"
    SUPER_ADMIN_NAME: str = "Super Admin"
    SUPER_ADMIN_BOOTSTRAP_TOKEN: str = "shivam-patsanstha-bootstrap-2026"

    # Authentication & PIN Security
    PIN_LENGTH: int = 6
    MAX_FAILED_LOGIN_ATTEMPTS: int = 5
    LOCKOUT_DURATION_MINUTES: int = 15
    PROGRESSIVE_DELAY_SECONDS: float = 0.5

    # Localization
    TIMEZONE: str = "Asia/Kolkata"

    # Physical Presence Geofencing (Official Shivam Patsanstha Registered Office)
    OFFICE_LATITUDE: float = 18.1361880
    OFFICE_LONGITUDE: float = 74.5104810
    ATTENDANCE_GEOFENCE_RADIUS_METERS: float = 100.0
    PREFERRED_LOCATION_ACCURACY_METERS: float = 50.0
    MAX_ACCEPTABLE_LOCATION_ACCURACY_METERS: float = 100.0
    LOCATION_TIMESTAMP_MAX_AGE_SECONDS: int = 120

    # Optional Office Wi-Fi / IP Restriction (disabled by default)
    OFFICE_WIFI_RESTRICTION_ENABLED: bool = False
    OFFICE_ALLOWED_IPS: List[str] = []
    TRUSTED_PROXIES: List[str] = ["127.0.0.1", "::1"]

    # CORS Configuration
    BACKEND_CORS_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
        "*"
    ]

    model_config = SettingsConfigDict(
        env_file=(".env", "backend/.env", "../.env"),
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="allow"
    )


settings = Settings()
