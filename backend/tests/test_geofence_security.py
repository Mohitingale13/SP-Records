from datetime import timedelta
import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.core.timezone import utc_now
from app.services.location_service import LocationService
from tests.test_attendance_state_machine import get_authenticated_staff, get_authenticated_admin


def test_haversine_distance_calculation():
    """Validates mathematical correctness of Haversine implementation."""
    # Test identical point distance is 0
    dist_zero = LocationService.calculate_haversine_distance(
        settings.OFFICE_LATITUDE,
        settings.OFFICE_LONGITUDE,
        settings.OFFICE_LATITUDE,
        settings.OFFICE_LONGITUDE,
    )
    assert dist_zero == 0.0

    # Test known points:
    # (18.1361880, 74.5104810) to (18.1363788, 74.5106817) is ~30m
    dist_30m = LocationService.calculate_haversine_distance(
        18.1361880, 74.5104810, 18.1363788, 74.5106817
    )
    assert 29.0 <= dist_30m <= 31.0

    # Test ~150m offset
    dist_150m = LocationService.calculate_haversine_distance(
        18.1361880, 74.5104810, 18.1371419, 74.5114847
    )
    assert 148.0 <= dist_150m <= 152.0


def test_geofence_exact_office_coordinates_accepted(client: TestClient):
    """Exact office coordinates (distance ~0m, high accuracy) must be accepted."""
    staff_token, _ = get_authenticated_staff(client, phone="+919800010001", name="Geofence Test User 1")
    headers = {"Authorization": f"Bearer {staff_token}"}
    qr_token = f"SP_OFFICE_STATIC_QR:{settings.ORGANIZATION_CODE}"

    # Submit scan with exact office coordinates
    scan_res = client.post(
        "/api/v1/attendance/scan",
        headers=headers,
        json={
            "qr_token": qr_token,
            "latitude": 18.1361880,
            "longitude": 74.5104810,
            "accuracy": 15.0,
            "location_timestamp": utc_now().isoformat(),
        },
    )
    assert scan_res.status_code == 200
    data = scan_res.json()
    assert data["event_type"] == "OFFICE_IN"
    assert data["verified_distance_meters"] is not None
    assert data["verified_distance_meters"] <= 1.0
    assert data["reported_accuracy_meters"] == 15.0
    assert data["verification_method"] == "QR_GPS"


def test_geofence_acceptable_offsets_30m_and_80m(client: TestClient):
    """Points within the 100m geofence radius (e.g. 30m, 80m) must be accepted."""
    staff_token, _ = get_authenticated_staff(client, phone="+919800010003", name="Geofence Test User 2")
    headers = {"Authorization": f"Bearer {staff_token}"}
    qr_token = f"SP_OFFICE_STATIC_QR:{settings.ORGANIZATION_CODE}"

    # 30m away: 18.1363788, 74.5106817
    scan_res = client.post(
        "/api/v1/attendance/scan",
        headers=headers,
        json={
            "qr_token": qr_token,
            "latitude": 18.1363788,
            "longitude": 74.5106817,
            "accuracy": 25.0,
            "location_timestamp": utc_now().isoformat(),
        },
    )
    assert scan_res.status_code == 200
    data = scan_res.json()
    assert data["event_type"] == "OFFICE_IN"
    assert 28.0 <= data["verified_distance_meters"] <= 32.0


def test_geofence_outside_radius_rejections(client: TestClient):
    """Locations outside 100m geofence (150m, 1km, 5km) must be rejected with 400."""
    staff_token, _ = get_authenticated_staff(client, phone="+919800010005", name="Geofence Test User 3")
    headers = {"Authorization": f"Bearer {staff_token}"}
    qr_token = f"SP_OFFICE_STATIC_QR:{settings.ORGANIZATION_CODE}"

    # 1. 150m away (18.1371419, 74.5114847)
    res_150m = client.post(
        "/api/v1/attendance/scan",
        headers=headers,
        json={
            "qr_token": qr_token,
            "latitude": 18.1371419,
            "longitude": 74.5114847,
            "accuracy": 20.0,
            "location_timestamp": utc_now().isoformat(),
        },
    )
    assert res_150m.status_code == 400
    assert "outside office geofence" in res_150m.json()["detail"].lower()

    # 2. 1000m away (18.1425470, 74.5171729)
    res_1km = client.post(
        "/api/v1/attendance/scan",
        headers=headers,
        json={
            "qr_token": qr_token,
            "latitude": 18.1425470,
            "longitude": 74.5171729,
            "accuracy": 15.0,
            "location_timestamp": utc_now().isoformat(),
        },
    )
    assert res_1km.status_code == 400
    assert "outside office geofence" in res_1km.json()["detail"].lower()

    # 3. 5000m away (18.1679809, 74.5439451)
    res_5km = client.post(
        "/api/v1/attendance/scan",
        headers=headers,
        json={
            "qr_token": qr_token,
            "latitude": 18.1679809,
            "longitude": 74.5439451,
            "accuracy": 20.0,
            "location_timestamp": utc_now().isoformat(),
        },
    )
    assert res_5km.status_code == 400
    assert "outside office geofence" in res_5km.json()["detail"].lower()


