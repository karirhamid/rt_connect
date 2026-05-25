"""Scheduled automatic database backups.

A lightweight background thread (same pattern as the report scheduler and the
device heartbeat). Every minute it checks the schedule stored in AppSettings
and, when due, runs a pg_dump backup (+ external push + retention) once.

Times are evaluated in APP_TIMEZONE so 02:00 means 02:00 local.
"""
from __future__ import annotations
import threading
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

_stop = threading.Event()
_thread: threading.Thread | None = None
_TICK_SECONDS = 60


def _local_now() -> datetime:
    try:
        from app.services.integrity_guards import _local_now_naive
        return _local_now_naive()
    except Exception:
        return datetime.now()


def _tick():
    from app.database.connection import get_db_session
    from app.database.schema import AppSettings

    with get_db_session() as db:
        s = db.query(AppSettings).first()
        if not s or not bool(getattr(s, 'backup_schedule_enabled', False)):
            return
        freq = getattr(s, 'backup_schedule_frequency', 'daily') or 'daily'
        tstr = getattr(s, 'backup_schedule_time', '02:00') or '02:00'
        weekday = int(getattr(s, 'backup_schedule_weekday', 0) or 0)
        last = getattr(s, 'backup_last_run_at', None)

    now = _local_now()
    try:
        hh, mm = [int(x) for x in tstr.split(':')]
    except Exception:
        hh, mm = 2, 0

    scheduled = now.replace(hour=hh, minute=mm, second=0, microsecond=0)
    if now < scheduled:
        return                                  # not yet time today
    if freq == 'weekly' and now.weekday() != weekday:
        return                                  # wrong day of week

    # Already ran in this period?
    if last:
        if freq == 'daily' and last.date() == now.date():
            return
        if freq == 'weekly' and (now.date() - last.date()).days < 6:
            return

    logger.info("Backup scheduler: running scheduled backup (%s %s)", freq, tstr)
    try:
        from app.api.maintenance import _perform_backup
        r = _perform_backup()
        logger.info("Scheduled backup OK: %s (pushed=%s)", r.get('filename'), r.get('pushed'))
    except Exception as e:
        logger.error("Scheduled backup failed: %s", e)

    # Record last run regardless, so a failing backup doesn't retry every minute
    try:
        with get_db_session() as db:
            s = db.query(AppSettings).first()
            if s:
                s.backup_last_run_at = now
                db.commit()
    except Exception as e:
        logger.warning("Could not record backup_last_run_at: %s", e)


def _loop():
    logger.info("Backup scheduler thread started")
    while not _stop.is_set():
        try:
            _tick()
        except Exception as e:
            logger.error("Backup scheduler tick error: %s", e)
        _stop.wait(_TICK_SECONDS)
    logger.info("Backup scheduler thread stopped")


def start():
    global _thread
    if _thread and _thread.is_alive():
        return
    _stop.clear()
    _thread = threading.Thread(target=_loop, daemon=True, name='backup-scheduler')
    _thread.start()
