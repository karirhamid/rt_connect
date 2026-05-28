"""Send a one-off scheduled report for a specific date.

Runs the same code path as the scheduler (run_schedule) but forces the
period to a single date you pass on the CLI. Useful for re-sending
yesterday's report when proving out the holiday banner or any other
change.

Usage (inside the backend container):
    python scripts/send_report_for_date.py <SCHEDULE_ID> <YYYY-MM-DD> [<END_YYYY-MM-DD>]

Example:
    python scripts/send_report_for_date.py 2 2026-05-27
"""
import json
import sys
from datetime import date, datetime, timezone

# Bootstrap path so 'app' is importable when run with `python scripts/...`
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database.connection import get_db_session
from app.database.schema import ReportSchedule, EmailSettings, ReportScheduleLog
from app.services.scheduler import (
    _generate_pdf, _build_variables, _render_template, _auto_sync_devices,
)
from app.api.email_settings import _send_email


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(2)

    sid = int(sys.argv[1])
    start = datetime.strptime(sys.argv[2], "%Y-%m-%d").date()
    end = datetime.strptime(sys.argv[3], "%Y-%m-%d").date() if len(sys.argv) > 3 else start

    with get_db_session() as db:
        sched = db.query(ReportSchedule).filter(ReportSchedule.id == sid).first()
        if not sched:
            print(f"Schedule {sid} not found"); sys.exit(1)
        email = db.query(EmailSettings).first()
        if not email or not email.is_enabled:
            print("SMTP not enabled — configure /settings/email first"); sys.exit(1)

        snap = dict(
            name=sched.name, language=sched.language or 'fr',
            group_by=sched.group_by or 'employee',
            email_subject=sched.email_subject, email_body=sched.email_body,
            recipients=json.loads(sched.recipients) if sched.recipients else [],
            device_ids=json.loads(sched.device_ids) if sched.device_ids else None,
            company_id=sched.company_id, department_id=sched.department_id,
        )
        cfg_snap = {c.name: getattr(email, c.name) for c in EmailSettings.__table__.columns}

    if not snap['recipients']:
        print("No recipients on this schedule"); sys.exit(1)

    class _Cfg: ...
    smtp_cfg = _Cfg()
    for k, v in cfg_snap.items():
        setattr(smtp_cfg, k, v)

    _auto_sync_devices(snap['device_ids'])

    class _Proxy: ...
    sp = _Proxy()
    sp.device_ids = json.dumps(snap['device_ids']) if snap['device_ids'] else None
    sp.company_id = snap['company_id']
    sp.department_id = snap['department_id']
    sp.language = snap['language']
    sp.group_by = snap['group_by']

    pdf_bytes, total_emp, total_rec = _generate_pdf(sp, start, end)
    variables = _build_variables(sp, start, end, snap['language'], total_emp, total_rec)
    subject = _render_template(snap['email_subject'] or 'Rapport — {{period_label}}', variables)
    body = _render_template(snap['email_body'] or '<p>Rapport en pièce jointe.</p>', variables)
    fname = f'rapport_test_{start.strftime("%Y%m%d")}_{end.strftime("%Y%m%d")}.pdf'

    _send_email(smtp_cfg=smtp_cfg, to_list=snap['recipients'],
                subject=subject, html_body=body,
                pdf_bytes=pdf_bytes, pdf_filename=fname)

    # Log it the same way the scheduler does
    with get_db_session() as db:
        db.add(ReportScheduleLog(
            schedule_id=sid,
            executed_at=datetime.now(timezone.utc),
            period_start=datetime.combine(start, datetime.min.time()).replace(tzinfo=timezone.utc),
            period_end=datetime.combine(end, datetime.min.time()).replace(tzinfo=timezone.utc),
            status='success', recipients_count=len(snap['recipients']),
            error_message='[manual test send]',
        ))
        db.commit()

    print(f"OK — sent '{subject}' to {len(snap['recipients'])} recipient(s) "
          f"(employees={total_emp}, records={total_rec}, period={start}..{end})")


if __name__ == '__main__':
    main()
