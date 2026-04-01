from fastapi import APIRouter, HTTPException, Query, Depends, Response
from typing import Optional
from datetime import datetime
import io
from sqlalchemy.orm import Session
from sqlalchemy import and_, func, cast, Date
from app.database.connection import get_db_session
from app.core.security import get_current_user
from app.database.schema import (
    Attendance as DBAttendance,
    Employee as DBEmployee,
    Department as DBDepartment,
    Company as DBCompany,
    Device as DBDevice,
)

router = APIRouter()

# ---------------------------------------------------------------------------
# PDF translation dictionaries
# ---------------------------------------------------------------------------
_PDF_LABELS = {
    "fr": {
        "title": "Rapport de Présence",
        "generated": "Généré le",
        "date": "Date",
        "period": "Période",
        "records": "Enregistrements",
        "page": "Page",
        "employee": "Employé",
        "emp_id": "ID",
        "department": "Département",
        "col_date": "Date",
        "time": "Heure",
        "punch": "Type",
        "device": "Appareil",
        "check_in": "Entrée",
        "check_out": "Sortie",
        "no_records": "Aucun enregistrement trouvé pour les critères sélectionnés.",
        "summary": "Résumé",
        "total_records": "Total enregistrements",
        "total_employees": "Total employés",
        "confidential": "Document confidentiel — usage interne uniquement",
    },
    "en": {
        "title": "Attendance Report",
        "generated": "Generated on",
        "date": "Date",
        "period": "Period",
        "records": "Records",
        "page": "Page",
        "employee": "Employee",
        "emp_id": "ID",
        "department": "Department",
        "col_date": "Date",
        "time": "Time",
        "punch": "Type",
        "device": "Device",
        "check_in": "In",
        "check_out": "Out",
        "no_records": "No records found for the selected criteria.",
        "summary": "Summary",
        "total_records": "Total records",
        "total_employees": "Total employees",
        "confidential": "Confidential document — internal use only",
    },
    "ar": {
        "title": "تقرير الحضور",
        "generated": "تاريخ الإنشاء",
        "date": "التاريخ",
        "period": "الفترة",
        "records": "السجلات",
        "page": "صفحة",
        "employee": "الموظف",
        "emp_id": "الرقم",
        "department": "القسم",
        "col_date": "التاريخ",
        "time": "الوقت",
        "punch": "النوع",
        "device": "الجهاز",
        "check_in": "دخول",
        "check_out": "خروج",
        "no_records": "لم يتم العثور على سجلات للمعايير المحددة.",
        "summary": "ملخص",
        "total_records": "إجمالي السجلات",
        "total_employees": "إجمالي الموظفين",
        "confidential": "وثيقة سرية — للاستخدام الداخلي فقط",
    },
}


def _get_labels(lang: str) -> dict:
    return _PDF_LABELS.get(lang, _PDF_LABELS["en"])


def parse_dates(single_date: Optional[str], start_date: Optional[str], end_date: Optional[str]):
    try:
        if single_date:
            sd = datetime.strptime(single_date, "%Y-%m-%d")
            start_dt = datetime.combine(sd.date(), datetime.min.time())
            end_dt = datetime.combine(sd.date(), datetime.max.time())
            return start_dt, end_dt
        start_dt = datetime.strptime(start_date, "%Y-%m-%d") if start_date else None
        end_dt = datetime.strptime(end_date + " 23:59:59", "%Y-%m-%d %H:%M:%S") if end_date else None
        return start_dt, end_dt
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")


def _base_filters(start_dt, end_dt, employee_name, employee_id, device_id):
    """Build common filter list used by all report endpoints."""
    filters = []
    if start_dt:
        filters.append(DBAttendance.timestamp >= start_dt)
    if end_dt:
        filters.append(DBAttendance.timestamp <= end_dt)
    if employee_name:
        filters.append(DBEmployee.name.ilike(f"%{employee_name}%"))
    if employee_id:
        filters.append(DBEmployee.user_id == employee_id)
    if device_id:
        filters.append(DBAttendance.device_id == device_id)
    return filters


