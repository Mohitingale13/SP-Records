from datetime import date
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from app.core.config import settings
from app.models.role import RoleName
from tests.test_attendance_state_machine import get_authenticated_staff, get_authenticated_admin


def test_weekly_pdf_report_english(client: TestClient, db_session: Session):
    admin_token = get_authenticated_admin(client, phone="+919876543301", name="Branch Manager")
    res = client.get(
        "/api/v1/admin/reports/weekly.pdf?start_date=2026-11-09&lang=en",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert res.status_code == 200
    assert res.headers["content-type"] == "application/pdf"
    assert len(res.content) > 1000
    assert "Shivam_Patsanstha_Weekly_Attendance" in res.headers["content-disposition"]


def test_weekly_pdf_report_marathi(client: TestClient, db_session: Session):
    admin_token = get_authenticated_admin(client, phone="+919876543302", name="Branch Manager 2")
    res = client.get(
        "/api/v1/admin/reports/weekly.pdf?start_date=2026-11-09&lang=mr",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert res.status_code == 200
    assert res.headers["content-type"] == "application/pdf"
    assert len(res.content) > 1000


def test_monthly_pdf_report(client: TestClient, db_session: Session):
    admin_token = get_authenticated_admin(client, phone="+919876543303", name="Branch Manager 3")
    res = client.get(
        "/api/v1/admin/reports/monthly.pdf?year=2026&month=11&lang=en",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert res.status_code == 200
    assert res.headers["content-type"] == "application/pdf"
    assert len(res.content) > 1000
    assert "Shivam_Patsanstha_Monthly_Attendance" in res.headers["content-disposition"]


def test_staff_cannot_download_reports(client: TestClient, db_session: Session):
    staff_token, _ = get_authenticated_staff(client, phone="+919876543304", name="Staff Unauthorized")
    res = client.get(
        "/api/v1/admin/reports/weekly.pdf?lang=en",
        headers={"Authorization": f"Bearer {staff_token}"},
    )
    assert res.status_code == 403


def test_super_admin_role_assignment_and_revocation(client: TestClient, db_session: Session):
    # Bootstrap super admin
    super_auth = client.post(
        "/api/v1/auth/bootstrap-super-admin",
        json={
            "bootstrap_token": settings.SUPER_ADMIN_BOOTSTRAP_TOKEN,
            "phone_number": "+919999900003",
            "full_name": "Super Admin Master",
            "pin": "123456",
        },
    )
    assert super_auth.status_code == 200
    super_token = super_auth.json()["access_token"]

    # Register candidate staff
    staff_auth = client.post(
        "/api/v1/auth/register",
        json={
            "phone_number": "+919876543305",
            "full_name": "Kailash Gaikwad",
            "pin": "123456",
            "confirm_pin": "123456",
        },
    )
    assert staff_auth.status_code == 200
    candidate_id = staff_auth.json()["user"]["id"]
    assert staff_auth.json()["user"]["role"] == RoleName.STAFF.value

    # Super admin elevates candidate to ADMIN
    elevate_res = client.put(
        f"/api/v1/admin/users/{candidate_id}/role",
        json={"role_name": "ADMIN"},
        headers={"Authorization": f"Bearer {super_token}"},
    )
    assert elevate_res.status_code == 200
    assert elevate_res.json()["role"]["name"] == RoleName.ADMIN.value

    # Super admin revokes ADMIN back to STAFF
    revoke_res = client.put(
        f"/api/v1/admin/users/{candidate_id}/role",
        json={"role_name": "STAFF"},
        headers={"Authorization": f"Bearer {super_token}"},
    )
    assert revoke_res.status_code == 200
    assert revoke_res.json()["role"]["name"] == RoleName.STAFF.value


def test_ordinary_admin_cannot_alter_roles(client: TestClient, db_session: Session):
    admin_token = get_authenticated_admin(client, phone="+919876543306", name="Standard Admin")
    _, staff_user = get_authenticated_staff(client, phone="+919876543307", name="Target Staff")

    res = client.put(
        f"/api/v1/admin/users/{staff_user['id']}/role",
        json={"role_name": "ADMIN"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert res.status_code == 403

