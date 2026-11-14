from datetime import timedelta
from jose import jwt
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from app.core.config import settings
from app.core.timezone import utc_now
from tests.test_attendance_state_machine import get_authenticated_staff, get_authenticated_admin


def test_qr_replay_attack_prevention(client: TestClient, db_session: Session):
    """Verifies that the same staff member cannot redeem the same QR token twice."""
    staff_token, _ = get_authenticated_staff(client, phone="+919876543230", name="Vikas More")
    admin_token = get_authenticated_admin(client, phone="+919876543231", name="Admin 2")

    # Temporarily set debounce to 0 to specifically test QR nonce replay protection
    orig_interval = settings.SCAN_MIN_INTERVAL_SECONDS
    settings.SCAN_MIN_INTERVAL_SECONDS = 0

    try:
        # Generate QR token
        qr_res = client.post("/api/v1/qr/rotate", headers={"Authorization": f"Bearer {admin_token}"})
        qr_token = qr_res.json()["token"]

        # First scan succeeds
        res1 = client.post(
            "/api/v1/attendance/scan",
            json={
                "qr_token": qr_token,
                "latitude": settings.OFFICE_LATITUDE,
                "longitude": settings.OFFICE_LONGITUDE,
                "accuracy": 15.0,
            },
            headers={"Authorization": f"Bearer {staff_token}"},
        )
        assert res1.status_code == 200

        # Second scan with SAME token by the SAME user fails
        res2 = client.post(
            "/api/v1/attendance/scan",
            json={
                "qr_token": qr_token,
                "latitude": settings.OFFICE_LATITUDE,
                "longitude": settings.OFFICE_LONGITUDE,
                "accuracy": 15.0,
            },
            headers={"Authorization": f"Bearer {staff_token}"},
        )
        assert res2.status_code == 400
        assert "already used this qr code" in res2.json()["detail"].lower()
    finally:
        settings.SCAN_MIN_INTERVAL_SECONDS = orig_interval


def test_multi_user_shared_qr_scan(client: TestClient, db_session: Session):
    """Verifies that two different employees standing in line can both scan the same rotating QR."""
    staff1_token, _ = get_authenticated_staff(client, phone="+919876543241", name="Worker One")
    staff2_token, _ = get_authenticated_staff(client, phone="+919876543242", name="Worker Two")
    admin_token = get_authenticated_admin(client, phone="+919876543243", name="Admin 3")

    # Temporarily set debounce to 0
    orig_interval = settings.SCAN_MIN_INTERVAL_SECONDS
    settings.SCAN_MIN_INTERVAL_SECONDS = 0

    try:
        # Office screen generates rotating QR
        qr_token = client.post("/api/v1/qr/rotate", headers={"Authorization": f"Bearer {admin_token}"}).json()["token"]

        # Employee 1 scans
        scan1 = client.post(
            "/api/v1/attendance/scan",
            json={
                "qr_token": qr_token,
                "latitude": settings.OFFICE_LATITUDE,
                "longitude": settings.OFFICE_LONGITUDE,
                "accuracy": 15.0,
            },
            headers={"Authorization": f"Bearer {staff1_token}"},
        )
        assert scan1.status_code == 200

        # Employee 2 scans SAME QR
        scan2 = client.post(
            "/api/v1/attendance/scan",
            json={
                "qr_token": qr_token,
                "latitude": settings.OFFICE_LATITUDE,
                "longitude": settings.OFFICE_LONGITUDE,
                "accuracy": 15.0,
            },
            headers={"Authorization": f"Bearer {staff2_token}"},
        )
        assert scan2.status_code == 200
    finally:
        settings.SCAN_MIN_INTERVAL_SECONDS = orig_interval


def test_tampered_qr_signature_rejection(client: TestClient, db_session: Session):
    """Verifies that a forged QR token signed with a bogus key is rejected."""
    staff_token, _ = get_authenticated_staff(client, phone="+919876543250", name="Hacker Attempt")

    fake_payload = {
        "jti": "fake-nonce",
        "org_id": "00000000-0000-0000-0000-000000000001",
        "iat": int(utc_now().timestamp()),
        "exp": int((utc_now() + timedelta(minutes=5)).timestamp()),
        "type": "OFFICE_ROTATING_QR",
    }
    fake_token = jwt.encode(fake_payload, "completely-wrong-secret-key", algorithm="HS256")

    res = client.post(
        "/api/v1/attendance/scan",
        json={
            "qr_token": fake_token,
            "latitude": settings.OFFICE_LATITUDE,
            "longitude": settings.OFFICE_LONGITUDE,
            "accuracy": 15.0,
        },
        headers={"Authorization": f"Bearer {staff_token}"},
    )
    assert res.status_code == 400
    assert "invalid qr code signature" in res.json()["detail"].lower()


def test_expired_qr_rejection(client: TestClient, db_session: Session):
    """Verifies that an expired QR token is rejected."""
    staff_token, _ = get_authenticated_staff(client, phone="+919876543260", name="Late Scanner")

    # Get user profile to read actual org_id
    me = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {staff_token}"}).json()
    org_id = me["organization_id"]

    # Payload with expiration in the past
    expired_payload = {
        "jti": "expired-nonce",
        "org_id": org_id,
        "iat": int((utc_now() - timedelta(minutes=10)).timestamp()),
        "exp": int((utc_now() - timedelta(minutes=5)).timestamp()),
        "type": "OFFICE_ROTATING_QR",
    }
    expired_token = jwt.encode(expired_payload, settings.QR_SIGNING_SECRET, algorithm=settings.ALGORITHM)

    res = client.post(
        "/api/v1/attendance/scan",
        json={
            "qr_token": expired_token,
            "latitude": settings.OFFICE_LATITUDE,
            "longitude": settings.OFFICE_LONGITUDE,
            "accuracy": 15.0,
        },
        headers={"Authorization": f"Bearer {staff_token}"},
    )
    assert res.status_code == 400
    assert "expired" in res.json()["detail"].lower()
