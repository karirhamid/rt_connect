"""
Punch Classification Service

Classifies raw attendance punches into meaningful categories:
  - entry       : Employee arriving at work
  - break_out   : Employee leaving for break
  - break_in    : Employee returning from break
  - exit        : Employee leaving work
  - overtime_exit: Employee leaving after scheduled end + tolerance

Priority chain:
  1. Personal schedule (employee_schedules)    → highest priority
  2. Assigned shift   (employee_shifts)        → medium
  3. Auto-detect      (first punch of day)     → fallback

Once determined, the shift for employee+date is locked in daily_shift_records
so all subsequent punches that day are classified against the same schedule.
"""
from datetime import datetime, date, time, timedelta, timezone
from typing import Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import and_
from sqlalchemy.dialects.postgresql import insert as pg_insert
import logging

from app.database.schema import Attendance as DBAttendance, Employee as DBEmployee, AppSettings
from app.database.shift_schema import (
    EmployeeSchedule, DepartmentSchedule, DailyShiftRecord, EmployeeShift, ShiftTiming,
    Shift, DetectionMethod,
)

logger = logging.getLogger(__name__)


def _upsert_daily_shift(db: Session, employee_id: int, punch_date, **kwargs) -> DailyShiftRecord:
    """Insert a DailyShiftRecord atomically using ON CONFLICT DO NOTHING.

    Using a plain INSERT + IntegrityError catch caused PostgreSQL deadlocks when
    two concurrent requests both tried to insert rows for the same employees in
    the same order.  The atomic upsert avoids any row-level lock contention.
    """
    # Core INSERT requires enum values as strings; ORM defaults don't apply.
    values = dict(kwargs)
    if "detection_method" in values and hasattr(values["detection_method"], "value"):
        values["detection_method"] = values["detection_method"].value
    values.setdefault("created_at", datetime.now(timezone.utc))

    stmt = (
        pg_insert(DailyShiftRecord)
        .values(employee_id=employee_id, date=punch_date, **values)
        .on_conflict_do_nothing(constraint="uq_employee_day")
    )
    db.execute(stmt)
    db.flush()

    return db.query(DailyShiftRecord).filter(
        and_(
            DailyShiftRecord.employee_id == employee_id,
            DailyShiftRecord.date == punch_date,
        )
    ).first()

# Tolerance windows (minutes)
ENTRY_TOLERANCE = 60       # ±60 min from work_start
BREAK_TOLERANCE = 30       # ±30 min from break_start / break_end
EXIT_TOLERANCE = 60        # ±60 min from work_end
AUTO_DETECT_BEFORE = 30    # Can punch up to 30 min before shift start
AUTO_DETECT_AFTER = 120    # Can punch up to 120 min after shift start

PUNCH_TYPES = {
    "entry": "entry",
    "break_out": "break_out",
    "break_in": "break_in",
    "exit": "exit",
    "overtime_exit": "overtime_exit",
    "unknown": "unknown",
}


def _time_diff_minutes(t1: time, t2: time) -> float:
    """Signed difference in minutes: t1 - t2.  Positive means t1 is later."""
    d1 = timedelta(hours=t1.hour, minutes=t1.minute, seconds=t1.second)
    d2 = timedelta(hours=t2.hour, minutes=t2.minute, seconds=t2.second)
    return (d1 - d2).total_seconds() / 60.0


def _abs_diff_minutes(t1: time, t2: time) -> float:
    return abs(_time_diff_minutes(t1, t2))


# ─── Resolve schedule for employee + date ──────────────────────────

def _get_shift_timing_for_day(shift: Shift, day_of_week: int) -> Optional[ShiftTiming]:
    """Get the timing for a specific day of week. Falls back to all-days timing."""
    specific = None
    fallback = None
    for t in shift.timings:
        if t.day_of_week == day_of_week:
            specific = t
        elif t.day_of_week is None:
            fallback = t
    return specific or fallback


