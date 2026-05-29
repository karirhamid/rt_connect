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
from app.services.punch_classifier import classify_attendance_records, get_employee_day_summary, merge_close_punches

router = APIRouter()


# ── Arabic-capable font for PDF (bilingual holiday labels, AR reports) ────────
def _register_arabic_font_once():
    """Register an Arabic-capable TrueType font as 'AR' on first call. Returns
    the registered family name, or None if no font found. Idempotent."""
    if getattr(_register_arabic_font_once, "_done", False):
        return getattr(_register_arabic_font_once, "_name", None)
    _register_arabic_font_once._done = True
    candidates = [
        # Linux / Docker (fonts-dejavu-core, fonts-noto)
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/noto/NotoSansArabic-Regular.ttf",
        # Windows dev
        "C:/Windows/Fonts/arial.ttf",
        "C:/Windows/Fonts/tahoma.ttf",
        "C:/Windows/Fonts/segoeui.ttf",
        # macOS dev
        "/Library/Fonts/Arial.ttf",
    ]
    import os
    for p in candidates:
        if not os.path.isfile(p):
            continue
        try:
            from reportlab.pdfbase import pdfmetrics
            from reportlab.pdfbase.ttfonts import TTFont
            pdfmetrics.registerFont(TTFont("AR", p))
            _register_arabic_font_once._name = "AR"
            return "AR"
        except Exception:
            continue
    _register_arabic_font_once._name = None
    return None


def _has_arabic(s: str) -> bool:
    return any(0x0600 <= ord(c) <= 0x06FF for c in (s or ""))


def _shape_arabic(s: str) -> str:
    """Reshape connected Arabic letters + apply RTL bidi for visual order in PDF."""
    try:
        import arabic_reshaper
        from bidi.algorithm import get_display
        return get_display(arabic_reshaper.reshape(s))
    except Exception:
        return s


def _bilingual_html(text: str) -> str:
    """Take a holiday name like 'Aid Al-Adha / عيد الأضحى (Jour 2)' and return
    HTML where the Arabic portion is wrapped in the AR font (if registered)
    and properly shaped + RTL-ordered; Latin portion stays in the default font.

    The previous version split at every non-Arabic-block code point, which
    broke phrases like 'عيد الأضحى' on the inner space — each word then got
    shaped+bidi'd in isolation and ReportLab laid them out left-to-right,
    so the phrase appeared in the wrong visual order. We now match each
    *maximal* Arabic phrase (Arabic letters with internal ASCII spaces) as
    one run, so reshape+get_display sees the whole phrase and produces
    correct RTL-ordered output.
    """
    if not text:
        return text
    if not _has_arabic(text):
        return text
    ar_font = _register_arabic_font_once()
    if not ar_font:
        return text  # font missing — leave as plain text

    import re
    # An Arabic phrase = one or more Arabic letters, optionally with ASCII
    # spaces between them (but must start AND end on an Arabic letter so
    # surrounding Latin spaces stay on the Latin side).
    _PHRASE = re.compile(r'[؀-ۿ](?:[؀-ۿ  ]*[؀-ۿ])?')

    def _repl(m):
        return f'<font name="{ar_font}">{_shape_arabic(m.group(0))}</font>'

    return _PHRASE.sub(_repl, text)

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
        "employee": "Employé(e)",
        "emp_id": "ID",
        "department": "Département",
        "col_date": "Date",
        "time": "Heure",
        "punch": "Type",
        "device": "Appareil",
        "check_in": "Entrée",
        "check_out": "Sortie",
        "category": "Catégorie",
        "cat_entry": "Entrée",
        "cat_break_out": "Sortie Pause",
        "cat_break_in": "Retour Pause",
        "cat_exit": "Sortie",
        "cat_overtime_exit": "Sortie Heures Sup.",
        "cat_unknown": "Inconnu",
        "no_records": "Aucun enregistrement trouvé pour les critères sélectionnés.",
        "summary": "Résumé",
        "total_records": "Total enregistrements",
        "total_employees": "Total employés",
        "confidential": "Document confidentiel — usage interne uniquement",
        "entry_time": "Entrée",
        "exit_time": "Sortie",
        "total_worked": "Total Travaillé",
        "overtime": "Heures Sup.",
        "late": "Retard",
        "early_dep": "Départ Anticipé",
        "status": "Statut",
        "on_time": "À l'heure",
        "late_status": "En retard",
        "early_status": "Départ anticipé",
        "absent_status": "Absent",
        "holiday_label": "Jour férié",
        "absentees_title": "Employés sans pointage",
        "absentees_subtitle": "Pour la période sélectionnée",
        "absentees_count": "absent(s)",
        "absentees_empty": "Tous les employés ont pointé pendant la période.",
        "mode_simple": "Mode Simple",
        "mode_strict": "Mode Strict",
        "swipes": "Pointages",
        "total_overtime": "Total heures supplémentaires",
        "total_late": "Total retards",
        "daily_summary": "Résumé Journalier",
        "legend_incomplete": "■ Ligne surlignée = un seul pointage enregistré (entrée ou sortie manquante)",
        "device_legend_prefix": "Appareils",
        "emp_count": "employé(e)s",
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
        "category": "Category",
        "cat_entry": "Entry",
        "cat_break_out": "Break Out",
        "cat_break_in": "Break In",
        "cat_exit": "Exit",
        "cat_overtime_exit": "Overtime Exit",
        "cat_unknown": "Unknown",
        "no_records": "No records found for the selected criteria.",
        "summary": "Summary",
        "total_records": "Total records",
        "total_employees": "Total employees",
        "confidential": "Confidential document — internal use only",
        "entry_time": "Entry",
        "exit_time": "Exit",
        "total_worked": "Total Worked",
        "overtime": "Overtime",
        "late": "Late",
        "early_dep": "Early Dep.",
        "status": "Status",
        "on_time": "On Time",
        "late_status": "Late",
        "early_status": "Early Dep.",
        "absent_status": "Absent",
        "holiday_label": "Public holiday",
        "absentees_title": "Employees with no attendance",
        "absentees_subtitle": "For the selected period",
        "absentees_count": "absent",
        "absentees_empty": "All employees punched during the period.",
        "mode_simple": "Simple Mode",
        "mode_strict": "Strict Mode",
        "swipes": "Swipes",
        "total_overtime": "Total overtime",
        "total_late": "Total late",
        "daily_summary": "Daily Summary",
        "legend_incomplete": "■ Highlighted row = single punch recorded (entry or exit missing)",
        "device_legend_prefix": "Devices",
        "emp_count": "employees",
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
        "category": "الفئة",
        "cat_entry": "دخول",
        "cat_break_out": "خروج استراحة",
        "cat_break_in": "عودة استراحة",
        "cat_exit": "خروج",
        "cat_overtime_exit": "خروج إضافي",
        "cat_unknown": "غير معروف",
        "no_records": "لم يتم العثور على سجلات للمعايير المحددة.",
        "summary": "ملخص",
        "total_records": "إجمالي السجلات",
        "total_employees": "إجمالي الموظفين",
        "confidential": "وثيقة سرية — للاستخدام الداخلي فقط",
        "entry_time": "الدخول",
        "exit_time": "الخروج",
        "total_worked": "إجمالي العمل",
        "overtime": "ساعات إضافية",
        "late": "تأخير",
        "early_dep": "مغادرة مبكرة",
        "status": "الحالة",
        "on_time": "في الوقت",
        "late_status": "متأخر",
        "early_status": "مغادرة مبكرة",
        "absent_status": "غائب",
        "holiday_label": "عيد رسمي",
        "absentees_title": "موظفون بدون تسجيل حضور",
        "absentees_subtitle": "خلال الفترة المحددة",
        "absentees_count": "غائب(ون)",
        "absentees_empty": "جميع الموظفين قاموا بتسجيل حضورهم خلال الفترة.",
        "mode_simple": "الوضع البسيط",
        "mode_strict": "الوضع الصارم",
        "swipes": "تسجيلات",
        "total_overtime": "إجمالي الساعات الإضافية",
        "total_late": "إجمالي التأخيرات",
        "daily_summary": "ملخص يومي",
        "legend_incomplete": "■ الصف المميز = تسجيل واحد فقط (دخول أو خروج مفقود)",
        "device_legend_prefix": "الأجهزة",
        "emp_count": "موظف(ة)",
    },
}


def _get_labels(lang: str) -> dict:
    return _PDF_LABELS.get(lang, _PDF_LABELS["en"])


_CATEGORY_LABEL_KEY = {
    "entry": "cat_entry",
    "break_out": "cat_break_out",
    "break_in": "cat_break_in",
    "exit": "cat_exit",
    "overtime_exit": "cat_overtime_exit",
    "unknown": "cat_unknown",
}


def _category_label(category: str, L: dict) -> str:
    """Get the translated label for a punch category."""
    key = _CATEGORY_LABEL_KEY.get(category, "cat_unknown")
    return L.get(key, category)


def _resolve_entry_exit(first_ts, last_ts, swipes: int, summary_data: dict):
    """Return (entry_str|None, exit_str|None), never the same value in both columns.

    Priority:
      1. Punch classification from summary_data (when timing mode is active)
      2. Time-of-day heuristic for single-punch days: before noon = entry, else = exit
      3. First/last timestamps for multi-punch days
    """
    if summary_data:
        s_entry = summary_data.get("entry")
        s_exit = summary_data.get("exit")
        if s_entry or s_exit:
            return s_entry, s_exit

    if swipes == 1 and first_ts:
        t_str = first_ts.strftime("%H:%M")
        return (t_str, None) if first_ts.hour < 12 else (None, t_str)

    return (
        first_ts.strftime("%H:%M") if first_ts else None,
        last_ts.strftime("%H:%M") if last_ts else None,
    )


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


def _parse_employee_ids(employee_ids: Optional[str]) -> Optional[list[str]]:
    """Split a comma-separated matricule list. Empty / None → None (no filter)."""
    if not employee_ids:
        return None
    ids = [x.strip() for x in employee_ids.split(",") if x.strip()]
    return ids or None


def _base_filters(start_dt, end_dt, employee_name, employee_id, device_id,
                  employee_ids: Optional[list[str]] = None):
    """Build common filter list used by all report endpoints."""
    filters = [
        DBAttendance.voided_by_correction_id.is_(None),  # hide voided rows
        DBAttendance.approved.isnot(False),               # hide unapproved manual punches
    ]
    if start_dt:
        filters.append(DBAttendance.timestamp >= start_dt)
    if end_dt:
        filters.append(DBAttendance.timestamp <= end_dt)
    if employee_name:
        filters.append(DBEmployee.name.ilike(f"%{employee_name}%"))
    if employee_id:
        filters.append(DBEmployee.user_id == employee_id)
    if employee_ids:
        # Multi-employee selection from the new chip picker. AND'd with any
        # other employee filter — sensible because the chip picker is the
        # primary input; the legacy single-id arg is rarely set alongside.
        filters.append(DBEmployee.user_id.in_(employee_ids))
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
    employee_ids: Optional[str] = Query(None, description="Comma-separated matricules (chip picker)"),
    device_id: Optional[str] = Query(None, description="Filter by device ID"),
    limit: int = Query(1000, ge=1, le=5000),
    current=Depends(get_current_user),
):
    """Detailed attendance records with filters."""
    start_dt, end_dt = parse_dates(date, start_date, end_date)
    emp_ids = _parse_employee_ids(employee_ids)

    with get_db_session() as db:
        q = (
            db.query(DBAttendance)
            .join(DBEmployee, DBAttendance.employee_id == DBEmployee.id)
            .outerjoin(DBDepartment, DBEmployee.department_id == DBDepartment.id)
            .outerjoin(DBCompany, DBEmployee.company_id == DBCompany.id)
            .outerjoin(DBDevice, DBAttendance.device_id == DBDevice.id)
        )

        filters = _base_filters(start_dt, end_dt, employee_name, employee_id, device_id, emp_ids)
        if filters:
            q = q.filter(and_(*filters))

        rows = q.order_by(DBAttendance.timestamp.desc()).limit(limit).all()

        # Classify punches
        classified = classify_attendance_records(db, rows)

        results = []
        for item in classified:
            r = item["record"]
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
                "punch_category": item["punch_category"],
            })
        return {"count": len(results), "records": results}


