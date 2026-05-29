from fastapi import APIRouter, HTTPException, Query, Depends
from typing import List, Optional
from datetime import datetime, date
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, func
from app.database import get_db
from app.database.schema import (
    Attendance as DBAttendance,
    Employee as DBEmployee,
    Department as DBDepartment,
    Company as DBCompany,
    AppSettings as DBAppSettings,
    AttendanceDayResolution as DBDayResolution,
)
from app.core.security import get_current_user, user_has_permission
import logging

# Every endpoint under /api/attendance/* requires a valid bearer token.
# Defense in depth: applied at the router level so a future endpoint added
# to this file is protected by default — a missing per-route gate cannot
# leak attendance data to unauthenticated callers. The audit found the old
# version had ZERO auth on /today, /filter, /latest-log-date,
# /expected-working, and the PUT/DELETE attendance edit routes.
router = APIRouter(dependencies=[Depends(get_current_user)])
logger = logging.getLogger(__name__)



@router.get("/latest-log-date")
async def latest_log_date(
    device_id: Optional[str] = Query(None, description="Limit to one device"),
    db: Session = Depends(get_db),
):
    """Return the date of the most recent stored punch (device-local).

    Used by the 'sync since last logs' feature: it syncs from this date
    (start of day) up to now, so the gap since the last sync is filled.
    Pass device_id to get the last punch for a single device.
    """
    q = db.query(func.max(DBAttendance.timestamp))
    if device_id:
        q = q.filter(DBAttendance.device_id == device_id)
    max_ts = q.scalar()
    return {
        "latest_timestamp": max_ts.isoformat() if max_ts else None,
        "latest_date": max_ts.date().isoformat() if max_ts else None,
    }


