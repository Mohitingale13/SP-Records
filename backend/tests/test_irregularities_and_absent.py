from datetime import date, datetime, timezone, timedelta
import uuid
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from app.models.attendance import AttendanceEventType, AttendanceRecord
from app.models.user import User
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


def test_uncommon_timestamps_and_admin_lunch_exception(client: TestClient, db_session: Session):
    staff_token, staff_user = get_authenticated_staff(client, phone="+919876543330", name="Close Punch Staff")
    admin_token = get_authenticated_admin(client, phone="+919876543331", name="Lunch Exception Admin")

    admin_obj = db_session.query(User).filter(User.phone_number == "+919876543331").first()
    staff_uid = uuid.UUID(staff_user["id"])
    org_id = admin_obj.organization_id
    target_date = date.today() - timedelta(days=1)

    # Staff forgot morning punch and punched OFFICE_IN (07:58 UTC) and LUNCH_BREAK_OUT (07:59 UTC) 1 min apart
    for ev_type, hour, minute in [
        (AttendanceEventType.OFFICE_IN.value, 7, 58),
        (AttendanceEventType.LUNCH_BREAK_OUT.value, 7, 59),
        (AttendanceEventType.LUNCH_BREAK_IN.value, 8, 30),
        (AttendanceEventType.OFFICE_OUT.value, 12, 30),
    ]:
        db_session.add(
            AttendanceRecord(
                user_id=staff_uid,
                organization_id=org_id,
                event_type=ev_type,
                event_date=target_date,
                scanned_at=datetime(target_date.year, target_date.month, target_date.day, hour, minute, tzinfo=timezone.utc),
                verification_method="QR_GPS",
                is_manually_corrected=False,
            )
        )

    # Admin has LUNCH_BREAK_OUT (12:28 UTC), LUNCH_BREAK_IN (12:29 UTC), OFFICE_OUT (12:30 UTC) -> ALL lunch checks skipped!
    for ev_type, hour, minute in [
        (AttendanceEventType.OFFICE_IN.value, 4, 0),
        (AttendanceEventType.LUNCH_BREAK_OUT.value, 12, 28),
        (AttendanceEventType.LUNCH_BREAK_IN.value, 12, 29),
        (AttendanceEventType.OFFICE_OUT.value, 12, 30),
    ]:
        db_session.add(
            AttendanceRecord(
                user_id=admin_obj.id,
                organization_id=org_id,
                event_type=ev_type,
                event_date=target_date,
                scanned_at=datetime(target_date.year, target_date.month, target_date.day, hour, minute, tzinfo=timezone.utc),
                verification_method="QR_GPS",
                is_manually_corrected=False,
            )
        )
    db_session.commit()

    # Admin irregularities check
    res = client.get("/api/v1/admin/irregularities?days=7", headers={"Authorization": f"Bearer {admin_token}"})
    assert res.status_code == 200
    data = res.json()

    staff_uncommon = [
        i for i in data["irregularities"]
        if i["user_id"] == str(staff_uid) and i["date"] == target_date.isoformat() and i["type"] == "UNCOMMON_TIMESTAMPS"
    ]
    admin_uncommon = [
        i for i in data["irregularities"]
        if i["user_id"] == str(admin_obj.id) and i["date"] == target_date.isoformat() and i["type"] == "UNCOMMON_TIMESTAMPS"
    ]
    assert len(staff_uncommon) == 1
    assert len(admin_uncommon) == 0


def test_member_irregularities_report_and_ignore(client: TestClient, db_session: Session):
    staff_token1, staff_user1 = get_authenticated_staff(client, phone="+919876543340", name="Reporter Staff")
    staff_token2, staff_user2 = get_authenticated_staff(client, phone="+919876543341", name="Ignorer Staff")
    admin_token = get_authenticated_admin(client, phone="+919876543342", name="Review Admin")

    admin_obj = db_session.query(User).filter(User.phone_number == "+919876543342").first()
    s1_uid = uuid.UUID(staff_user1["id"])
    s2_uid = uuid.UUID(staff_user2["id"])
    org_id = admin_obj.organization_id
    target_date = date.today() - timedelta(days=1)

    # Both staff have uncommon timestamps on target_date
    for uid in (s1_uid, s2_uid):
        for ev_type, hour, minute in [
            (AttendanceEventType.OFFICE_IN.value, 4, 0),
            (AttendanceEventType.LUNCH_BREAK_OUT.value, 8, 0),
            (AttendanceEventType.LUNCH_BREAK_IN.value, 8, 30),
            (AttendanceEventType.OFFICE_OUT.value, 8, 31),  # 1 min after lunch return
        ]:
            db_session.add(
                AttendanceRecord(
                    user_id=uid,
                    organization_id=org_id,
                    event_type=ev_type,
                    event_date=target_date,
                    scanned_at=datetime(target_date.year, target_date.month, target_date.day, hour, minute, tzinfo=timezone.utc),
                    verification_method="QR_GPS",
                    is_manually_corrected=False,
                )
            )
    db_session.commit()

    # Staff 1 fetches own irregularities and REPORTS
    s1_res = client.get("/api/v1/attendance/irregularities?days=7", headers={"Authorization": f"Bearer {staff_token1}"})
    assert s1_res.status_code == 200
    s1_items = [i for i in s1_res.json()["irregularities"] if i["date"] == target_date.isoformat()]
    assert len(s1_items) == 1
    s1_item = s1_items[0]

    act1 = client.post(
        "/api/v1/attendance/irregularities/action",
        json={
            "irregularity_id": s1_item["id"],
            "event_date": s1_item["date"],
            "irregularity_type": s1_item["type"],
            "action": "REPORTED",
        },
        headers={"Authorization": f"Bearer {staff_token1}"},
    )
    assert act1.status_code == 200
    assert act1.json()["status"] == "REPORTED"

    # Staff 2 fetches own irregularities and IGNORES
    s2_res = client.get("/api/v1/attendance/irregularities?days=7", headers={"Authorization": f"Bearer {staff_token2}"})
    assert s2_res.status_code == 200
    s2_items = [i for i in s2_res.json()["irregularities"] if i["date"] == target_date.isoformat()]
    assert len(s2_items) == 1
    s2_item = s2_items[0]

    act2 = client.post(
        "/api/v1/attendance/irregularities/action",
        json={
            "irregularity_id": s2_item["id"],
            "event_date": s2_item["date"],
            "irregularity_type": s2_item["type"],
            "action": "IGNORED",
        },
        headers={"Authorization": f"Bearer {staff_token2}"},
    )
    assert act2.status_code == 200
    assert act2.json()["status"] == "IGNORED"

    # Staff 2's list no longer shows the ignored item
    s2_after = client.get("/api/v1/attendance/irregularities?days=7", headers={"Authorization": f"Bearer {staff_token2}"})
    assert all(i["id"] != s2_item["id"] for i in s2_after.json()["irregularities"])

    # Admin's list shows BOTH (reported_count >= 1, and Staff 2's item is still visible normally to Admin!)
    admin_res = client.get("/api/v1/admin/irregularities?days=7", headers={"Authorization": f"Bearer {admin_token}"})
    assert admin_res.status_code == 200
    admin_data = admin_res.json()
    assert admin_data["reported_count"] >= 1
    ids_map = {i["id"]: i for i in admin_data["irregularities"]}
    assert ids_map[s1_item["id"]]["member_status"] == "REPORTED"
    assert s2_item["id"] in ids_map


