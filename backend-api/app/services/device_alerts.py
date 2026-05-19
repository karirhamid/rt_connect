"""Device health alerts — emails the alerts recipient when devices go offline.

Reuses the SMTP config from EmailSettings; emails go to the *separate*
`alerts_recipient_email` (NOT the report-schedule recipients).

Throttled: at most one offline alert per device per hour, and only on
state transitions (online → offline). Re-online sends a "recovered" email.
"""
from __future__ import annotations
import logging
from datetime import datetime, timezone, timedelta

from sqlalchemy import text as sa_text

from app.database.connection import get_db_session, engine
from app.database.schema import EmailSettings, Device
from app.api.email_settings import _send_email

logger = logging.getLogger(__name__)

OFFLINE_THRESHOLD_SEC = 30 * 60  # 30 min without heartbeat = offline
ALERT_COOLDOWN_SEC    = 60 * 60  # 1 hour between repeat alerts for same device


def _now_naive():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _get_state(conn, device_id: str):
    r = conn.execute(sa_text(
        "SELECT last_offline_alert, last_state FROM device_alert_state WHERE device_id = :d"
    ), {"d": device_id}).first()
    if not r:
        return None, None
    return r[0], r[1]


def _set_state(conn, device_id: str, last_offline_alert=None, last_state=None):
    conn.execute(sa_text("""
        INSERT INTO device_alert_state (device_id, last_offline_alert, last_state)
        VALUES (:d, :loa, :ls)
        ON CONFLICT (device_id) DO UPDATE SET
            last_offline_alert = COALESCE(EXCLUDED.last_offline_alert, device_alert_state.last_offline_alert),
            last_state         = COALESCE(EXCLUDED.last_state,         device_alert_state.last_state)
    """), {"d": device_id, "loa": last_offline_alert, "ls": last_state})


def _send_alert(smtp_cfg, recipient, subject, html):
    try:
        _send_email(smtp_cfg=smtp_cfg, to_list=[recipient], subject=subject, html_body=html)
        return True
    except Exception as e:
        logger.error(f"failed to send device alert: {e}")
        return False


def check_devices_and_alert():
    """Inspect every device's last_seen_at, emit alerts when needed."""
    now = _now_naive()

    with get_db_session() as db:
        smtp = db.query(EmailSettings).first()
        if not smtp or not getattr(smtp, 'alerts_enabled', False):
            return {"checked": 0, "alerted": 0, "reason": "alerts_disabled"}
        if not getattr(smtp, 'alerts_recipient_email', None):
            return {"checked": 0, "alerted": 0, "reason": "no_recipient"}
        if not smtp.host or not smtp.from_address:
            return {"checked": 0, "alerted": 0, "reason": "smtp_not_configured"}

        # Snapshot SMTP fields while session is open (DetachedInstance otherwise)
        class _Cfg: pass
        cfg = _Cfg()
        cfg.host = smtp.host; cfg.port = smtp.port; cfg.username = smtp.username
        cfg.password = smtp.password; cfg.use_tls = smtp.use_tls; cfg.use_ssl = smtp.use_ssl
        cfg.from_name = smtp.from_name; cfg.from_address = smtp.from_address
        recipient = smtp.alerts_recipient_email

        devices = db.query(Device).filter(Device.is_active == True).all()
        device_snapshots = [(d.id, d.name, d.ip, d.last_seen_at) for d in devices]

    alerted = 0
    with engine.connect() as conn:
        for dev_id, name, ip, last_seen in device_snapshots:
            # Normalize TZ
            ls_naive = None
            if last_seen:
                ls_naive = last_seen.astimezone(timezone.utc).replace(tzinfo=None) if last_seen.tzinfo else last_seen
            offline = (ls_naive is None) or ((now - ls_naive).total_seconds() > OFFLINE_THRESHOLD_SEC)
            cur_state = 'offline' if offline else 'online'
            last_offline_alert, last_state = _get_state(conn, dev_id)

            if offline:
                cooldown_ok = (last_offline_alert is None or
                               (now - last_offline_alert).total_seconds() > ALERT_COOLDOWN_SEC)
                # Alert on transition online→offline OR after cooldown
                if (last_state != 'offline') or cooldown_ok:
                    subject = f"[RTPointage] Appareil hors ligne — {name}"
                    last_seen_str = ls_naive.strftime('%Y-%m-%d %H:%M:%S UTC') if ls_naive else 'jamais'
                    html = (
                        '<div style="font-family:Arial,sans-serif;max-width:540px;padding:20px">'
                        f'<h2 style="color:#b91c1c;margin:0 0 12px">⚠ Appareil hors ligne</h2>'
                        f'<p><strong>Appareil:</strong> {name} ({ip or "—"})</p>'
                        f'<p><strong>Dernier contact:</strong> {last_seen_str}</p>'
                        '<p style="color:#6b7280;font-size:13px">'
                        "Vérifiez l'alimentation et la connexion réseau de l'appareil. "
                        "Aucun pointage ne peut être collecté tant qu'il reste hors ligne."
                        '</p></div>'
                    )
                    if _send_alert(cfg, recipient, subject, html):
                        alerted += 1
                        _set_state(conn, dev_id, last_offline_alert=now, last_state='offline')
                else:
                    _set_state(conn, dev_id, last_state='offline')
            else:
                # Came back online — notify if previous state was offline
                if last_state == 'offline':
                    subject = f"[RTPointage] Appareil de nouveau en ligne — {name}"
                    html = (
                        '<div style="font-family:Arial,sans-serif;max-width:540px;padding:20px">'
                        f'<h2 style="color:#16a34a;margin:0 0 12px">✓ Appareil de nouveau en ligne</h2>'
                        f'<p><strong>Appareil:</strong> {name} ({ip or "—"})</p>'
                        '</div>'
                    )
                    if _send_alert(cfg, recipient, subject, html):
                        alerted += 1
                _set_state(conn, dev_id, last_state='online')
        conn.commit()

    return {"checked": len(device_snapshots), "alerted": alerted}
