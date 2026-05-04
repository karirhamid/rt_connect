import json
from datetime import datetime, timezone, timedelta
import calendar
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from app.database.connection import get_db_session
from app.database.schema import ReportSchedule, ReportScheduleLog
from app.core.security import require_permission

router = APIRouter()


# ── Default email templates per schedule type ────────────────────────────────

DEFAULT_SUBJECTS = {
    'daily':         'Rapport de présence — {{report_date}}',
    'weekly':        'Rapport hebdomadaire — {{week_start}} au {{week_end}}',
    'monthly_day':   'Rapport mensuel — {{month_name}} {{year}}',
    'monthly_last':  'Rapport mensuel — {{month_name}} {{year}}',
}

DEFAULT_BODIES = {
    'daily': """<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
  <div style="background:#1e3a5f;color:white;padding:24px;border-radius:8px 8px 0 0">
    <h2 style="margin:0">📊 Rapport de Présence Journalier</h2>
    <p style="margin:4px 0 0;opacity:.8">{{company_name}}</p>
  </div>
  <div style="background:#f8fafc;padding:24px;border:1px solid #e2e8f0;border-top:none">
    <p>Bonjour,</p>
    <p>Veuillez trouver ci-joint le rapport de présence du <strong>{{report_date}}</strong>.</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0">
      <tr style="background:#e2e8f0"><td style="padding:8px 12px;font-weight:bold">Période</td><td style="padding:8px 12px">{{period_label}}</td></tr>
      <tr><td style="padding:8px 12px;font-weight:bold">Employés</td><td style="padding:8px 12px">{{total_employees}}</td></tr>
      <tr style="background:#e2e8f0"><td style="padding:8px 12px;font-weight:bold">Enregistrements</td><td style="padding:8px 12px">{{total_records}}</td></tr>
      <tr><td style="padding:8px 12px;font-weight:bold">Généré le</td><td style="padding:8px 12px">{{generated_at}}</td></tr>
    </table>
    <p style="color:#64748b;font-size:13px">Le rapport PDF est joint à cet email.</p>
  </div>
  <div style="background:#1e3a5f;color:white;padding:12px 24px;border-radius:0 0 8px 8px;font-size:12px;text-align:center">
    RT Connect — Système de Gestion de Présence
  </div>
</div>""",

    'weekly': """<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
  <div style="background:#1e3a5f;color:white;padding:24px;border-radius:8px 8px 0 0">
    <h2 style="margin:0">📊 Rapport Hebdomadaire</h2>
    <p style="margin:4px 0 0;opacity:.8">{{company_name}}</p>
  </div>
  <div style="background:#f8fafc;padding:24px;border:1px solid #e2e8f0;border-top:none">
    <p>Bonjour,</p>
    <p>Veuillez trouver ci-joint le rapport de présence de la semaine du <strong>{{week_start}}</strong> au <strong>{{week_end}}</strong>.</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0">
      <tr style="background:#e2e8f0"><td style="padding:8px 12px;font-weight:bold">Période</td><td style="padding:8px 12px">{{period_label}}</td></tr>
      <tr><td style="padding:8px 12px;font-weight:bold">Employés</td><td style="padding:8px 12px">{{total_employees}}</td></tr>
      <tr style="background:#e2e8f0"><td style="padding:8px 12px;font-weight:bold">Enregistrements</td><td style="padding:8px 12px">{{total_records}}</td></tr>
      <tr><td style="padding:8px 12px;font-weight:bold">Généré le</td><td style="padding:8px 12px">{{generated_at}}</td></tr>
    </table>
    <p style="color:#64748b;font-size:13px">Le rapport PDF est joint à cet email.</p>
  </div>
  <div style="background:#1e3a5f;color:white;padding:12px 24px;border-radius:0 0 8px 8px;font-size:12px;text-align:center">
    RT Connect — Système de Gestion de Présence
  </div>
</div>""",

    'monthly_day': """<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
  <div style="background:#1e3a5f;color:white;padding:24px;border-radius:8px 8px 0 0">
    <h2 style="margin:0">📊 Rapport Mensuel</h2>
    <p style="margin:4px 0 0;opacity:.8">{{company_name}} — {{month_name}} {{year}}</p>
  </div>
  <div style="background:#f8fafc;padding:24px;border:1px solid #e2e8f0;border-top:none">
    <p>Bonjour,</p>
    <p>Veuillez trouver ci-joint le rapport de présence du mois de <strong>{{month_name}} {{year}}</strong>.</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0">
      <tr style="background:#e2e8f0"><td style="padding:8px 12px;font-weight:bold">Période</td><td style="padding:8px 12px">{{period_label}}</td></tr>
      <tr><td style="padding:8px 12px;font-weight:bold">Employés</td><td style="padding:8px 12px">{{total_employees}}</td></tr>
      <tr style="background:#e2e8f0"><td style="padding:8px 12px;font-weight:bold">Enregistrements</td><td style="padding:8px 12px">{{total_records}}</td></tr>
      <tr><td style="padding:8px 12px;font-weight:bold">Généré le</td><td style="padding:8px 12px">{{generated_at}}</td></tr>
    </table>
    <p style="color:#64748b;font-size:13px">Le rapport PDF est joint à cet email.</p>
  </div>
  <div style="background:#1e3a5f;color:white;padding:12px 24px;border-radius:0 0 8px 8px;font-size:12px;text-align:center">
    RT Connect — Système de Gestion de Présence
  </div>
</div>""",
}
DEFAULT_BODIES['monthly_last'] = DEFAULT_BODIES['monthly_day']


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class ScheduleIn(BaseModel):
    name:          str
    is_active:     bool = True
    schedule_type: str  = 'daily'
    send_hour:     int  = 20
    send_minute:   int  = 0
    week_day:      Optional[int] = None
    month_day:     Optional[int] = None
    data_period:   str  = 'yesterday'
    device_ids:    Optional[List[str]] = None
    company_id:    Optional[int] = None
    department_id: Optional[int] = None
    language:      str  = 'fr'
    group_by:      str  = 'employee'
    email_subject: Optional[str] = None
    email_body:    Optional[str] = None
    recipients:    List[str] = []


