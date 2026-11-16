import io
import os
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
        self.drawString(36, 24, "Shivam Patsanstha – Confidential Digital Attendance Record")
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
                "org_name": "शिवम पतसंस्था",
                "register_title": "डिजिटल उपस्थिती नोंदवही",
                "weekly_title": "साप्ताहिक उपस्थिती अहवाल",
                "monthly_title": "मासिक उपस्थिती अहवाल",
                "period": "कालावधी",
                "generated_on": "निर्मिती वेळ",
                "total_staff": "एकूण कर्मचारी",
                "active_staff": "सक्रिय कर्मचारी",
                "completed_days": "पूर्ण उपस्थिती दिवस",
                "incomplete_days": "अपूर्ण उपस्थिती दिवस",
                "total_events": "एकूण नोंदवलेले प्रसंग",
                "col_employee": "कर्मचाऱ्याचे नाव",
                "col_date": "दिनांक",
                "col_in": "कार्यालय आगमन",
                "col_lunch_out": "जेवण (बाहेर)",
                "col_lunch_in": "जेवण (परत)",
                "col_out": "कार्यालय निर्गमन",
                "col_status": "स्थिती",
                "status_completed": "पूर्ण",
                "status_incomplete": "अपूर्ण",
                "status_not_started": "नोंद नाही",
                "no_records": "या कालावधीसाठी कोणत्याही उपस्थिती नोंदी आढळल्या नाहीत.",
            }
        else:
            L = {
                "org_name": "Shivam Patsanstha",
                "register_title": "Digital Attendance Register",
                "weekly_title": "Weekly Attendance Report",
                "monthly_title": "Monthly Attendance Report",
                "period": "Reporting Period",
                "generated_on": "Generated On",
                "total_staff": "Total Staff",
                "active_staff": "Active Staff in Period",
                "completed_days": "Completed Cycles",
                "incomplete_days": "Incomplete Cycles",
                "total_events": "Total Events Logged",
                "col_employee": "Employee Name",
                "col_date": "Date",
                "col_in": "Office In",
                "col_lunch_out": "Lunch Out",
                "col_lunch_in": "Lunch In",
                "col_out": "Office Out",
                "col_status": "Status",
                "status_completed": "Completed",
                "status_incomplete": "Incomplete",
                "status_not_started": "Not Started",
                "no_records": "No attendance records found for this period.",
            }

        # Query Database
        all_staff = (
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
        active_user_ids = set()
        completed_days_count = 0
        incomplete_days_count = 0

        for r in records:
            key = (r.user_id, r.event_date)
            if key not in day_user_events:
                day_user_events[key] = {}
            day_user_events[key][r.event_type] = r
            active_user_ids.add(r.user_id)

        for key, event_dict in day_user_events.items():
            if AttendanceEventType.OFFICE_OUT.value in event_dict:
                completed_days_count += 1
            else:
                incomplete_days_count += 1

        # Setup Document Layout (A4 Landscape)
        buffer = io.BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=landscape(A4),
            leftMargin=36,
            rightMargin=36,
            topMargin=36,
            bottomMargin=42,
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
        elements.append(Spacer(1, 10))

        # 2. Executive Metrics Summary Table
        summary_data = [
            [
                Paragraph(f"<b>{L['total_staff']}</b>", meta_style),
                Paragraph(f"<b>{L['active_staff']}</b>", meta_style),
                Paragraph(f"<b>{L['completed_days']}</b>", meta_style),
                Paragraph(f"<b>{L['incomplete_days']}</b>", meta_style),
                Paragraph(f"<b>{L['total_events']}</b>", meta_style),
            ],
            [
                Paragraph(f"<b>{len(all_staff)}</b>", cell_bold),
                Paragraph(f"<b>{len(active_user_ids)}</b>", cell_bold),
                Paragraph(f"<b>{completed_days_count}</b>", cell_bold),
                Paragraph(f"<b>{incomplete_days_count}</b>", cell_bold),
                Paragraph(f"<b>{len(records)}</b>", cell_bold),
            ]
        ]
        summary_table = Table(summary_data, colWidths=[154, 154, 154, 154, 154])
        summary_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F0FBFA")),
            ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#B8F2EC")),
            ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#D9FAF5")),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ]))
        elements.append(summary_table)
        elements.append(Spacer(1, 12))

        # 3. Attendance Roster Table
        table_rows = [
            [
                Paragraph(L["col_employee"], header_cell_style),
                Paragraph(L["col_date"], header_cell_style),
                Paragraph(L["col_in"], header_cell_style),
                Paragraph(L["col_lunch_out"], header_cell_style),
                Paragraph(L["col_lunch_in"], header_cell_style),
                Paragraph(L["col_out"], header_cell_style),
                Paragraph(L["col_status"], header_cell_style),
            ]
        ]

        date_header_indices = []
        if not records:
            table_rows.append([
                Paragraph(f"<i>{L['no_records']}</i>", cell_style),
                Paragraph("—", cell_style),
                Paragraph("—", cell_style),
                Paragraph("—", cell_style),
                Paragraph("—", cell_style),
                Paragraph("—", cell_style),
                Paragraph("—", cell_style),
            ])
        else:
            # Sort day_user_events by date ascending, then user name
            sorted_keys = sorted(
                day_user_events.keys(),
                key=lambda k: (k[1], user_map.get(k[0]).full_name if k[0] in user_map else "")
            )

            last_date = None
            for user_id, event_date in sorted_keys:
                # Group & differentiate clearly by date
                if event_date != last_date:
                    last_date = event_date
                    date_row_idx = len(table_rows)
                    date_header_indices.append(date_row_idx)
                    formatted_dt = format_report_date(event_date, is_marathi)
                    table_rows.append([
                        Paragraph(f"<b>📅 {formatted_dt}</b>", date_header_style),
                        "", "", "", "", "", ""
                    ])

                user = user_map.get(user_id)
                emp_name = user.full_name if user else "Unknown Staff"
                day_dict = day_user_events[(user_id, event_date)]

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

                if out_evt:
                    status_str = f"<font color='#008080'><b>{L['status_completed']}{correction_flag}</b></font>"
                else:
                    status_str = f"<font color='#D97706'><b>{L['status_incomplete']}{correction_flag}</b></font>"

                table_rows.append([
                    Paragraph(emp_name, cell_bold),
                    Paragraph(format_report_date(event_date, is_marathi), cell_style),
                    Paragraph(in_str, cell_style),
                    Paragraph(l_out_str, cell_style),
                    Paragraph(l_in_str, cell_style),
                    Paragraph(out_str, cell_style),
                    Paragraph(status_str, cell_style),
                ])

        # Table Column Widths (Sum = 770 points fitting A4 landscape)
        col_widths = [160, 110, 100, 100, 100, 100, 100]
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

        # Footnote
        elements.append(Spacer(1, 8))
        footnote_text = (
            "* अधिकृत प्रशासकाद्वारे मॅन्युअल जोडलेली किंवा दुरुस्त केलेली उपस्थिती नोंद दर्शवते."
            if is_marathi
            else "* Indicates an attendance record manually corrected or added by an authorized administrator."
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

        elements.append(Paragraph("शिवम नागरी सहकारी पतसंस्था मर्यादित", title_style))
        elements.append(Spacer(1, 4))
        elements.append(Paragraph("Shivam Nagari Sahakari Patsanstha Maryadit", subtitle_style))
        elements.append(Spacer(1, 10))

        # Decorative Badge Pill
        badge_table = Table(
            [[Paragraph("अधिकृत कर्मचारी डिजिटल उपस्थिती फलक (OFFICIAL ATTENDANCE QR)", badge_style)]],
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
            Paragraph("<b>सुरक्षा वैशिष्ट्ये (Security Features)</b>", inst_title_style),
            Spacer(1, 4),
            Paragraph(f"• <b>GPS Geofence:</b> {int(geofence_radius)} मीटर कार्यालयीन आवारातच उपस्थिती वैध.", inst_body_style),
            Paragraph("• <b>Satellite GPS:</b> मोबाईल लोकेशनद्वारे प्रत्यक्ष उपस्थितीची पडताळणी.", inst_body_style),
            Paragraph("• <b>Anti-Spoofing:</b> घरून किंवा बाहेरून फोटो स्कॅन केल्यास आपोआप बाद.", inst_body_style),
        ]

        how_col = [
            Paragraph("<b>उपस्थिती नोंदवण्याची पद्धत (How to Scan)</b>", inst_title_style),
            Spacer(1, 4),
            Paragraph("१. मोबाईलमध्ये <b>Shivam Attendance</b> अ‍ॅप उघडा.", inst_body_style),
            Paragraph("२. <b>'Scan QR'</b> बटण दाबून हा कोड स्कॅन करा.", inst_body_style),
            Paragraph("३. आगमन, दुपारचे जेवण व निर्गमन वेळी स्कॅन करा.", inst_body_style),
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
            Paragraph("शिवम पतसंस्था – अधिकृत डिजिटल उपस्थिती व्यवस्थापन प्रणाली | बारामती", footer_style)
        )

        doc.build(elements)
        return buffer.getvalue()

