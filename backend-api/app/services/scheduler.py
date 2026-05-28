"""Background scheduler for automated email reports.

A daemon thread wakes up every 60 seconds, finds schedules whose
next_run_at has passed, generates a PDF and emails it.
"""
import io
import json
import logging
import threading
import calendar
from datetime import datetime, timezone, timedelta, date

logger = logging.getLogger(__name__)

_thread: threading.Thread | None = None
_stop_event = threading.Event()

FRENCH_MONTHS = [
    '', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
]
ENGLISH_MONTHS = [
    '', 'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
]
ARABIC_MONTHS = [
    '', 'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
    'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
]


def _month_name(month: int, lang: str) -> str:
    if lang == 'ar':
        return ARABIC_MONTHS[month]
    if lang == 'en':
        return ENGLISH_MONTHS[month]
    return FRENCH_MONTHS[month]


def _fmt_date(d: date, lang: str = 'fr') -> str:
    if lang == 'en':
        return d.strftime('%m/%d/%Y')
    return d.strftime('%d/%m/%Y')


def _calc_period(data_period: str, ref: datetime) -> tuple[date, date]:
    """Return (start_date, end_date) for a given data_period token.

    `ref` is a UTC datetime; we convert to server local time so that
    'yesterday' means the user's local yesterday, not UTC's yesterday.
    Attendance timestamps are stored as device local time, so the date
    comparison must also be local.
    """
    today = ref.astimezone().date()

    if data_period == 'today':
        return today, today

    if data_period == 'yesterday':
        d = today - timedelta(days=1)
        return d, d

    if data_period == 'current_week':
        monday = today - timedelta(days=today.weekday())
        return monday, today

    if data_period == 'last_week':
        monday = today - timedelta(days=today.weekday() + 7)
        sunday = monday + timedelta(days=6)
        return monday, sunday

    if data_period == 'current_month':
        return today.replace(day=1), today

    if data_period == 'last_month':
        first_this = today.replace(day=1)
        last_of_prev = first_this - timedelta(days=1)
        first_of_prev = last_of_prev.replace(day=1)
        return first_of_prev, last_of_prev

    # Fallback
    return today, today


def _render_template(template: str, variables: dict) -> str:
    """Replace {{key}} placeholders in a template string."""
    result = template
    for key, value in variables.items():
        result = result.replace('{{' + key + '}}', str(value))
    return result


def _build_variables(schedule, start: date, end: date, lang: str,
                     total_employees: int, total_records: int) -> dict:
    now = datetime.now(timezone.utc)
    fmt = lambda d: _fmt_date(d, lang)

    vars_ = {
        'company_name':     'RT Connect',
        'period_label':     f'{fmt(start)} — {fmt(end)}',
        'total_employees':  str(total_employees),
        'total_records':    str(total_records),
        'generated_at':     now.strftime('%d/%m/%Y %H:%M'),
        'send_date':        fmt(now.date()),
        'report_date':      fmt(start),
        'week_start':       fmt(start),
        'week_end':         fmt(end),
        'month_name':       _month_name(start.month, lang),
        'year':             str(start.year),
    }

    # Try to load company name from DB
    try:
        from app.database.connection import get_db_session
        from app.database.schema import Company
        with get_db_session() as db:
            company = None
            if getattr(schedule, 'company_id', None):
                company = db.query(Company).filter(Company.id == schedule.company_id).first()
            else:
                company = db.query(Company).first()
            if company:
                vars_['company_name'] = company.name
    except Exception:
        pass

    return vars_


def _generate_pdf(schedule, start: date, end: date) -> tuple[bytes, int, int]:
    """Generate PDF report bytes + stats for a schedule."""
    from app.api.reports import _attendance_pdf_bytes, _attendance_counts

    device_ids_list = None
    if schedule.device_ids:
        try:
            device_ids_list = json.loads(schedule.device_ids)
        except Exception:
            pass

    # Use first device_id for the PDF filter if only one device selected
    device_id_param = device_ids_list[0] if device_ids_list and len(device_ids_list) == 1 else None

    group_by = getattr(schedule, 'group_by', 'employee') or 'employee'
    if group_by == 'none':
        group_by = ''

    pdf_bytes = _attendance_pdf_bytes(
        start_date=str(start),
        end_date=str(end),
        lang=schedule.language or 'fr',
        device_id=device_id_param,
        group_by=group_by,
    )

    total_emp, total_rec = _attendance_counts(
        start_date=str(start),
        end_date=str(end),
        company_id=schedule.company_id,
        department_id=schedule.department_id,
        device_ids=device_ids_list,
    )

    return pdf_bytes, total_emp, total_rec


