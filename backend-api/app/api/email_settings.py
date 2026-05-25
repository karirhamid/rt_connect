import smtplib
import ssl
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from app.database.connection import get_db_session
from app.database.schema import EmailSettings
from app.core.security import get_current_user, require_permission

router = APIRouter()


class EmailSettingsIn(BaseModel):
    is_enabled:   bool = False
    host:         Optional[str] = None
    port:         int  = 587
    username:     Optional[str] = None
    password:     Optional[str] = None   # None means "keep existing"
    use_tls:      bool = True
    use_ssl:      bool = False
    from_name:    Optional[str] = None
    from_address: Optional[str] = None
    alerts_enabled:         bool = False
    alerts_recipient_email: Optional[str] = None


class EmailSettingsOut(BaseModel):
    is_enabled:   bool
    host:         Optional[str]
    port:         int
    username:     Optional[str]
    has_password: bool           # never expose the actual password
    use_tls:      bool
    use_ssl:      bool
    from_name:    Optional[str]
    from_address: Optional[str]
    alerts_enabled:         bool = False
    alerts_recipient_email: Optional[str] = None


class TestEmailIn(BaseModel):
    to: str


def _get_or_create(db) -> EmailSettings:
    row = db.query(EmailSettings).first()
    if not row:
        row = EmailSettings()
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


@router.get('/email-settings', response_model=EmailSettingsOut,
            dependencies=[Depends(require_permission('roles.manage'))])
def get_email_settings():
    with get_db_session() as db:
        row = _get_or_create(db)
        return EmailSettingsOut(
            is_enabled=row.is_enabled,
            host=row.host,
            port=row.port,
            username=row.username,
            has_password=bool(row.password),
            use_tls=row.use_tls,
            use_ssl=row.use_ssl,
            from_name=row.from_name,
            from_address=row.from_address,
            alerts_enabled=bool(getattr(row, 'alerts_enabled', False)),
            alerts_recipient_email=getattr(row, 'alerts_recipient_email', None),
        )


@router.put('/email-settings', response_model=EmailSettingsOut,
            dependencies=[Depends(require_permission('roles.manage'))])
def update_email_settings(payload: EmailSettingsIn):
    with get_db_session() as db:
        row = _get_or_create(db)
        row.is_enabled   = payload.is_enabled
        row.host         = payload.host
        row.port         = payload.port
        row.username     = payload.username
        if payload.password is not None:   # empty string clears it
            row.password = payload.password or None
        row.use_tls      = payload.use_tls
        row.use_ssl      = payload.use_ssl
        row.from_name    = payload.from_name
        row.from_address = payload.from_address
        row.alerts_enabled         = bool(payload.alerts_enabled)
        row.alerts_recipient_email = (payload.alerts_recipient_email or None)
        db.commit()
        db.refresh(row)
        return EmailSettingsOut(
            is_enabled=row.is_enabled,
            host=row.host,
            port=row.port,
            username=row.username,
            has_password=bool(row.password),
            use_tls=row.use_tls,
            use_ssl=row.use_ssl,
            from_name=row.from_name,
            from_address=row.from_address,
            alerts_enabled=bool(getattr(row, 'alerts_enabled', False)),
            alerts_recipient_email=getattr(row, 'alerts_recipient_email', None),
        )


class TestAlertIn(BaseModel):
    to: Optional[str] = None   # optional override so you can test before saving


@router.post('/email-settings/test-alert',
             dependencies=[Depends(require_permission('roles.manage'))])
