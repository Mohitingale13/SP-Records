import time
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from app.core.config import settings
from app.models.attendance import AttendanceRecord, AttendanceEventType
from app.models.role import RoleName
from app.services.attendance_service import AttendanceService
from app.services.qr_service import QRCodeService


def get_authenticated_staff(client: TestClient, phone: str = "+919876543220", name: str = "Pooja Kulkarni", pin: str = "123456"):
    login_res = client.post("/api/v1/auth/login", json={"phone_number": phone, "pin": pin})
    if login_res.status_code == 200:
        return login_res.json()["access_token"], login_res.json()["user"]
    res = client.post("/api/v1/auth/register", json={
        "full_name": name,
        "phone_number": phone,
        "pin": pin,
        "confirm_pin": pin,
    })
    return res.json()["access_token"], res.json()["user"]


def get_authenticated_admin(client: TestClient, phone: str = "+919876543299", name: str = "Branch Admin", pin: str = "123456"):
    # Bootstrap super admin first to elevate admin
    super_res = client.post(
        "/api/v1/auth/bootstrap-super-admin",
        json={"bootstrap_token": settings.SUPER_ADMIN_BOOTSTRAP_TOKEN, "phone_number": "+919999900002", "full_name": "Super Admin", "pin": "123456"},
    )
    super_token = super_res.json()["access_token"]

    # Register admin user as staff
    _, staff_user = get_authenticated_staff(client, phone=phone, name=name, pin=pin)
    user_id = staff_user["id"]

    # Super admin assigns ADMIN role
    elevate_res = client.put(
        f"/api/v1/admin/users/{user_id}/role",
        json={"role_name": "ADMIN"},
        headers={"Authorization": f"Bearer {super_token}"},
    )
    assert elevate_res.status_code == 200

    # Log in to get updated JWT with ADMIN role
    login_res = client.post("/api/v1/auth/login", json={"phone_number": phone, "pin": pin})
    return login_res.json()["access_token"]


def test_full_attendance_state_machine_cycle(client: TestClient, db_session: Session):
    staff_token, staff_user = get_authenticated_staff(client)
    admin_token = get_authenticated_admin(client)

    # Verify initial status: NOT_STARTED
    status_res = client.get("/api/v1/attendance/today-status", headers={"Authorization": f"Bearer {staff_token}"})
    assert status_res.status_code == 200
    data = status_res.json()
    assert data["status"] == "NOT_STARTED"
    assert data["next_expected_event"] == AttendanceEventType.OFFICE_IN.value

    # Temporarily set debounce to 0 for test cycle execution
    orig_interval = settings.SCAN_MIN_INTERVAL_SECONDS
    settings.SCAN_MIN_INTERVAL_SECONDS = 0

    expected_sequence = [
        (AttendanceEventType.OFFICE_IN.value, "CHECKED_IN", AttendanceEventType.LUNCH_BREAK_OUT.value),
        (AttendanceEventType.LUNCH_BREAK_OUT.value, "ON_LUNCH_BREAK", AttendanceEventType.LUNCH_BREAK_IN.value),
        (AttendanceEventType.LUNCH_BREAK_IN.value, "RETURNED_FROM_LUNCH", AttendanceEventType.OFFICE_OUT.value),
        (AttendanceEventType.OFFICE_OUT.value, "COMPLETED", None),
    ]

    try:
        # Permanent static office QR used by staff
        static_res = client.get("/api/v1/qr/office-static", headers={"Authorization": f"Bearer {staff_token}"})
        assert static_res.status_code == 200
        qr_token = static_res.json()["token"]

        for recorded_type, expected_status_after, next_expected in expected_sequence:
            # Staff scans permanent office QR
            scan_res = client.post(
                "/api/v1/attendance/scan",
                json={
                    "qr_token": qr_token,
                    "latitude": settings.OFFICE_LATITUDE,
                    "longitude": settings.OFFICE_LONGITUDE,
                    "accuracy": 15.0,
                },
                headers={"Authorization": f"Bearer {staff_token}"},
            )
            assert scan_res.status_code == 200
            scan_data = scan_res.json()
            assert scan_data["event_type"] == recorded_type

            # Check status after scan
            curr_status = client.get("/api/v1/attendance/today-status", headers={"Authorization": f"Bearer {staff_token}"}).json()
            assert curr_status["status"] == expected_status_after
            assert curr_status["next_expected_event"] == next_expected

        # 5th scan attempt when cycle is completed should fail
        fail_res = client.post(
            "/api/v1/attendance/scan",
            json={
                "qr_token": qr_token,
                "latitude": settings.OFFICE_LATITUDE,
                "longitude": settings.OFFICE_LONGITUDE,
                "accuracy": 15.0,
            },
            headers={"Authorization": f"Bearer {staff_token}"},
        )
        assert fail_res.status_code == 400
        assert "already completed" in fail_res.json()["detail"].lower()

    finally:
        settings.SCAN_MIN_INTERVAL_SECONDS = orig_interval