@router.get("/attendance/summary")
def attendance_summary(
    date: Optional[str] = Query(None),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    employee_name: Optional[str] = Query(None),
    employee_id: Optional[str] = Query(None),
    employee_ids: Optional[str] = Query(None, description="Comma-separated matricules (chip picker)"),
    device_id: Optional[str] = Query(None),
    with_lateness: bool = Query(False, description="Always populate late_minutes regardless of attendance_mode"),
    current=Depends(get_current_user),
):
    """Daily per-employee summary: first in, last out, total swipes.
    In 'shared' employee mode, groups by user_id to merge records across devices.
    In 'separate' mode, groups by Employee.id (each device row is independent)."""
    start_dt, end_dt = parse_dates(date, start_date, end_date)
    emp_ids = _parse_employee_ids(employee_ids)

    with get_db_session() as db:
        # Read settings
        from app.database.schema import AppSettings as _AppSettings
        _settings = db.query(_AppSettings).first()
        attendance_mode = getattr(_settings, 'attendance_mode', None) or 'simple'
        employee_mode = getattr(_settings, 'employee_mode', None) or 'shared'

        # Defense in depth: a caller could pass with_lateness=true directly
        # against this URL even after the super admin disabled the module.
        # Force it off so the response never exposes late_minutes and the
        # column never bleeds back into the UI through a stale frontend.
        if with_lateness and not getattr(_settings, 'lateness_module_enabled', False):
            with_lateness = False

        shared = employee_mode == 'shared'

        # Choose grouping column
        id_col = DBEmployee.user_id if shared else DBEmployee.id
        q = (
            db.query(
                id_col.label("employee_id"),
                func.min(DBEmployee.name).label("employee_name") if shared else DBEmployee.name.label("employee_name"),
                func.coalesce(func.min(DBDepartment.name), "-").label("department") if shared else func.coalesce(DBDepartment.name, "-").label("department"),
                func.coalesce(func.min(DBCompany.name), "-").label("company") if shared else func.coalesce(DBCompany.name, "-").label("company"),
                cast(DBAttendance.timestamp, Date).label("day"),
                func.min(DBAttendance.timestamp).label("first_ts"),
                func.max(DBAttendance.timestamp).label("last_ts"),
                func.count(DBAttendance.id).label("swipes"),
                func.array_agg(func.distinct(DBAttendance.source)).label("sources"),
                func.array_agg(DBAttendance.timestamp).label("all_ts"),
            )
            .select_from(DBAttendance)
            .join(DBEmployee, DBAttendance.employee_id == DBEmployee.id)
            .outerjoin(DBDepartment, DBEmployee.department_id == DBDepartment.id)
            .outerjoin(DBCompany, DBEmployee.company_id == DBCompany.id)
        )

        filters = _base_filters(start_dt, end_dt, employee_name, employee_id, device_id, emp_ids)
        if filters:
            q = q.filter(and_(*filters))

        if shared:
            q = q.group_by(DBEmployee.user_id, cast(DBAttendance.timestamp, Date))
        else:
            q = q.group_by(DBEmployee.id, DBEmployee.name, DBDepartment.name, DBCompany.name, cast(DBAttendance.timestamp, Date))
        q = q.order_by(cast(DBAttendance.timestamp, Date).desc(), func.min(DBEmployee.name).asc())
        rows = q.all()

        # Build id -> [list of Employee PKs] for cross-device summary (shared mode)
        uid_to_pks = {}
        if shared:
            for r in rows:
                uid = r.employee_id
                if uid not in uid_to_pks:
                    pks = db.query(DBEmployee.id).filter(DBEmployee.user_id == uid).all()
                    uid_to_pks[uid] = [pk[0] for pk in pks]

        out = []
        for r in rows:
            day_date = r.day if hasattr(r.day, 'isoformat') else None
            item = {
                "employee_id": r.employee_id,
                "employee_name": r.employee_name,
                "department": r.department,
                "company": r.company,
                "date": r.day.isoformat() if hasattr(r.day, "isoformat") else str(r.day),
                "sources": list(r.sources) if getattr(r, "sources", None) else ["device"],
            }
            # Merge near-duplicate punches (double-taps) the same way the PDF does,
            # so e.g. two taps at 18:35 collapse to a single punch instead of being
            # shown as both Entrée and Sortie at 18:35.
            _merge_sec = int((getattr(_settings, 'punch_merge_window_min', 5) or 0)) * 60
            _all_ts = [t for t in (getattr(r, 'all_ts', None) or []) if t is not None]
            _merged = merge_close_punches(_all_ts, _merge_sec) if _all_ts else []
            if _merged:
                _first_ts = _merged[0][0]
                _last_ts = _merged[-1][0]
                _eff_swipes = len(_merged)
            else:
                _first_ts, _last_ts, _eff_swipes = r.first_ts, r.last_ts, int(r.swipes or 0)

            item["first_check_in"] = _first_ts.isoformat() if _first_ts else None
            item["last_check_out"] = _last_ts.isoformat() if _last_ts else None
            item["swipes"] = _eff_swipes
            # Single (effective) punch: don't show the same time as both in and out
            if _eff_swipes == 1 and _first_ts:
                if _first_ts.hour < 12:
                    item["last_check_out"] = None
                else:
                    item["first_check_in"] = None
            # Enrich with day summary (overtime, late, etc.)
            if shared:
                all_pks = uid_to_pks.get(r.employee_id, [])
            else:
                all_pks = [r.employee_id]
            if day_date and all_pks:
                summary_data = get_employee_day_summary(
                    db, all_pks[0], day_date,
                    employee_ids=all_pks if shared else None,
                )
                item["total_minutes"] = summary_data.get("total_minutes")
                item["overtime_minutes"] = summary_data.get("overtime_minutes", 0)
                if attendance_mode == 'strict' or with_lateness:
                    # When the user asked for the 'avec retards' report we
                    # surface late_minutes even though attendance_mode is
                    # 'simple' — it's the whole point of that report type.
                    item["late_minutes"] = summary_data.get("late_minutes", 0)
                    item["early_departure_minutes"] = summary_data.get("early_departure_minutes", 0)
            out.append(item)
        return {"count": len(out), "summary": out, "attendance_mode": attendance_mode, "employee_mode": employee_mode, "with_lateness": with_lateness}