@router.get("/attendance/records")
def attendance_records(
    date: Optional[str] = Query(None, description="Specific day YYYY-MM-DD"),
    start_date: Optional[str] = Query(None, description="Start date YYYY-MM-DD"),
    end_date: Optional[str] = Query(None, description="End date YYYY-MM-DD"),
    employee_name: Optional[str] = Query(None, description="Employee name (partial match)"),
    employee_id: Optional[str] = Query(None, description="Employee user_id"),
    device_id: Optional[str] = Query(None, description="Filter by device ID"),
    limit: int = Query(1000, ge=1, le=5000),
    current=Depends(get_current_user),
):
    """Detailed attendance records with filters."""
    start_dt, end_dt = parse_dates(date, start_date, end_date)

    with get_db_session() as db:
        q = (
            db.query(DBAttendance)
            .join(DBEmployee, DBAttendance.employee_id == DBEmployee.id)
            .outerjoin(DBDepartment, DBEmployee.department_id == DBDepartment.id)
            .outerjoin(DBCompany, DBEmployee.company_id == DBCompany.id)
            .outerjoin(DBDevice, DBAttendance.device_id == DBDevice.id)
        )

        filters = _base_filters(start_dt, end_dt, employee_name, employee_id, device_id)
        if filters:
            q = q.filter(and_(*filters))

        rows = q.order_by(DBAttendance.timestamp.desc()).limit(limit).all()
        results = []
        for r in rows:
            results.append({
                "id": r.id,
                "timestamp": r.timestamp.isoformat(),
                "date": r.timestamp.strftime("%Y-%m-%d"),
                "time": r.timestamp.strftime("%H:%M:%S"),
                "employee_id": r.employee.user_id if r.employee else "?",
                "employee_name": r.employee.name if r.employee else "Unknown",
                "department": (r.employee.department.name if r.employee and r.employee.department else "-"),
                "company": (r.employee.company.name if r.employee and r.employee.company else "-"),
                "device_name": r.device.name if r.device else "Unknown",
                "status": r.status,
                "punch": r.punch,
            })
        return {"count": len(results), "records": results}


@router.get("/attendance/summary")
def attendance_summary(
    date: Optional[str] = Query(None),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    employee_name: Optional[str] = Query(None),
    employee_id: Optional[str] = Query(None),
    device_id: Optional[str] = Query(None),
    current=Depends(get_current_user),
):
    """Daily per-employee summary: first in, last out, total swipes."""
    start_dt, end_dt = parse_dates(date, start_date, end_date)

    with get_db_session() as db:
        q = (
            db.query(
                DBEmployee.id.label("emp_pk"),
                DBEmployee.user_id.label("employee_id"),
                DBEmployee.name.label("employee_name"),
                func.coalesce(DBDepartment.name, "-").label("department"),
                func.coalesce(DBCompany.name, "-").label("company"),
                cast(DBAttendance.timestamp, Date).label("day"),
                func.min(DBAttendance.timestamp).label("first_ts"),
                func.max(DBAttendance.timestamp).label("last_ts"),
                func.count(DBAttendance.id).label("swipes"),
            )
            .select_from(DBAttendance)
            .join(DBEmployee, DBAttendance.employee_id == DBEmployee.id)
            .outerjoin(DBDepartment, DBEmployee.department_id == DBDepartment.id)
            .outerjoin(DBCompany, DBEmployee.company_id == DBCompany.id)
        )

        filters = _base_filters(start_dt, end_dt, employee_name, employee_id, device_id)
        if filters:
            q = q.filter(and_(*filters))

        q = q.group_by(
            DBEmployee.id,
            DBEmployee.user_id,
            DBEmployee.name,
            DBDepartment.name,
            DBCompany.name,
            cast(DBAttendance.timestamp, Date),
        )
        q = q.order_by(cast(DBAttendance.timestamp, Date).desc(), DBEmployee.name.asc())
        rows = q.all()

        out = []
        for r in rows:
            out.append({
                "employee_id": r.employee_id,
                "employee_name": r.employee_name,
                "department": r.department,
                "company": r.company,
                "date": r.day.isoformat() if hasattr(r.day, "isoformat") else str(r.day),
                "first_check_in": r.first_ts.isoformat() if r.first_ts else None,
                "last_check_out": r.last_ts.isoformat() if r.last_ts else None,
                "swipes": int(r.swipes or 0),
            })
        return {"count": len(out), "summary": out}


