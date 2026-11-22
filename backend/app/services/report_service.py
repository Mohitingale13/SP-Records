import io
import os
import re
from datetime import date, datetime, timedelta
from typing import List, Dict, Any, Optional
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    KeepTogether,
    Image as RLImage,
)
from reportlab.graphics.shapes import Drawing
from reportlab.graphics.barcode.qr import QrCodeWidget
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from sqlalchemy.orm import Session
from app.models.user import User
from app.models.role import Role
from app.models.attendance import AttendanceRecord, AttendanceEventType
from app.core.timezone import format_kolkata_time, format_kolkata_datetime, utc_now

# Register Devanagari Unicode Fonts
FONT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "assets", "fonts"))
REGULAR_FONT_PATH = os.path.join(FONT_DIR, "NotoSansDevanagari-Regular.ttf")
BOLD_FONT_PATH = os.path.join(FONT_DIR, "NotoSansDevanagari-Bold.ttf")
LOGO_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "assets", "logo-circle.png"))

MARATHI_MONTHS = {
    1: "जानेवारी", 2: "फेब्रुवारी", 3: "मार्च", 4: "एप्रिल",
    5: "मे", 6: "जून", 7: "जुलै", 8: "ऑगस्ट",
    9: "सप्टेंबर", 10: "ऑक्टोबर", 11: "नोव्हेंबर", 12: "डिसेंबर"
}

MARATHI_DAYS = {
    0: "सोम", 1: "मंगळ", 2: "बुध", 3: "गुरु", 4: "शुक्र", 5: "शनि", 6: "रवि"
}

def format_report_date(d: date, is_marathi: bool) -> str:
    if is_marathi:
        month_name = MARATHI_MONTHS.get(d.month, "")
        day_name = MARATHI_DAYS.get(d.weekday(), "")
        return f"{d.day:02d} {month_name} {d.year} ({day_name})"
    return d.strftime("%d %b %Y (%a)")

def format_report_period(start_d: date, end_d: date, is_marathi: bool) -> str:
    if is_marathi:
        start_m = MARATHI_MONTHS.get(start_d.month, "")
        end_m = MARATHI_MONTHS.get(end_d.month, "")
        return f"{start_d.day:02d} {start_m} {start_d.year} – {end_d.day:02d} {end_m} {end_d.year}"
    return f"{start_d.strftime('%d %b %Y')} – {end_d.strftime('%d %b %Y')}"

def calculate_work_seconds(
    in_evt: Optional[AttendanceRecord],
    l_out_evt: Optional[AttendanceRecord],
    l_in_evt: Optional[AttendanceRecord],
    out_evt: Optional[AttendanceRecord],
) -> float:
    """
    Calculates total productive working seconds for a day, strictly excluding lunch break.
    - If full 4-step shift: (LUNCH_OUT - IN) + (OUT - LUNCH_IN)
    - If 2-step shift without lunch punches: (OUT - IN)
    - If shift incomplete (missing OUT): 0.0
    """
    if not in_evt or not out_evt:
        return 0.0

    in_time = in_evt.scanned_at
    out_time = out_evt.scanned_at

    if out_time < in_time:
        return 0.0

    # If both lunch break punches exist in valid chronological order
    if (
        l_out_evt
        and l_in_evt
        and in_time <= l_out_evt.scanned_at <= l_in_evt.scanned_at <= out_time
    ):
        morning_sec = (l_out_evt.scanned_at - in_time).total_seconds()
        afternoon_sec = (out_time - l_in_evt.scanned_at).total_seconds()
        return max(0.0, morning_sec + afternoon_sec)

    # If no lunch break punches, return total elapsed shift duration
    return max(0.0, (out_time - in_time).total_seconds())

