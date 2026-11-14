import uuid
from jose import jwt
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from app.core.config import settings
from tests.test_attendance_state_machine import get_authenticated_staff


def test_multi_user_shared_office_qr_scan(client: TestClient, db_session: Session):
    """Verifies that multiple employees can scan the official permanent office QR."""
    staff1_token, _ = get_authenticated_staff(client, phone="+919876543241", name="Worker One")
    staff2_token, _ = get_authenticated_staff(client, phone="+919876543242", name="Worker Two")

    # Get permanent office QR
    qr_res = client.get("/api/v1/qr/office-static", headers={"Authorization": f"Bearer {staff1_token}"})
    assert qr_res.status_code == 200
    qr_token = qr_res.json()["token"]

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
    assert scan1.json()["event_type"] == "OFFICE_IN"

    # Employee 2 scans SAME permanent QR
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
    assert scan2.json()["event_type"] == "OFFICE_IN"


def test_tampered_qr_signature_rejection(client: TestClient, db_session: Session):
    """Verifies that a forged QR token signed with a bogus key is rejected."""
    staff_token, _ = get_authenticated_staff(client, phone="+919876543250", name="Hacker Attempt")

    fake_payload = {
        "jti": "fake-nonce",
        "org_id": str(uuid.uuid4()),
        "type": "PERMANENT_OFFICE_QR",
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


def test_different_org_qr_rejection(client: TestClient, db_session: Session):
    """Verifies that a QR token belonging to a different organization is rejected."""
    staff_token, _ = get_authenticated_staff(client, phone="+919876543260", name="Foreign Scanner")

    # Generate token signed with our key, but with a different organization ID
    foreign_org_id = str(uuid.uuid4())
    payload = {
        "jti": "PERM_OFFICE_QR_FOREIGN",
        "org_id": foreign_org_id,
        "type": "PERMANENT_OFFICE_QR",
    }
    foreign_token = jwt.encode(payload, settings.QR_SIGNING_SECRET, algorithm=settings.ALGORITHM)

    res = client.post(
        "/api/v1/attendance/scan",
        json={
            "qr_token": foreign_token,
            "latitude": settings.OFFICE_LATITUDE,
            "longitude": settings.OFFICE_LONGITUDE,
            "accuracy": 15.0,
        },
        headers={"Authorization": f"Bearer {staff_token}"},
    )
    assert res.status_code == 400
    assert "different organization" in res.json()["detail"].lower()


def test_scan_debounce_protection(client: TestClient, db_session: Session):
    """Verifies that immediate duplicate scan attempts are throttled by debounce interval."""
    staff_token, _ = get_authenticated_staff(client, phone="+919876543270", name="Fast Clicker")
    qr_token = f"SP_OFFICE_STATIC_QR:{settings.ORGANIZATION_CODE}"

    # Ensure debounce is active (e.g. 10s default)
    orig_interval = settings.SCAN_MIN_INTERVAL_SECONDS
    settings.SCAN_MIN_INTERVAL_SECONDS = 15

    try:
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

        # Immediate second scan is throttled by debounce
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
        assert "rapid scan detected" in res2.json()["detail"].lower()
    finally:
        settings.SCAN_MIN_INTERVAL_SECONDS = orig_interval
