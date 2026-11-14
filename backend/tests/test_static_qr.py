import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from tests.test_attendance_state_machine import get_authenticated_staff


def test_get_office_static_qr_config(client: TestClient):
    """Staff or admin can retrieve official permanent static QR token and office geofence config."""
    staff_token, _ = get_authenticated_staff(client, phone="+919822200001", name="Static QR Staff 1")
    headers = {"Authorization": f"Bearer {staff_token}"}

    response = client.get("/api/v1/qr/office-static", headers=headers)
    assert response.status_code == 200
    data = response.json()

    assert "token" in data
    assert data["organization_code"] == settings.ORGANIZATION_CODE
    assert data["office_latitude"] == settings.OFFICE_LATITUDE
    assert data["office_longitude"] == settings.OFFICE_LONGITUDE
    assert data["geofence_radius_meters"] == settings.ATTENDANCE_GEOFENCE_RADIUS_METERS
    assert data["verification_mode"] == "PERMANENT_QR_GPS"


def test_scan_with_permanent_office_qr_accepted(client: TestClient):
    """Scanning permanent static QR code while inside 100m geofence is accepted."""
    staff_token, _ = get_authenticated_staff(client, phone="+919822200002", name="Static QR Staff 2")
    headers = {"Authorization": f"Bearer {staff_token}"}

    # Retrieve official permanent QR token
    cfg_res = client.get("/api/v1/qr/office-static", headers=headers)
    assert cfg_res.status_code == 200
    permanent_token = cfg_res.json()["token"]

    # Submit scan with exact office coordinates
    scan_res = client.post(
        "/api/v1/attendance/scan",
        headers=headers,
        json={
            "qr_token": permanent_token,
            "latitude": settings.OFFICE_LATITUDE,
            "longitude": settings.OFFICE_LONGITUDE,
            "accuracy": 15.0,
        },
    )
    assert scan_res.status_code == 200, scan_res.text
    event_data = scan_res.json()
    assert event_data["event_type"] == "OFFICE_IN"
    assert event_data["verified_distance_meters"] == 0.0


def test_scan_with_permanent_office_qr_outside_geofence_rejected(client: TestClient):
    """Permanent static QR cannot be scanned remotely from outside the office premises."""
    staff_token, _ = get_authenticated_staff(client, phone="+919822200003", name="Static QR Staff 3")
    headers = {"Authorization": f"Bearer {staff_token}"}

    cfg_res = client.get("/api/v1/qr/office-static", headers=headers)
    permanent_token = cfg_res.json()["token"]

    # Coordinates ~500m away
    scan_res = client.post(
        "/api/v1/attendance/scan",
        headers=headers,
        json={
            "qr_token": permanent_token,
            "latitude": 18.140000,
            "longitude": 74.515000,
            "accuracy": 15.0,
        },
    )
    assert scan_res.status_code == 400
    assert "Outside office geofence" in scan_res.json()["detail"]


def test_download_printable_qr_pdf(client: TestClient):
    """Validates that the official A4 printable QR poster PDF is generated cleanly."""
    staff_token, _ = get_authenticated_staff(client, phone="+919822200004", name="Static QR Staff 4")
    headers = {"Authorization": f"Bearer {staff_token}"}

    response = client.get("/api/v1/qr/print-pdf", headers=headers)
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert response.content.startswith(b"%PDF")
    assert len(response.content) > 5000

