"""Data integrity guards — flag-only.

Runs after a sync (or on-demand) over a window and inserts rows into the
`anomalies` table. Never blocks ingestion; reports show '-' on missing IN/OUT.
"""
from __future__ import annotations
from datetime import datetime, timedelta, timezone, date
from typing import Optional
import os
import logging

from sqlalchemy import func, and_
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.database.connection import get_db_session
from app.database.schema import Attendance, Employee, Device, Anomaly

logger = logging.getLogger(__name__)

ODD_HOURS_START = 0   # midnight
ODD_HOURS_END = 5     # 5 AM — punches between 00:00–05:00 are flagged "odd"
HUGE_GAP_HOURS = 14   # >14h between first IN and last OUT is suspicious
MERGED_CLUSTER_LARGE = 4  # 4+ punches within the merge window
FUTURE_TOLERANCE_MIN = 10  # allow small clock skew before flagging a future punch

# Device timestamps are stored naive in DEVICE-LOCAL time. To compare against
# "now" we must use the same wall-clock zone, regardless of the server's TZ.
APP_TIMEZONE = os.getenv("APP_TIMEZONE", "Africa/Casablanca")


def _local_now_naive() -> datetime:
    """Current wall-clock time in the configured app timezone, as a naive datetime."""
    try:
        from zoneinfo import ZoneInfo
        return datetime.now(ZoneInfo(APP_TIMEZONE)).replace(tzinfo=None)
    except Exception:
        # Fall back to server local time if the tz database is unavailable.
        return datetime.now()


def _insert_anomaly(db, **kw):
    """Insert anomaly, dedupe by (kind, attendance_id, employee_id, day)."""
    stmt = pg_insert(Anomaly).values(**kw).on_conflict_do_nothing(
        constraint='uq_anomaly_dedupe'
    )
    db.execute(stmt)


def scan_attendance_window(start: datetime, end: datetime, device_id: Optional[str] = None) -> dict:
    """Scan a time window and emit anomalies. Returns counts per kind."""
    counts: dict[str, int] = {}

    def bump(k):
        counts[k] = counts.get(k, 0) + 1

    now = _local_now_naive()

    with get_db_session() as db:
        q = db.query(Attendance).filter(
            Attendance.timestamp >= start,
            Attendance.timestamp < end,
        )
        if device_id:
            q = q.filter(Attendance.device_id == device_id)
        rows = q.all()

        for a in rows:
            ts = a.timestamp
            day = datetime.combine(ts.date(), datetime.min.time())

            # ---- future timestamp ----
            if ts > now + timedelta(minutes=FUTURE_TOLERANCE_MIN):
                _insert_anomaly(db, kind='future_timestamp', severity='warn',
                                attendance_id=a.id, employee_id=a.employee_id,
                                device_id=a.device_id, day=day,
                                detail=f'Timestamp {ts.isoformat()} is in the future')
                bump('future_timestamp')

            # ---- before hire / inactive ----
            if a.employee_id:
                emp = db.query(Employee).filter(Employee.id == a.employee_id).first()
                if emp:
                    hd = getattr(emp, 'hire_date', None)
                    if hd:
                        try:
                            hd_date = hd.date() if hasattr(hd, 'date') else hd
                            if ts.date() < hd_date:
                                _insert_anomaly(db, kind='before_hire', severity='warn',
                                                attendance_id=a.id, employee_id=a.employee_id,
                                                device_id=a.device_id, day=day,
                                                detail=f'Punch on {ts.date()} but hired {hd_date}')
                                bump('before_hire')
                        except Exception:
                            pass
                    if getattr(emp, 'is_active', True) is False:
                        _insert_anomaly(db, kind='inactive_employee', severity='warn',
                                        attendance_id=a.id, employee_id=a.employee_id,
                                        device_id=a.device_id, day=day,
                                        detail='Punch by inactive employee')
                        bump('inactive_employee')
            else:
                _insert_anomaly(db, kind='unmatched_user', severity='warn',
                                attendance_id=a.id, device_id=a.device_id, day=day,
                                detail=f'Device UID {a.user_id_str} has no matching employee')
                bump('unmatched_user')

            # ---- odd hours ----
            if ODD_HOURS_START <= ts.hour < ODD_HOURS_END:
                _insert_anomaly(db, kind='odd_hours', severity='info',
                                attendance_id=a.id, employee_id=a.employee_id,
                                device_id=a.device_id, day=day,
                                detail=f'Punch at {ts.strftime("%H:%M")} — outside normal working hours')
                bump('odd_hours')

        # ---- per-employee-per-day checks (orphan IN/OUT, huge gap, multi-device, large merge) ----
        per_day = db.query(
            Attendance.employee_id,
            func.date(Attendance.timestamp).label('d'),
            func.min(Attendance.timestamp).label('first_ts'),
            func.max(Attendance.timestamp).label('last_ts'),
            func.count(Attendance.id).label('n'),
            func.array_agg(func.distinct(Attendance.device_id)).label('devs'),
        ).filter(
            Attendance.timestamp >= start,
            Attendance.timestamp < end,
            Attendance.employee_id.isnot(None),
        ).group_by(Attendance.employee_id, func.date(Attendance.timestamp)).all()

        for r in per_day:
            day = datetime.combine(r.d, datetime.min.time())
            n = int(r.n or 0)
            if n == 1 and r.first_ts:
                # Single punch — orphan IN if AM, orphan OUT if PM
                kind = 'orphan_in' if r.first_ts.hour < 12 else 'orphan_out'
                _insert_anomaly(db, kind=kind, severity='warn',
                                employee_id=r.employee_id, day=day,
                                detail=f'Only one punch at {r.first_ts.strftime("%H:%M")} on {r.d}')
                bump(kind)
            if r.first_ts and r.last_ts:
                gap_h = (r.last_ts - r.first_ts).total_seconds() / 3600
                if gap_h >= HUGE_GAP_HOURS:
                    _insert_anomaly(db, kind='huge_gap', severity='warn',
                                    employee_id=r.employee_id, day=day,
                                    detail=f'{gap_h:.1f}h between first and last punch on {r.d}')
                    bump('huge_gap')
            devs = list(r.devs or [])
            if len([d for d in devs if d]) > 1:
                _insert_anomaly(db, kind='multi_device', severity='info',
                                employee_id=r.employee_id, day=day,
                                detail=f'Punches on multiple devices: {", ".join(d for d in devs if d)}')
                bump('multi_device')

        db.commit()

    if counts:
        logger.info("integrity scan: %s", counts)
    return counts


def scan_recent(hours: int = 48) -> dict:
    end = _local_now_naive() + timedelta(hours=2)
    start = end - timedelta(hours=hours)
    return scan_attendance_window(start, end)
