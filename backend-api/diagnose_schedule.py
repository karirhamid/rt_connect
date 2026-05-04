"""Diagnostic for the 'data: 0' issue in scheduled email reports.

Run from the backend-api directory:
    venv\\Scripts\\python diagnose_schedule.py

It will:
  1. List all attendance records for yesterday in YOUR database
  2. Run the exact same count query the scheduler runs
  3. Show every active schedule with its filters
"""
import json
import sys
from datetime import datetime, timezone, timedelta, date
from app.database.connection import get_db_session
from app.database.schema import (
    Attendance, Employee, Device, Company, Department,
    ReportSchedule,
)
from sqlalchemy import func


def main():
    today_local = date.today()
    yesterday   = today_local - timedelta(days=1)

    print(f"\n=== Diagnostic — server local date: {today_local}  yesterday: {yesterday} ===\n")

    # ── 1. raw count of yesterday's records ─────────────────────────────────
    start_dt = datetime.combine(yesterday, datetime.min.time())
    end_dt   = datetime.combine(yesterday, datetime.max.time().replace(microsecond=0))

    with get_db_session() as db:
        total = (db.query(Attendance)
                 .filter(Attendance.timestamp >= start_dt,
                         Attendance.timestamp <= end_dt)
                 .count())
        print(f"[1] Total attendance rows for {yesterday}: {total}")

        if total == 0:
            # Check if records exist with any date around yesterday
            for delta in (-2, -1, 0, 1):
                d = yesterday + timedelta(days=delta)
                s = datetime.combine(d, datetime.min.time())
                e = datetime.combine(d, datetime.max.time().replace(microsecond=0))
                c = (db.query(Attendance)
                     .filter(Attendance.timestamp >= s, Attendance.timestamp <= e)
                     .count())
                marker = '   ← yesterday' if delta == -1 else ''
                print(f"    {d}: {c} records{marker}")

        # First and last record overall
        first = db.query(func.min(Attendance.timestamp)).scalar()
        last  = db.query(func.max(Attendance.timestamp)).scalar()
        print(f"    Database range: {first} → {last}")

        # ── 2. records with NULL employee_id ────────────────────────────────
        null_emp = (db.query(Attendance)
                    .filter(Attendance.timestamp >= start_dt,
                            Attendance.timestamp <= end_dt,
                            Attendance.employee_id.is_(None))
                    .count())
        print(f"\n[2] Of those, with NULL employee_id (unlinked): {null_emp}")

        # ── 3. devices ───────────────────────────────────────────────────────
        print(f"\n[3] Devices in database:")
        for d in db.query(Device).all():
            print(f"    id={d.id}  name={d.name}  ip={d.ip}")

        # ── 4. active schedules and their filters ───────────────────────────
        print(f"\n[4] Active schedules:")
        scheds = db.query(ReportSchedule).filter(ReportSchedule.is_active == True).all()
        if not scheds:
            print("    (none active)")
        for s in scheds:
            dev_ids = json.loads(s.device_ids) if s.device_ids else None
            print(f"    [{s.id}] '{s.name}'  type={s.schedule_type}  period={s.data_period}")
            print(f"        send: {s.send_hour:02d}:{s.send_minute:02d}  next_run_at(UTC)={s.next_run_at}")
            print(f"        filters: device_ids={dev_ids}  company_id={s.company_id}  department_id={s.department_id}")
            print(f"        group_by={s.group_by}  recipients={s.recipients}")
            print(f"        last_run_at(UTC)={s.last_run_at}")

            # Apply this schedule's filters and re-count
            q = (db.query(Attendance)
                 .filter(Attendance.timestamp >= start_dt,
                         Attendance.timestamp <= end_dt))
            if s.company_id or s.department_id:
                q = q.join(Employee, Attendance.employee_id == Employee.id, isouter=True)
                if s.company_id:
                    q = q.filter(Employee.company_id == s.company_id)
                if s.department_id:
                    q = q.filter(Employee.department_id == s.department_id)
            if dev_ids:
                q = q.filter(Attendance.device_id.in_(dev_ids))
            count_with_filters = q.count()
            print(f"        ★ COUNT WITH THESE FILTERS for {yesterday}: {count_with_filters}")

    print("\n=== Done ===\n")


if __name__ == '__main__':
    try:
        main()
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        import traceback; traceback.print_exc()
        sys.exit(1)