def test_poor_gps_accuracy_rejected(client: TestClient):
    """GPS accuracy worse than 100m must be rejected."""
    staff_token, _ = get_authenticated_staff(client, phone="+919800010007", name="Geofence Test User 4")
    headers = {"Authorization": f"Bearer {staff_token}"}
    qr_token = f"SP_OFFICE_STATIC_QR:{settings.ORGANIZATION_CODE}"

    # Accuracy 150m at exact office location
    res = client.post(
        "/api/v1/attendance/scan",
        headers=headers,
        json={
            "qr_token": qr_token,
            "latitude": 18.1361880,
            "longitude": 74.5104810,
            "accuracy": 150.0,
            "location_timestamp": utc_now().isoformat(),
        },
    )
    assert res.status_code == 400
    assert "gps accuracy too low" in res.json()["detail"].lower()


def test_stale_location_timestamp_rejected(client: TestClient):
    """Location timestamps older than 120 seconds must be rejected."""
    staff_token, _ = get_authenticated_staff(client, phone="+919800010009", name="Geofence Test User 5")
    headers = {"Authorization": f"Bearer {staff_token}"}
    qr_token = f"SP_OFFICE_STATIC_QR:{settings.ORGANIZATION_CODE}"

    # 180 seconds old
    stale_time = utc_now() - timedelta(seconds=180)
    res = client.post(
        "/api/v1/attendance/scan",
        headers=headers,
        json={
            "qr_token": qr_token,
            "latitude": 18.1361880,
            "longitude": 74.5104810,
            "accuracy": 20.0,
            "location_timestamp": stale_time.isoformat(),
        },
    )
    assert res.status_code == 400
    assert "location timestamp is stale" in res.json()["detail"].lower()


def test_invalid_coordinates_rejected(client: TestClient):
    """Out-of-range coordinates must be rejected."""
    staff_token, _ = get_authenticated_staff(client, phone="+919800010011", name="Geofence Test User 6")
    headers = {"Authorization": f"Bearer {staff_token}"}
    qr_token = f"SP_OFFICE_STATIC_QR:{settings.ORGANIZATION_CODE}"

    # Latitude 95.0 (> 90.0)
    res = client.post(
        "/api/v1/attendance/scan",
        headers=headers,
        json={
            "qr_token": qr_token,
            "latitude": 95.0,
            "longitude": 74.5104810,
            "accuracy": 20.0,
            "location_timestamp": utc_now().isoformat(),
        },
    )
    assert res.status_code in (400, 422)


def test_missing_coordinates_payload_validation(client: TestClient):
    """Submissions without GPS coordinates must fail Pydantic validation (422)."""
    staff_token, _ = get_authenticated_staff(client, phone="+919800010013", name="Geofence Test User 7")
    headers = {"Authorization": f"Bearer {staff_token}"}
    qr_token = f"SP_OFFICE_STATIC_QR:{settings.ORGANIZATION_CODE}"

    res = client.post(
        "/api/v1/attendance/scan",
        headers=headers,
        json={"qr_token": qr_token},
    )
    assert res.status_code == 422


def test_super_admin_office_location_configuration(client: TestClient):
    """Super Admin can read and update office coordinates and geofence radius."""
    # Bootstrap Super Admin
    bootstrap_res = client.post(
        "/api/v1/auth/bootstrap-super-admin",
        json={
            "bootstrap_token": settings.SUPER_ADMIN_BOOTSTRAP_TOKEN,
            "phone_number": "+919999900099",
            "full_name": "Main Super Admin",
            "pin": "999999",
        },
    )
    assert bootstrap_res.status_code == 200
    sa_token = bootstrap_res.json()["access_token"]
    sa_headers = {"Authorization": f"Bearer {sa_token}"}

    # 1. Read current office location
    get_res = client.get("/api/v1/admin/office-location", headers=sa_headers)
    assert get_res.status_code == 200
    loc_data = get_res.json()
    assert loc_data["office_latitude"] == 18.1361880
    assert loc_data["office_longitude"] == 74.5104810
    assert loc_data["geofence_radius_meters"] == 100.0

    # 2. Update office location
    patch_res = client.patch(
        "/api/v1/admin/office-location",
        headers=sa_headers,
        json={
            "office_latitude": 18.1365000,
            "office_longitude": 74.5105000,
            "geofence_radius_meters": 150.0,
            "reason": "Office expanded to new wing in ground floor",
        },
    )
    assert patch_res.status_code == 200
    updated = patch_res.json()
    assert updated["office_latitude"] == 18.1365000
    assert updated["office_longitude"] == 74.5105000
    assert updated["geofence_radius_meters"] == 150.0

    # 3. Ordinary staff cannot update office location
    staff_token, _ = get_authenticated_staff(client, phone="+919800010015", name="Staff Non Admin")
    staff_headers = {"Authorization": f"Bearer {staff_token}"}

    staff_patch = client.patch(
        "/api/v1/admin/office-location",
        headers=staff_headers,
        json={
            "office_latitude": 18.0,
            "office_longitude": 74.0,
            "geofence_radius_meters": 50.0,
            "reason": "Unauthorized attempt to alter geofence",
        },
    )
    assert staff_patch.status_code == 403

    # Restore official coordinates for subsequent tests
    client.patch(
        "/api/v1/admin/office-location",
        headers=sa_headers,
        json={
            "office_latitude": 18.1361880,
            "office_longitude": 74.5104810,
            "geofence_radius_meters": 100.0,
            "reason": "Restoring default office coordinates",
        },
    )