def _auto_sync_devices(device_ids: list | None) -> None:
    """Sync devices before report generation.

    - If `device_ids` is provided, sync only those.
    - If None, sync all active devices in the device store.
    Each device's session is opened and closed inside _sync_device_blocking,
    so devices remain reachable between syncs and on failure.
    Failures are logged, not raised — we still send the report with whatever
    data is in the DB.
    """
    try:
        from app.services.sync_service import sync_service
        from app.services.device_store import device_store

        if device_ids:
            target_ids = list(device_ids)
        else:
            target_ids = [d.id for d in device_store.get_all()]

        if not target_ids:
            logger.info('[Auto-sync] No devices to sync')
            return

        logger.info(f'[Auto-sync] Syncing {len(target_ids)} device(s) before report')
        for dev_id in target_ids:
            try:
                sync_service._sync_device_blocking(dev_id)
                logger.info(f'[Auto-sync] Device {dev_id} synced')
            except Exception as e:
                logger.warning(f'[Auto-sync] Device {dev_id} sync failed: {e}')
    except Exception as e:
        logger.error(f'[Auto-sync] Unexpected error: {e}')


def run_schedule(schedule_id: int) -> dict:
    """Execute one schedule: generate PDF and send emails.

    Returns {'ok': True} on success or raises RuntimeError with a
    human-readable message on any pre-flight or send failure.
    Called by the scheduler loop and the run-now HTTP endpoint.
    """
    from app.database.connection import get_db_session
    from app.database.schema import ReportSchedule, ReportScheduleLog, EmailSettings
    from app.api.email_settings import _send_email
    from app.api.report_schedules import _calc_next

    now = datetime.now(timezone.utc)

    # ── Load schedule + email config inside one session ──────────────────────
    # All attributes must be read here — accessing columns on a detached
    # SQLAlchemy object after the session closes raises DetachedInstanceError.
    with get_db_session() as db:
        schedule = db.query(ReportSchedule).filter(ReportSchedule.id == schedule_id).first()
        if not schedule:
            raise RuntimeError(f'Schedule {schedule_id} not found')

        email_row = db.query(EmailSettings).first()

        # Snapshot everything we need from both rows
        sched_snap = dict(
            name=schedule.name,
            data_period=schedule.data_period,
            language=schedule.language or 'fr',
            group_by=schedule.group_by or 'employee',
            email_subject=schedule.email_subject,
            email_body=schedule.email_body,
            recipients=json.loads(schedule.recipients) if schedule.recipients else [],
            device_ids=json.loads(schedule.device_ids) if schedule.device_ids else None,
            company_id=schedule.company_id,
            department_id=schedule.department_id,
        )
        if email_row:
            email_snap = dict(
                is_enabled=email_row.is_enabled,
                host=email_row.host,
                port=email_row.port,
                username=email_row.username,
                password=email_row.password,
                use_tls=email_row.use_tls,
                use_ssl=email_row.use_ssl,
                from_name=email_row.from_name,
                from_address=email_row.from_address,
            )
        else:
            email_snap = None

    # ── Pre-flight checks ────────────────────────────────────────────────────
    if not email_snap or not email_snap.get('is_enabled'):
        raise RuntimeError(
            'Email SMTP non activé — activez-le dans Paramètres → Email SMTP'
        )
    if not email_snap.get('host') or not email_snap.get('from_address'):
        raise RuntimeError(
            'Configuration SMTP incomplète — vérifiez l\'hôte et l\'adresse expéditeur'
        )
    if not sched_snap['recipients']:
        raise RuntimeError(
            'Aucun destinataire configuré dans ce programme'
        )

    # ── Build a plain smtp_cfg object from the snapshot ──────────────────────
    class _Cfg:
        pass
    smtp_cfg = _Cfg()
    for k, v in email_snap.items():
        setattr(smtp_cfg, k, v)

    start, end = _calc_period(sched_snap['data_period'], now)

    logger.info(
        f"[Schedule {schedule_id}] '{sched_snap['name']}' running "
        f"period={sched_snap['data_period']} → {start}..{end} "
        f"filters: device_ids={sched_snap['device_ids']} "
        f"company_id={sched_snap['company_id']} department_id={sched_snap['department_id']} "
        f"group_by={sched_snap['group_by']}"
    )

    log_entry = ReportScheduleLog(
        schedule_id=schedule_id,
        executed_at=now,
        period_start=datetime.combine(start, datetime.min.time()).replace(tzinfo=timezone.utc),
        period_end=datetime.combine(end, datetime.min.time()).replace(tzinfo=timezone.utc),
    )

    # ── Auto-sync relevant devices before generating the report ─────────────
    # Sync is normally manual, but for scheduled reports we open a session,
    # pull the latest logs, and close it — so the latest data is in the DB
    # before we query. Each device's session opens/closes per device, so
    # other users / devices remain reachable between syncs.
    _auto_sync_devices(sched_snap['device_ids'])

    error_msg = None
    try:
        # Build a lightweight object that _generate_pdf expects
        class _SchedProxy:
            pass
        sp = _SchedProxy()
        sp.device_ids    = json.dumps(sched_snap['device_ids']) if sched_snap['device_ids'] else None
        sp.company_id    = sched_snap['company_id']
        sp.department_id = sched_snap['department_id']
        sp.language      = sched_snap['language']
        sp.group_by      = sched_snap.get('group_by', 'employee')

        pdf_bytes, total_emp, total_rec = _generate_pdf(sp, start, end)

        logger.info(
            f"[Schedule {schedule_id}] query result: "
            f"total_employees={total_emp} total_records={total_rec} "
            f"pdf_size={len(pdf_bytes)} bytes"
        )

        variables = _build_variables(sp, start, end, sched_snap['language'], total_emp, total_rec)

        subject = _render_template(
            sched_snap['email_subject'] or 'Rapport de présence — {{period_label}}',
            variables,
        )
        body = _render_template(
            sched_snap['email_body'] or '<p>Rapport en pièce jointe.</p>',
            variables,
        )

        pdf_filename = f'rapport_{start.strftime("%Y%m%d")}_{end.strftime("%Y%m%d")}.pdf'

        _send_email(
            smtp_cfg=smtp_cfg,
            to_list=sched_snap['recipients'],
            subject=subject,
            html_body=body,
            pdf_bytes=pdf_bytes,
            pdf_filename=pdf_filename,
        )

        log_entry.status           = 'success'
        log_entry.recipients_count = len(sched_snap['recipients'])
        logger.info(f'Schedule {schedule_id} sent to {len(sched_snap["recipients"])} recipients ({start}→{end})')

    except Exception as exc:
        error_msg                = str(exc)
        log_entry.status         = 'failed'
        log_entry.error_message  = error_msg
        logger.error(f'Schedule {schedule_id} failed: {exc}')

    # ── Persist log + update timestamps ─────────────────────────────────────
    with get_db_session() as db:
        db.add(log_entry)
        sched = db.query(ReportSchedule).filter(ReportSchedule.id == schedule_id).first()
        if sched:
            sched.last_run_at = now
            sched.next_run_at = _calc_next(sched, after=now)
        db.commit()

    if error_msg:
        raise RuntimeError(error_msg)

    return {'ok': True, 'recipients': len(sched_snap['recipients'])}