def resolve_daily_record(
    db: Session,
    employee_id: int,
    punch_date: date,
    punch_time: time,
) -> Optional[DailyShiftRecord]:
    """
    Resolve (or create) the DailyShiftRecord for employee+date.
    Returns the record with work_start/work_end/break times filled in,
    or None if nothing could be determined.

    timing_mode controls which schedule sources are consulted:
      - "off"        → skip classification entirely
      - "employee"   → personal schedules only
      - "department" → department schedules only
      - "both"       → personal first, fallback to department

    Guard/night assigned shifts (step 2) are ALWAYS checked regardless of mode.
    """
    # ── 0. Read timing_mode from AppSettings ──
    app_settings = db.query(AppSettings).first()
    timing_mode = getattr(app_settings, 'timing_mode', None) or 'off'
    # Backwards compat: if timing_mode not set, check legacy timing_enabled
    if timing_mode == 'off' and app_settings and getattr(app_settings, 'timing_enabled', False):
        timing_mode = 'both'

    # Already locked?
    record = db.query(DailyShiftRecord).filter(
        and_(
            DailyShiftRecord.employee_id == employee_id,
            DailyShiftRecord.date == punch_date,
        )
    ).first()
    if record and record.locked:
        return record

    dow = punch_date.weekday()  # 0=Monday .. 6=Sunday

    # ── 1. Personal schedule (only when mode is "employee" or "both") ──
    if timing_mode in ('employee', 'both'):
        personal = db.query(EmployeeSchedule).filter(
            and_(
                EmployeeSchedule.employee_id == employee_id,
                EmployeeSchedule.day_of_week == dow,
            )
        ).first()
        if personal:
            if personal.is_day_off:
                # Still check guard shifts below before returning None
                pass
            else:
                if record is None:
                    record = _upsert_daily_shift(
                        db, employee_id, punch_date,
                        detection_method=DetectionMethod.SCHEDULE,
                        work_start=personal.work_start,
                        work_end=personal.work_end,
                        break_start=personal.break_start if personal.has_break else None,
                        break_end=personal.break_end if personal.has_break else None,
                        locked=True,
                    )
                return record

    # ── 1.5  Department schedule (only when mode is "department" or "both") ──
    if timing_mode in ('department', 'both'):
        employee = db.query(DBEmployee).filter(DBEmployee.id == employee_id).first()
        if employee and employee.department_id:
            dept_sched = db.query(DepartmentSchedule).filter(
                and_(
                    DepartmentSchedule.department_id == employee.department_id,
                    DepartmentSchedule.day_of_week == dow,
                )
            ).first()
            if dept_sched:
                if dept_sched.is_day_off:
                    # Still check guard shifts below
                    pass
                else:
                    if record is None:
                        record = _upsert_daily_shift(
                            db, employee_id, punch_date,
                            detection_method=DetectionMethod.SCHEDULE,
                            work_start=dept_sched.work_start,
                            work_end=dept_sched.work_end,
                            break_start=dept_sched.break_start if dept_sched.has_break else None,
                            break_end=dept_sched.break_end if dept_sched.has_break else None,
                            locked=True,
                        )
                    return record

    # ── 2. Assigned shift (ALWAYS checked — covers guard/night shifts) ──
    assignment = db.query(EmployeeShift).filter(
        and_(
            EmployeeShift.employee_id == employee_id,
            EmployeeShift.effective_from <= punch_date,
            (EmployeeShift.effective_to.is_(None)) | (EmployeeShift.effective_to >= punch_date),
        )
    ).first()
    if assignment:
        shift = assignment.shift
        dow = punch_date.weekday()  # 0=Monday
        timing = _get_shift_timing_for_day(shift, dow)
        if timing:
            # Derive break times from break_duration_minutes if > 0
            brk_start, brk_end = None, None
            if timing.break_duration_minutes and timing.break_duration_minutes > 0:
                # Place break at midpoint of the work day
                start_min = timing.start_time.hour * 60 + timing.start_time.minute
                end_min = timing.end_time.hour * 60 + timing.end_time.minute
                if timing.is_overnight:
                    end_min += 24 * 60
                mid = (start_min + end_min) // 2
                half_brk = timing.break_duration_minutes // 2
                brk_s = mid - half_brk
                brk_e = mid + (timing.break_duration_minutes - half_brk)
                brk_start = time(hour=(brk_s // 60) % 24, minute=brk_s % 60)
                brk_end = time(hour=(brk_e // 60) % 24, minute=brk_e % 60)

            if record is None:
                record = _upsert_daily_shift(
                    db, employee_id, punch_date,
                    shift_id=shift.id,
                    detection_method=DetectionMethod.ASSIGNED,
                    work_start=timing.start_time,
                    work_end=timing.end_time,
                    break_start=brk_start,
                    break_end=brk_end,
                    locked=True,
                )
            return record

    # ── 3. Auto-detect (only when timing is active) ──
    if timing_mode == 'off':
        return None

    # Check if employee already has OTHER punches today → means a shift is already
    # in progress (day shift) and this punch is overtime, not a new shift.
    existing_punches_today = db.query(DBAttendance).filter(
        and_(
            DBAttendance.employee_id == employee_id,
            DBAttendance.timestamp >= datetime.combine(punch_date, time.min),
            DBAttendance.timestamp <= datetime.combine(punch_date, time.max),
        )
    ).count()

    if existing_punches_today > 0:
        # Employee already has punches today but no schedule/assignment →
        # Can't auto-detect, leave as unknown (simple in/out)
        return None

    # First punch of the day: try to match against any active shift's start time
    active_shifts = db.query(Shift).filter(Shift.is_active == True).all()
    best_shift = None
    best_timing = None
    best_diff = 999999
    dow = punch_date.weekday()

    for shift in active_shifts:
        timing = _get_shift_timing_for_day(shift, dow)
        if not timing:
            continue
        diff = _time_diff_minutes(punch_time, timing.start_time)
        # Within window: -30 min (early) to +120 min (late arrival)
        if -AUTO_DETECT_BEFORE <= diff <= AUTO_DETECT_AFTER:
            if abs(diff) < best_diff:
                best_diff = abs(diff)
                best_shift = shift
                best_timing = timing

    if best_shift and best_timing:
        brk_start, brk_end = None, None
        if best_timing.break_duration_minutes and best_timing.break_duration_minutes > 0:
            start_min = best_timing.start_time.hour * 60 + best_timing.start_time.minute
            end_min = best_timing.end_time.hour * 60 + best_timing.end_time.minute
            if best_timing.is_overnight:
                end_min += 24 * 60
            mid = (start_min + end_min) // 2
            half_brk = best_timing.break_duration_minutes // 2
            brk_s = mid - half_brk
            brk_e = mid + (best_timing.break_duration_minutes - half_brk)
            brk_start = time(hour=(brk_s // 60) % 24, minute=brk_s % 60)
            brk_end = time(hour=(brk_e // 60) % 24, minute=brk_e % 60)

        record = _upsert_daily_shift(
            db, employee_id, punch_date,
            shift_id=best_shift.id,
            detection_method=DetectionMethod.AUTO,
            work_start=best_timing.start_time,
            work_end=best_timing.end_time,
            break_start=brk_start,
            break_end=brk_end,
            locked=True,
        )
        return record

    return None


# ─── Classify a single punch ──────────────────────────────────────

def classify_punch(
    db: Session,
    employee_id: int,
    timestamp: datetime,
) -> str:
    """
    Classify a punch timestamp for the given employee.
    Returns one of: entry, break_out, break_in, exit, overtime_exit, unknown
    """
    punch_date = timestamp.date()
    punch_time = timestamp.time()

    record = resolve_daily_record(db, employee_id, punch_date, punch_time)
    if record is None:
        return PUNCH_TYPES["unknown"]

    ws = record.work_start
    we = record.work_end
    bs = record.break_start
    be = record.break_end

    # Calculate distances to each window
    dist_entry = _abs_diff_minutes(punch_time, ws) if ws else 9999
    dist_exit = _abs_diff_minutes(punch_time, we) if we else 9999
    dist_break_out = _abs_diff_minutes(punch_time, bs) if bs else 9999
    dist_break_in = _abs_diff_minutes(punch_time, be) if be else 9999

    # Check overtime (punch is significantly after work_end)
    if we and _time_diff_minutes(punch_time, we) > EXIT_TOLERANCE:
        return PUNCH_TYPES["overtime_exit"]

    # Build candidates sorted by distance
    candidates = []
    if dist_entry <= ENTRY_TOLERANCE:
        candidates.append((dist_entry, "entry"))
    if bs and dist_break_out <= BREAK_TOLERANCE:
        candidates.append((dist_break_out, "break_out"))
    if be and dist_break_in <= BREAK_TOLERANCE:
        candidates.append((dist_break_in, "break_in"))
    if dist_exit <= EXIT_TOLERANCE:
        candidates.append((dist_exit, "exit"))

    if not candidates:
        # Fallback: before midpoint = entry, after = exit
        if ws and we:
            ws_min = ws.hour * 60 + ws.minute
            we_min = we.hour * 60 + we.minute
            p_min = punch_time.hour * 60 + punch_time.minute
            midpoint = (ws_min + we_min) // 2
            return PUNCH_TYPES["entry"] if p_min <= midpoint else PUNCH_TYPES["exit"]
        return PUNCH_TYPES["unknown"]

    candidates.sort(key=lambda x: x[0])
    return PUNCH_TYPES[candidates[0][1]]


# ─── Bulk classify for reporting ──────────────────────────────────

def classify_attendance_records(
    db: Session,
    records: list,
) -> list:
    """
    Given a list of attendance ORM objects sorted by timestamp,
    return a list of dicts with the record + punch_category.
    """
    results = []
    for r in records:
        if r.employee_id:
            category = classify_punch(db, r.employee_id, r.timestamp)
        else:
            category = "unknown"
        results.append({
            "record": r,
            "punch_category": category,
        })
    return results


def get_employee_day_summary(
    db: Session,
    employee_id: int,
    day: date,
    employee_ids: list = None,
) -> dict:
    """
    Build a full-day summary for one employee:
    {entry, break_out, break_in, exit, overtime, total_worked_minutes, schedule_info}

    If *employee_ids* is provided (list of PKs for the same logical person
    across multiple devices), attendance from ALL those PKs is merged.
    """
    day_start = datetime.combine(day, time.min)
    day_end = datetime.combine(day, time.max)

    all_pks = employee_ids if employee_ids else [employee_id]

    punches = db.query(DBAttendance).filter(
        and_(
            DBAttendance.employee_id.in_(all_pks),
            DBAttendance.timestamp >= day_start,
            DBAttendance.timestamp <= day_end,
        )
    ).order_by(DBAttendance.timestamp.asc()).all()

    classified = []
    for p in punches:
        cat = classify_punch(db, p.employee_id, p.timestamp)
        classified.append({"time": p.timestamp.strftime("%H:%M"), "category": cat})

    # Extract key entries
    entry_time = None
    break_out_time = None
    break_in_time = None
    exit_time = None

    for c in classified:
        if c["category"] == "entry" and entry_time is None:
            entry_time = c["time"]
        elif c["category"] == "break_out" and break_out_time is None:
            break_out_time = c["time"]
        elif c["category"] == "break_in" and break_in_time is None:
            break_in_time = c["time"]
        elif c["category"] in ("exit", "overtime_exit"):
            exit_time = c["time"]  # last one wins

    # Get schedule info (check all PKs for this person)
    record = None
    for _pk in all_pks:
        record = db.query(DailyShiftRecord).filter(
            and_(
                DailyShiftRecord.employee_id == _pk,
                DailyShiftRecord.date == day,
            )
        ).first()
        if record:
            break

    # ── Compute durations ──────────────────────────────────────
    total_minutes = None
    overtime_minutes = 0
    late_minutes = 0
    early_departure_minutes = 0

    if entry_time and exit_time:
        _entry_dt = datetime.strptime(entry_time, "%H:%M")
        _exit_dt = datetime.strptime(exit_time, "%H:%M")
        diff = (_exit_dt - _entry_dt).total_seconds() / 60.0
        # Subtract break if we have both break_out and break_in
        if break_out_time and break_in_time:
            _bout = datetime.strptime(break_out_time, "%H:%M")
            _bin = datetime.strptime(break_in_time, "%H:%M")
            diff -= (_bin - _bout).total_seconds() / 60.0
        total_minutes = max(0, diff)

    if record and record.work_end and exit_time:
        _exit_t = datetime.strptime(exit_time, "%H:%M").time()
        ot = _time_diff_minutes(_exit_t, record.work_end)
        overtime_minutes = max(0, ot)

    if record and record.work_start and entry_time:
        _entry_t = datetime.strptime(entry_time, "%H:%M").time()
        late = _time_diff_minutes(_entry_t, record.work_start)
        late_minutes = max(0, late)

    if record and record.work_end and exit_time:
        _exit_t = datetime.strptime(exit_time, "%H:%M").time()
        early = _time_diff_minutes(record.work_end, _exit_t)
        early_departure_minutes = max(0, early)

    return {
        "entry": entry_time,
        "break_out": break_out_time,
        "break_in": break_in_time,
        "exit": exit_time,
        "total_minutes": round(total_minutes) if total_minutes is not None else None,
        "overtime_minutes": round(overtime_minutes),
        "late_minutes": round(late_minutes),
        "early_departure_minutes": round(early_departure_minutes),
        "all_punches": classified,
        "schedule": {
            "work_start": record.work_start.strftime("%H:%M") if record and record.work_start else None,
            "work_end": record.work_end.strftime("%H:%M") if record and record.work_end else None,
            "break_start": record.break_start.strftime("%H:%M") if record and record.break_start else None,
            "break_end": record.break_end.strftime("%H:%M") if record and record.break_end else None,
            "detection_method": record.detection_method.value if record else None,
            "shift_name": record.shift.name if record and record.shift else None,
        } if record else None,
    }
