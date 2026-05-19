"""Employee self-service portal — matricule + PIN login, read-only views."""
from __future__ import annotations
import re
from datetime import datetime, date, timedelta, time, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Header
from pydantic import BaseModel, Field
from sqlalchemy import and_, func

from app.database.connection import get_db_session
from app.database.schema import Employee, Attendance, Department, AppSettings
from app.core.security import (
    verify_password, get_password_hash,
    create_access_token, decode_token, get_current_user, user_has_permission
)
from app.services.punch_classifier import get_employee_day_summary

router = APIRouter()


# ─── Admin: set / reset an employee PIN ────────────────────────────────────
class SetPinBody(BaseModel):
    pin: str = Field(..., min_length=4, max_length=6, pattern=r"^\d{4,6}$")


@router.put("/employees/{employee_id}/portal-pin")
def set_pin(employee_id: int, body: SetPinBody, current=Depends(get_current_user)):
    if not (user_has_permission(current, "users.write") or user_has_permission(current, "roles.manage")):
        raise HTTPException(403, "Not authorized")
    with get_db_session() as db:
        emp = db.query(Employee).filter(Employee.id == employee_id).first()
        if not emp:
            raise HTTPException(404, "employee not found")
        emp.portal_pin_hash = get_password_hash(body.pin)
        db.commit()
        return {"ok": True, "employee_id": employee_id}


@router.delete("/employees/{employee_id}/portal-pin")
def clear_pin(employee_id: int, current=Depends(get_current_user)):
    if not (user_has_permission(current, "users.write") or user_has_permission(current, "roles.manage")):
        raise HTTPException(403, "Not authorized")
    with get_db_session() as db:
        emp = db.query(Employee).filter(Employee.id == employee_id).first()
        if not emp:
            raise HTTPException(404, "employee not found")
        emp.portal_pin_hash = None
        db.commit()
        return {"ok": True}


# ─── Portal login ─────────────────────────────────────────────────────────
class PortalLoginBody(BaseModel):
    matricule: str
    pin: str


@router.post("/portal/login")
def portal_login(body: PortalLoginBody):
    """Login with matricule (Employee.user_id) + PIN. Returns short-lived JWT."""
    if not re.fullmatch(r"\d{4,6}", body.pin):
        raise HTTPException(401, "Invalid credentials")
    with get_db_session() as db:
        # In shared mode there can be multiple Employee rows per user_id
        # (one per device). Any of them with a PIN that matches is fine.
        cands = db.query(Employee).filter(Employee.user_id == body.matricule).all()
        matched = next((e for e in cands if e.portal_pin_hash and verify_password(body.pin, e.portal_pin_hash)), None)
        if not matched:
            raise HTTPException(401, "Invalid credentials")
        token = create_access_token(
            data={"sub": f"emp:{matched.id}", "type": "portal", "matricule": matched.user_id},
            expires_delta=timedelta(hours=12),
        )
        return {
            "access_token": token,
            "token_type": "bearer",
            "employee": {
                "id": matched.id,
                "matricule": matched.user_id,
                "name": matched.name,
            },
        }


# ─── Portal endpoints (token in Authorization header) ─────────────────────
def _require_portal(authorization: Optional[str] = Header(None)) -> Employee:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Missing token")
    payload = decode_token(authorization.split(" ", 1)[1].strip())
    if not payload or payload.get("type") != "portal":
        raise HTTPException(401, "Invalid token")
    sub = payload.get("sub") or ""
    if not sub.startswith("emp:"):
        raise HTTPException(401, "Invalid token")
    try:
        emp_id = int(sub.split(":", 1)[1])
    except ValueError:
        raise HTTPException(401, "Invalid token")
    with get_db_session() as db:
        e = db.query(Employee).filter(Employee.id == emp_id).first()
        if not e:
            raise HTTPException(401, "Employee not found")
        # snapshot needed fields outside the session
        return {
            "id": e.id, "name": e.name, "matricule": e.user_id,
            "department_id": e.department_id, "user_id": e.user_id,
        }


@router.get("/portal/me")
def portal_me(me=Depends(_require_portal)):
    with get_db_session() as db:
        dep = db.query(Department).filter(Department.id == me["department_id"]).first() if me["department_id"] else None
        return {
            "id": me["id"], "name": me["name"], "matricule": me["matricule"],
            "department": dep.name if dep else None,
        }


@router.get("/portal/punches")
def portal_punches(start_date: str, end_date: str, me=Depends(_require_portal)):
    try:
        s = datetime.strptime(start_date, "%Y-%m-%d")
        e = datetime.combine(datetime.strptime(end_date, "%Y-%m-%d").date(), time.max)
    except ValueError:
        raise HTTPException(400, "Invalid date")

    with get_db_session() as db:
        # Shared employee mode: pull punches from all Employee rows with same user_id
        settings = db.query(AppSettings).first()
        shared = (getattr(settings, 'employee_mode', None) or 'shared') == 'shared'
        if shared:
            emp_ids = [pk for (pk,) in db.query(Employee.id).filter(Employee.user_id == me["matricule"]).all()]
        else:
            emp_ids = [me["id"]]

        rows = (db.query(Attendance)
                  .filter(Attendance.employee_id.in_(emp_ids))
                  .filter(Attendance.timestamp >= s)
                  .filter(Attendance.timestamp <= e)
                  .filter(Attendance.voided_by_correction_id.is_(None))
                  .order_by(Attendance.timestamp.asc())
                  .all())
        return [{
            "id": r.id,
            "timestamp": r.timestamp.isoformat() if r.timestamp else None,
            "punch": r.punch,
            "source": r.source,
        } for r in rows]


@router.get("/portal/month-summary")
def portal_month(year: int, month: int, me=Depends(_require_portal)):
    if not (1 <= month <= 12):
        raise HTTPException(400, "Invalid month")
    start_d = date(year, month, 1)
    end_d = (date(year + (month == 12), (month % 12) + 1, 1) - timedelta(days=1))

    with get_db_session() as db:
        settings = db.query(AppSettings).first()
        shared = (getattr(settings, 'employee_mode', None) or 'shared') == 'shared'
        if shared:
            emp_ids = [pk for (pk,) in db.query(Employee.id).filter(Employee.user_id == me["matricule"]).all()]
        else:
            emp_ids = [me["id"]]

        # Days where employee punched
        days = (db.query(func.date(Attendance.timestamp).label("d"))
                  .filter(Attendance.employee_id.in_(emp_ids))
                  .filter(Attendance.timestamp >= datetime.combine(start_d, time.min))
                  .filter(Attendance.timestamp <= datetime.combine(end_d, time.max))
                  .filter(Attendance.voided_by_correction_id.is_(None))
                  .group_by(func.date(Attendance.timestamp)).all())

        totals = {"days": 0, "worked": 0, "overtime": 0, "late": 0, "early": 0}
        per_day = []
        for (d,) in days:
            s = get_employee_day_summary(db, emp_ids[0], d, employee_ids=emp_ids if shared else None) or {}
            totals["days"] += 1
            totals["worked"]   += int(s.get("total_minutes") or 0)
            totals["overtime"] += int(s.get("overtime_minutes") or 0)
            totals["late"]     += int(s.get("late_minutes") or 0)
            totals["early"]    += int(s.get("early_departure_minutes") or 0)
            per_day.append({"date": d.isoformat() if hasattr(d, "isoformat") else str(d), **{k: int(s.get(k) or 0) for k in (
                "total_minutes", "overtime_minutes", "late_minutes", "early_departure_minutes")}})

        return {"year": year, "month": month, "totals": totals, "per_day": per_day}