@router.get("/expected-working")
async def expected_working(
    target_date: Optional[str] = Query(None, description="Date YYYY-MM-DD, defaults to today"),
    db: Session = Depends(get_db),
):
    """How many employees are EXPECTED to work on the given date.

    A day is non-working for an employee when their weekly schedule
    (EmployeeSchedule, else the DepartmentSchedule fallback) marks that
    weekday as a day off. Employees with no schedule at all are assumed to
    work (current behaviour). Used by the Today page to compute 'absent'
    correctly — a person off on Sunday is not counted absent.

    Note: night-guard / holiday-duty handling is NOT applied here yet — see
    docs/NIGHT_SHIFT_GUARD.md for the planned feature.
    """
    from app.database.shift_schema import EmployeeSchedule, DepartmentSchedule, Holiday
    from app.database.schema import AppSettings as _AS

    if target_date:
        try:
            day = datetime.strptime(target_date, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    else:
        day = date.today()
    weekday = day.weekday()  # 0=Mon .. 6=Sun — matches schedule day_of_week

    # Public holiday → nobody is expected to work (la garde / on-duty staff is
    # the planned future feature; until then a holiday = 0 expected).
    holiday = db.query(Holiday).filter(Holiday.date == day).first()
    if holiday:
        # Still report day_off count from schedules for transparency
        return {
            "date": day.isoformat(),
            "weekday": weekday,
            "expected_working": 0,
            "day_off": 0,
            "holiday": True,
            "holiday_name": holiday.name,
        }

    settings = db.query(DBAppSettings).first()
    shared = (getattr(settings, 'employee_mode', None) or 'shared') == 'shared'

    employees = db.query(DBEmployee).filter(DBEmployee.is_active == True).all()  # noqa: E712

    # Preload schedules for this weekday
    emp_off = {
        s.employee_id: s.is_day_off
        for s in db.query(EmployeeSchedule).filter(EmployeeSchedule.day_of_week == weekday).all()
    }
    dept_off = {
        s.department_id: s.is_day_off
        for s in db.query(DepartmentSchedule).filter(DepartmentSchedule.day_of_week == weekday).all()
    }

    def is_working(emp) -> bool:
        if emp.id in emp_off:
            return not emp_off[emp.id]
        if emp.department_id in dept_off:
            return not dept_off[emp.department_id]
        return True  # no schedule defined → assume working

    # Dedup by matricule in shared mode so a person on two devices counts once
    working_ids, off_ids = set(), set()
    for e in employees:
        key = e.user_id if shared else e.id
        if is_working(e):
            working_ids.add(key)
        else:
            off_ids.add(key)
    # If any alias is working, the person is working
    off_ids -= working_ids

    return {
        "date": day.isoformat(),
        "weekday": weekday,
        "expected_working": len(working_ids),
        "day_off": len(off_ids),
        "holiday": False,
    }


@router.get("/today")
async def get_today_attendance(
    target_date: Optional[str] = Query(None, description="Date to view (YYYY-MM-DD), defaults to today"),
    db: Session = Depends(get_db)
):
    """Get today's (or specified date's) attendance records with employee and department info"""
    try:
        # Parse target date or use today
        if target_date:
            try:
                target_day = datetime.strptime(target_date, "%Y-%m-%d").date()
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
        else:
            target_day = date.today()
        
        day_start = datetime.combine(target_day, datetime.min.time())
        day_end = datetime.combine(target_day, datetime.max.time())
        
        # Match reports.py:_base_filters — hide HR-deleted (voided) rows and
        # pending manual corrections (approved=False). Before this fix, voided
        # punches kept appearing on the live Today screen while having
        # correctly vanished from reports/payroll — a visible inconsistency.
        records = db.query(DBAttendance).join(
            DBEmployee, DBAttendance.employee_id == DBEmployee.id
        ).join(
            DBDepartment, DBEmployee.department_id == DBDepartment.id
        ).filter(
            and_(
                DBAttendance.voided_by_correction_id.is_(None),
                DBAttendance.approved.isnot(False),
                DBAttendance.timestamp >= day_start,
                DBAttendance.timestamp <= day_end
            )
        ).order_by(DBAttendance.timestamp.desc()).all()
        
        # Read employee_mode setting
        _settings = db.query(DBAppSettings).first()
        employee_mode = getattr(_settings, 'employee_mode', None) or 'shared'
        shared = employee_mode == 'shared'
        
        # Return all individual records (not grouped)
        attendance_list = []
        for record in records:
            # Determine check-in vs check-out
            # ZKTeco uses punch field: 0 = check-in, 1 = check-out, others = break states
            # Some devices use status field similarly
            is_check_in = (record.punch == 0) or (record.status == 0 and record.punch is None)
            
            attendance_list.append({
                'id': record.id,
                'employee_id': record.employee.user_id if shared else record.employee_id,
                'employee_name': record.employee.name,
                'department': record.employee.department.name,
                'company': record.employee.company.name,
                'timestamp': record.timestamp.isoformat(),
                'date': record.timestamp.strftime('%Y-%m-%d'),
                'time': record.timestamp.strftime('%H:%M:%S'),
                'device_id': record.device_id,
                'device_name': record.device.name if record.device else 'Unknown',
                'status': record.status,
                'punch': record.punch,
                'type': 'check_in' if is_check_in else 'check_out',
                'status_label': 'Check In' if is_check_in else 'Check Out'
            })
        
        return {
            'attendance': attendance_list,
            'count': len(attendance_list),
            'date': target_day.isoformat(),
            'employee_mode': employee_mode,
        }
    except Exception as e:
        logger.error(f"Error getting today's attendance: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/filter")
async def filter_attendance(
    start_date: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="End date (YYYY-MM-DD)"),
    employee_id: Optional[str] = Query(None, description="Employee user ID"),
    employee_name: Optional[str] = Query(None, description="Employee name (partial match)"),
    department_id: Optional[int] = Query(None, description="Department ID"),
    company_id: Optional[int] = Query(None, description="Company ID"),
    status: Optional[str] = Query(None, description="Status filter (present/late/absent)"),
    db: Session = Depends(get_db)
):
    """Filter attendance records with advanced search"""
    try:
        query = db.query(DBAttendance).join(
            DBEmployee, DBAttendance.employee_id == DBEmployee.id
        ).join(
            DBDepartment, DBEmployee.department_id == DBDepartment.id
        ).join(
            DBCompany, DBEmployee.company_id == DBCompany.id
        )
        
        # Apply filters — start with the same hide-voided / hide-unapproved
        # baseline as reports.py:_base_filters so /filter and reports agree.
        filters = [
            DBAttendance.voided_by_correction_id.is_(None),
            DBAttendance.approved.isnot(False),
        ]

        if start_date:
            start_dt = datetime.strptime(start_date, "%Y-%m-%d")
            filters.append(DBAttendance.timestamp >= start_dt)
        
        if end_date:
            end_dt = datetime.strptime(end_date + " 23:59:59", "%Y-%m-%d %H:%M:%S")
            filters.append(DBAttendance.timestamp <= end_dt)
        
        if employee_id:
            filters.append(DBEmployee.user_id == employee_id)
        
        if employee_name:
            filters.append(DBEmployee.name.ilike(f"%{employee_name}%"))
        
        if department_id:
            filters.append(DBEmployee.department_id == department_id)
        
        if company_id:
            filters.append(DBEmployee.company_id == company_id)
        
        if filters:
            query = query.filter(and_(*filters))
        
        records = query.order_by(DBAttendance.timestamp.desc()).limit(1000).all()
        
        # Format results with all attendance records
        results = []
        for record in records:
            results.append({
                'id': record.id,
                'timestamp': record.timestamp.isoformat(),
                'employee_id': record.employee.user_id,
                'employee_name': record.employee.name,
                'department': record.employee.department.name,
                'company': record.employee.company.name,
                'device_name': record.device.name if record.device else 'Unknown',
                'status': record.status,
                'punch': record.punch,
                'date': record.timestamp.strftime('%Y-%m-%d'),
                'time': record.timestamp.strftime('%H:%M:%S')
            })
        
        return {
            'attendance': results,
            'count': len(results)
        }
    except Exception as e:
        logger.error(f"Error filtering attendance: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{attendance_id}")