class ScheduleOut(BaseModel):
    id:            int
    name:          str
    is_active:     bool
    schedule_type: str
    send_hour:     int
    send_minute:   int
    week_day:      Optional[int]
    month_day:     Optional[int]
    data_period:   str
    device_ids:    Optional[List[str]]
    company_id:    Optional[int]
    department_id: Optional[int]
    language:      str
    group_by:      str
    email_subject: Optional[str]
    email_body:    Optional[str]
    recipients:    List[str]
    last_run_at:   Optional[datetime]
    next_run_at:   Optional[datetime]
    created_at:    datetime


class LogOut(BaseModel):
    id:               int
    executed_at:      datetime
    status:           str
    error_message:    Optional[str]
    recipients_count: int
    period_start:     Optional[datetime]
    period_end:       Optional[datetime]


def _to_out(s: ReportSchedule) -> ScheduleOut:
    return ScheduleOut(
        id=s.id, name=s.name, is_active=s.is_active,
        schedule_type=s.schedule_type,
        send_hour=s.send_hour, send_minute=s.send_minute,
        week_day=s.week_day, month_day=s.month_day,
        data_period=s.data_period,
        device_ids=json.loads(s.device_ids) if s.device_ids else None,
        company_id=s.company_id, department_id=s.department_id,
        language=s.language,
        group_by=s.group_by or 'employee',
        email_subject=s.email_subject,
        email_body=s.email_body,
        recipients=json.loads(s.recipients) if s.recipients else [],
        last_run_at=s.last_run_at,
        next_run_at=s.next_run_at,
        created_at=s.created_at,
    )