@router.get("/attendance/export.csv")
def export_attendance_csv(
    date: Optional[str] = Query(None),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    employee_name: Optional[str] = Query(None),
    employee_id: Optional[str] = Query(None),
    employee_ids: Optional[str] = Query(None, description="Comma-separated matricules (chip picker)"),
    device_id: Optional[str] = Query(None),
    current=Depends(get_current_user),
):
    """Export detailed attendance to CSV."""
    import csv

    start_dt, end_dt = parse_dates(date, start_date, end_date)
    emp_ids = _parse_employee_ids(employee_ids)

    with get_db_session() as db:
        q = (
            db.query(DBAttendance)
            .join(DBEmployee, DBAttendance.employee_id == DBEmployee.id)
            .outerjoin(DBDepartment, DBEmployee.department_id == DBDepartment.id)
            .outerjoin(DBCompany, DBEmployee.company_id == DBCompany.id)
            .outerjoin(DBDevice, DBAttendance.device_id == DBDevice.id)
        )
        filters = _base_filters(start_dt, end_dt, employee_name, employee_id, device_id, emp_ids)
        if filters:
            q = q.filter(and_(*filters))
        rows = q.order_by(DBAttendance.timestamp.desc()).limit(5000).all()

        # Classify punches
        classified = classify_attendance_records(db, rows)

        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow([
            "Date", "Time", "Employee ID", "Employee Name",
            "Department", "Company", "Device", "Punch", "Category", "Status",
        ])
        for item in classified:
            r = item["record"]
            punch_label = "In" if r.punch == 0 else ("Out" if r.punch == 1 else str(r.punch))
            cat_label = item["punch_category"].replace("_", " ").title()
            writer.writerow([
                r.timestamp.strftime("%Y-%m-%d"),
                r.timestamp.strftime("%H:%M:%S"),
                r.employee.user_id if r.employee else "?",
                r.employee.name if r.employee else "Unknown",
                (r.employee.department.name if r.employee and r.employee.department else "-"),
                (r.employee.company.name if r.employee and r.employee.company else "-"),
                (r.device.name if r.device else "Unknown"),
                punch_label,
                cat_label,
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
    employee_ids: Optional[str] = Query(None, description="Comma-separated matricules (chip picker)"),
    device_id: Optional[str] = Query(None),
    lang: str = Query("en", description="Language: en, fr, ar"),
    group_by: Optional[str] = Query(None, description="Group by: employee, date, or omit for flat"),
    with_lateness: bool = Query(False, description="Add 'Retard' column + per-group totals"),
    current=Depends(get_current_user),
):
    """Export attendance to a professionally formatted PDF report.

    When `with_lateness` is true:
    - Each row gets a 'Retard' column populated regardless of attendance_mode.
    - Each group (employee / date / department / flat) ends with a
      'Total retard' footer line.
    """
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.lib import colors
    from reportlab.platypus import (
        SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, HRFlowable,
        KeepTogether, PageBreak,
    )
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
    from collections import OrderedDict

    L = _get_labels(lang)
    start_dt, end_dt = parse_dates(date, start_date, end_date)

    # ── Helper: format minutes as Xh Ym ─────────────────────────────────
    def _fmt_min(mins):
        if mins is None or mins == 0:
            return "-"
        h, m = divmod(int(mins), 60)
        if h > 0:
            return f"{h}h {m:02d}m"
        return f"{m}m"

    # ── Fetch summary data inside session ──────────────────────────────
    with get_db_session() as db:
        from app.database.schema import AppSettings as _AppSettings
        _settings = db.query(_AppSettings).first()
        attendance_mode = getattr(_settings, 'attendance_mode', None) or 'simple'
        employee_mode = getattr(_settings, 'employee_mode', None) or 'shared'
        pdf_style = getattr(_settings, 'pdf_style', None) or 'style1'
        pdf_show_overtime = getattr(_settings, 'pdf_show_overtime', True) if hasattr(_settings, 'pdf_show_overtime') else True
        pdf_show_total_worked = getattr(_settings, 'pdf_show_total_worked', True) if hasattr(_settings, 'pdf_show_total_worked') else True

        # Honour the module flag even if the caller smuggled ?with_lateness=true:
        # disabling the module in Settings → Rapports must make the Retard
        # column disappear everywhere, including from a stale browser tab or
        # a hand-built URL. The PDF then renders identical to the pre-Phase-1
        # report — zero column, zero per-group totals, zero extra work.
        if with_lateness and not getattr(_settings, 'lateness_module_enabled', False):
            with_lateness = False

        shared = employee_mode == 'shared'

        id_col = DBEmployee.user_id if shared else DBEmployee.id
        q = (
            db.query(
                id_col.label("employee_id"),
                func.min(DBEmployee.name).label("employee_name") if shared else DBEmployee.name.label("employee_name"),
                func.coalesce(func.min(DBDepartment.name), "-").label("department") if shared else func.coalesce(DBDepartment.name, "-").label("department"),
                func.coalesce(func.min(DBCompany.name), "-").label("company") if shared else func.coalesce(DBCompany.name, "-").label("company"),
                cast(DBAttendance.timestamp, Date).label("day"),
                func.min(DBAttendance.timestamp).label("first_ts"),
                func.max(DBAttendance.timestamp).label("last_ts"),
                func.count(DBAttendance.id).label("swipes"),
                # Full timestamp list so we can merge near-duplicate punches in
                # Python (5-min window by default — see punch_merge_window_min).
                func.array_agg(DBAttendance.timestamp).label("all_ts"),
            )
            .select_from(DBAttendance)
            .join(DBEmployee, DBAttendance.employee_id == DBEmployee.id)
            .outerjoin(DBDepartment, DBEmployee.department_id == DBDepartment.id)
            .outerjoin(DBCompany, DBEmployee.company_id == DBCompany.id)
        )
        emp_ids = _parse_employee_ids(employee_ids)
        filters = _base_filters(start_dt, end_dt, employee_name, employee_id, device_id, emp_ids)
        if filters:
            q = q.filter(and_(*filters))
        if shared:
            q = q.group_by(DBEmployee.user_id, cast(DBAttendance.timestamp, Date))
        else:
            q = q.group_by(DBEmployee.id, DBEmployee.name, DBDepartment.name, DBCompany.name, cast(DBAttendance.timestamp, Date))
        q = q.order_by(id_col.asc(), cast(DBAttendance.timestamp, Date).asc())
        rows = q.all()

        # Read merge window from settings (0 disables merging)
        _merge_window_min = int(getattr(_settings, 'punch_merge_window_min', 5) or 0)
        _merge_window_sec = max(0, _merge_window_min) * 60

        company_row = db.query(DBCompany.name).order_by(DBCompany.id).first()
        company_name = company_row[0] if company_row else ""

        # Build id -> [list of Employee PKs] for cross-device summary (shared mode)
        uid_to_pks = {}
        if shared:
            for r in rows:
                uid = r.employee_id
                if uid not in uid_to_pks:
                    pks = db.query(DBEmployee.id).filter(DBEmployee.user_id == uid).all()
                    uid_to_pks[uid] = [pk[0] for pk in pks]

        record_count = len(rows)
        employee_set = set()
        flat_rows = []

        # Build a lookup of device names per (employee_id, day)
        # Query: for each attendance record, which device was used
        device_names_map = {}  # (employee_id_or_uid, day_iso) -> set of device names
        dev_q = (
            db.query(
                (DBEmployee.user_id if shared else DBEmployee.id).label("eid"),
                cast(DBAttendance.timestamp, Date).label("day"),
                DBDevice.name.label("device_name"),
            )
            .select_from(DBAttendance)
            .join(DBEmployee, DBAttendance.employee_id == DBEmployee.id)
            .outerjoin(DBDevice, DBAttendance.device_id == DBDevice.id)
        )
        dev_filters = _base_filters(start_dt, end_dt, employee_name, employee_id, device_id, emp_ids)
        if dev_filters:
            dev_q = dev_q.filter(and_(*dev_filters))
        for dr in dev_q.all():
            key = (dr.eid, dr.day.isoformat() if hasattr(dr.day, 'isoformat') else str(dr.day))
            if key not in device_names_map:
                device_names_map[key] = set()
            if dr.device_name:
                device_names_map[key].add(dr.device_name)

        for r in rows:
            emp_name = (r.employee_name or "?")[:32]
            employee_set.add(r.employee_id)
            day_date = r.day if hasattr(r.day, 'isoformat') else None
            summary_data = {}
            if shared:
                all_pks = uid_to_pks.get(r.employee_id, [])
            else:
                all_pks = [r.employee_id]
            if day_date and all_pks:
                summary_data = get_employee_day_summary(
                    db, all_pks[0], day_date,
                    employee_ids=all_pks if shared else None,
                )
            # ── Merge near-duplicate punches ──
            # all_ts is the full timestamp list for this employee/day. Collapse
            # any cluster whose punches are within _merge_window_sec apart so
            # the report shows the user's intent (one punch per "attempt"),
            # not raw device noise. window_seconds=0 keeps the existing
            # behaviour (no merging).
            _raw_count = int(r.swipes or 0)
            _all_ts = list(r.all_ts or [])
            _merged = merge_close_punches(_all_ts, _merge_window_sec) if _all_ts else []
            if _merged:
                _swipes = len(_merged)
                _first_ts = _merged[0][0]
                _last_ts  = _merged[-1][0]
            else:
                _swipes = _raw_count
                _first_ts = r.first_ts
                _last_ts  = r.last_ts
            _merged_count = _raw_count - _swipes if _raw_count > _swipes else 0
            _entry, _exit = _resolve_entry_exit(_first_ts, _last_ts, _swipes, summary_data)
            flat_rows.append({
                "employee": emp_name,
                "emp_id": r.employee_id or "-",
                "department": (r.department or "-")[:24],
                "date": r.day.isoformat() if hasattr(r.day, "isoformat") else str(r.day),
                "entry": _entry or "-",
                "exit": _exit or "-",
                "incomplete": _entry is None or _exit is None,
                "swipes": _swipes,
                "swipes_original": _raw_count,
                "swipes_merged": _merged_count,
                "device_names": ", ".join(sorted(device_names_map.get(
                    (r.employee_id, r.day.isoformat() if hasattr(r.day, "isoformat") else str(r.day)),
                    set()
                ))) or "-",
                "total_minutes": summary_data.get("total_minutes"),
                "overtime_minutes": summary_data.get("overtime_minutes", 0),
                "late_minutes": summary_data.get("late_minutes", 0),
                "early_departure_minutes": summary_data.get("early_departure_minutes", 0),
            })

    # ── Device abbreviation map ────────────────────────────────────────
    # Collect every unique device name that appears in the report, assign
    # sequential numbers (sorted alphabetically), and replace the long names
    # in each row with their short number so the table column stays narrow.
    _all_dev_names: set = set()
    for _r in flat_rows:
        for _dn in (_r.get("device_names") or "").split(", "):
            _dn = _dn.strip()
            if _dn and _dn != "-":
                _all_dev_names.add(_dn)
    device_legend: list = []
    if _all_dev_names:
        _dev_num_map = {name: str(i + 1) for i, name in enumerate(sorted(_all_dev_names))}
        device_legend = sorted(
            [(_num, _name) for _name, _num in _dev_num_map.items()],
            key=lambda x: int(x[0]),
        )
        for _r in flat_rows:
            _parts = [p.strip() for p in (_r.get("device_names") or "").split(", ")
                      if p.strip() and p.strip() != "-"]
            _r["device_names"] = ", ".join(
                _dev_num_map[p] for p in _parts if p in _dev_num_map
            ) or "-"

    # ── Colour palette & styles ────────────────────────────────────────
    if pdf_style == 'style2':
        BRAND_COLOR = colors.HexColor("#059669")   # emerald
        HEADER_BG = colors.HexColor("#065f46")
        ALT_ROW = colors.HexColor("#ecfdf5")
    else:
        BRAND_COLOR = colors.HexColor("#1e40af")
        HEADER_BG = colors.HexColor("#1e3a5f")
        ALT_ROW = colors.HexColor("#f1f5f9")
    HEADER_FG = colors.white
    OT_COLOR = colors.HexColor("#7c3aed")       # purple for overtime
    LATE_COLOR = colors.HexColor("#d97706")     # amber for late
    EARLY_COLOR = colors.HexColor("#ea580c")    # orange for early dep
    OK_COLOR = colors.HexColor("#16a34a")       # green for on-time
    INCOMPLETE_BG = colors.HexColor("#fff7ed")  # warm amber tint for single-punch rows

    buf = io.BytesIO()
    # Single day when an explicit date is given OR start==end.
    _is_single_day = bool(date) or bool(start_date and end_date and start_date == end_date)
    _period_str = (date or start_date) if _is_single_day else f"{start_date or ''} – {end_date or ''}"
    _doc_title = " — ".join(x for x in [(company_name or "RTPointage"), L["title"], _period_str] if x)

    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=18 * mm, rightMargin=18 * mm,
        topMargin=18 * mm, bottomMargin=22 * mm,
        title=_doc_title,
        author=(company_name or "RTPointage"),
        subject=L["title"],
    )
    width, height = A4
    styles = getSampleStyleSheet()

    title_style = ParagraphStyle("PDFTitle", parent=styles["Title"], fontSize=18, textColor=BRAND_COLOR, spaceAfter=2)
    subtitle_style = ParagraphStyle("PDFSub", parent=styles["Normal"], fontSize=10, textColor=colors.HexColor("#475569"), spaceAfter=2)
    footer_style = ParagraphStyle("PDFFooter", parent=styles["Normal"], fontSize=7, textColor=colors.HexColor("#94a3b8"), alignment=TA_CENTER)
    cell_style = ParagraphStyle("Cell", parent=styles["Normal"], fontSize=8, leading=10)
    cell_bold = ParagraphStyle("CellBold", parent=cell_style, fontName="Helvetica-Bold")
    cell_center = ParagraphStyle("CellC", parent=cell_style, alignment=TA_CENTER)
    cell_missing = ParagraphStyle(
        "CellMiss", parent=cell_center,
        textColor=colors.HexColor("#9ca3af"), fontName="Helvetica-Oblique",
    )
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
    def _make_table(col_headers, data_rows, col_widths, title_row_text=None, incomplete_rows=None):
        """Build a professional table. If title_row_text is given, a full-width
        banner row is prepended above the column headers.
        incomplete_rows: list of 0-based data row indices to tint amber (single-punch)."""
        if pdf_style == 'style2':
            th_text_color = BRAND_COLOR
        else:
            th_text_color = HEADER_FG
        th_style = ParagraphStyle("TH", parent=cell_style, fontSize=8, textColor=th_text_color, fontName="Helvetica-Bold")
        header_row = [Paragraph(f"<b>{h}</b>", th_style) for h in col_headers]

        table_data = []
        title_row_idx = None          # index of the banner row (if any)
        col_header_idx = 0            # index of the column-header row

        if title_row_text:
            # Banner row: single Paragraph that spans all columns
            if pdf_style == 'style2':
                banner_para = Paragraph(
                    f"<b>{title_row_text}</b>",
                    ParagraphStyle("BannerCell", parent=cell_style, fontSize=10,
                                   fontName="Helvetica-Bold", textColor=BRAND_COLOR),
                )
            else:
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

        # Scale columns to always fill the full printable width
        _printable_w = width - 2 * 18 * mm
        _natural_w = sum(col_widths)
        if _natural_w > 0:
            _scale = _printable_w / _natural_w
            col_widths = [w * _scale for w in col_widths]

        tbl = Table(table_data, colWidths=col_widths, repeatRows=col_header_idx + 1)

        if pdf_style == 'style2':
            # Style 2: clean minimal — no solid header bg, borders instead
            cmds = [
                ("TEXTCOLOR", (0, col_header_idx), (-1, col_header_idx), BRAND_COLOR),
                ("FONTNAME", (0, col_header_idx), (-1, col_header_idx), "Helvetica-Bold"),
                ("FONTSIZE", (0, col_header_idx), (-1, col_header_idx), 8),
                ("BOTTOMPADDING", (0, col_header_idx), (-1, col_header_idx), 6),
                ("TOPPADDING", (0, col_header_idx), (-1, col_header_idx), 6),
                ("LINEABOVE", (0, col_header_idx), (-1, col_header_idx), 1.5, BRAND_COLOR),
                ("LINEBELOW", (0, col_header_idx), (-1, col_header_idx), 1.5, BRAND_COLOR),
                # Data rows
                ("FONTSIZE", (0, col_header_idx + 1), (-1, -1), 8),
                ("TOPPADDING", (0, col_header_idx + 1), (-1, -1), 4),
                ("BOTTOMPADDING", (0, col_header_idx + 1), (-1, -1), 4),
                ("LINEBELOW", (0, -1), (-1, -1), 0.75, BRAND_COLOR),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ]
            if len(table_data) > col_header_idx + 2:
                cmds.append(("LINEBELOW", (0, col_header_idx + 1), (-1, -2), 0.25, colors.HexColor("#d1d5db")))
            # Banner row for style2: light tinted background
            if title_row_idx is not None:
                cmds.extend([
                    ("SPAN", (0, title_row_idx), (-1, title_row_idx)),
                    ("BACKGROUND", (0, title_row_idx), (-1, title_row_idx), ALT_ROW),
                    ("TEXTCOLOR", (0, title_row_idx), (-1, title_row_idx), BRAND_COLOR),
                    ("FONTNAME", (0, title_row_idx), (-1, title_row_idx), "Helvetica-Bold"),
                    ("FONTSIZE", (0, title_row_idx), (-1, title_row_idx), 10),
                    ("BOTTOMPADDING", (0, title_row_idx), (-1, title_row_idx), 7),
                    ("TOPPADDING", (0, title_row_idx), (-1, title_row_idx), 7),
                    ("LINEABOVE", (0, title_row_idx), (-1, title_row_idx), 1, BRAND_COLOR),
                    ("LINEBELOW", (0, title_row_idx), (-1, title_row_idx), 0, colors.white),
                ])
            # No alternating rows in style2 — keep it clean
        else:
            # Style 1: classic solid-header professional look
            cmds = [
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

        # Incomplete rows (single punch): amber tint — applied last so it overrides alt-rows
        if incomplete_rows:
            for idx in incomplete_rows:
                row_idx = idx + col_header_idx + 1
                cmds.append(("BACKGROUND", (0, row_idx), (-1, row_idx), INCOMPLETE_BG))

        # Full grid: outer border in brand colour, inner vertical/horizontal lines in light gray
        cmds.extend([
            ("BOX",       (0, col_header_idx), (-1, -1), 0.75, BRAND_COLOR),
            ("INNERGRID", (0, col_header_idx), (-1, -1), 0.25, colors.HexColor("#d1d5db")),
        ])

        tbl.setStyle(TableStyle(cmds))
        return tbl

    def _ot_para(val):
        """Overtime value with purple color."""
        txt = _fmt_min(val)
        if txt == "-":
            return Paragraph("-", cell_center)
        return Paragraph(f'<font color="#{OT_COLOR.hexval()[2:]}">{txt}</font>', cell_center)

    def _late_para(val):
        """Late value with amber color."""
        txt = _fmt_min(val)
        if txt == "-":
            return Paragraph("-", cell_center)
        return Paragraph(f'<font color="#{LATE_COLOR.hexval()[2:]}">{txt}</font>', cell_center)

    def _early_para(val):
        """Early departure value with orange color."""
        txt = _fmt_min(val)
        if txt == "-":
            return Paragraph("-", cell_center)
        return Paragraph(f'<font color="#{EARLY_COLOR.hexval()[2:]}">{txt}</font>', cell_center)

    def _status_para(r):
        """Build a status label based on late/early values."""
        late = r.get("late_minutes", 0) or 0
        early = r.get("early_departure_minutes", 0) or 0
        parts = []
        if late > 0:
            parts.append(f'<font color="#{LATE_COLOR.hexval()[2:]}">{L["late_status"]}</font>')
        if early > 0:
            parts.append(f'<font color="#{EARLY_COLOR.hexval()[2:]}">{L["early_status"]}</font>')
        if not parts:
            return Paragraph(f'<font color="#{OK_COLOR.hexval()[2:]}">{L["on_time"]}</font>', cell_center)
        return Paragraph(" / ".join(parts), cell_center)

    def _time_cell(val: str):
        """Gray italic em-dash for a missing punch; normal centered text otherwise."""
        if val == "-":
            return Paragraph('<font color="#9ca3af"><i>—</i></font>', cell_missing)
        return Paragraph(val, cell_center)

    # ── Build row cells helper per mode ────────────────────────────────
    # `_show_late_only` controls whether to add JUST the 'Retard' column
    # without the strict-mode Early/Status pair. It's the on-demand flag
    # the 'Avec retards' report type uses on top of any attendance_mode.
    _show_late_only = (with_lateness and attendance_mode != "strict")

    def _build_row(r, include_employee=True, include_date=True, include_department=True):
        """Return a list of Paragraph cells for one summary row."""
        cells = []
        if include_employee:
            cells.append(Paragraph(str(r["emp_id"]), cell_center))
            cells.append(Paragraph(r["employee"], cell_bold))
            if include_department:
                cells.append(Paragraph(r["department"], cell_style))
        if include_date:
            cells.append(Paragraph(r["date"], cell_center))
        cells.append(_time_cell(r["entry"]))
        cells.append(_time_cell(r["exit"]))
        if pdf_show_total_worked:
            cells.append(Paragraph(_fmt_min(r["total_minutes"]), cell_center))
        if pdf_show_overtime:
            cells.append(_ot_para(r["overtime_minutes"]))
        if attendance_mode == "strict":
            cells.append(_late_para(r["late_minutes"]))
            cells.append(_early_para(r["early_departure_minutes"]))
            cells.append(_status_para(r))
        elif _show_late_only:
            cells.append(_late_para(r.get("late_minutes", 0)))
        cells.append(Paragraph(r.get("device_names", "-"), cell_center))
        return cells

    def _build_headers(include_employee=True, include_date=True, include_department=True):
        """Return (col_headers, col_widths) for the current mode."""
        headers = []
        widths = []
        if include_employee:
            headers += [L["emp_id"], L["employee"]]
            widths += [14 * mm, 34 * mm]
            if include_department:
                headers.append(L["department"])
                widths.append(24 * mm)
        if include_date:
            headers.append(L["col_date"])
            widths.append(22 * mm)
        headers += [L["entry_time"], L["exit_time"]]
        widths += [18 * mm, 18 * mm]
        if pdf_show_total_worked:
            headers.append(L["total_worked"])
            widths.append(20 * mm)
        if pdf_show_overtime:
            headers.append(L["overtime"])
            widths.append(18 * mm)
        if attendance_mode == "strict":
            headers += [L["late"], L["early_dep"], L["status"]]
            widths += [16 * mm, 18 * mm, 22 * mm]
        elif _show_late_only:
            headers.append(L["late"])
            widths.append(18 * mm)
        headers.append(L["device"])
        widths.append(26 * mm)
        return headers, widths

    # ── 'Total retard' footer (only when 'Avec retards' was requested) ────
    _total_retard_style = ParagraphStyle(
        "TotalRetard", parent=styles["Normal"],
        fontSize=9, alignment=TA_RIGHT,
        textColor=LATE_COLOR, spaceBefore=1, spaceAfter=2,
    )
    def _total_retard_line(rows: list, label_prefix: str = "") -> "Paragraph | None":
        """Return a 'Total retard: Xh Ym' paragraph for the given rows,
        or None if the report doesn't include the retard column."""
        if not with_lateness:
            return None
        total = sum(int(r.get("late_minutes") or 0) for r in rows)
        prefix = f"{label_prefix} — " if label_prefix else ""
        return Paragraph(
            f'<b>{prefix}{L["late"]} :</b> {_fmt_min(total)}',
            _total_retard_style,
        )

    story = []

    # ── Report header ──────────────────────────────────────────────────
    mode_label = L["mode_simple"] if attendance_mode == "simple" else L["mode_strict"]
    if company_name:
        story.append(Paragraph(company_name, title_style))
    story.append(Paragraph(
        f"<b>{L['title']}</b>  —  {L['daily_summary']}",
        ParagraphStyle("RT", parent=styles["Heading2"], fontSize=14, textColor=BRAND_COLOR),
    ))

    # Single day → "Date: X"; real range → "Période: X – Y" (en dash renders in
    # Helvetica; the old "→" arrow showed as "®" in some PDF viewers).
    date_label = _period_str if _is_single_day else f"{start_date or '—'} – {end_date or '—'}"
    meta = [
        f"<b>{L['date'] if _is_single_day else L['period']}:</b> {date_label}",
        f"<b>{L['generated']}:</b> {datetime.now().strftime('%Y-%m-%d %H:%M')}",
        f"<b>Mode:</b> {mode_label}",
    ]
    story.append(Paragraph("  &nbsp; |  &nbsp; ".join(meta), subtitle_style))
    summary_text = (
        f"<b>{L['total_records']}:</b> {record_count}  &nbsp; |  &nbsp; "
        f"<b>{L['total_employees']}:</b> {len(employee_set)}"
    )
    story.append(Paragraph(summary_text, subtitle_style))

    # ── Holiday notice (if the period covers any public holiday) ──────────
    # Skipped entirely — no DB query, no banner — when the super admin
    # disabled pdf_show_holidays in Settings → Général. Default is ON.
    _show_holidays = bool(getattr(_settings, 'pdf_show_holidays', True))
    try:
        from app.database.shift_schema import Holiday as _HOL2
        _hsd = start_dt.date() if start_dt else None
        _hed = end_dt.date() if end_dt else None
        _holidays_in_period = []
        if _show_holidays and _hsd and _hed:
            with get_db_session() as _hdb:
                _holidays_in_period = (_hdb.query(_HOL2)
                    .filter(_HOL2.date >= _hsd, _HOL2.date <= _hed)
                    .order_by(_HOL2.date.asc()).all())
        if _holidays_in_period:
            _hol_style = ParagraphStyle(
                "HolidayBanner", parent=subtitle_style,
                fontSize=10, leading=14,
                textColor=colors.HexColor("#92400e"),       # amber-800
                backColor=colors.HexColor("#fef3c7"),       # amber-100
                borderColor=colors.HexColor("#fcd34d"),     # amber-300
                borderWidth=0.6, borderPadding=6,
                borderRadius=4,
                spaceBefore=4, spaceAfter=2,
            )
            _label = L.get("holiday_label", "Jour férié")
            _bits = []
            for _h in _holidays_in_period:
                _d = _h.date.isoformat() if hasattr(_h.date, 'isoformat') else str(_h.date)
                _bits.append(f"<b>{_d}</b> — {_bilingual_html(_h.name)}")
            _hol_html = f'<font size="11">★</font> &nbsp; <b>{_label}{"s" if len(_holidays_in_period) > 1 else ""} :</b>  ' + " &nbsp; · &nbsp; ".join(_bits)
            story.append(Spacer(1, 3 * mm))
            story.append(Paragraph(_hol_html, _hol_style))
    except Exception as _hexc:
        logger.warning(f"Holiday banner skipped: {_hexc}")

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

        for emp_name, emp_rows in groups.items():
            emp_id = emp_rows[0]["emp_id"]
            dept = emp_rows[0]["department"]
            subtitle = f"{dept}  ·  {len(emp_rows)} {L['records']}"

            col_headers, col_widths = _build_headers(include_employee=False, include_date=True)
            data_rows = [_build_row(r, include_employee=False, include_date=True) for r in emp_rows]
            inc = [i for i, r in enumerate(emp_rows) if r.get("incomplete")]

            story.append(Spacer(1, 3 * mm))
            story.append(HRFlowable(width="100%", thickness=1.5, color=BRAND_COLOR, spaceAfter=2 * mm))
            story.append(Paragraph(f"<b>{emp_name}  ({emp_id})</b>", group_title_style))
            story.append(Paragraph(subtitle, group_sub_style))
            story.append(Spacer(1, 2 * mm))
            story.append(_make_table(col_headers, data_rows, col_widths, incomplete_rows=inc))
            _tr = _total_retard_line(emp_rows, label_prefix=f"{emp_name}")
            if _tr is not None: story.append(_tr)
            story.append(Spacer(1, 4 * mm))

    # ── GROUP BY DATE ──────────────────────────────────────────────────
    elif group_by == "date":
        groups = OrderedDict()
        for r in flat_rows:
            groups.setdefault(r["date"], []).append(r)

        for day, day_rows in groups.items():
            unique_emp = len(set(r["emp_id"] for r in day_rows))
            subtitle = f"{unique_emp} {L['emp_count']}  ·  {len(day_rows)} {L['records']}"

            col_headers, col_widths = _build_headers(include_employee=True, include_date=False)
            data_rows = [_build_row(r, include_employee=True, include_date=False) for r in day_rows]
            inc = [i for i, r in enumerate(day_rows) if r.get("incomplete")]

            story.append(Spacer(1, 3 * mm))
            story.append(HRFlowable(width="100%", thickness=1.5, color=BRAND_COLOR, spaceAfter=2 * mm))
            story.append(Paragraph(f"<b>{day}</b>", group_title_style))
            story.append(Paragraph(subtitle, group_sub_style))
            story.append(Spacer(1, 2 * mm))
            story.append(_make_table(col_headers, data_rows, col_widths, incomplete_rows=inc))
            _tr = _total_retard_line(day_rows, label_prefix=str(day))
            if _tr is not None: story.append(_tr)
            story.append(Spacer(1, 4 * mm))

    # ── GROUP BY DEPARTMENT ────────────────────────────────────────────
    elif group_by == "department":
        groups = OrderedDict()
        for r in flat_rows:
            groups.setdefault(r["department"] or "-", []).append(r)

        for dept_name, dept_rows in groups.items():
            unique_emp = len(set(r["emp_id"] for r in dept_rows))
            subtitle = f"{unique_emp} {L['emp_count']}  ·  {len(dept_rows)} {L['records']}"

            col_headers, col_widths = _build_headers(include_employee=True, include_date=True, include_department=False)
            data_rows = [_build_row(r, include_employee=True, include_date=True, include_department=False) for r in dept_rows]
            inc = [i for i, r in enumerate(dept_rows) if r.get("incomplete")]

            story.append(Spacer(1, 3 * mm))
            story.append(HRFlowable(width="100%", thickness=1.5, color=BRAND_COLOR, spaceAfter=2 * mm))
            story.append(Paragraph(f"<b>{dept_name}</b>", group_title_style))
            story.append(Paragraph(subtitle, group_sub_style))
            story.append(Spacer(1, 2 * mm))
            story.append(_make_table(col_headers, data_rows, col_widths, incomplete_rows=inc))
            _tr = _total_retard_line(dept_rows, label_prefix=str(dept_name))
            if _tr is not None: story.append(_tr)
            story.append(Spacer(1, 4 * mm))

    # ── NO GROUPING (flat table) ───────────────────────────────────────
    else:
        col_headers, col_widths = _build_headers(include_employee=True, include_date=True)
        data_rows = [_build_row(r, include_employee=True, include_date=True) for r in flat_rows]
        inc = [i for i, r in enumerate(flat_rows) if r.get("incomplete")]
        story.append(_make_table(col_headers, data_rows, col_widths, incomplete_rows=inc))
        # A grand 'Total retard' on the flat layout only makes sense when the
        # report covers a single employee — summing lateness across many
        # different people and many days is a meaningless number. For
        # multi-employee reports the user should group by employee to get
        # per-employee totals (which we do show, below each section).
        _distinct_emp = {r.get("emp_id") for r in flat_rows}
        if len(_distinct_emp) == 1:
            _name = flat_rows[0].get("employee") or "—"
            _tr = _total_retard_line(flat_rows, label_prefix=_name)
            if _tr is not None: story.append(_tr)

    # ── Absentees section (employees with no punches in the period) ─────
    # Queries all employees matching the same device/employee filters as the
    # main report and lists the ones whose ID isn't in employee_set (i.e. who
    # produced no punches at all during the period). Doesn't render anything
    # if the period had no records at all (the empty-state block above
    # already covers that case).
    #
    # CRITICAL: the absentees query must apply EVERY filter the main report
    # used, otherwise picking one employee in the chip picker still surfaces
    # everyone else as "absent" — which was the bug a user reported. Mirror
    # the filter set built by _base_filters above:
    #   • employee_id   (legacy single-matricule arg)
    #   • employee_ids  (the new chip-picker CSV)
    #   • employee_name (free-text contains match)
    #   • device_id     (source device on the Employee row)
    try:
        with get_db_session() as _absdb:
            _absq = (_absdb.query(DBEmployee)
                          .outerjoin(DBDepartment, DBEmployee.department_id == DBDepartment.id))
            if device_id:
                _absq = _absq.filter(DBEmployee.source_device_id == device_id)
            if employee_id:
                _absq = _absq.filter(DBEmployee.user_id == employee_id)
            if emp_ids:
                _absq = _absq.filter(DBEmployee.user_id.in_(emp_ids))
            if employee_name:
                _absq = _absq.filter(DBEmployee.name.ilike(f"%{employee_name}%"))
            _all_emps = _absq.all()

            # Identify absent employees — employee_set is keyed by user_id in
            # shared mode and by employee.id otherwise (see the rows loop above).
            if shared:
                _absent_emps = [e for e in _all_emps if e.user_id not in employee_set]
            else:
                _absent_emps = [e for e in _all_emps if e.id not in employee_set]

            # Exclude employees who are OFF (per their weekly schedule) OR for
            # whom the whole period is public holidays. An employee counts as
            # absent only if they were expected to work on at least one
            # NON-HOLIDAY day in the period and didn't punch.
            from datetime import timedelta as _td
            from app.database.shift_schema import (
                EmployeeSchedule as _ES, DepartmentSchedule as _DS, Holiday as _HOL,
            )
            _sd = start_dt.date() if start_dt else None
            _ed = end_dt.date() if end_dt else None
            # Working dates = period dates that are not public holidays
            _holidays = set()
            if _sd and _ed:
                _holidays = {h.date for h in _absdb.query(_HOL)
                              .filter(_HOL.date >= _sd, _HOL.date <= _ed).all()}
            _working_dates = []
            if _sd and _ed and _ed >= _sd and (_ed - _sd).days <= 366:
                _d = _sd
                while _d <= _ed:
                    if _d not in _holidays:
                        _working_dates.append(_d)
                    _d += _td(days=1)
            _emp_off = {(s.employee_id, s.day_of_week): s.is_day_off for s in _absdb.query(_ES).all()}
            _dept_off = {(s.department_id, s.day_of_week): s.is_day_off for s in _absdb.query(_DS).all()}

            def _works_on(e, wd):
                if (e.id, wd) in _emp_off:
                    return not _emp_off[(e.id, wd)]
                if (e.department_id, wd) in _dept_off:
                    return not _dept_off[(e.department_id, wd)]
                return True  # no schedule → assume working

            # Expected-to-work per logical person (OR across their device rows)
            _expected = {}
            for e in _absent_emps:
                key = e.user_id if shared else e.id
                works = any(_works_on(e, d.weekday()) for d in _working_dates) if _working_dates else False
                _expected[key] = _expected.get(key, False) or works

            # DEDUPE — in shared mode the same person can be registered on
            # multiple devices (one Employee row per device), so we keep only
            # ONE row per logical person. Sort by user_id (numeric if possible)
            # so the list is stable and easy to scan.
            _seen = set()
            _dedup_data = []
            for e in _absent_emps:
                key = e.user_id if shared else e.id
                if key in _seen:
                    continue
                if not _expected.get(key, True):
                    continue  # off the whole period — not absent
                _seen.add(key)
                _dedup_data.append({
                    "name":       e.name or "—",
                    "user_id":    str(e.user_id or ""),
                    "department": (e.department.name if e.department else "—"),
                })

            def _sort_key(d):
                try:    return (0, int(d["user_id"]))
                except: return (1, d["user_id"])
            _absent_data = sorted(_dedup_data, key=_sort_key)
    except Exception as _e:
        logger.warning(f"Could not compute absentees list: {_e}")
        _absent_data = []

    if flat_rows and _absent_data:
        # Start the absentees on a new page so the main attendance table stays
        # visually grouped and the absentees list gets its own dedicated section.
        story.append(PageBreak())
        story.append(Paragraph(
            f"<b>{L['absentees_title']}</b>",
            ParagraphStyle("AbsTitle", parent=title_style, fontSize=16, spaceAfter=2),
        ))
        story.append(Paragraph(
            f"{L['absentees_subtitle']}  &nbsp; |  &nbsp; "
            f"<b>{len(_absent_data)}</b> {L['absentees_count']}",
            subtitle_style,
        ))
        story.append(Spacer(1, 3 * mm))
        story.append(HRFlowable(width="100%", thickness=0.5, color=BRAND_COLOR, spaceAfter=4 * mm))

        # Build the absentees table with the SAME columns as the main table,
        # so headers/widths/colours/font sizes all match exactly. For each
        # absentee, entry/exit/total/overtime/device cells render as a grey
        # em-dash (— via _time_cell("-") / _fmt_min(0) / etc).
        _abs_headers, _abs_widths = _build_headers(
            include_employee=True, include_date=True, include_department=True
        )

        # Date column value: the single date if the report is for one day,
        # otherwise the period range.
        if date:
            _abs_date_label = date
        elif start_date and end_date and start_date != end_date:
            _abs_date_label = f"{start_date} → {end_date}"
        elif start_date or end_date:
            _abs_date_label = start_date or end_date
        else:
            _abs_date_label = "—"

        _abs_rows = []
        for d in _absent_data:
            row_cells = _build_row(
                {
                    "emp_id":                  d["user_id"],
                    "employee":                d["name"],
                    "department":              d["department"],
                    "date":                    _abs_date_label,
                    "entry":                   "-",   # _time_cell renders as grey —
                    "exit":                    "-",
                    "incomplete":              False,
                    "swipes":                  0,
                    "swipes_original":         0,
                    "swipes_merged":           0,
                    "device_names":            "-",   # also rendered as a dash
                    "total_minutes":           0,
                    "overtime_minutes":        0,
                    "late_minutes":            0,
                    "early_departure_minutes": 0,
                },
                include_employee=True,
                include_date=True,
                include_department=True,
            )
            # In strict mode, _build_row's status column would say "À l'heure"
            # ("On Time") which is wrong for absentees — override it to "Absent".
            # Column order now ends in: ..., late, early_dep, status, device
            # so status is at index -2.
            if attendance_mode == "strict" and len(row_cells) >= 2:
                row_cells[-2] = Paragraph(
                    f'<font color="#9ca3af"><i>{L["absent_status"]}</i></font>',
                    cell_center,
                )
            _abs_rows.append(row_cells)

        story.append(_make_table(_abs_headers, _abs_rows, col_widths=_abs_widths))

    # ── Footer ─────────────────────────────────────────────────────────
    story.append(Spacer(1, 6 * mm))
    if device_legend:
        dev_leg_style = ParagraphStyle(
            "DevLeg", parent=footer_style, fontSize=7.5,
            textColor=colors.HexColor("#475569"), alignment=TA_LEFT, leading=11,
        )
        lines = [f'<i>{L.get("device_legend_prefix", "Devices")} :</i>']
        for num, name in device_legend:
            lines.append(f'<b>{num}</b>  =  {name}')
        story.append(Paragraph("<br/>".join(lines), dev_leg_style))
        story.append(Spacer(1, 2 * mm))
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
        if pdf_style == 'style2':
            # Style 2: thin emerald line at top of page for branding
            canvas_obj.setStrokeColor(BRAND_COLOR)
            canvas_obj.setLineWidth(2)
            canvas_obj.line(18 * mm, height - 10 * mm, width - 18 * mm, height - 10 * mm)
        canvas_obj.restoreState()

    doc.build(story, onFirstPage=_page_footer, onLaterPages=_page_footer)
    pdf_bytes = buf.getvalue()
    buf.close()

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="attendance_report.pdf"'},
    )