@router.get("/attendance/export.csv")
def export_attendance_csv(
    date: Optional[str] = Query(None),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    employee_name: Optional[str] = Query(None),
    employee_id: Optional[str] = Query(None),
    device_id: Optional[str] = Query(None),
    current=Depends(get_current_user),
):
    """Export detailed attendance to CSV."""
    import csv

    start_dt, end_dt = parse_dates(date, start_date, end_date)

    with get_db_session() as db:
        q = (
            db.query(DBAttendance)
            .join(DBEmployee, DBAttendance.employee_id == DBEmployee.id)
            .outerjoin(DBDepartment, DBEmployee.department_id == DBDepartment.id)
            .outerjoin(DBCompany, DBEmployee.company_id == DBCompany.id)
            .outerjoin(DBDevice, DBAttendance.device_id == DBDevice.id)
        )
        filters = _base_filters(start_dt, end_dt, employee_name, employee_id, device_id)
        if filters:
            q = q.filter(and_(*filters))
        rows = q.order_by(DBAttendance.timestamp.desc()).limit(5000).all()

        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow([
            "Date", "Time", "Employee ID", "Employee Name",
            "Department", "Company", "Device", "Punch", "Status",
        ])
        for r in rows:
            punch_label = "In" if r.punch == 0 else ("Out" if r.punch == 1 else str(r.punch))
            writer.writerow([
                r.timestamp.strftime("%Y-%m-%d"),
                r.timestamp.strftime("%H:%M:%S"),
                r.employee.user_id if r.employee else "?",
                r.employee.name if r.employee else "Unknown",
                (r.employee.department.name if r.employee and r.employee.department else "-"),
                (r.employee.company.name if r.employee and r.employee.company else "-"),
                (r.device.name if r.device else "Unknown"),
                punch_label,
                r.status,
            ])
        csv_data = buf.getvalue()

    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="attendance_export.csv"'},
    )