def format_duration(seconds: float, is_marathi: bool) -> str:
    """Formats seconds into human-readable duration (e.g. 7h 45m / 7 तास 45 मि)."""
    if seconds <= 0:
        return "—"
    total_min = int(round(seconds / 60))
    hours = total_min // 60
    minutes = total_min % 60
    if is_marathi:
        mi_lbl = fix_devanagari_i_matra("मि")
        if hours > 0 and minutes > 0:
            return f"{hours} तास {minutes:02d} {mi_lbl}"
        elif hours > 0:
            return f"{hours} तास"
        else:
            return f"{minutes} {mi_lbl}"
    else:
        if hours > 0 and minutes > 0:
            return f"{hours}h {minutes:02d}m"
        elif hours > 0:
            return f"{hours}h"
        else:
            return f"{minutes}m"

HAS_DEVANAGARI_FONT = False
if os.path.exists(REGULAR_FONT_PATH):
    try:
        pdfmetrics.registerFont(TTFont("Devanagari", REGULAR_FONT_PATH))
        if os.path.exists(BOLD_FONT_PATH):
            pdfmetrics.registerFont(TTFont("Devanagari-Bold", BOLD_FONT_PATH))
        else:
            pdfmetrics.registerFont(TTFont("Devanagari-Bold", REGULAR_FONT_PATH))
        HAS_DEVANAGARI_FONT = True
    except Exception as e:
        print(f"Warning: Failed to register Devanagari font: {e}")


def fix_devanagari_i_matra(text: str) -> str:
    """
    Reorders Unicode Devanagari short-i vowel signs (\u093f) before consonant clusters.
    ReportLab's TrueType engine lacks OpenType GSUB reordering; moving \u093f before
    the base consonant cluster prevents combining marks from rendering onto following characters
    (e.g. fixes 'शविम' -> 'शिवम', 'बगिर' -> 'बिगर', 'मर्यादति' -> 'मर्यादित', 'डजिटिल' -> 'डिजिटल').
    """
    if not text or not HAS_DEVANAGARI_FONT:
        return text
    pattern = r'((?:[\u0915-\u0939]\u093c?\u094d)*[\u0915-\u0939]\u093c?)\u093f'
    I_MATRA = '\u093f'
    return re.sub(pattern, lambda m: I_MATRA + m.group(1), text)


class NumberedCanvas(canvas.Canvas):
    """Adds Page X of Y to all pages in the PDF document."""
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_number(num_pages)
            super().showPage()
        super().save()

    def draw_page_number(self, page_count):
        self.saveState()
        self.setFont("Helvetica", 8)
        self.setFillColor(colors.HexColor("#64868B"))
        # A4 landscape width is 841.89 points, height is 595.27 points
        page_text = f"Page {self._pageNumber} of {page_count}"
        self.drawRightString(841.89 - 36, 24, page_text)
        self.drawString(36, 24, "Shivam Gramin Bigar Sheti Sahakari Patsanstha Maryadit – Confidential Digital Attendance Record")
        self.restoreState()