async def update_attendance(
    attendance_id: int,
    timestamp: Optional[str] = Query(None, description="New timestamp (ISO format)"),
    status: Optional[int] = Query(None, description="Status (0=check-in, 1=check-out)"),
    punch: Optional[int] = Query(None, description="Punch type"),
    db: Session = Depends(get_db)
):
    """Update an attendance record in the database"""
    try:
        record = db.query(DBAttendance).filter(DBAttendance.id == attendance_id).first()
        if not record:
            raise HTTPException(status_code=404, detail="Attendance record not found")

        original_timestamp = record.timestamp.isoformat()

        if timestamp:
            record.timestamp = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
        if status is not None:
            record.status = status
        if punch is not None:
            record.punch = punch

        db.commit()
        db.refresh(record)

        logger.info(f"Updated attendance record {attendance_id} for employee {record.employee.name}: {original_timestamp} -> {record.timestamp.isoformat()}")

        return {
            'success': True,
            'message': 'Attendance record updated successfully in database',
            'record': {
                'id': record.id,
                'timestamp': record.timestamp.isoformat(),
                'employee_id': record.employee.user_id,
                'employee_name': record.employee.name,
                'status': record.status,
                'punch': record.punch
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating attendance: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{attendance_id}")
async def delete_attendance(
    attendance_id: int,
    db: Session = Depends(get_db)
):
    """Delete a single attendance record"""
    try:
        record = db.query(DBAttendance).filter(DBAttendance.id == attendance_id).first()
        if not record:
            raise HTTPException(status_code=404, detail="Attendance record not found")

        db.delete(record)
        db.commit()

        return {
            'success': True,
            'message': 'Attendance record deleted successfully'
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting attendance: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


# ===========================================================================
# Punch review / entrée-sortie override — "Validation des pointages"
#
# A reviewer designates which punches of an ambiguous day are the
# entrée / sortie / break-out / break-in. The choice is stored per logical
# person per day and overrides auto-detection everywhere (reports, Today,
# lateness) via get_employee_day_summary — the single place that reads the
# AttendanceDayResolution table. When no row exists, behaviour is unchanged.
# ===========================================================================
def _review_can_write(user) -> bool:
    return (user_has_permission(user, "attendance.write")
            or user_has_permission(user, "roles.manage")
            or user_has_permission(user, "manage_users"))


@router.get("/review")
async def list_review(
    target_date: Optional[str] = Query(None, description="Day YYYY-MM-DD, defaults to today"),
    employee_id: Optional[str] = Query(None, description="Filter to one matricule (user_id)"),
    db: Session = Depends(get_db),
):
    """Per-employee punches for a single day + any saved resolution.

    Shows EVERY employee who punched that day (even a single punch), so the
    reviewer can open any day and (re)designate entrée/sortie/break. Defaults
    to today. In shared employee_mode a person's punches are merged across
    devices under their matricule.
    """
    if target_date:
        try:
            day = datetime.strptime(target_date, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    else:
        day = date.today()

    day_start = datetime.combine(day, datetime.min.time())
    day_end = datetime.combine(day, datetime.max.time())

    settings = db.query(DBAppSettings).first()
    shared = (getattr(settings, 'employee_mode', None) or 'shared') == 'shared'

    q = (db.query(DBAttendance)
         .join(DBEmployee, DBAttendance.employee_id == DBEmployee.id)
         .outerjoin(DBDepartment, DBEmployee.department_id == DBDepartment.id)
         .filter(DBAttendance.timestamp >= day_start,
                 DBAttendance.timestamp <= day_end,
                 DBAttendance.voided_by_correction_id.is_(None),
                 DBAttendance.approved.isnot(False)))
    if employee_id:
        q = q.filter(DBEmployee.user_id == employee_id)
    rows = q.order_by(DBAttendance.timestamp.asc()).all()

    # Group by logical person
    groups: dict = {}
    for r in rows:
        key = r.employee.user_id if shared else str(r.employee_id)
        g = groups.setdefault(key, {
            "user_id": r.employee.user_id,
            "employee_name": r.employee.name,
            "department": (r.employee.department.name if r.employee.department else "-"),
            "punches": [],
        })
        g["punches"].append({
            "id": r.id,
            "time": r.timestamp.strftime("%H:%M"),
            "timestamp": r.timestamp.isoformat(),
            "punch": r.punch,
            "device_id": r.device_id,
            "device_name": r.device.name if r.device else "?",
        })

    # Attach saved resolutions for the day
    res_rows = (db.query(DBDayResolution)
                .filter(func.date(DBDayResolution.date) == day).all())
    res_by_user = {rr.user_id: rr for rr in res_rows}

    out = []
    for key, g in groups.items():
        rr = res_by_user.get(g["user_id"])
        g["resolution"] = None if rr is None else {
            "entry_attendance_id":     rr.entry_attendance_id,
            "break_out_attendance_id": rr.break_out_attendance_id,
            "break_in_attendance_id":  rr.break_in_attendance_id,
            "exit_attendance_id":      rr.exit_attendance_id,
            "note": rr.note,
            "resolved_at": rr.resolved_at.isoformat() if rr.resolved_at else None,
        }
        g["punch_count"] = len(g["punches"])
        # A day with >=3 punches is the one most likely to need review.
        g["needs_review"] = len(g["punches"]) >= 3
        out.append(g)

    out.sort(key=lambda x: (not x["needs_review"], x["employee_name"]))
    return {"date": day.isoformat(), "employee_mode": "shared" if shared else "separate",
            "count": len(out), "items": out}


@router.post("/review")
async def upsert_review(
    payload: dict,
    current=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create/replace the entrée-sortie override for one (matricule, day).

    Body: { user_id, date (YYYY-MM-DD),
            entry_attendance_id, break_out_attendance_id,
            break_in_attendance_id, exit_attendance_id, note }
    Each *_attendance_id may be null. All non-null IDs must be real punches
    of that matricule on that date.
    """
    if not _review_can_write(current):
        raise HTTPException(403, "Not authorized to validate punches")

    user_id = (payload.get("user_id") or "").strip()
    date_str = (payload.get("date") or "").strip()
    if not user_id or not date_str:
        raise HTTPException(400, "user_id and date are required")
    try:
        day = datetime.strptime(date_str, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(400, "Invalid date format. Use YYYY-MM-DD")

    ids = {
        "entry_attendance_id":     payload.get("entry_attendance_id"),
        "break_out_attendance_id": payload.get("break_out_attendance_id"),
        "break_in_attendance_id":  payload.get("break_in_attendance_id"),
        "exit_attendance_id":      payload.get("exit_attendance_id"),
    }

    # Validate every non-null id is a punch of this matricule on this day.
    day_start = datetime.combine(day, datetime.min.time())
    day_end = datetime.combine(day, datetime.max.time())
    valid_ids = {
        a.id for a in (db.query(DBAttendance.id)
                       .join(DBEmployee, DBAttendance.employee_id == DBEmployee.id)
                       .filter(DBEmployee.user_id == user_id,
                               DBAttendance.timestamp >= day_start,
                               DBAttendance.timestamp <= day_end)
                       .all())
    }
    for field, aid in ids.items():
        if aid is not None and aid not in valid_ids:
            raise HTTPException(400, f"{field}={aid} is not a punch of {user_id} on {day}")

    uid = None
    try:
        uid = int(current.get("id")) if isinstance(current, dict) else getattr(current, "id", None)
    except Exception:
        uid = None

    existing = (db.query(DBDayResolution)
                .filter(DBDayResolution.user_id == user_id,
                        func.date(DBDayResolution.date) == day).first())
    if existing:
        existing.entry_attendance_id     = ids["entry_attendance_id"]
        existing.break_out_attendance_id = ids["break_out_attendance_id"]
        existing.break_in_attendance_id  = ids["break_in_attendance_id"]
        existing.exit_attendance_id      = ids["exit_attendance_id"]
        existing.note        = payload.get("note")
        existing.resolved_by = uid
        existing.resolved_at = datetime.now()
    else:
        db.add(DBDayResolution(
            user_id=user_id,
            date=datetime.combine(day, datetime.min.time()),
            entry_attendance_id     = ids["entry_attendance_id"],
            break_out_attendance_id = ids["break_out_attendance_id"],
            break_in_attendance_id  = ids["break_in_attendance_id"],
            exit_attendance_id      = ids["exit_attendance_id"],
            note=payload.get("note"),
            resolved_by=uid,
        ))
    db.commit()
    return {"ok": True, "user_id": user_id, "date": day.isoformat()}


@router.delete("/review/{user_id}/{date_str}")
async def delete_review(
    user_id: str,
    date_str: str,
    current=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Remove the override for (matricule, day) — revert to auto-detection."""
    if not _review_can_write(current):
        raise HTTPException(403, "Not authorized to validate punches")
    try:
        day = datetime.strptime(date_str, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(400, "Invalid date format. Use YYYY-MM-DD")
    existing = (db.query(DBDayResolution)
                .filter(DBDayResolution.user_id == user_id,
                        func.date(DBDayResolution.date) == day).first())
    if existing:
        db.delete(existing)
        db.commit()
    return {"ok": True, "user_id": user_id, "date": day.isoformat()}