def _scheduler_loop():
    logger.info('Scheduler thread started')
    while not _stop_event.is_set():
        try:
            _tick()
        except Exception as exc:
            logger.error(f'Scheduler tick error: {exc}')
        _stop_event.wait(60)   # sleep 60 s between ticks
    logger.info('Scheduler thread stopped')


def _tick():
    """Find due schedules and run them.

    We advance `next_run_at` to a tentative future value BEFORE the run
    starts, not just after it. If the loop body takes longer than a single
    tick (slow PDF, slow SMTP), the next tick used to re-select the same
    schedule because next_run_at had not moved — duplicate-fire bug. The
    advance is provisional: `run_schedule` recomputes the canonical
    next_run_at at the end based on the actual finish time.
    """
    from app.database.connection import get_db_session
    from app.database.schema import ReportSchedule
    from app.api.report_schedules import _calc_next

    now = datetime.now(timezone.utc)
    ids: list[int] = []
    with get_db_session() as db:
        due = (db.query(ReportSchedule)
               .filter(ReportSchedule.is_active == True,
                       ReportSchedule.next_run_at <= now)
               .all())
        for s in due:
            ids.append(s.id)
            # Provisional bump: push next_run_at out by one full cadence so
            # the next tick will not pick this row again while it's running.
            # run_schedule overwrites this with the canonical value when it
            # finishes (success or failure).
            try:
                s.next_run_at = _calc_next(s, after=now)
            except Exception as exc:
                logger.warning(f"schedule {s.id} provisional bump failed: {exc}")
        if ids:
            db.commit()

    for sid in ids:
        try:
            run_schedule(sid)
        except Exception as exc:
            logger.error(f'run_schedule({sid}) raised: {exc}')


def start():
    global _thread
    if _thread and _thread.is_alive():
        return
    _stop_event.clear()
    _thread = threading.Thread(target=_scheduler_loop, daemon=True, name='report-scheduler')
    _thread.start()


def stop():
    _stop_event.set()