@router.get("/attendance/export.pdf")
def export_attendance_pdf(
    date: Optional[str] = Query(None),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    employee_name: Optional[str] = Query(None),
    employee_id: Optional[str] = Query(None),
    device_id: Optional[str] = Query(None),
    lang: str = Query("en", description="Language: en, fr, ar"),
    group_by: Optional[str] = Query(None, description="Group by: employee, date, or omit for flat"),
    current=Depends(get_current_user),
):
    """Export attendance to a professionally formatted PDF report."""
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.lib import colors
    from reportlab.platypus import (
        SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, HRFlowable,
        KeepTogether,
    )
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
    from collections import OrderedDict

    L = _get_labels(lang)
    start_dt, end_dt = parse_dates(date, start_date, end_date)

    # ── Fetch data inside session ──────────────────────────────────────
    with get_db_session() as db:
        q = (
            db.query(DBAttendance)
            .join(DBEmployee, DBAttendance.employee_id == DBEmployee.id)
            .outerjoin(DBDepartment, DBEmployee.department_id == DBDepartment.id)
            .outerjoin(DBCompany, DBEmployee.company_id == DBCompany.id)
            .outerjoin(DBDevice, DBAttendance.device_id == DBDevice.id)
        )
        filters = _base_filters(start_dt, end_dt, employee_name, employee_id, device_id)
        if filters:
            q = q.filter(and_(*filters))
        rows = q.order_by(
            DBEmployee.name.asc(),
            DBAttendance.timestamp.asc(),
        ).limit(5000).all()

        company_row = db.query(DBCompany.name).order_by(DBCompany.id).first()
        company_name = company_row[0] if company_row else ""

        record_count = len(rows)
        employee_set = set()
        flat_rows = []
        for r in rows:
            emp_name = (r.employee.name if r.employee else "?") or "?"
            employee_set.add(emp_name)
            punch_label = L["check_in"] if r.punch == 0 else (L["check_out"] if r.punch == 1 else str(r.punch))
            flat_rows.append({
                "employee": emp_name[:32],
                "emp_id": (r.employee.user_id if r.employee else "-") or "-",
                "department": ((r.employee.department.name if r.employee and r.employee.department else "-") or "-")[:24],
                "date": r.timestamp.strftime("%Y-%m-%d"),
                "time": r.timestamp.strftime("%H:%M:%S"),
                "punch": punch_label,
                "device": ((r.device.name if r.device else "-") or "-")[:20],
            })

    # ── Colour palette & styles ────────────────────────────────────────
    BRAND_COLOR = colors.HexColor("#1e40af")
    HEADER_BG = colors.HexColor("#1e3a5f")
    HEADER_FG = colors.white
    ALT_ROW = colors.HexColor("#f1f5f9")
    GROUP_BG = colors.HexColor("#e0e7ff")          # light indigo for group headers
    IN_COLOR = colors.HexColor("#16a34a")
    OUT_COLOR = colors.HexColor("#dc2626")

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=18 * mm, rightMargin=18 * mm,
        topMargin=18 * mm, bottomMargin=22 * mm,
    )
    width, height = A4
    styles = getSampleStyleSheet()

    title_style = ParagraphStyle("PDFTitle", parent=styles["Title"], fontSize=18, textColor=BRAND_COLOR, spaceAfter=2)
    subtitle_style = ParagraphStyle("PDFSub", parent=styles["Normal"], fontSize=10, textColor=colors.HexColor("#475569"), spaceAfter=2)
    footer_style = ParagraphStyle("PDFFooter", parent=styles["Normal"], fontSize=7, textColor=colors.HexColor("#94a3b8"), alignment=TA_CENTER)
    cell_style = ParagraphStyle("Cell", parent=styles["Normal"], fontSize=8, leading=10)
    cell_bold = ParagraphStyle("CellBold", parent=cell_style, fontName="Helvetica-Bold")
    cell_center = ParagraphStyle("CellC", parent=cell_style, alignment=TA_CENTER)
    group_title_style = ParagraphStyle(
        "GroupTitle", parent=styles["Heading3"], fontSize=11,
        textColor=BRAND_COLOR, spaceAfter=2, spaceBefore=6,
        fontName="Helvetica-Bold",
    )
    group_sub_style = ParagraphStyle(
        "GroupSub", parent=styles["Normal"], fontSize=8,
        textColor=colors.HexColor("#64748b"), spaceAfter=3,
    )

    # ── Helper: build a styled table from header + data rows ───────────
    def _make_table(col_headers, data_rows, col_widths, title_row_text=None):
        """Build a professional table. If title_row_text is given, a full-width
        banner row is prepended above the column headers."""
        th_style = ParagraphStyle("TH", parent=cell_style, fontSize=8, textColor=HEADER_FG, fontName="Helvetica-Bold")
        header_row = [Paragraph(f"<b>{h}</b>", th_style) for h in col_headers]

        table_data = []
        title_row_idx = None          # index of the banner row (if any)
        col_header_idx = 0            # index of the column-header row

        if title_row_text:
            # Banner row: single Paragraph that spans all columns
            banner_para = Paragraph(
                f"<b>{title_row_text}</b>",
                ParagraphStyle("BannerCell", parent=cell_style, fontSize=10,
                               fontName="Helvetica-Bold", textColor=colors.white),
            )
            # Fill remaining columns with empty strings so Table has uniform col count
            banner_cells = [banner_para] + [""] * (len(col_headers) - 1)
            table_data.append(banner_cells)
            title_row_idx = 0
            col_header_idx = 1

        table_data.append(header_row)
        table_data.extend(data_rows)

        tbl = Table(table_data, colWidths=col_widths, repeatRows=col_header_idx + 1)

        cmds = [
            # Column-header row styling
            ("BACKGROUND", (0, col_header_idx), (-1, col_header_idx), HEADER_BG),
            ("TEXTCOLOR", (0, col_header_idx), (-1, col_header_idx), HEADER_FG),
            ("FONTNAME", (0, col_header_idx), (-1, col_header_idx), "Helvetica-Bold"),
            ("FONTSIZE", (0, col_header_idx), (-1, col_header_idx), 8),
            ("BOTTOMPADDING", (0, col_header_idx), (-1, col_header_idx), 6),
            ("TOPPADDING", (0, col_header_idx), (-1, col_header_idx), 6),
            ("LINEBELOW", (0, col_header_idx), (-1, col_header_idx), 1, BRAND_COLOR),
            # Data rows
            ("FONTSIZE", (0, col_header_idx + 1), (-1, -1), 8),
            ("TOPPADDING", (0, col_header_idx + 1), (-1, -1), 3),
            ("BOTTOMPADDING", (0, col_header_idx + 1), (-1, -1), 3),
            ("LINEBELOW", (0, -1), (-1, -1), 0.5, BRAND_COLOR),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ]

        # Fine row separators (skip if only header + 1 data row)
        if len(table_data) > col_header_idx + 2:
            cmds.append(("LINEBELOW", (0, col_header_idx + 1), (-1, -2), 0.25, colors.HexColor("#e2e8f0")))

        # Banner row styling (spans all cols, brand-coloured background)
        if title_row_idx is not None:
            cmds.extend([
                ("SPAN", (0, title_row_idx), (-1, title_row_idx)),
                ("BACKGROUND", (0, title_row_idx), (-1, title_row_idx), BRAND_COLOR),
                ("TEXTCOLOR", (0, title_row_idx), (-1, title_row_idx), colors.white),
                ("FONTNAME", (0, title_row_idx), (-1, title_row_idx), "Helvetica-Bold"),
                ("FONTSIZE", (0, title_row_idx), (-1, title_row_idx), 10),
                ("BOTTOMPADDING", (0, title_row_idx), (-1, title_row_idx), 7),
                ("TOPPADDING", (0, title_row_idx), (-1, title_row_idx), 7),
                ("LINEBELOW", (0, title_row_idx), (-1, title_row_idx), 0, colors.white),
            ])

        # Alternating row colours on data rows
        first_data = col_header_idx + 1
        for i in range(first_data, len(table_data)):
            if (i - first_data) % 2 == 1:
                cmds.append(("BACKGROUND", (0, i), (-1, i), ALT_ROW))

        tbl.setStyle(TableStyle(cmds))
        return tbl

    def _punch_para(text):
        if text == L["check_in"]:
            return Paragraph(f'<font color="#{IN_COLOR.hexval()[2:]}">{text}</font>', cell_center)
        elif text == L["check_out"]:
            return Paragraph(f'<font color="#{OUT_COLOR.hexval()[2:]}">{text}</font>', cell_center)
        return Paragraph(text, cell_center)

    story = []

    # ── Report header ──────────────────────────────────────────────────
    if company_name:
        story.append(Paragraph(company_name, title_style))
    story.append(Paragraph(f"<b>{L['title']}</b>", ParagraphStyle("RT", parent=styles["Heading2"], fontSize=14, textColor=BRAND_COLOR)))

    date_label = date if date else f"{start_date or '—'}  →  {end_date or '—'}"
    meta = [
        f"<b>{L['period'] if not date else L['date']}:</b> {date_label}",
        f"<b>{L['generated']}:</b> {datetime.now().strftime('%Y-%m-%d %H:%M')}",
    ]
    story.append(Paragraph("  &nbsp; |  &nbsp; ".join(meta), subtitle_style))
    summary_text = (
        f"<b>{L['total_records']}:</b> {record_count}  &nbsp; |  &nbsp; "
        f"<b>{L['total_employees']}:</b> {len(employee_set)}"
    )
    story.append(Paragraph(summary_text, subtitle_style))
    story.append(Spacer(1, 4 * mm))
    story.append(HRFlowable(width="100%", thickness=0.5, color=BRAND_COLOR, spaceAfter=4 * mm))

    # ── Empty state ────────────────────────────────────────────────────
    if not flat_rows:
        story.append(Spacer(1, 20 * mm))
        story.append(Paragraph(L["no_records"], ParagraphStyle("Empty", parent=styles["Normal"], fontSize=12, alignment=TA_CENTER, textColor=colors.HexColor("#94a3b8"))))

    # ── GROUP BY EMPLOYEE ──────────────────────────────────────────────
    elif group_by == "employee":
        groups = OrderedDict()
        for r in flat_rows:
            groups.setdefault(r["employee"], []).append(r)

        col_headers = [L["col_date"], L["time"], L["punch"], L["department"], L["device"]]
        col_widths = [28 * mm, 22 * mm, 18 * mm, 40 * mm, 30 * mm]

        for emp_name, emp_rows in groups.items():
            emp_id = emp_rows[0]["emp_id"]
            dept = emp_rows[0]["department"]
            banner = f"{emp_name}  ({emp_id})  —  {L['department']}: {dept}  |  {L['records']}: {len(emp_rows)}"

            data_rows = []
            for r in emp_rows:
                data_rows.append([
                    Paragraph(r["date"], cell_center),
                    Paragraph(r["time"], cell_center),
                    _punch_para(r["punch"]),
                    Paragraph(r["department"], cell_style),
                    Paragraph(r["device"], cell_style),
                ])
            story.append(_make_table(col_headers, data_rows, col_widths, title_row_text=banner))
            story.append(Spacer(1, 5 * mm))

    # ── GROUP BY DATE ──────────────────────────────────────────────────
    elif group_by == "date":
        groups = OrderedDict()
        for r in flat_rows:
            groups.setdefault(r["date"], []).append(r)

        col_headers = [L["employee"], L["emp_id"], L["department"], L["time"], L["punch"], L["device"]]
        col_widths = [38 * mm, 16 * mm, 30 * mm, 20 * mm, 18 * mm, 26 * mm]

        for day, day_rows in groups.items():
            unique_emp = len(set(r["employee"] for r in day_rows))
            banner = f"{day}  —  {L['records']}: {len(day_rows)}  |  {L['total_employees']}: {unique_emp}"

            data_rows = []
            for r in day_rows:
                data_rows.append([
                    Paragraph(r["employee"], cell_bold),
                    Paragraph(r["emp_id"], cell_center),
                    Paragraph(r["department"], cell_style),
                    Paragraph(r["time"], cell_center),
                    _punch_para(r["punch"]),
                    Paragraph(r["device"], cell_style),
                ])
            story.append(_make_table(col_headers, data_rows, col_widths, title_row_text=banner))
            story.append(Spacer(1, 5 * mm))

    # ── NO GROUPING (flat table) ───────────────────────────────────────
    else:
        col_headers = [
            L["employee"], L["emp_id"], L["department"],
            L["col_date"], L["time"], L["punch"], L["device"],
        ]
        col_widths = [42 * mm, 16 * mm, 30 * mm, 24 * mm, 20 * mm, 16 * mm, 26 * mm]

        data_rows = []
        for r in flat_rows:
            data_rows.append([
                Paragraph(r["employee"], cell_bold),
                Paragraph(r["emp_id"], cell_center),
                Paragraph(r["department"], cell_style),
                Paragraph(r["date"], cell_center),
                Paragraph(r["time"], cell_center),
                _punch_para(r["punch"]),
                Paragraph(r["device"], cell_style),
            ])
        story.append(_make_table(col_headers, data_rows, col_widths))

    # ── Footer ─────────────────────────────────────────────────────────
    story.append(Spacer(1, 6 * mm))
    story.append(HRFlowable(width="100%", thickness=0.3, color=colors.HexColor("#cbd5e1"), spaceBefore=2 * mm))
    story.append(Paragraph(L["confidential"], footer_style))

    def _page_footer(canvas_obj, doc_obj):
        canvas_obj.saveState()
        canvas_obj.setFont("Helvetica", 7)
        canvas_obj.setFillColor(colors.HexColor("#94a3b8"))
        canvas_obj.drawRightString(
            width - 18 * mm, 12 * mm,
            f"{L['page']} {doc_obj.page}",
        )
        canvas_obj.restoreState()

    doc.build(story, onFirstPage=_page_footer, onLaterPages=_page_footer)
    pdf_bytes = buf.getvalue()
    buf.close()

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="attendance_report.pdf"'},
    )