def _apply(row: ReportSchedule, p: ScheduleIn):
    row.name          = p.name
    row.is_active     = p.is_active
    row.schedule_type = p.schedule_type
    row.send_hour     = max(0, min(23, p.send_hour))
    row.send_minute   = max(0, min(59, p.send_minute))
    row.week_day      = p.week_day
    row.month_day     = p.month_day
    row.data_period   = p.data_period
    row.device_ids    = json.dumps(p.device_ids) if p.device_ids is not None else None
    row.company_id    = p.company_id
    row.department_id = p.department_id
    row.language      = p.language
    row.group_by      = p.group_by or 'employee'
    row.email_subject = p.email_subject or DEFAULT_SUBJECTS.get(p.schedule_type, '')
    row.email_body    = p.email_body    or DEFAULT_BODIES.get(p.schedule_type, '')
    row.recipients    = json.dumps(p.recipients)
    row.next_run_at   = _calc_next(row)


# ── next_run_at calculation ───────────────────────────────────────────────────

def _calc_next(s: ReportSchedule, after: datetime | None = None) -> datetime:
    """Return the next UTC datetime this schedule should fire.

    send_hour / send_minute are interpreted as the **server's local timezone**
    (the user enters them in their UI, which they think of as local). We compute
    the next firing time in local time, then convert to UTC for storage.
    """
    now_utc   = after or datetime.now(timezone.utc)
    now_local = now_utc.astimezone()  # naive-ish but tz-aware in local TZ
    h, m      = s.send_hour, s.send_minute

    def to_utc(local_dt: datetime) -> datetime:
        return local_dt.astimezone(timezone.utc)

    if s.schedule_type == 'daily':
        candidate = now_local.replace(hour=h, minute=m, second=0, microsecond=0)
        if candidate <= now_local:
            candidate += timedelta(days=1)
        return to_utc(candidate)

    if s.schedule_type == 'weekly':
        wd = s.week_day or 0  # 0=Mon
        days_ahead = (wd - now_local.weekday()) % 7
        if days_ahead == 0:
            candidate = now_local.replace(hour=h, minute=m, second=0, microsecond=0)
            if candidate <= now_local:
                days_ahead = 7
            else:
                return to_utc(candidate)
        candidate = (now_local + timedelta(days=days_ahead)).replace(
            hour=h, minute=m, second=0, microsecond=0
        )
        return to_utc(candidate)

    if s.schedule_type == 'monthly_day':
        md = max(1, min(28, s.month_day or 1))
        candidate = now_local.replace(day=md, hour=h, minute=m, second=0, microsecond=0)
        if candidate <= now_local:
            if now_local.month == 12:
                candidate = candidate.replace(year=now_local.year + 1, month=1)
            else:
                candidate = candidate.replace(month=now_local.month + 1)
        return to_utc(candidate)

    if s.schedule_type == 'monthly_last':
        last = calendar.monthrange(now_local.year, now_local.month)[1]
        candidate = now_local.replace(day=last, hour=h, minute=m, second=0, microsecond=0)
        if candidate <= now_local:
            if now_local.month == 12:
                yr, mo = now_local.year + 1, 1
            else:
                yr, mo = now_local.year, now_local.month + 1
            last = calendar.monthrange(yr, mo)[1]
            candidate = candidate.replace(year=yr, month=mo, day=last)
        return to_utc(candidate)

    return now_utc + timedelta(days=1)


# ── CRUD endpoints ────────────────────────────────────────────────────────────

@router.get('/report-schedules', response_model=List[ScheduleOut],
            dependencies=[Depends(require_permission('roles.manage'))])
def list_schedules():
    with get_db_session() as db:
        rows = db.query(ReportSchedule).order_by(ReportSchedule.created_at).all()
        return [_to_out(r) for r in rows]


