from datetime import date, datetime, timezone
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from app.models.attendance import AttendanceEventType
from tests.test_attendance_state_machine import get_authenticated_staff, get_authenticated_admin


def test_admin_manual_addition_with_audit_log(client: TestClient, db_session: Session):
    staff_token, staff_user = get_authenticated_staff(client, phone="+919876543270", name="Deepak Mane")
    admin_token = get_authenticated_admin(client, phone="+919876543271", name="Admin Supervisor")

    # Staff attempts to call admin manual-add -> 403 Forbidden
    forbidden_res = client.post(
        "/api/v1/admin/attendance/manual-add",
        json={
            "user_id": staff_user["id"],
            "event_type": AttendanceEventType.OFFICE_IN.value,
            "event_date": "2026-11-14",
            "scanned_at": "2026-11-14T09:00:00Z",
            "reason": "Staff forgot phone at home, authorized by branch head",
        },
        headers={"Authorization": f"Bearer {staff_token}"},
    )
    assert forbidden_res.status_code == 403

    # Admin calls manual-add -> 200 OK
    admin_res = client.post(
        "/api/v1/admin/attendance/manual-add",
        json={
            "user_id": staff_user["id"],
            "event_type": AttendanceEventType.OFFICE_IN.value,
            "event_date": "2026-11-14",
            "scanned_at": "2026-11-14T09:00:00Z",
            "reason": "Staff forgot phone at home, authorized by branch head",
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert admin_res.status_code == 200
    record_data = admin_res.json()
    assert record_data["is_manually_corrected"] is True
    record_id = record_data["id"]

    # Verify audit log was recorded
    audit_res = client.get("/api/v1/admin/audit-logs", headers={"Authorization": f"Bearer {admin_token}"})
    assert audit_res.status_code == 200
    logs = audit_res.json()
    assert len(logs) > 0
    assert logs[0]["action"] == "MANUAL_ADDITION"
    assert "forgot phone" in logs[0]["reason"]


def test_admin_daily_monitor(client: TestClient, db_session: Session):
    get_authenticated_staff(client, phone="+919876543280", name="Staff Member Alpha")
    admin_token = get_authenticated_admin(client, phone="+919876543281", name="Admin Manager")

    res = client.get("/api/v1/admin/daily-monitor", headers={"Authorization": f"Bearer {admin_token}"})
    assert res.status_code == 200
    data = res.json()
    assert "counts" in data
    assert "staff_attendance" in data
    assert data["counts"]["total_staff"] >= 1


def test_admin_correction_and_staff_history(client: TestClient, db_session: Session):
    staff_token, staff_user = get_authenticated_staff(client, phone="+919876543290", name="Vijay Shinde")
    admin_token = get_authenticated_admin(client, phone="+919876543291", name="Admin Reviewer")

    # Add initial record
    add_res = client.post(
        "/api/v1/admin/attendance/manual-add",
        json={
            "user_id": staff_user["id"],
            "event_type": AttendanceEventType.OFFICE_IN.value,
            "event_date": "2026-11-14",
            "scanned_at": "2026-11-14T09:15:00Z",
            "reason": "Initial manual check-in entry",
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert add_res.status_code == 200
    rec_id = add_res.json()["id"]

    # Staff attempts correction -> 403 Forbidden
    forbidden_correct = client.put(
        "/api/v1/admin/attendance/correct",
        json={
            "record_id": rec_id,
            "new_scanned_at": "2026-11-14T09:05:00Z",
            "reason": "Staff attempting self modification",
        },
        headers={"Authorization": f"Bearer {staff_token}"},
    )
    assert forbidden_correct.status_code == 403

    # Admin corrects timestamp
    correct_res = client.put(
        "/api/v1/admin/attendance/correct",
        json={
            "record_id": rec_id,
            "new_scanned_at": "2026-11-14T09:05:00Z",
            "reason": "Verified against entry CCTV timestamp adjustment",
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert correct_res.status_code == 200
    assert correct_res.json()["is_manually_corrected"] is True

    # Admin checks staff history
    history_res = client.get(
        f"/api/v1/admin/staff/{staff_user['id']}/history",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert history_res.status_code == 200
    history_records = history_res.json()
    assert len(history_records) >= 1
    assert history_records[0]["id"] == rec_id

    # Verify CORRECTION audit log
    audit_res = client.get("/api/v1/admin/audit-logs", headers={"Authorization": f"Bearer {admin_token}"})
    assert audit_res.status_code == 200
    logs = audit_res.json()
    assert any(log["action"] == "CORRECTION" and "CCTV" in log["reason"] for log in logs)


