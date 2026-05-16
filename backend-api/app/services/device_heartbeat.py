"""Device heartbeat — lightweight TCP-connect probe to verify device reachability.

Why TCP-connect and not a full ZKTeco get_info() call:
- A full call opens a session on the device. Sessions are exclusive on older
  ZKTeco firmware — while a session is open, no one else (including this
  app's own sync) can talk to the device. We want the heartbeat to be
  invisible to operators.
- A bare TCP-connect to port 4370 just confirms the device is on the
  network and listening. Round-trip is ~50-200 ms and creates no session.
- If the port responds, we mark the device as reachable. Anything more
  expensive (firmware version, time check) would defeat the purpose.

The loop runs in a daemon thread. It wakes every 30 seconds and pings any
device whose `last_ping_at` is older than the configured interval. Default
interval is 300 s (5 min); admin can change it in General Settings.
"""
import logging
import socket
import threading
from datetime import datetime, timezone, timedelta

logger = logging.getLogger(__name__)

_thread: threading.Thread | None = None
_stop_event = threading.Event()

# Wake-up tick. Independent of the per-device interval — keeps the loop
# responsive to setting changes without long sleeps.
_TICK_SECONDS = 30
_TCP_TIMEOUT = 3.0


def _ping(ip: str, port: int) -> bool:
    """TCP connect with timeout. True iff the port accepted the connection."""
    try:
        with socket.create_connection((ip, port), timeout=_TCP_TIMEOUT):
            return True
    except (socket.timeout, OSError):
        return False


def _heartbeat_loop():
    logger.info("Device heartbeat thread started")
    while not _stop_event.is_set():
        try:
            _tick()
        except Exception as exc:
            logger.error(f"Heartbeat tick error: {exc}")
        _stop_event.wait(_TICK_SECONDS)
    logger.info("Device heartbeat thread stopped")


def _tick():
    from app.database.connection import get_db_session
    from app.database.schema import Device, AppSettings

    now = datetime.now(timezone.utc)

    # Read settings (interval may have changed since last tick)
    with get_db_session() as db:
        settings = db.query(AppSettings).first()
        enabled = bool(getattr(settings, 'device_heartbeat_enabled', True)) if settings else True
        interval_sec = int(getattr(settings, 'device_heartbeat_interval_sec', 300) or 300) if settings else 300

        if not enabled:
            return

        cutoff = now - timedelta(seconds=interval_sec)
        # Devices that are active AND haven't been pinged recently
        due = (
            db.query(Device)
              .filter(Device.is_active == True)
              .filter((Device.last_ping_at == None) | (Device.last_ping_at < cutoff))
              .all()
        )
        # Snapshot the fields we need so we can release the session during pings
        targets = [(d.id, d.ip, d.port) for d in due]

    if not targets:
        return

    results = []
    for dev_id, ip, port in targets:
        ok = _ping(ip, port)
        results.append((dev_id, ok, datetime.now(timezone.utc)))

    # Write all results in one short session
    with get_db_session() as db:
        for dev_id, ok, ts in results:
            d = db.query(Device).filter(Device.id == dev_id).first()
            if not d:
                continue
            d.last_ping_at = ts
            if ok:
                d.last_seen_at = ts
        db.commit()


def start():
    global _thread
    if _thread and _thread.is_alive():
        return
    _stop_event.clear()
    _thread = threading.Thread(target=_heartbeat_loop, daemon=True, name='device-heartbeat')
    _thread.start()


def stop():
    _stop_event.set()


def ping_now(device_id: str) -> bool:
    """Force-ping a single device on demand. Returns True if reachable."""
    from app.database.connection import get_db_session
    from app.database.schema import Device

    with get_db_session() as db:
        d = db.query(Device).filter(Device.id == device_id).first()
        if not d:
            return False
        ip, port = d.ip, d.port

    ok = _ping(ip, port)
    ts = datetime.now(timezone.utc)

    with get_db_session() as db:
        d = db.query(Device).filter(Device.id == device_id).first()
        if d:
            d.last_ping_at = ts
            if ok:
                d.last_seen_at = ts
            db.commit()
    return ok