@router.post('/report-schedules', response_model=ScheduleOut, status_code=201,
             dependencies=[Depends(require_permission('roles.manage'))])
def create_schedule(payload: ScheduleIn):
    with get_db_session() as db:
        row = ReportSchedule()
        _apply(row, payload)
        db.add(row)
        db.commit()
        db.refresh(row)
        return _to_out(row)


@router.get('/report-schedules/{sid}', response_model=ScheduleOut,
            dependencies=[Depends(require_permission('roles.manage'))])
def get_schedule(sid: int):
    with get_db_session() as db:
        row = db.query(ReportSchedule).filter(ReportSchedule.id == sid).first()
        if not row:
            raise HTTPException(404, 'Schedule not found')
        return _to_out(row)


@router.put('/report-schedules/{sid}', response_model=ScheduleOut,
            dependencies=[Depends(require_permission('roles.manage'))])
def update_schedule(sid: int, payload: ScheduleIn):
    with get_db_session() as db:
        row = db.query(ReportSchedule).filter(ReportSchedule.id == sid).first()
        if not row:
            raise HTTPException(404, 'Schedule not found')
        _apply(row, payload)
        db.commit()
        db.refresh(row)
        return _to_out(row)


@router.delete('/report-schedules/{sid}', status_code=204,
               dependencies=[Depends(require_permission('roles.manage'))])
def delete_schedule(sid: int):
    with get_db_session() as db:
        row = db.query(ReportSchedule).filter(ReportSchedule.id == sid).first()
        if not row:
            raise HTTPException(404, 'Schedule not found')
        db.delete(row)
        db.commit()


@router.patch('/report-schedules/{sid}/toggle', response_model=ScheduleOut,
              dependencies=[Depends(require_permission('roles.manage'))])
def toggle_schedule(sid: int):
    with get_db_session() as db:
        row = db.query(ReportSchedule).filter(ReportSchedule.id == sid).first()
        if not row:
            raise HTTPException(404, 'Schedule not found')
        row.is_active = not row.is_active
        if row.is_active:
            row.next_run_at = _calc_next(row)
        db.commit()
        db.refresh(row)
        return _to_out(row)


@router.get('/report-schedules/{sid}/logs', response_model=List[LogOut],
            dependencies=[Depends(require_permission('roles.manage'))])
def get_logs(sid: int):
    with get_db_session() as db:
        rows = (db.query(ReportScheduleLog)
                .filter(ReportScheduleLog.schedule_id == sid)
                .order_by(ReportScheduleLog.executed_at.desc())
                .limit(50).all())
        return [LogOut(
            id=r.id, executed_at=r.executed_at, status=r.status,
            error_message=r.error_message, recipients_count=r.recipients_count,
            period_start=r.period_start, period_end=r.period_end,
        ) for r in rows]


@router.post('/report-schedules/{sid}/run-now',
             dependencies=[Depends(require_permission('roles.manage'))])
def run_now(sid: int):
    """Manually trigger a schedule immediately."""
    from app.services.scheduler import run_schedule
    with get_db_session() as db:
        row = db.query(ReportSchedule).filter(ReportSchedule.id == sid).first()
        if not row:
            raise HTTPException(404, 'Schedule not found')
    # run_schedule raises RuntimeError on pre-flight failures or send errors;
    # surface the message directly so the frontend can show it.
    try:
        result = run_schedule(sid)
        return {'ok': True, 'detail': f'Envoyé à {result["recipients"]} destinataire(s)'}
    except RuntimeError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get('/report-schedules/defaults/templates',
            dependencies=[Depends(require_permission('roles.manage'))])
def get_default_templates():
    """Return default subject+body for each schedule type."""
    return {
        t: {'subject': DEFAULT_SUBJECTS.get(t, ''), 'body': DEFAULT_BODIES.get(t, '')}
        for t in ('daily', 'weekly', 'monthly_day', 'monthly_last')
    }
