import sys
import os
import uuid
from datetime import date, datetime, timedelta

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.db.session import SessionLocal, engine
from app.db.base import Base
from app.models.organization import Organization
from app.models.role import Role, RoleName
from app.models.user import User
from app.models.attendance import AttendanceRecord, AttendanceEventType
from app.models.audit import AttendanceAuditLog, AuditAction
from app.services.report_service import ReportService
import pypdf

def setup_realistic_data(db):
    # Ensure organization
    org = db.query(Organization).first()
    if not org:
        org = Organization(name="Shivam Patsanstha", code="SP_MAIN")
        db.add(org)
        db.commit()
        db.refresh(org)

    role_staff = db.query(Role).filter_by(name=RoleName.STAFF.value).first()
    if not role_staff:
        role_staff = Role(name=RoleName.STAFF.value, description="Staff")
        db.add(role_staff)
        db.commit()
        db.refresh(role_staff)

    # Create 5 realistic staff members (bilingual names)
    staff_data = [
        ("रमेश पाटील (Ramesh Patil)", "9820011111"),
        ("सुनीता भोसले (Sunita Bhosale)", "9820022222"),
        ("अमित देशमुख (Amit Deshmukh)", "9820033333"),
        ("प्रिया सावंत (Priya Sawant)", "9820044444"),
        ("गणेश जाधव (Ganesh Jadhav)", "9820055555"),
    ]

    staff_objs = []
    for name, phone in staff_data:
        u = db.query(User).filter_by(phone_number=phone).first()
        if not u:
            u = User(
                organization_id=org.id,
                role_id=role_staff.id,
                full_name=name,
                phone_number=phone,
            )
            db.add(u)
            db.commit()
            db.refresh(u)
        staff_objs.append(u)

    # Seed 7 days of attendance (Nov 9 to Nov 15, 2026)
    base_monday = date(2026, 11, 9)
    for day_offset in range(6): # Mon to Sat
        d = base_monday + timedelta(days=day_offset)
        for idx, staff in enumerate(staff_objs):
            # Check existing
            existing = db.query(AttendanceRecord).filter_by(user_id=staff.id, event_date=d).first()
            if existing:
                continue

            # Varied employee patterns:
            # Staff 0: Always complete
            # Staff 1: Complete with manual correction on Wednesday
            # Staff 2: On break (missed office out on Thursday)
            # Staff 3: Absent on Friday
            # Staff 4: Checked in but half day
            if idx == 3 and day_offset == 4:
                continue # absent

            t_in = datetime(2026, 11, d.day, 9, 30 + idx, 0)
            rec_in = AttendanceRecord(
                user_id=staff.id,
                organization_id=org.id,
                event_type=AttendanceEventType.OFFICE_IN.value,
                event_date=d,
                scanned_at=t_in,
            )
            db.add(rec_in)

            if not (idx == 4 and day_offset % 2 == 1):
                t_lout = datetime(2026, 11, d.day, 13, 0, 0)
                rec_lout = AttendanceRecord(
                    user_id=staff.id,
                    organization_id=org.id,
                    event_type=AttendanceEventType.LUNCH_BREAK_OUT.value,
                    event_date=d,
                    scanned_at=t_lout,
                )
                db.add(rec_lout)

                t_lin = datetime(2026, 11, d.day, 13, 45, 0)
                rec_lin = AttendanceRecord(
                    user_id=staff.id,
                    organization_id=org.id,
                    event_type=AttendanceEventType.LUNCH_BREAK_IN.value,
                    event_date=d,
                    scanned_at=t_lin,
                )
                db.add(rec_lin)

            if not (idx == 2 and day_offset == 3):
                t_out = datetime(2026, 11, d.day, 18, 15, 0)
                is_corrected = (idx == 1 and day_offset == 2)
                rec_out = AttendanceRecord(
                    user_id=staff.id,
                    organization_id=org.id,
                    event_type=AttendanceEventType.OFFICE_OUT.value,
                    event_date=d,
                    scanned_at=t_out,
                    is_manually_corrected=is_corrected,
                )
                db.add(rec_out)

    db.commit()
    print("Database seeded with realistic staff and attendance records!")

def inspect_pdfs():
    db = SessionLocal()
    try:
        setup_realistic_data(db)

        # 1. Weekly English
        pdf_en = ReportService.generate_attendance_pdf(
            db,
            start_date=date(2026, 11, 9),
            end_date=date(2026, 11, 15),
            report_type="WEEKLY",
            lang="en",
        )
        with open("sample_realistic_weekly_en.pdf", "wb") as f:
            f.write(pdf_en)
        reader_en = pypdf.PdfReader("sample_realistic_weekly_en.pdf")
        print("Weekly EN: Pages =", len(reader_en.pages), "Size =", len(pdf_en))

        # 2. Weekly Marathi
        pdf_mr = ReportService.generate_attendance_pdf(
            db,
            start_date=date(2026, 11, 9),
            end_date=date(2026, 11, 15),
            report_type="WEEKLY",
            lang="mr",
        )
        with open("sample_realistic_weekly_mr.pdf", "wb") as f:
            f.write(pdf_mr)
        reader_mr = pypdf.PdfReader("sample_realistic_weekly_mr.pdf")
        print("Weekly MR: Pages =", len(reader_mr.pages), "Size =", len(pdf_mr))
        for p_idx, page in enumerate(reader_mr.pages):
            text = page.extract_text()
            print(f"--- MR Page {p_idx+1} (first 300 chars) ---")
            print(repr(text[:300]))

        # 3. Monthly Marathi
        pdf_m_mr = ReportService.generate_attendance_pdf(
            db,
            start_date=date(2026, 11, 1),
            end_date=date(2026, 11, 30),
            report_type="MONTHLY",
            lang="mr",
        )
        with open("sample_realistic_monthly_mr.pdf", "wb") as f:
            f.write(pdf_m_mr)
        reader_m_mr = pypdf.PdfReader("sample_realistic_monthly_mr.pdf")
        print("Monthly MR: Pages =", len(reader_m_mr.pages), "Size =", len(pdf_m_mr))

    finally:
        db.close()

if __name__ == "__main__":
    inspect_pdfs()
