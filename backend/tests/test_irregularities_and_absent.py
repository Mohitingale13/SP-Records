from datetime import date, datetime, timezone, timedelta
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from app.models.attendance import AttendanceEventType
from tests.test_attendance_state_machine import get_authenticated_staff, get_authenticated_admin
from app.services.report_service import ReportService


def test_admin_irregularities_detection(client: TestClient, db_session: Session):
    staff_token1, staff_user1 = get_authenticated_staff(client, phone="+919876543310", name="Irreg Staff One")
    staff_token2, staff_user2 = get_authenticated_staff(client, phone="+919876543311", name="Irreg Staff Two")
    admin_token = get_authenticated_admin(client, phone="+919876543312", name="Irreg Admin")

    past_date = (date.today() - timedelta(days=2)).isoformat()

    # Staff 1 has OFFICE_IN on past_date, but forgets to checkout
    res1 = client.post(
        "/api/v1/admin/attendance/manual-add",
        json={
            "user_id": staff_user1["id"],
            "event_type": AttendanceEventType.OFFICE_IN.value,
            "event_date": past_date,
            "scanned_at": f"{past_date}T09:30:00Z",
            "reason": "Test setup for missing checkout",
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert res1.status_code == 200

    # Staff 2 has NO attendance on past_date (office was open because staff 1 attended)
    # Check irregularities endpoint
    irreg_res = client.get("/api/v1/admin/irregularities?days=7", headers={"Authorization": f"Bearer {admin_token}"})
    assert irreg_res.status_code == 200
    data = irreg_res.json()
    assert "total_irregularities" in data
    assert data["total_irregularities"] >= 2
    types = [i["type"] for i in data["irregularities"]]
    assert "MISSING_CHECKOUT" in types
    assert "NOT_MARKED" in types


def test_pdf_report_shows_absent_for_unmarked_day(client: TestClient, db_session: Session):
    staff_token1, staff_user1 = get_authenticated_staff(client, phone="+919876543320", name="Present Staff")
    staff_token2, staff_user2 = get_authenticated_staff(client, phone="+919876543321", name="Absent Staff")
    admin_token = get_authenticated_admin(client, phone="+919876543322", name="Reporting Admin")

    test_date = (date.today() - timedelta(days=3))
    test_date_str = test_date.isoformat()

    # Add complete punches for Staff 1
    client.post(
        "/api/v1/admin/attendance/manual-add",
        json={
            "user_id": staff_user1["id"],
            "event_type": AttendanceEventType.OFFICE_IN.value,
            "event_date": test_date_str,
            "scanned_at": f"{test_date_str}T09:30:00Z",
            "reason": "Setup check in",
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    client.post(
        "/api/v1/admin/attendance/manual-add",
        json={
            "user_id": staff_user1["id"],
            "event_type": AttendanceEventType.OFFICE_OUT.value,
            "event_date": test_date_str,
            "scanned_at": f"{test_date_str}T18:00:00Z",
            "reason": "Setup check out",
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    # Generate Weekly PDF in English and Marathi
    pdf_en = ReportService.generate_attendance_pdf(
        db=db_session,
        start_date=test_date,
        end_date=test_date,
        report_type="WEEKLY",
        lang="en",
    )
    assert len(pdf_en) > 1000

    pdf_mr = ReportService.generate_attendance_pdf(
        db=db_session,
        start_date=test_date,
        end_date=test_date,
        report_type="WEEKLY",
        lang="mr",
    )
    assert len(pdf_mr) > 1000

