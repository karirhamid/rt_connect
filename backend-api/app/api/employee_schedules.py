"""
Employee & Department Schedule API — per-day work timing CRUD + punch classification.
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from typing import Optional, List
from datetime import date, time as dt_time
from sqlalchemy.orm import Session
from app.database import get_db
from app.database.schema import Employee as DBEmployee, Department as DBDepartment
from app.database.shift_schema import EmployeeSchedule, DepartmentSchedule, DailyShiftRecord
from app.services.punch_classifier import (
    classify_punch, get_employee_day_summary, classify_attendance_records,
)
from app.database.schema import Attendance as DBAttendance
from sqlalchemy import and_
from datetime import datetime, time
import logging

router = APIRouter()
logger = logging.getLogger(__name__)

DAY_NAMES = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]


# ── Pydantic schemas ──────────────────────────────────────────────

class DayScheduleEntry(BaseModel):
    day_of_week: int         # 0=Monday .. 6=Sunday
    is_day_off: bool = False
    work_start: Optional[str] = None  # "HH:MM"
    work_end: Optional[str] = None    # "HH:MM"
    has_break: bool = False
    break_start: Optional[str] = None
    break_end: Optional[str] = None

class WeekSchedulePayload(BaseModel):
    days: List[DayScheduleEntry]


def _parse_time(s: Optional[str]) -> Optional[dt_time]:
    if not s:
        return None
    parts = s.strip().split(":")
    return dt_time(hour=int(parts[0]), minute=int(parts[1]))


def _format_time(t) -> Optional[str]:
    return t.strftime("%H:%M") if t else None


def _schedule_row_to_dict(s) -> dict:
    return {
        "day_of_week": s.day_of_week,
        "day_name": DAY_NAMES[s.day_of_week] if 0 <= s.day_of_week <= 6 else "?",
        "is_day_off": s.is_day_off,
        "work_start": _format_time(s.work_start),
        "work_end": _format_time(s.work_end),
        "has_break": s.has_break,
        "break_start": _format_time(s.break_start),
        "break_end": _format_time(s.break_end),
    }


# ══════════════════════════════════════════════════════════════════
# EMPLOYEE SCHEDULE CRUD  (7-day weekly)
# ══════════════════════════════════════════════════════════════════

@router.get("/employees/{employee_id}/personal-schedule")
async def get_employee_schedule(employee_id: int, db: Session = Depends(get_db)):
    """Get the weekly schedule for an employee (array of up to 7 day entries)."""
    emp = db.query(DBEmployee).filter(DBEmployee.id == employee_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    rows = (
        db.query(EmployeeSchedule)
        .filter(EmployeeSchedule.employee_id == employee_id)
        .order_by(EmployeeSchedule.day_of_week)
        .all()
    )
    if not rows:
        return {"schedule": None}
    return {"schedule": [_schedule_row_to_dict(r) for r in rows]}


@router.put("/employees/{employee_id}/personal-schedule")
async def upsert_employee_schedule(
    employee_id: int,
    data: WeekSchedulePayload,
    db: Session = Depends(get_db),
):
    """Create or update the weekly schedule for an employee (up to 7 days)."""
    emp = db.query(DBEmployee).filter(DBEmployee.id == employee_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")

    # Delete existing entries then re-create
    db.query(EmployeeSchedule).filter(EmployeeSchedule.employee_id == employee_id).delete()

    saved = []
    for day in data.days:
        row = EmployeeSchedule(
            employee_id=employee_id,
            day_of_week=day.day_of_week,
            is_day_off=day.is_day_off,
            work_start=_parse_time(day.work_start) if not day.is_day_off else None,
            work_end=_parse_time(day.work_end) if not day.is_day_off else None,
            has_break=day.has_break if not day.is_day_off else False,
            break_start=_parse_time(day.break_start) if day.has_break and not day.is_day_off else None,
            break_end=_parse_time(day.break_end) if day.has_break and not day.is_day_off else None,
        )
        db.add(row)
        saved.append(row)

    db.commit()
    for r in saved:
        db.refresh(r)
    return {"message": "Schedule saved", "schedule": [_schedule_row_to_dict(r) for r in saved]}


@router.delete("/employees/{employee_id}/personal-schedule")
async def delete_employee_schedule(employee_id: int, db: Session = Depends(get_db)):
    """Remove the entire weekly schedule for an employee."""
    count = db.query(EmployeeSchedule).filter(
        EmployeeSchedule.employee_id == employee_id
    ).delete()
    db.commit()
    if count == 0:
        raise HTTPException(status_code=404, detail="No schedule found for this employee")
    return {"message": f"Deleted {count} schedule entries"}


# ══════════════════════════════════════════════════════════════════
# DEPARTMENT SCHEDULE CRUD  (7-day weekly template)
# ══════════════════════════════════════════════════════════════════

@router.get("/departments/{department_id}/schedule")
async def get_department_schedule(department_id: int, db: Session = Depends(get_db)):
    """Get the weekly schedule template for a department."""
    dept = db.query(DBDepartment).filter(DBDepartment.id == department_id).first()
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")
    rows = (
        db.query(DepartmentSchedule)
        .filter(DepartmentSchedule.department_id == department_id)
        .order_by(DepartmentSchedule.day_of_week)
        .all()
    )
    if not rows:
        return {"schedule": None, "department_name": dept.name}
    return {"schedule": [_schedule_row_to_dict(r) for r in rows], "department_name": dept.name}


@router.put("/departments/{department_id}/schedule")
async def upsert_department_schedule(
    department_id: int,
    data: WeekSchedulePayload,
    db: Session = Depends(get_db),
):
    """Create or update the weekly schedule template for a department."""
    dept = db.query(DBDepartment).filter(DBDepartment.id == department_id).first()
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")

    # Delete existing then re-create
    db.query(DepartmentSchedule).filter(DepartmentSchedule.department_id == department_id).delete()

    saved = []
    for day in data.days:
        row = DepartmentSchedule(
            department_id=department_id,
            day_of_week=day.day_of_week,
            is_day_off=day.is_day_off,
            work_start=_parse_time(day.work_start) if not day.is_day_off else None,
            work_end=_parse_time(day.work_end) if not day.is_day_off else None,
            has_break=day.has_break if not day.is_day_off else False,
            break_start=_parse_time(day.break_start) if day.has_break and not day.is_day_off else None,
            break_end=_parse_time(day.break_end) if day.has_break and not day.is_day_off else None,
        )
        db.add(row)
        saved.append(row)

    db.commit()
    for r in saved:
        db.refresh(r)
    return {"message": "Department schedule saved", "schedule": [_schedule_row_to_dict(r) for r in saved]}


@router.delete("/departments/{department_id}/schedule")
async def delete_department_schedule(department_id: int, db: Session = Depends(get_db)):
    """Remove the entire weekly schedule for a department."""
    count = db.query(DepartmentSchedule).filter(
        DepartmentSchedule.department_id == department_id
    ).delete()
    db.commit()
    if count == 0:
        raise HTTPException(status_code=404, detail="No schedule found for this department")
    return {"message": f"Deleted {count} schedule entries"}


# ── Classification endpoint ──────────────────────────────────────

@router.get("/employees/{employee_id}/day-summary")
async def employee_day_summary(
    employee_id: int,
    day: str = Query(..., description="YYYY-MM-DD"),
    db: Session = Depends(get_db),
):
    """
    Get the classified day summary for an employee:
    entry, break_out, break_in, exit, and schedule info.
    """
    emp = db.query(DBEmployee).filter(DBEmployee.id == employee_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    try:
        d = datetime.strptime(day, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format, use YYYY-MM-DD")

    summary = get_employee_day_summary(db, employee_id, d)
    return {"employee_id": employee_id, "date": day, **summary}


@router.get("/attendance/classified")
async def get_classified_attendance(
    date: Optional[str] = Query(None, description="YYYY-MM-DD (defaults to today)"),
    start_date: Optional[str] = Query(None, description="Start date YYYY-MM-DD (for ranges)"),
    end_date: Optional[str] = Query(None, description="End date YYYY-MM-DD (for ranges)"),
    employee_name: Optional[str] = Query(None),
    device_id: Optional[str] = Query(None),
    limit: int = Query(5000, ge=1, le=10000),
    db: Session = Depends(get_db),
):
    """
    Get attendance records with punch classification.
    Supports single date or date range. Returns each punch labeled as
    entry/break_out/break_in/exit/overtime_exit/unknown.
    """
    try:
        if date:
            target = datetime.strptime(date, "%Y-%m-%d").date()
            day_start = datetime.combine(target, time.min)
            day_end = datetime.combine(target, time.max)
        elif start_date or end_date:
            day_start = datetime.strptime(start_date, "%Y-%m-%d") if start_date else None
            day_end = datetime.strptime(end_date + " 23:59:59", "%Y-%m-%d %H:%M:%S") if end_date else None
        else:
            from datetime import date as dt_date_mod
            target = dt_date_mod.today()
            day_start = datetime.combine(target, time.min)
            day_end = datetime.combine(target, time.max)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format")

    q = (
        db.query(DBAttendance)
        .join(DBEmployee, DBAttendance.employee_id == DBEmployee.id)
    )
    filters = []
    if day_start:
        filters.append(DBAttendance.timestamp >= day_start)
    if day_end:
        filters.append(DBAttendance.timestamp <= day_end)
    if employee_name:
        filters.append(DBEmployee.name.ilike(f"%{employee_name}%"))
    if device_id:
        filters.append(DBAttendance.device_id == device_id)
    if filters:
        q = q.filter(and_(*filters))
    q = q.order_by(DBAttendance.timestamp.asc()).limit(limit)

    records = q.all()
    classified = classify_attendance_records(db, records)

    # Read attendance_mode and employee_mode settings
    from app.database.schema import AppSettings as _AppSettings
    _settings = db.query(_AppSettings).first()
    attendance_mode = getattr(_settings, 'attendance_mode', None) or 'simple'
    employee_mode = getattr(_settings, 'employee_mode', None) or 'shared'
    shared = employee_mode == 'shared'

    results = []
    for item in classified:
        r = item["record"]
        results.append({
            "id": r.id,
            "timestamp": r.timestamp.isoformat(),
            "date": r.timestamp.strftime("%Y-%m-%d"),
            "time": r.timestamp.strftime("%H:%M:%S"),
            "employee_id": r.employee.user_id if (r.employee and shared) else (r.employee_id or "?"),
            "employee_name": r.employee.name if r.employee else "Unknown",
            "employee_pk": r.employee_id,
            "department": (r.employee.department.name if r.employee and r.employee.department else "-"),
            "device_name": r.device.name if r.device else "Unknown",
            "punch_category": item["punch_category"],
            "punch": r.punch,
            "status": r.status,
        })

    # Build per-employee per-day summaries
    # In shared mode: group by user_id and pass all PKs for cross-device merge
    from collections import defaultdict
    if shared:
        # Collect unique user_ids and their PKs + days
        uid_days = defaultdict(set)
        uid_pks = defaultdict(set)
        for item in classified:
            r = item["record"]
            if r.employee and r.employee.user_id:
                uid_days[r.employee.user_id].add(r.timestamp.date())
                uid_pks[r.employee.user_id].add(r.employee_id)

        day_summaries = {}
        for uid, days in uid_days.items():
            all_pks = list(uid_pks[uid])
            for day in days:
                s = get_employee_day_summary(db, all_pks[0], day, employee_ids=all_pks)
                key = f"{uid}_{day.isoformat()}"
                summary_item = {
                    "entry": s.get("entry"),
                    "break_out": s.get("break_out"),
                    "break_in": s.get("break_in"),
                    "exit": s.get("exit"),
                    "total_minutes": s.get("total_minutes"),
                    "overtime_minutes": s.get("overtime_minutes", 0),
                }
                if attendance_mode == 'strict':
                    summary_item["late_minutes"] = s.get("late_minutes", 0)
                    summary_item["early_departure_minutes"] = s.get("early_departure_minutes", 0)
                day_summaries[key] = summary_item
    else:
        emp_days = defaultdict(set)
        for item in classified:
            r = item["record"]
            if r.employee_id:
                emp_days[r.employee_id].add(r.timestamp.date())

        day_summaries = {}
        for emp_pk, days in emp_days.items():
            for day in days:
                s = get_employee_day_summary(db, emp_pk, day)
                key = f"{emp_pk}_{day.isoformat()}"
                summary_item = {
                    "entry": s.get("entry"),
                    "break_out": s.get("break_out"),
                    "break_in": s.get("break_in"),
                    "exit": s.get("exit"),
                    "total_minutes": s.get("total_minutes"),
                    "overtime_minutes": s.get("overtime_minutes", 0),
                }
                if attendance_mode == 'strict':
                    summary_item["late_minutes"] = s.get("late_minutes", 0)
                    summary_item["early_departure_minutes"] = s.get("early_departure_minutes", 0)
                day_summaries[key] = summary_item

    return {
        "count": len(results),
        "records": results,
        "attendance_mode": attendance_mode,
        "employee_mode": employee_mode,
        "day_summaries": day_summaries,
    }
