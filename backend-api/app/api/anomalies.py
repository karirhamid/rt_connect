from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
from sqlalchemy import desc

from app.database.connection import get_db_session
from app.database.schema import Anomaly, Employee, Device
from app.core.security import get_current_user, require_any_permission, MANAGER_PERMS

router = APIRouter()

# Anomaly inbox is a management feature — not for plain reporting users.
_require_manager = require_any_permission(*MANAGER_PERMS)


class ResolveBody(BaseModel):
    status: str  # ack | ignored | resolved
    note: Optional[str] = None


@router.get("/anomalies")
def list_anomalies(
    status: str = Query("open"),
    kind: Optional[str] = None,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    current=Depends(_require_manager),
):
    with get_db_session() as db:
        q = db.query(Anomaly)
        if status and status != "all":
            q = q.filter(Anomaly.status == status)
        if kind:
            q = q.filter(Anomaly.kind == kind)
        total = q.count()
        rows = q.order_by(desc(Anomaly.id)).offset(offset).limit(limit).all()
        # Eager fetch employee/device names
        emp_ids = list({r.employee_id for r in rows if r.employee_id})
        dev_ids = list({r.device_id for r in rows if r.device_id})
        emp_map = {e.id: e.name for e in db.query(Employee).filter(Employee.id.in_(emp_ids)).all()} if emp_ids else {}
        dev_map = {d.id: d.name for d in db.query(Device).filter(Device.id.in_(dev_ids)).all()} if dev_ids else {}
        return {
            "total": total,
            "items": [{
                "id": r.id,
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "kind": r.kind,
                "severity": r.severity,
                "status": r.status,
                "attendance_id": r.attendance_id,
                "employee_id": r.employee_id,
                "employee_name": emp_map.get(r.employee_id),
                "device_id": r.device_id,
                "device_name": dev_map.get(r.device_id),
                "day": r.day.date().isoformat() if r.day else None,
                "detail": r.detail,
                "resolution_note": r.resolution_note,
            } for r in rows],
        }


@router.get("/anomalies/summary")
def summary(current=Depends(_require_manager)):
    """Counts per kind for the open anomalies — used for sidebar badge."""
    from sqlalchemy import func
    with get_db_session() as db:
        rows = db.query(Anomaly.kind, func.count(Anomaly.id)).filter(Anomaly.status == 'open').group_by(Anomaly.kind).all()
        total = sum(int(c) for _, c in rows)
        return {"open_total": total, "by_kind": {k: int(c) for k, c in rows}}


@router.put("/anomalies/{aid}")
def resolve(aid: int, body: ResolveBody, current=Depends(_require_manager)):
    if body.status not in ("ack", "ignored", "resolved", "open"):
        raise HTTPException(400, "invalid status")
    with get_db_session() as db:
        a = db.query(Anomaly).filter(Anomaly.id == aid).first()
        if not a:
            raise HTTPException(404, "anomaly not found")
        a.status = body.status
        a.resolution_note = body.note
        a.resolved_by = current.id
        a.resolved_at = datetime.now(timezone.utc)
        db.commit()
        return {"ok": True, "id": aid, "status": a.status}


@router.post("/anomalies/scan")
def trigger_scan(hours: int = Query(48, ge=1, le=720), current=Depends(_require_manager)):
    from app.services.integrity_guards import scan_recent
    counts = scan_recent(hours=hours)
    return {"scanned_hours": hours, "counts": counts}