def test_alert(payload: Optional[TestAlertIn] = None):
    """Send a sample device-offline alert. Uses the recipient from the request
    body if provided (lets you test before saving), else the saved one."""
    with get_db_session() as db:
        row = _get_or_create(db)
        recipient = (payload.to.strip() if (payload and payload.to) else None) \
            or getattr(row, 'alerts_recipient_email', None)
        if not recipient:
            raise HTTPException(400, "Aucun destinataire d'alerte. Saisissez l'email puis enregistrez (ou réessayez).")
        if not row.host or not row.from_address:
            raise HTTPException(400, "SMTP non configuré : renseignez le serveur et l'adresse d'expéditeur, puis enregistrez.")
        cfg = dict(host=row.host, port=row.port, username=row.username,
                   password=row.password, use_tls=row.use_tls, use_ssl=row.use_ssl,
                   from_name=row.from_name, from_address=row.from_address)

    class _Cfg: pass
    c = _Cfg()
    for k, v in cfg.items():
        setattr(c, k, v)
    try:
        _send_email(smtp_cfg=c, to_list=[recipient],
                    subject="[RTPointage] Test d'alerte appareil",
                    html_body=(
                        '<div style="font-family:Arial,sans-serif;max-width:520px;padding:20px">'
                        '<h2 style="color:#b91c1c;margin:0 0 12px">⚠ Test — Appareil hors ligne</h2>'
                        '<p>Ceci est un test du système d\'alertes appareils. '
                        'Vous recevrez ce type de message si un appareil reste injoignable.</p>'
                        '</div>'))
        return {"ok": True, "detail": f"Test alert sent to {recipient}"}
    except Exception as e:
        raise HTTPException(500, str(e))


@router.post('/email-settings/test',
             dependencies=[Depends(require_permission('roles.manage'))])
def test_email(payload: TestEmailIn):
    # Read all fields inside the session — accessing attributes on a detached
    # SQLAlchemy object after the session closes raises DetachedInstanceError.
    with get_db_session() as db:
        row = _get_or_create(db)
        cfg = dict(
            host=row.host,
            port=row.port,
            username=row.username,
            password=row.password,
            use_tls=row.use_tls,
            use_ssl=row.use_ssl,
            from_name=row.from_name,
            from_address=row.from_address,
        )

    if not cfg['host'] or not cfg['from_address']:
        raise HTTPException(status_code=400, detail='SMTP not configured: host and from_address are required')

    class _Cfg:
        pass

    smtp_cfg = _Cfg()
    for k, v in cfg.items():
        setattr(smtp_cfg, k, v)

    try:
        _send_email(
            smtp_cfg=smtp_cfg,
            to_list=[payload.to],
            subject='RT Connect — Test Email',
            html_body=(
                '<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px">'
                '<h2 style="color:#1e3a5f;margin:0 0 12px">RT Connect</h2>'
                '<p style="color:#374151;margin:0 0 8px">Your SMTP configuration is working correctly.</p>'
                '<p style="color:#6b7280;font-size:13px">This is an automated test message from RT Connect.</p>'
                '</div>'
            ),
        )
        return {'ok': True, 'detail': f'Test email sent to {payload.to}'}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Internal send helper (used by scheduler too) ─────────────────────────────

def _send_email(smtp_cfg: EmailSettings, to_list: list[str], subject: str,
                html_body: str, pdf_bytes: bytes | None = None,
                pdf_filename: str = 'report.pdf'):
    """Send an HTML email with an optional PDF attachment."""
    msg = MIMEMultipart('mixed')
    msg['Subject'] = subject
    msg['From']    = f'{smtp_cfg.from_name} <{smtp_cfg.from_address}>' if smtp_cfg.from_name else smtp_cfg.from_address
    msg['To']      = ', '.join(to_list)

    # HTML part
    alt = MIMEMultipart('alternative')
    alt.attach(MIMEText(html_body, 'html', 'utf-8'))
    msg.attach(alt)

    # PDF attachment
    if pdf_bytes:
        from email.mime.base import MIMEBase
        from email import encoders
        part = MIMEBase('application', 'pdf')
        part.set_payload(pdf_bytes)
        encoders.encode_base64(part)
        part.add_header('Content-Disposition', 'attachment', filename=pdf_filename)
        msg.attach(part)

    host = smtp_cfg.host
    port = smtp_cfg.port
    user = smtp_cfg.username
    pwd  = smtp_cfg.password

    if smtp_cfg.use_ssl:
        ctx = ssl.create_default_context()
        with smtplib.SMTP_SSL(host, port, context=ctx) as s:
            if user:
                s.login(user, pwd or '')
            s.sendmail(smtp_cfg.from_address, to_list, msg.as_bytes())
    else:
        with smtplib.SMTP(host, port) as s:
            if smtp_cfg.use_tls:
                s.starttls()
            if user:
                s.login(user, pwd or '')
            s.sendmail(smtp_cfg.from_address, to_list, msg.as_bytes())