# ---------------------------------------------------------------------------
# Employee list PDF export
# ---------------------------------------------------------------------------
@router.get("/employees/export.pdf")
def export_employees_pdf(
    company_id: Optional[int] = Query(None),
    department_id: Optional[int] = Query(None),
    device_id: Optional[str] = Query(None),
    device_name: Optional[str] = Query(None),
    lang: str = Query("en"),
    current=Depends(get_current_user),
):
    """Generate a professional PDF list of employees grouped by device."""
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.lib import colors
    from reportlab.platypus import (
        SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, HRFlowable,
        KeepTogether, PageBreak,
    )
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT

    LABELS = {
        "fr": {
            "title": "Liste des Employés",
            "generated": "Généré le",
            "department": "Département",
            "position": "Poste",
            "device": "Appareil",
            "employee": "Employé(e)",
            "dev_id": "N° App.",
            "user_id": "ID",
            "card": "N° Carte",
            "role": "Rôle",
            "admin": "Admin",
            "user": "Utilisateur",
            "total": "Total",
            "no_records": "Aucun employé trouvé.",
            "confidential": "Document confidentiel — usage interne uniquement",
            "page": "Page",
            "employees_count": "employé(e)s",
        },
        "en": {
            "title": "Employee List",
            "generated": "Generated on",
            "department": "Department",
            "position": "Position",
            "device": "Device",
            "employee": "Employee",
            "dev_id": "Dev.ID",
            "user_id": "ID",
            "card": "Card No.",
            "role": "Role",
            "admin": "Admin",
            "user": "User",
            "total": "Total",
            "no_records": "No employees found.",
            "confidential": "Confidential document — internal use only",
            "page": "Page",
            "employees_count": "employees",
        },
        "ar": {
            "title": "قائمة الموظفين",
            "generated": "تاريخ الإنشاء",
            "department": "القسم",
            "position": "المنصب",
            "device": "الجهاز",
            "employee": "الموظف",
            "dev_id": "رقم الجهاز",
            "user_id": "الرقم",
            "card": "رقم البطاقة",
            "role": "الدور",
            "admin": "مسؤول",
            "user": "مستخدم",
            "total": "المجموع",
            "no_records": "لم يتم العثور على موظفين.",
            "confidential": "وثيقة سرية — للاستخدام الداخلي فقط",
            "page": "صفحة",
            "employees_count": "موظفين",
        },
    }
    L = LABELS.get(lang, LABELS["en"])

    # ── Fetch data + read pdf_style from settings ────────────────────────
    with get_db_session() as db:
        from app.database.schema import AppSettings as _AppSettings
        _settings = db.query(_AppSettings).first()
        pdf_style = getattr(_settings, 'pdf_style', None) or 'style1'

        q = (
            db.query(DBEmployee)
            .outerjoin(DBDepartment, DBEmployee.department_id == DBDepartment.id)
            .outerjoin(DBCompany, DBEmployee.company_id == DBCompany.id)
            .outerjoin(DBDevice, DBEmployee.source_device_id == DBDevice.id)
        )
        if company_id:
            q = q.filter(DBEmployee.company_id == company_id)
        if department_id:
            q = q.filter(DBEmployee.department_id == department_id)
        if device_id:
            q = q.filter(DBEmployee.source_device_id == device_id)

        employees = q.order_by(DBDevice.name.asc(), DBEmployee.user_id.asc()).all()

        company_row = db.query(DBCompany.name).order_by(DBCompany.id).first()
        company_name = company_row[0] if company_row else ""

        from collections import OrderedDict
        device_groups = OrderedDict()
        for emp in employees:
            dev_name = ((emp.source_device.name if emp.source_device else None) or "—").strip()
            if dev_name not in device_groups:
                device_groups[dev_name] = []
            device_groups[dev_name].append({
                "name": (emp.name or "")[:36],
                "dev_id": str(emp.device_user_id or "-"),
                "user_id": str(emp.user_id or "-"),
                "department": ((emp.department.name if emp.department else "-") or "-")[:28],
                "position": ((emp.position.name if hasattr(emp, "position") and emp.position else "-") or "-")[:24],
                "card": str(emp.card_number or "-"),
                "role": L["admin"] if emp.privilege == 14 else L["user"],
            })

    # ── Colour palette — mirrors attendance report (respects pdf_style) ──
    if pdf_style == 'style2':
        BRAND_COLOR = colors.HexColor("#059669")
        HEADER_BG   = colors.HexColor("#065f46")
        ALT_ROW     = colors.HexColor("#ecfdf5")
    else:
        BRAND_COLOR = colors.HexColor("#1e40af")
        HEADER_BG   = colors.HexColor("#1e3a5f")
        ALT_ROW     = colors.HexColor("#f1f5f9")
    HEADER_FG = colors.white

    buf = io.BytesIO()
    width, height = A4
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=18 * mm, rightMargin=18 * mm,
        topMargin=18 * mm, bottomMargin=22 * mm,
        title=f"{company_name or 'RTPointage'} — Employés",
        author=(company_name or "RTPointage"),
    )
    styles = getSampleStyleSheet()

    title_style       = ParagraphStyle("PT",  parent=styles["Title"],   fontSize=18, textColor=BRAND_COLOR, spaceAfter=2)
    sub_style         = ParagraphStyle("PS",  parent=styles["Normal"],  fontSize=10, textColor=colors.HexColor("#475569"), spaceAfter=2)
    footer_style      = ParagraphStyle("PF",  parent=styles["Normal"],  fontSize=7,  textColor=colors.HexColor("#94a3b8"), alignment=TA_CENTER)
    cell_style        = ParagraphStyle("PC",  parent=styles["Normal"],  fontSize=8,  leading=10)
    cell_bold         = ParagraphStyle("PCB", parent=cell_style, fontName="Helvetica-Bold")
    cell_center       = ParagraphStyle("PCC", parent=cell_style, alignment=TA_CENTER)
    cell_small        = ParagraphStyle("PCS", parent=cell_style, fontSize=7, textColor=colors.HexColor("#64748b"))
    group_title_style = ParagraphStyle(
        "GroupTitle", parent=styles["Heading3"], fontSize=11,
        textColor=BRAND_COLOR, spaceAfter=2, spaceBefore=6,
        fontName="Helvetica-Bold",
    )
    group_sub_style = ParagraphStyle(
        "GroupSub", parent=styles["Normal"], fontSize=8,
        textColor=colors.HexColor("#64748b"), spaceAfter=3,
    )

    def _make_table(col_headers, data_rows, col_widths):
        if pdf_style == 'style2':
            th_text_color = BRAND_COLOR
        else:
            th_text_color = HEADER_FG
        th_style = ParagraphStyle("TH", parent=cell_style, fontSize=8, textColor=th_text_color, fontName="Helvetica-Bold")
        header_row = [Paragraph(f"<b>{h}</b>", th_style) for h in col_headers]

        table_data = [header_row] + data_rows

        # Scale columns to fill the full printable width
        _printable_w = width - 2 * 18 * mm
        _natural_w = sum(col_widths)
        if _natural_w > 0:
            col_widths = [w * (_printable_w / _natural_w) for w in col_widths]

        tbl = Table(table_data, colWidths=col_widths, repeatRows=1)

        if pdf_style == 'style2':
            cmds = [
                ("TEXTCOLOR",     (0, 0), (-1, 0), BRAND_COLOR),
                ("FONTNAME",      (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE",      (0, 0), (-1, 0), 8),
                ("BOTTOMPADDING", (0, 0), (-1, 0), 6),
                ("TOPPADDING",    (0, 0), (-1, 0), 6),
                ("LINEABOVE",     (0, 0), (-1, 0), 1.5, BRAND_COLOR),
                ("LINEBELOW",     (0, 0), (-1, 0), 1.5, BRAND_COLOR),
                ("FONTSIZE",      (0, 1), (-1, -1), 8),
                ("TOPPADDING",    (0, 1), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 1), (-1, -1), 4),
                ("LINEBELOW",     (0, -1), (-1, -1), 0.75, BRAND_COLOR),
                ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
            ]
            if len(table_data) > 2:
                cmds.append(("LINEBELOW", (0, 1), (-1, -2), 0.25, colors.HexColor("#d1d5db")))
        else:
            cmds = [
                ("BACKGROUND",    (0, 0), (-1, 0), HEADER_BG),
                ("TEXTCOLOR",     (0, 0), (-1, 0), HEADER_FG),
                ("FONTNAME",      (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE",      (0, 0), (-1, 0), 8),
                ("BOTTOMPADDING", (0, 0), (-1, 0), 6),
                ("TOPPADDING",    (0, 0), (-1, 0), 6),
                ("LINEBELOW",     (0, 0), (-1, 0), 1, BRAND_COLOR),
                ("FONTSIZE",      (0, 1), (-1, -1), 8),
                ("TOPPADDING",    (0, 1), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 1), (-1, -1), 3),
                ("LINEBELOW",     (0, -1), (-1, -1), 0.5, BRAND_COLOR),
                ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
            ]
            if len(table_data) > 2:
                cmds.append(("LINEBELOW", (0, 1), (-1, -2), 0.25, colors.HexColor("#e2e8f0")))
            for i in range(1, len(table_data)):
                if (i - 1) % 2 == 1:
                    cmds.append(("BACKGROUND", (0, i), (-1, i), ALT_ROW))

        cmds.extend([
            ("BOX",       (0, 0), (-1, -1), 0.75, BRAND_COLOR),
            ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#d1d5db")),
        ])

        tbl.setStyle(TableStyle(cmds))
        return tbl

    story = []

    # ── Report header ────────────────────────────────────────────────────
    if company_name:
        story.append(Paragraph(company_name, title_style))
    story.append(Paragraph(f"<b>{L['title']}</b>",
        ParagraphStyle("RT", parent=styles["Heading2"], fontSize=14, textColor=BRAND_COLOR)))
    if device_name:
        story.append(Paragraph(
            f"{L['device']}: <b>{device_name}</b>",
            ParagraphStyle("DevSub", parent=styles["Normal"], fontSize=11,
                           textColor=colors.HexColor("#1e40af"), spaceAfter=2)))
    story.append(Paragraph(
        f"<b>{L['generated']}:</b> {datetime.now().strftime('%Y-%m-%d %H:%M')}"
        f"  &nbsp;|&nbsp;  <b>{L['total']}:</b> {len(employees)} {L['employees_count']}",
        sub_style))
    story.append(Spacer(1, 4 * mm))
    story.append(HRFlowable(width="100%", thickness=0.5, color=BRAND_COLOR, spaceAfter=4 * mm))

    if not employees:
        story.append(Spacer(1, 20 * mm))
        story.append(Paragraph(L["no_records"],
            ParagraphStyle("Empty", parent=styles["Normal"], fontSize=12,
                           alignment=TA_CENTER, textColor=colors.HexColor("#94a3b8"))))
    else:
        # ID first — matches the HTML table column order
        col_headers = [L["user_id"], L["employee"], L["department"], L["position"], L["role"]]
        col_widths  = [16 * mm, 56 * mm, 44 * mm, 34 * mm, 24 * mm]

        for dev_name, emp_list in device_groups.items():
            data_rows = []
            for r in emp_list:
                data_rows.append([
                    Paragraph(r["user_id"], cell_center),
                    Paragraph(r["name"], cell_bold),
                    Paragraph(r["department"], cell_style),
                    Paragraph(r["position"], cell_small),
                    Paragraph(r["role"], cell_center),
                ])
            # Standalone section header — same pattern as grouped attendance report
            if not device_name:
                story.append(Spacer(1, 3 * mm))
                story.append(HRFlowable(width="100%", thickness=1.5, color=BRAND_COLOR, spaceAfter=2 * mm))
                story.append(Paragraph(f"<b>{dev_name}</b>", group_title_style))
                story.append(Paragraph(f"{len(emp_list)} {L['employees_count']}", group_sub_style))
                story.append(Spacer(1, 2 * mm))
            story.append(_make_table(col_headers, data_rows, col_widths))
            story.append(Spacer(1, 5 * mm))

    # ── Footer ───────────────────────────────────────────────────────────
    story.append(Spacer(1, 6 * mm))
    story.append(HRFlowable(width="100%", thickness=0.3, color=colors.HexColor("#cbd5e1"), spaceBefore=2 * mm))
    story.append(Paragraph(L["confidential"], footer_style))

    def _page_footer(canvas_obj, doc_obj):
        canvas_obj.saveState()
        canvas_obj.setFont("Helvetica", 7)
        canvas_obj.setFillColor(colors.HexColor("#94a3b8"))
        canvas_obj.drawRightString(width - 18 * mm, 12 * mm, f"{L['page']} {doc_obj.page}")
        canvas_obj.restoreState()

    doc.build(story, onFirstPage=_page_footer, onLaterPages=_page_footer)
    pdf_bytes = buf.getvalue()
    buf.close()

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="employees_list.pdf"'},
    )


# ---------------------------------------------------------------------------
# Internal helper for the scheduler (no HTTP context required)
# ---------------------------------------------------------------------------

def _attendance_pdf_bytes(
    start_date: str,
    end_date: str,
    lang: str = 'fr',
    device_id: str | None = None,
    group_by: str = 'employee',
) -> bytes:
    """Generate an attendance PDF and return raw bytes. Used by the scheduler."""
    response = export_attendance_pdf(
        date=None,
        start_date=start_date,
        end_date=end_date,
        employee_name=None,
        employee_id=None,
        employee_ids=None,
        device_id=device_id,
        lang=lang,
        group_by=group_by,
        with_lateness=False,
        current=None,
    )
    return response.body


def _attendance_counts(start_date: str, end_date: str,
                       company_id: int | None, department_id: int | None,
                       device_ids: list | None) -> tuple[int, int]:
    """Return (total_employees, total_records) consistent with the PDF report.

    Both numbers are computed exactly like the PDF header:
      • total_employees = distinct employees with punches, grouped by matricule
        (user_id) in shared mode or by PK in separate mode. This avoids
        double-counting a person who has one Employee row per device.
      • total_records   = number of employee-day summary rows (what the PDF
        table lists), NOT raw punch count.
    Voided (corrected/deleted) punches are excluded.
    """
    from app.database.schema import (
        Attendance as _Att, Employee as _Emp, AppSettings as _AS,
    )
    from datetime import datetime as _dt
    start_dt = _dt.fromisoformat(start_date)
    end_dt   = _dt.fromisoformat(end_date).replace(hour=23, minute=59, second=59)
    with get_db_session() as db:
        settings = db.query(_AS).first()
        shared = (getattr(settings, 'employee_mode', None) or 'shared') == 'shared'
        group_col = _Emp.user_id if shared else _Emp.id

        q = (
            db.query(group_col.label('gid'), cast(_Att.timestamp, Date).label('day'))
              .join(_Emp, _Att.employee_id == _Emp.id)
              .filter(_Att.timestamp >= start_dt, _Att.timestamp <= end_dt)
              .filter(_Att.voided_by_correction_id.is_(None))
        )
        if company_id:
            q = q.filter(_Emp.company_id == company_id)
        if department_id:
            q = q.filter(_Emp.department_id == department_id)
        if device_ids:
            q = q.filter(_Att.device_id.in_(device_ids))

        groups = q.group_by(group_col, cast(_Att.timestamp, Date)).all()
        total_records = len(groups)                    # employee-day rows (matches PDF)
        total_employees = len({g.gid for g in groups})  # distinct matricules

    return total_employees, total_records


# ===========================================================================
# Lateness module — Phase 1 (ranking only)
#
# Off by default. Gated on AppSettings.lateness_module_enabled, super admin
# only. When off, every endpoint here returns 403 so the frontend gets a
# clear signal to hide the tab (the public probe at
# /settings/reports-module/public is what the UI actually reads on load).
#
# Lateness math: minute-exact, no grace.
#   late = max(0, first_check_in − scheduled_start)
# Scheduled_start comes from get_employee_day_summary() which already does
# the EmployeeSchedule → DepartmentSchedule → device-timing fallback chain.
# Days the employee was absent (no check-in) or had no scheduled start
# (holiday / day-off / unscheduled) don't contribute and aren't counted in
# late_days.
# ===========================================================================
def _require_lateness_enabled():
    """Raise 403 if the module flag is off. Cheap — one settings row read."""
    from app.database.schema import AppSettings as _AS
    with get_db_session() as _db:
        _row = _db.query(_AS).first()
        if not (_row and getattr(_row, 'lateness_module_enabled', False)):
            raise HTTPException(
                status_code=403,
                detail="lateness_module_disabled",
            )


def _compute_ranking(start_dt: datetime, end_dt: datetime,
                     department_id: Optional[int] = None,
                     device_id: Optional[str] = None,
                     employee_ids: Optional[list[str]] = None) -> tuple[list[dict], str]:
    """Aggregate lateness per employee over the period.

    Returns (rows, employee_mode). Each row:
      { employee_id, employee_name, department, late_days_count,
        total_late_minutes, max_late_minutes, avg_late_minutes,
        worked_days_count }
    Sorted by total_late_minutes desc, then late_days desc.
    """
    from app.database.schema import AppSettings as _AS
    with get_db_session() as db:
        _settings   = db.query(_AS).first()
        employee_mode = getattr(_settings, 'employee_mode', None) or 'shared'
        shared        = employee_mode == 'shared'

        # 1) Find the (employee, day) pairs that have any approved punch in the
        #    period — that's our universe of candidate "worked days".
        id_col = DBEmployee.user_id if shared else DBEmployee.id
        q = (db.query(
                id_col.label("eid"),
                func.min(DBEmployee.name).label("ename") if shared else DBEmployee.name.label("ename"),
                func.coalesce(func.min(DBDepartment.name), "-").label("dept") if shared else func.coalesce(DBDepartment.name, "-").label("dept"),
                cast(DBAttendance.timestamp, Date).label("day"),
             )
             .select_from(DBAttendance)
             .join(DBEmployee, DBAttendance.employee_id == DBEmployee.id)
             .outerjoin(DBDepartment, DBEmployee.department_id == DBDepartment.id)
             .filter(DBAttendance.voided_by_correction_id.is_(None))
             .filter(DBAttendance.approved.isnot(False))
             .filter(DBAttendance.timestamp >= start_dt)
             .filter(DBAttendance.timestamp <= end_dt))
        if department_id:
            q = q.filter(DBEmployee.department_id == department_id)
        if device_id:
            q = q.filter(DBAttendance.device_id == device_id)
        if employee_ids:
            q = q.filter(DBEmployee.user_id.in_(employee_ids))
        if shared:
            q = q.group_by(DBEmployee.user_id, cast(DBAttendance.timestamp, Date))
        else:
            q = q.group_by(DBEmployee.id, DBEmployee.name, DBDepartment.name, cast(DBAttendance.timestamp, Date))
        worked = q.all()

        # 2) For shared mode we need every Employee PK belonging to each
        #    matricule so the day-summary query merges across devices.
        uid_to_pks: dict = {}
        if shared:
            uids = {w.eid for w in worked}
            for uid in uids:
                pks = db.query(DBEmployee.id).filter(DBEmployee.user_id == uid).all()
                uid_to_pks[uid] = [pk[0] for pk in pks]

        # 3) Accumulate lateness per employee.
        agg: dict = {}
        for w in worked:
            day_date = w.day if hasattr(w.day, 'isoformat') else None
            if not day_date:
                continue
            if shared:
                all_pks = uid_to_pks.get(w.eid, [])
                pk = all_pks[0] if all_pks else None
                if pk is None:
                    continue
                summary = get_employee_day_summary(db, pk, day_date, employee_ids=all_pks)
            else:
                summary = get_employee_day_summary(db, w.eid, day_date)
            late = int(summary.get("late_minutes") or 0)
            row = agg.setdefault(w.eid, {
                "employee_id":   w.eid,
                "employee_name": w.ename,
                "department":    w.dept,
                "worked_days_count": 0,
                "late_days_count":   0,
                "total_late_minutes": 0,
                "max_late_minutes":   0,
            })
            row["worked_days_count"] += 1
            if late > 0:
                row["late_days_count"]    += 1
                row["total_late_minutes"] += late
                if late > row["max_late_minutes"]:
                    row["max_late_minutes"] = late

        rows = []
        for r in agg.values():
            r["avg_late_minutes"] = round(r["total_late_minutes"] / r["late_days_count"]) if r["late_days_count"] else 0
            rows.append(r)
        rows.sort(key=lambda r: (r["total_late_minutes"], r["late_days_count"]), reverse=True)
    return rows, employee_mode


@router.get("/lateness/ranking")
def lateness_ranking(
    start_date: str = Query(..., description="Start date YYYY-MM-DD"),
    end_date:   str = Query(..., description="End date YYYY-MM-DD"),
    department_id: Optional[int] = Query(None),
    device_id:     Optional[str] = Query(None),
    employee_ids:  Optional[str] = Query(None, description="Comma-separated matricules (chip picker)"),
    current=Depends(get_current_user),
):
    """Lateness ranking — one row per employee, sorted by total late minutes.

    Returns 403 with `lateness_module_disabled` when the super admin hasn't
    enabled the module; the frontend uses that signal to hide the option.
    """
    _require_lateness_enabled()
    start_dt, end_dt = parse_dates(None, start_date, end_date)
    if not start_dt or not end_dt:
        raise HTTPException(status_code=400, detail="start_date and end_date are required")
    emp_ids = _parse_employee_ids(employee_ids)
    rows, employee_mode = _compute_ranking(start_dt, end_dt, department_id, device_id, emp_ids)
    return {
        "count":         len(rows),
        "ranking":       rows,
        "employee_mode": employee_mode,
        "start_date":    start_dt.date().isoformat(),
        "end_date":      end_dt.date().isoformat(),
        "total_late_minutes_all": sum(r["total_late_minutes"] for r in rows),
        "total_late_days_all":    sum(r["late_days_count"] for r in rows),
    }


@router.get("/lateness/ranking/pdf")
def lateness_ranking_pdf(
    start_date: str = Query(..., description="Start date YYYY-MM-DD"),
    end_date:   str = Query(..., description="End date YYYY-MM-DD"),
    department_id: Optional[int] = Query(None),
    device_id:     Optional[str] = Query(None),
    employee_ids:  Optional[str] = Query(None, description="Comma-separated matricules (chip picker)"),
    lang: str = Query("fr", description="Language: en, fr, ar"),
    current=Depends(get_current_user),
):
    """Lateness ranking PDF — same data as /lateness/ranking, rendered as a
    single-table report ordered by total late minutes desc.
    """
    _require_lateness_enabled()
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.lib import colors
    from reportlab.platypus import (
        SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, HRFlowable,
    )
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT

    start_dt, end_dt = parse_dates(None, start_date, end_date)
    if not start_dt or not end_dt:
        raise HTTPException(status_code=400, detail="start_date and end_date are required")

    emp_ids = _parse_employee_ids(employee_ids)
    rows, _ = _compute_ranking(start_dt, end_dt, department_id, device_id, emp_ids)

    # Branding + style preference — mirrors the main attendance PDF (style2
    # = emerald with a top bar; style1 = navy without). company_name drives
    # the document title and the visible header.
    from app.database.schema import AppSettings as _AS
    with get_db_session() as db:
        _settings = db.query(_AS).first()
        pdf_style   = getattr(_settings, 'pdf_style', None) or 'style1'
        client_name = (getattr(_settings, 'client_name', None) or '').strip()
        _company_row = db.query(DBCompany.name).order_by(DBCompany.id).first()
        company_name = _company_row[0] if _company_row else ""

    # ── Labels ─────────────────────────────────────────────────────────
    LBL = {
        "fr": dict(
            title="Classement des retards",
            subtitle="Récapitulatif par employé sur la période",
            period="Période", generated="Généré le",
            total_evaluated="Total employés évalués",
            total_offenders="Employés en retard",
            rank="#", employee="Employé(e)", department="Département",
            late_days="Jours en retard", worked_days="Jours travaillés",
            total_late="Total retard", avg_late="Moyenne / retard",
            max_late="Plus gros retard",
            empty="Aucun retard détecté sur la période.",
            summary_total="Total cumulé", summary_offenders="Employés concernés",
            confidential="Document confidentiel — usage interne uniquement",
            page="Page",
        ),
        "en": dict(
            title="Lateness ranking",
            subtitle="Per-employee summary over the period",
            period="Period", generated="Generated",
            total_evaluated="Total employees evaluated",
            total_offenders="Employees late",
            rank="#", employee="Employee", department="Department",
            late_days="Late days", worked_days="Worked days",
            total_late="Total late", avg_late="Avg per late day",
            max_late="Max late",
            empty="No lateness recorded for the period.",
            summary_total="Cumulative total", summary_offenders="Employees concerned",
            confidential="Confidential document — internal use only",
            page="Page",
        ),
        "ar": dict(
            title="ترتيب التأخر",
            subtitle="ملخص لكل موظف خلال الفترة",
            period="الفترة", generated="تم الإنشاء في",
            total_evaluated="مجموع الموظفين الذين تم تقييمهم",
            total_offenders="الموظفون المتأخرون",
            rank="#", employee="الموظف", department="القسم",
            late_days="أيام التأخر", worked_days="أيام العمل",
            total_late="إجمالي التأخر", avg_late="متوسط التأخر",
            max_late="أكبر تأخر",
            empty="لا توجد حالات تأخر مسجلة في هذه الفترة.",
            summary_total="المجموع التراكمي", summary_offenders="عدد الموظفين",
            confidential="وثيقة سرية — للاستخدام الداخلي فقط",
            page="صفحة",
        ),
    }
    L = LBL.get(lang, LBL["fr"])

    def _fmt_min(m) -> str:
        m = int(m or 0)
        if m <= 0: return "—"
        h, r = divmod(m, 60)
        return f"{h}h {r:02d}m" if h else f"{r}m"

    # ── Palette: exact match with export_attendance_pdf ──────────────────
    if pdf_style == 'style2':
        BRAND_COLOR = colors.HexColor("#059669")   # emerald
        HEADER_BG   = colors.HexColor("#065f46")
        ALT_ROW     = colors.HexColor("#ecfdf5")
    else:
        BRAND_COLOR = colors.HexColor("#1e40af")   # navy
        HEADER_BG   = colors.HexColor("#1e3a5f")
        ALT_ROW     = colors.HexColor("#f1f5f9")
    HEADER_FG  = colors.white
    LATE_COLOR = colors.HexColor("#d97706")        # amber for late totals

    _period_str = f"{start_dt.date().isoformat()} – {end_dt.date().isoformat()}"
    _doc_title  = " — ".join(x for x in [(company_name or "RTPointage"),
                                         L["title"], _period_str] if x)

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=18 * mm, rightMargin=18 * mm,
        topMargin=18 * mm, bottomMargin=22 * mm,
        title=_doc_title,
        author=(company_name or "RTPointage"),
        subject=L["title"],
    )
    width, height = A4

    # ── Styles: identical names + parents as export_attendance_pdf ──────
    styles = getSampleStyleSheet()
    title_style    = ParagraphStyle("PDFTitle", parent=styles["Title"],
                                    fontSize=18, textColor=BRAND_COLOR, spaceAfter=2)
    subtitle_style = ParagraphStyle("PDFSub", parent=styles["Normal"],
                                    fontSize=10, textColor=colors.HexColor("#475569"),
                                    spaceAfter=2)
    footer_style   = ParagraphStyle("PDFFooter", parent=styles["Normal"],
                                    fontSize=7, textColor=colors.HexColor("#94a3b8"),
                                    alignment=TA_CENTER)

    story: list = []

    # ── Report header (same shape as the main PDF) ─────────────────────
    if company_name:
        story.append(Paragraph(company_name, title_style))
    story.append(Paragraph(
        f"<b>{L['title']}</b>  —  {L['subtitle']}",
        ParagraphStyle("RT", parent=styles["Heading2"], fontSize=14,
                       textColor=BRAND_COLOR),
    ))
    meta = [
        f"<b>{L['period']}:</b> {_period_str}",
        f"<b>{L['generated']}:</b> {datetime.now().strftime('%Y-%m-%d %H:%M')}",
    ]
    if client_name and client_name != company_name:
        meta.insert(0, f"<b>{client_name}</b>")
    story.append(Paragraph("  &nbsp; |  &nbsp; ".join(meta), subtitle_style))
    summary_meta = (
        f"<b>{L['total_evaluated']}:</b> {len(rows)}  &nbsp; |  &nbsp; "
        f"<b>{L['total_offenders']}:</b> {sum(1 for r in rows if r['late_days_count'] > 0)}"
    )
    story.append(Paragraph(summary_meta, subtitle_style))

    story.append(Spacer(1, 4 * mm))
    story.append(HRFlowable(width="100%", thickness=0.5, color=BRAND_COLOR,
                            spaceAfter=4 * mm))

    if not rows:
        story.append(Spacer(1, 20 * mm))
        story.append(Paragraph(L["empty"],
                               ParagraphStyle("Empty", parent=styles["Normal"],
                                              fontSize=12, alignment=TA_CENTER,
                                              textColor=colors.HexColor("#94a3b8"))))
    else:
        # Header cells as Paragraphs so long French labels ("Jours en
        # retard", "Plus gros retard", "Moyenne / retard") wrap onto two
        # lines instead of running into the neighbouring column. Same
        # technique as _make_table in the main PDF (see line ~888).
        if pdf_style == 'style2':
            th_color = BRAND_COLOR
        else:
            th_color = HEADER_FG
        th_style = ParagraphStyle(
            "RnkTH", parent=styles["Normal"],
            fontSize=8, leading=10, alignment=TA_CENTER,
            fontName="Helvetica-Bold", textColor=th_color,
        )
        # Slim 6-column layout: rank, name, dept, jours en retard, jours
        # travaillés, total retard. 'Moyenne' and 'Plus gros' were removed
        # at the user's request — they're still available via the JSON
        # endpoint /lateness/ranking for anyone who wants them.
        header = [Paragraph(f"<b>{lbl}</b>", th_style)
                  for lbl in [L["rank"], L["employee"], L["department"],
                              L["late_days"], L["worked_days"],
                              L["total_late"]]]
        data: list = [header]
        for i, r in enumerate(rows, start=1):
            data.append([
                str(i),
                r["employee_name"] or "—",
                r["department"] or "—",
                str(r["late_days_count"]),
                str(r["worked_days_count"]),
                _fmt_min(r["total_late_minutes"]),
            ])
        # Six columns split to use the full printable width; auto-scale
        # below stretches/shrinks to fit. Wider name/dept columns now
        # that we have more horizontal room.
        col_widths = [12*mm, 60*mm, 40*mm, 28*mm, 28*mm, 32*mm]
        # Scale to printable width to fill the page same as the main PDF
        _printable_w = width - 2 * 18 * mm
        _natural_w = sum(col_widths)
        if _natural_w > 0:
            col_widths = [w * (_printable_w / _natural_w) for w in col_widths]
        tbl = Table(data, colWidths=col_widths, repeatRows=1)

        # Two-style table treatment — same branching as _make_table in the
        # main PDF, so style2 looks clean (no solid header bg) and style1
        # uses a filled HEADER_BG band.
        if pdf_style == 'style2':
            cmds = [
                ("TEXTCOLOR",    (0, 0), (-1, 0), BRAND_COLOR),
                ("FONTNAME",     (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE",     (0, 0), (-1, 0), 8),
                ("BOTTOMPADDING",(0, 0), (-1, 0), 6),
                ("TOPPADDING",   (0, 0), (-1, 0), 6),
                ("LINEABOVE",    (0, 0), (-1, 0), 1.5, BRAND_COLOR),
                ("LINEBELOW",    (0, 0), (-1, 0), 1.5, BRAND_COLOR),
                ("FONTSIZE",     (0, 1), (-1, -1), 8),
                ("TOPPADDING",   (0, 1), (-1, -1), 4),
                ("BOTTOMPADDING",(0, 1), (-1, -1), 4),
                ("LINEBELOW",    (0, -1), (-1, -1), 0.75, BRAND_COLOR),
                ("VALIGN",       (0, 0), (-1, -1), "MIDDLE"),
            ]
            if len(data) > 2:
                cmds.append(("LINEBELOW", (0, 1), (-1, -2), 0.25,
                             colors.HexColor("#d1d5db")))
        else:
            cmds = [
                ("BACKGROUND",   (0, 0), (-1, 0), HEADER_BG),
                ("TEXTCOLOR",    (0, 0), (-1, 0), HEADER_FG),
                ("FONTNAME",     (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE",     (0, 0), (-1, 0), 8),
                ("BOTTOMPADDING",(0, 0), (-1, 0), 6),
                ("TOPPADDING",   (0, 0), (-1, 0), 6),
                ("LINEBELOW",    (0, 0), (-1, 0), 1, BRAND_COLOR),
                ("FONTSIZE",     (0, 1), (-1, -1), 8),
                ("TOPPADDING",   (0, 1), (-1, -1), 3),
                ("BOTTOMPADDING",(0, 1), (-1, -1), 3),
                ("LINEBELOW",    (0, -1), (-1, -1), 0.5, BRAND_COLOR),
                ("VALIGN",       (0, 0), (-1, -1), "MIDDLE"),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1),
                 [colors.white, ALT_ROW]),
            ]
        # Column alignment + amber emphasis on the Total retard column,
        # same for both styles.
        cmds.extend([
            ("ALIGN",     (0, 1), (0, -1), "CENTER"),     # rank
            ("ALIGN",     (1, 1), (2, -1), "LEFT"),       # name + dept
            ("ALIGN",     (3, 1), (-1, -1), "CENTER"),    # numeric cols
            ("TEXTCOLOR", (5, 1), (5, -1), LATE_COLOR),   # Total retard
            ("FONTNAME",  (5, 1), (5, -1), "Helvetica-Bold"),
        ])
        tbl.setStyle(TableStyle(cmds))
        story.append(tbl)
        story.append(Spacer(1, 4 * mm))
        # No 'Total cumulé' line: the whole point of this report is to
        # rank each employee on their OWN total retard. Summing across
        # different people gives a meaningless figure. The per-employee
        # totals already live in the rightmost column of the table.

    # ── Footer (same shape as the main attendance PDF) ─────────────────
    story.append(Spacer(1, 6 * mm))
    story.append(HRFlowable(width="100%", thickness=0.3,
                            color=colors.HexColor("#cbd5e1"),
                            spaceBefore=2 * mm))
    story.append(Paragraph(L["confidential"], footer_style))

    # Page footer + style2 top bar — identical callback to the main PDF
    def _page_footer(canvas_obj, doc_obj):
        canvas_obj.saveState()
        canvas_obj.setFont("Helvetica", 7)
        canvas_obj.setFillColor(colors.HexColor("#94a3b8"))
        canvas_obj.drawRightString(
            width - 18 * mm, 12 * mm,
            f"{L['page']} {doc_obj.page}",
        )
        if pdf_style == 'style2':
            # The distinctive emerald top bar that brands every page.
            canvas_obj.setStrokeColor(BRAND_COLOR)
            canvas_obj.setLineWidth(2)
            canvas_obj.line(18 * mm, height - 10 * mm,
                            width - 18 * mm, height - 10 * mm)
        canvas_obj.restoreState()

    doc.build(story, onFirstPage=_page_footer, onLaterPages=_page_footer)
    buf.seek(0)
    filename = f"lateness_ranking_{start_dt.date().isoformat()}_{end_dt.date().isoformat()}.pdf"
    return Response(
        content=buf.read(), media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
