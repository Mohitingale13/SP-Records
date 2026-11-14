import sys
import os
from datetime import date

# Add parent directory to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.db.session import SessionLocal
from app.services.report_service import ReportService

def main():
    db = SessionLocal()
    try:
        # Generate English Weekly
        pdf_en = ReportService.generate_attendance_pdf(
            db,
            start_date=date(2026, 11, 9),
            end_date=date(2026, 11, 15),
            report_type="WEEKLY",
            lang="en",
        )
        with open("sample_weekly_en.pdf", "wb") as f:
            f.write(pdf_en)
        print("Generated sample_weekly_en.pdf, size:", len(pdf_en))

        # Generate Marathi Weekly
        pdf_mr = ReportService.generate_attendance_pdf(
            db,
            start_date=date(2026, 11, 9),
            end_date=date(2026, 11, 15),
            report_type="WEEKLY",
            lang="mr",
        )
        with open("sample_weekly_mr.pdf", "wb") as f:
            f.write(pdf_mr)
        print("Generated sample_weekly_mr.pdf, size:", len(pdf_mr))

        # Generate Marathi Monthly
        pdf_month_mr = ReportService.generate_attendance_pdf(
            db,
            start_date=date(2026, 11, 1),
            end_date=date(2026, 11, 30),
            report_type="MONTHLY",
            lang="mr",
        )
        with open("sample_monthly_mr.pdf", "wb") as f:
            f.write(pdf_month_mr)
        print("Generated sample_monthly_mr.pdf, size:", len(pdf_month_mr))

    finally:
        db.close()

if __name__ == "__main__":
    main()