class ReportService:
    @staticmethod
    def get_weekly_date_range(any_date_in_week: date) -> tuple[date, date]:
        """Calculates Monday to Sunday range for the given week."""
        start_date = any_date_in_week - timedelta(days=any_date_in_week.weekday())  # Monday
        end_date = start_date + timedelta(days=6)  # Sunday
        return start_date, end_date

    @staticmethod
    def get_monthly_date_range(year: int, month: int) -> tuple[date, date]:
        """Calculates full month start and end dates."""
        start_date = date(year, month, 1)
        if month == 12:
            next_month = date(year + 1, 1, 1)
        else:
            next_month = date(year, month + 1, 1)
        end_date = next_month - timedelta(days=1)
        return start_date, end_date

    @staticmethod
    def generate_attendance_pdf(
        db: Session,
        start_date: date,
        end_date: date,
        report_type: str,  # "WEEKLY" or "MONTHLY"
        lang: str = "en",  # "en" or "mr"
    ) -> bytes:
        is_marathi = (lang == "mr") and HAS_DEVANAGARI_FONT
        font_regular = "Devanagari" if is_marathi else "Helvetica"
        font_bold = "Devanagari-Bold" if is_marathi else "Helvetica-Bold"

        # Localization Labels
        if is_marathi:
            L = {
                "org_name": fix_devanagari_i_matra("शिवम ग्रामीण बिगर शेती सहकारी पतसंस्था मर्यादित"),
                "register_title": fix_devanagari_i_matra("डिजिटल उपस्थिती नोंदवही"),
                "weekly_title": fix_devanagari_i_matra("साप्ताहिक उपस्थिती अहवाल"),
                "monthly_title": fix_devanagari_i_matra("मासिक उपस्थिती अहवाल"),
                "period": fix_devanagari_i_matra("कालावधी"),
                "generated_on": fix_devanagari_i_matra("निर्मिती वेळ"),
                "col_employee": fix_devanagari_i_matra("कर्मचाऱ्याचे नाव"),
                "col_in": fix_devanagari_i_matra("कार्यालय आगमन"),
                "col_lunch_out": fix_devanagari_i_matra("जेवण (बाहेर)"),
                "col_lunch_in": fix_devanagari_i_matra("जेवण (परत)"),
                "col_out": fix_devanagari_i_matra("कार्यालय निर्गमन"),
                "col_status": fix_devanagari_i_matra("स्थिती"),
                "col_work_hours": fix_devanagari_i_matra("कामाचे तास"),
                "status_completed": fix_devanagari_i_matra("पूर्ण"),
                "status_incomplete": fix_devanagari_i_matra("अपूर्ण"),
                "status_not_started": fix_devanagari_i_matra("नोंद नाही"),
                "status_absent": fix_devanagari_i_matra("गैरहजर"),
                "no_records": fix_devanagari_i_matra("या कालावधीसाठी कोणत्याही उपस्थिती नोंदी आढळल्या नाहीत."),
                "weekly_summary_title": fix_devanagari_i_matra("साप्ताहिक कर्मचारी कामाचे तास सारांश"),
                "monthly_summary_title": fix_devanagari_i_matra("मासिक कर्मचारी कामाचे तास सारांश"),
                "col_staff_name": fix_devanagari_i_matra("कर्मचाऱ्याचे नाव"),
                "col_completed_days": fix_devanagari_i_matra("पूर्ण उपस्थिती दिवस"),
                "col_total_hours": fix_devanagari_i_matra("एकूण कामाचे तास"),
                "col_avg_hours": fix_devanagari_i_matra("दैनंदिन सरासरी"),
                "grand_total": fix_devanagari_i_matra("एकूण संस्था तास"),
            }
        else:
            L = {
                "org_name": "Shivam Gramin Bigar Sheti Sahakari Patsanstha Maryadit",
                "register_title": "Digital Attendance Register",
                "weekly_title": "Weekly Attendance Report",
                "monthly_title": "Monthly Attendance Report",
                "period": "Reporting Period",
                "generated_on": "Generated On",
                "col_employee": "Employee Name",
                "col_in": "Office In",
                "col_lunch_out": "Lunch Out",
                "col_lunch_in": "Lunch In",
                "col_out": "Office Out",
                "col_status": "Status",
                "col_work_hours": "Work Hours",
                "status_completed": "Completed",
                "status_incomplete": "Incomplete",
                "status_not_started": "Not Started",
                "status_absent": "Absent",
                "no_records": "No attendance records found for this period.",
                "weekly_summary_title": "Weekly Staff Working Hours Summary",
                "monthly_summary_title": "Monthly Staff Working Hours Summary",
                "col_staff_name": "Employee Name",
                "col_completed_days": "Completed Days",
                "col_total_hours": "Total Hours Worked",
                "col_avg_hours": "Daily Average",
                "grand_total": "Grand Total",
            }

        # Query Database
        staff_users = (
            db.query(User)
            .join(Role, User.role_id == Role.id)
            .filter(Role.name.in_(["STAFF", "ADMIN"]))
            .order_by(User.full_name.asc())
            .all()
        )
        all_users = db.query(User).all()
        user_map = {u.id: u for u in all_users}
        records = (
            db.query(AttendanceRecord)
            .filter(
                AttendanceRecord.event_date >= start_date,
                AttendanceRecord.event_date <= end_date,
            )
            .order_by(AttendanceRecord.event_date.asc(), AttendanceRecord.scanned_at.asc())
            .all()
        )

        # Aggregate data by (user_id, event_date)
        day_user_events: Dict[tuple, Dict[str, AttendanceRecord]] = {}
        for r in records:
            key = (r.user_id, r.event_date)
            if key not in day_user_events:
                day_user_events[key] = {}
            day_user_events[key][r.event_type] = r

        # Accumulators for period working hours summary
        user_work_seconds: Dict[Any, float] = {u.id: 0.0 for u in staff_users}
        user_completed_days: Dict[Any, int] = {u.id: 0 for u in staff_users}

        # Setup Document Layout (A4 Landscape)
        buffer = io.BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=landscape(A4),
            leftMargin=36,
            rightMargin=36,
            topMargin=32,
            bottomMargin=32,
        )

        styles = getSampleStyleSheet()
        title_style = ParagraphStyle(
            "ReportTitle",
            parent=styles["Normal"],
            fontName=font_bold,
            fontSize=18,
            leading=22,
            textColor=colors.HexColor("#153B43"),
        )
        subtitle_style = ParagraphStyle(
            "ReportSubtitle",
            parent=styles["Normal"],
            fontName=font_regular,
            fontSize=11,
            leading=15,
            textColor=colors.HexColor("#00C7C7"),
        )
        meta_style = ParagraphStyle(
            "ReportMeta",
            parent=styles["Normal"],
            fontName=font_regular,
            fontSize=8,
            leading=11,
            textColor=colors.HexColor("#64868B"),
        )
        cell_style = ParagraphStyle(
            "ReportCell",
            parent=styles["Normal"],
            fontName=font_regular,
            fontSize=8,
            leading=10,
            textColor=colors.HexColor("#153B43"),
        )
        cell_bold = ParagraphStyle(
            "ReportCellBold",
            parent=styles["Normal"],
            fontName=font_bold,
            fontSize=8,
            leading=10,
            textColor=colors.HexColor("#153B43"),
        )
        cell_center = ParagraphStyle(
            "ReportCellCenter",
            parent=styles["Normal"],
            fontName=font_regular,
            fontSize=8,
            leading=10,
            textColor=colors.HexColor("#153B43"),
            alignment=1,  # Centered
        )
        cell_center_bold = ParagraphStyle(
            "ReportCellCenterBold",
            parent=styles["Normal"],
            fontName=font_bold,
            fontSize=8,
            leading=10,
            textColor=colors.HexColor("#153B43"),
            alignment=1,  # Centered
        )
        header_cell_style = ParagraphStyle(
            "ReportHeaderCell",
            parent=styles["Normal"],
            fontName=font_bold,
            fontSize=8.5,
            leading=11,
            textColor=colors.white,
            alignment=1,  # Centered
        )
        date_header_style = ParagraphStyle(
            "ReportDateHeaderCell",
            parent=styles["Normal"],
            fontName=font_bold,
            fontSize=8.5,
            leading=11,
            textColor=colors.HexColor("#153B43"),
        )

        elements = []

        # 1. Header Banner Table
        report_title_text = L["weekly_title"] if report_type == "WEEKLY" else L["monthly_title"]
        logo_img = None
        if os.path.exists(LOGO_PATH):
            try:
                logo_img = RLImage(LOGO_PATH, width=40, height=40)
            except Exception:
                logo_img = None

        if logo_img:
            header_data = [
                [
                    logo_img,
                    Paragraph(f"<b>{L['org_name']}</b> — {L['register_title']}", title_style),
                    Paragraph(f"<b>{L['period']}:</b> {format_report_period(start_date, end_date, is_marathi)}", meta_style),
                ],
                [
                    "",
                    Paragraph(report_title_text, subtitle_style),
                    Paragraph(f"<b>{L['generated_on']}:</b> {format_kolkata_datetime(utc_now())}", meta_style),
                ],
            ]
            header_table = Table(header_data, colWidths=[46, 474, 250])
            header_table.setStyle(TableStyle([
                ("SPAN", (0, 0), (0, 1)),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("ALIGN", (0, 0), (0, 1), "CENTER"),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
                ("TOPPADDING", (0, 0), (-1, -1), 2),
            ]))
        else:
            header_data = [
                [
                    Paragraph(f"<b>{L['org_name']}</b> — {L['register_title']}", title_style),
                    Paragraph(f"<b>{L['period']}:</b> {format_report_period(start_date, end_date, is_marathi)}", meta_style),
                ],
                [
                    Paragraph(report_title_text, subtitle_style),
                    Paragraph(f"<b>{L['generated_on']}:</b> {format_kolkata_datetime(utc_now())}", meta_style),
                ],
            ]
            header_table = Table(header_data, colWidths=[520, 250])
            header_table.setStyle(TableStyle([
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
                ("TOPPADDING", (0, 0), (-1, -1), 2),
            ]))
        elements.append(header_table)
        elements.append(Spacer(1, 14))

        # Attendance Roster Table
        table_rows = [
            [
                Paragraph(L["col_employee"], header_cell_style),
                Paragraph(L["col_in"], header_cell_style),
                Paragraph(L["col_lunch_out"], header_cell_style),
                Paragraph(L["col_lunch_in"], header_cell_style),
                Paragraph(L["col_out"], header_cell_style),
                Paragraph(L["col_status"], header_cell_style),
                Paragraph(L["col_work_hours"], header_cell_style),
            ]
        ]

        date_header_indices = []
        if not records:
            table_rows.append([
                Paragraph(f"<i>{L['no_records']}</i>", cell_style),
                Paragraph("—", cell_center),
                Paragraph("—", cell_center),
                Paragraph("—", cell_center),
                Paragraph("—", cell_center),
                Paragraph("—", cell_center),
                Paragraph("—", cell_center),
            ])
        else:
            # Collect unique dates that have attendance records, sorted ascending
            distinct_dates = sorted(list(set(r.event_date for r in records)))

            for event_date in distinct_dates:
                date_row_idx = len(table_rows)
                date_header_indices.append(date_row_idx)
                formatted_dt = format_report_date(event_date, is_marathi)
                table_rows.append([
                    Paragraph(f"<b>📅 {formatted_dt}</b>", date_header_style),
                    "", "", "", "", "", ""
                ])

                for user in staff_users:
                    user_id = user.id
                    emp_name = user.full_name
                    day_dict = day_user_events.get((user_id, event_date))

                    if day_dict:
                        in_evt = day_dict.get(AttendanceEventType.OFFICE_IN.value)
                        l_out_evt = day_dict.get(AttendanceEventType.LUNCH_BREAK_OUT.value)
                        l_in_evt = day_dict.get(AttendanceEventType.LUNCH_BREAK_IN.value)
                        out_evt = day_dict.get(AttendanceEventType.OFFICE_OUT.value)

                        in_str = format_kolkata_time(in_evt.scanned_at) if in_evt else "—"
                        l_out_str = format_kolkata_time(l_out_evt.scanned_at) if l_out_evt else "—"
                        l_in_str = format_kolkata_time(l_in_evt.scanned_at) if l_in_evt else "—"
                        out_str = format_kolkata_time(out_evt.scanned_at) if out_evt else "—"

                        # Check if any event in this day was manually adjusted
                        has_correction = any(e.is_manually_corrected for e in day_dict.values())
                        correction_flag = " *" if has_correction else ""

                        # Calculate productive work duration strictly excluding lunch break
                        day_sec = calculate_work_seconds(in_evt, l_out_evt, l_in_evt, out_evt)
                        if out_evt:
                            status_str = f"<font color='#008080'><b>{L['status_completed']}{correction_flag}</b></font>"
                            hours_str = format_duration(day_sec, is_marathi)
                            if user_id in user_completed_days:
                                user_completed_days[user_id] += 1
                        else:
                            status_str = f"<font color='#D97706'><b>{L['status_incomplete']}{correction_flag}</b></font>"
                            hours_str = "—"

                        if user_id in user_work_seconds:
                            user_work_seconds[user_id] += day_sec

                        table_rows.append([
                            Paragraph(emp_name, cell_bold),
                            Paragraph(in_str, cell_center),
                            Paragraph(l_out_str, cell_center),
                            Paragraph(l_in_str, cell_center),
                            Paragraph(out_str, cell_center),
                            Paragraph(status_str, cell_center),
                            Paragraph(hours_str, cell_center_bold),
                        ])
                    else:
                        # Employee was not present for the whole day -> display Absent
                        status_str = f"<font color='#DC2626'><b>{L['status_absent']}</b></font>"
                        table_rows.append([
                            Paragraph(emp_name, cell_bold),
                            Paragraph("—", cell_center),
                            Paragraph("—", cell_center),
                            Paragraph("—", cell_center),
                            Paragraph("—", cell_center),
                            Paragraph(status_str, cell_center),
                            Paragraph("—", cell_center_bold),
                        ])

        # Table Column Widths (Sum = 770 points fitting A4 landscape)
        col_widths = [170, 100, 100, 100, 100, 100, 100]
        attendance_table = Table(table_rows, colWidths=col_widths, repeatRows=1)

        t_style = [
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#00C7C7")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("BOTTOMPADDING", (0, 0), (-1, 0), 6),
            ("TOPPADDING", (0, 0), (-1, 0), 6),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#CBEFED")),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 1), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 1), (-1, -1), 3),
        ]

        # Apply alternating row colors or date banner styling
        for i in range(1, len(table_rows)):
            if i in date_header_indices:
                t_style.append(("SPAN", (0, i), (-1, i)))
                t_style.append(("BACKGROUND", (0, i), (-1, i), colors.HexColor("#E0F7F5")))
                t_style.append(("LINEBELOW", (0, i), (-1, i), 1, colors.HexColor("#00C7C7")))
                t_style.append(("TOPPADDING", (0, i), (-1, i), 5))
                t_style.append(("BOTTOMPADDING", (0, i), (-1, i), 5))
            else:
                if i % 2 == 0:
                    t_style.append(("BACKGROUND", (0, i), (-1, i), colors.HexColor("#F8FEFD")))
                else:
                    t_style.append(("BACKGROUND", (0, i), (-1, i), colors.white))

        attendance_table.setStyle(TableStyle(t_style))
        elements.append(attendance_table)

        # Staff Working Hours Summary Table (Weekly & Monthly Total Hours)
        elements.append(Spacer(1, 14))
        summary_title_text = (
            L["weekly_summary_title"] if report_type == "WEEKLY" else L["monthly_summary_title"]
        )
        elements.append(Paragraph(f"<b>{summary_title_text}</b>", subtitle_style))
        elements.append(Spacer(1, 6))

        summary_rows = [
            [
                Paragraph(L["col_staff_name"], header_cell_style),
                Paragraph(L["col_completed_days"], header_cell_style),
                Paragraph(L["col_total_hours"], header_cell_style),
                Paragraph(L["col_avg_hours"], header_cell_style),
            ]
        ]

        # Populate rows for staff members
        for u in staff_users:
            tot_sec = user_work_seconds.get(u.id, 0.0)
            comp_days = user_completed_days.get(u.id, 0)
            avg_sec = (tot_sec / comp_days) if comp_days > 0 else 0.0

            tot_str = format_duration(tot_sec, is_marathi)
            avg_str = format_duration(avg_sec, is_marathi)

            summary_rows.append([
                Paragraph(u.full_name, cell_bold),
                Paragraph(str(comp_days), cell_center),
                Paragraph(tot_str, cell_center_bold),
                Paragraph(avg_str, cell_center),
            ])

        # Grand Total Row across all staff
        grand_total_sec = sum(user_work_seconds.values())
        grand_total_days = sum(user_completed_days.values())
        grand_total_str = format_duration(grand_total_sec, is_marathi)

        summary_rows.append([
            Paragraph(f"<b>{L['grand_total']}</b>", cell_bold),
            Paragraph(f"<b>{grand_total_days}</b>", cell_center_bold),
            Paragraph(f"<b>{grand_total_str}</b>", cell_center_bold),
            Paragraph("—", cell_center),
        ])

        summary_table = Table(summary_rows, colWidths=[260, 170, 170, 170])
        s_style = [
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#00C7C7")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("BOTTOMPADDING", (0, 0), (-1, 0), 5),
            ("TOPPADDING", (0, 0), (-1, 0), 5),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#CBEFED")),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 1), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 1), (-1, -1), 3),
            # Grand Total Row Styling
            ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#E0F7F5")),
            ("LINEABOVE", (0, -1), (-1, -1), 1, colors.HexColor("#00C7C7")),
            ("TOPPADDING", (0, -1), (-1, -1), 4),
            ("BOTTOMPADDING", (0, -1), (-1, -1), 4),
        ]

        for r_idx in range(1, len(summary_rows) - 1):
            if r_idx % 2 == 0:
                s_style.append(("BACKGROUND", (0, r_idx), (-1, r_idx), colors.HexColor("#F8FEFD")))
            else:
                s_style.append(("BACKGROUND", (0, r_idx), (-1, r_idx), colors.white))

        summary_table.setStyle(TableStyle(s_style))
        elements.append(summary_table)

        # Footnote
        elements.append(Spacer(1, 8))
        footnote_text = (
            "* अधिकृत प्रशासकाद्वारे मॅन्युअल जोडलेली किंवा दुरुस्त केलेली उपस्थिती नोंद दर्शवते. कामाचे तास मोजताना जेवणाचा ब्रेक (Lunch Break) वगळण्यात आला आहे."
            if is_marathi
            else "* Indicates an attendance record manually corrected or added by an authorized administrator. Total hours exclude lunch breaks."
        )
        elements.append(Paragraph(footnote_text, meta_style))

        doc.build(elements, canvasmaker=NumberedCanvas)
        return buffer.getvalue()

    @staticmethod
    def generate_official_qr_poster_pdf(
        organization_name: str,
        qr_token_str: str,
        geofence_radius: float = 50.0,
    ) -> bytes:
        """
        Generates a high-resolution, vector-sharp A4 PDF poster suitable for printing
        and laminating on the Shivam Patsanstha office counter / wall.
        """
        buffer = io.BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            leftMargin=36,
            rightMargin=36,
            topMargin=36,
            bottomMargin=36,
        )

        elements = []
        font_family = "Devanagari" if HAS_DEVANAGARI_FONT else "Helvetica"
        bold_font_family = "Devanagari-Bold" if HAS_DEVANAGARI_FONT else "Helvetica-Bold"

        # 1. Organization Logo
        if os.path.exists(LOGO_PATH):
            logo_img = RLImage(LOGO_PATH, width=64, height=64)
            logo_img.hAlign = "CENTER"
            elements.append(logo_img)
            elements.append(Spacer(1, 10))

        # 2. Main Title (Bilingual)
        title_style = ParagraphStyle(
            "PosterTitle",
            fontName=bold_font_family,
            fontSize=20,
            leading=26,
            alignment=1,
            textColor=colors.HexColor("#153B43"),
        )
        subtitle_style = ParagraphStyle(
            "PosterSubtitle",
            fontName=bold_font_family,
            fontSize=12,
            leading=16,
            alignment=1,
            textColor=colors.HexColor("#008080"),
        )
        badge_style = ParagraphStyle(
            "PosterBadge",
            fontName=bold_font_family,
            fontSize=10.5,
            leading=14,
            alignment=1,
            textColor=colors.HexColor("#92400E"),
        )

        elements.append(Paragraph(fix_devanagari_i_matra("शिवम ग्रामीण बिगर शेती सहकारी पतसंस्था मर्यादित"), title_style))
        elements.append(Spacer(1, 4))
        elements.append(Paragraph("Shivam Gramin Bigar Sheti Sahakari Patsanstha Maryadit", subtitle_style))
        elements.append(Spacer(1, 10))

        # Decorative Badge Pill
        badge_table = Table(
            [[Paragraph(fix_devanagari_i_matra("अधिकृत कर्मचारी डिजिटल उपस्थिती फलक (OFFICIAL ATTENDANCE QR)"), badge_style)]],
            colWidths=[480],
        )
        badge_table.setStyle(
            TableStyle([
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#FEF3C7")),
                ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#F59E0B")),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ])
        )
        elements.append(badge_table)
        elements.append(Spacer(1, 16))

        # 3. Vector QR Code (Center)
        qr_widget = QrCodeWidget(qr_token_str)
        bounds = qr_widget.getBounds()
        w = bounds[2] - bounds[0]
        h = bounds[3] - bounds[1]
        qr_size = 230
        drawing = Drawing(qr_size, qr_size, transform=[qr_size / w, 0, 0, qr_size / h, 0, 0])
        drawing.add(qr_widget)

        # Frame around QR
        qr_container = Table([[drawing]], colWidths=[260])
        qr_container.setStyle(
            TableStyle([
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#FFFFFF")),
                ("BOX", (0, 0), (-1, -1), 2, colors.HexColor("#008080")),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 14),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 14),
            ])
        )
        elements.append(qr_container)
        elements.append(Spacer(1, 16))

        # 4. Security & Instructions Table
        inst_title_style = ParagraphStyle(
            "InstTitle",
            fontName=bold_font_family,
            fontSize=10.5,
            leading=14,
            textColor=colors.HexColor("#153B43"),
        )
        inst_body_style = ParagraphStyle(
            "InstBody",
            fontName=font_family,
            fontSize=9,
            leading=13.5,
            textColor=colors.HexColor("#334155"),
        )

        sec_col = [
            Paragraph(fix_devanagari_i_matra("<b>सुरक्षा वैशिष्ट्ये (Security Features)</b>"), inst_title_style),
            Spacer(1, 4),
            Paragraph(fix_devanagari_i_matra(f"• <b>GPS Geofence:</b> {int(geofence_radius)} मीटर कार्यालयीन आवारातच उपस्थिती वैध."), inst_body_style),
            Paragraph(fix_devanagari_i_matra("• <b>Satellite GPS:</b> मोबाईल लोकेशनद्वारे प्रत्यक्ष उपस्थितीची पडताळणी."), inst_body_style),
            Paragraph(fix_devanagari_i_matra("• <b>Anti-Spoofing:</b> घरून किंवा बाहेरून फोटो स्कॅन केल्यास आपोआप बाद."), inst_body_style),
        ]

        how_col = [
            Paragraph(fix_devanagari_i_matra("<b>उपस्थिती नोंदवण्याची पद्धत (How to Scan)</b>"), inst_title_style),
            Spacer(1, 4),
            Paragraph(fix_devanagari_i_matra("१. मोबाईलमध्ये <b>Shivam Attendance</b> अ‍ॅप उघडा."), inst_body_style),
            Paragraph(fix_devanagari_i_matra("२. <b>'Scan QR'</b> बटण दाबून हा कोड स्कॅन करा."), inst_body_style),
            Paragraph(fix_devanagari_i_matra("३. आगमन, दुपारचे जेवण व निर्गमन वेळी स्कॅन करा."), inst_body_style),
        ]

        inst_table = Table([[sec_col, how_col]], colWidths=[240, 240])
        inst_table.setStyle(
            TableStyle([
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F8FAFC")),
                ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#CBD5E1")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ])
        )
        elements.append(inst_table)
        elements.append(Spacer(1, 14))

        # 5. Footer Seal
        footer_style = ParagraphStyle(
            "FooterNotice",
            fontName=font_family,
            fontSize=8.5,
            leading=12,
            alignment=1,
            textColor=colors.HexColor("#64748B"),
        )
        elements.append(
            Paragraph(fix_devanagari_i_matra("शिवम ग्रामीण बिगर शेती सहकारी पतसंस्था मर्यादित – अधिकृत डिजिटल उपस्थिती व्यवस्थापन प्रणाली | माळेगाव बु ॥"), footer_style)
        )

        doc.build(elements)
        return buffer.getvalue()

