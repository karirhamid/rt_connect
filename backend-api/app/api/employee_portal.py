"""Employee self-service portal — matricule + password login, read-only views.

Initial password = employee first name (case-insensitive).
On first login, employee MUST change the password. After that, only the
bcrypt-hashed password is valid.
"""
from __future__ import annotations
import re
from datetime import datetime, date, timedelta, time, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Header
from pydantic import BaseModel, Field
from sqlalchemy import and_, func

from app.database.connection import get_db_session, get_portal_db_session
from app.database.schema import Employee, Attendance, Department, AppSettings
from app.core.security import (
    verify_password, get_password_hash,
    decode_token, get_current_user, user_has_permission,
    SECRET_KEY, ALGORITHM,
)
from jose import jwt
from app.services.punch_classifier import get_employee_day_summary

router = APIRouter()


# Brute-force protection — after MAX_PORTAL_ATTEMPTS consecutive failed
# passwords for a matricule, the row(s) are locked for PORTAL_LOCKOUT_MINUTES.
# Conservative defaults — same shape as most banking portals. Tunable later
# via env if anyone hits the lockout in normal use.
import os as _os
MAX_PORTAL_ATTEMPTS    = int(_os.getenv('MAX_PORTAL_ATTEMPTS', '5'))
PORTAL_LOCKOUT_MINUTES = int(_os.getenv('PORTAL_LOCKOUT_MINUTES', '15'))


def _first_name(full_name: str) -> str:
    """Return the first word of the full name, normalized for compare."""
    if not full_name:
        return ""
    return full_name.strip().split()[0]


def _require_portal_enabled():
    """Raise 503 if the portal feature flag is off. Checked on every portal request."""
    with get_portal_db_session() as db:
        s = db.query(AppSettings).first()
        if not s or not bool(getattr(s, 'portal_enabled', False)):
            raise HTTPException(status_code=503, detail="L'espace employé est désactivé par l'administrateur.")


@router.get("/portal/enabled")
def portal_enabled_flag():
    """Public probe — lets the portal-login page show a friendly disabled message."""
    try:
        with get_portal_db_session() as db:
            s = db.query(AppSettings).first()
            return {"enabled": bool(getattr(s, 'portal_enabled', False)) if s else False}
    except Exception:
        return {"enabled": False}


# ─── Admin: reset an employee's portal password ───────────────────────────
@router.post("/employees/{employee_id}/portal-reset")
def reset_portal_password(employee_id: int, current=Depends(get_current_user)):
    """Force the employee back to the 'first-name + must-change' state."""
    if not (user_has_permission(current, "users.write") or user_has_permission(current, "roles.manage")):
        raise HTTPException(403, "Not authorized")
    with get_db_session() as db:
        emp = db.query(Employee).filter(Employee.id == employee_id).first()
        if not emp:
            raise HTTPException(404, "employee not found")
        # Reset every Employee row that shares this matricule (shared mode = multiple rows).
        rows = db.query(Employee).filter(Employee.user_id == emp.user_id).all()
        for e in rows:
            e.portal_pin_hash = None
            e.portal_must_change_password = True
            # Admin reset also clears any brute-force lockout — without this
            # the employee would be told 'invalid credentials' even with the
            # fresh first-name password.
            e.portal_failed_attempts = 0
            e.portal_locked_until = None
        db.commit()
        return {"ok": True, "employee_id": employee_id, "initial_password_hint": _first_name(emp.name)}


# ─── Portal login ─────────────────────────────────────────────────────────
class PortalLoginBody(BaseModel):
    matricule: str
    password: str = Field(..., alias="password")

    class Config:
        populate_by_name = True


@router.post("/portal/login")
def portal_login(body: dict):
    """Login with matricule (Employee.user_id) + password.

    Accepts JSON keys `password` OR legacy `pin`.
    Initial password = first name (case-insensitive) when portal_pin_hash is null.

    Brute-force protection (added 2026-05-29 from the security audit):
      • Each wrong password increments `portal_failed_attempts` on every
        row for that matricule (shared mode replicates the matricule
        across devices — keeping the counter per row keeps the writes
        local to the candidates and lets the lockout block ANY of them).
      • After MAX_PORTAL_ATTEMPTS consecutive failures, portal_locked_until
        is set to now + PORTAL_LOCKOUT_MINUTES. While that time is in the
        future the endpoint returns 429 with a Retry-After header instead
        of even checking the password.
      • A successful login (or admin /portal-reset) zeroes both columns.
    """
    _require_portal_enabled()
    matricule = (body.get("matricule") or "").strip()
    password = (body.get("password") or body.get("pin") or "").strip()
    if not matricule or not password:
        raise HTTPException(401, "Invalid credentials")

    with get_portal_db_session() as db:
        cands = db.query(Employee).filter(Employee.user_id == matricule).all()
        if not cands:
            # Same 401 + generic message as a bad password — don't reveal
            # whether the matricule exists. No counter to bump.
            raise HTTPException(401, "Invalid credentials")

        # Reject if every alias is disabled
        if all(bool(getattr(e, 'portal_disabled', False)) for e in cands):
            raise HTTPException(403, "Portal access disabled for this employee.")

        # ── Lockout check (before we even touch the password) ─────────────
        # If ANY of the candidate rows is currently locked, refuse the
        # whole matricule. Use a naive UTC datetime to match the column.
        now_naive = datetime.utcnow()
        locked_rows = [e for e in cands
                       if e.portal_locked_until and e.portal_locked_until > now_naive]
        if locked_rows:
            until = max(e.portal_locked_until for e in locked_rows)
            retry_sec = max(1, int((until - now_naive).total_seconds()))
            raise HTTPException(
                status_code=429,
                detail=(
                    f"Trop de tentatives. Réessayez dans "
                    f"{retry_sec // 60}m {retry_sec % 60:02d}s."
                ),
                headers={"Retry-After": str(retry_sec)},
            )

        matched = None
        is_initial = False
        for e in cands:
            if getattr(e, 'portal_disabled', False):
                continue
            if e.portal_pin_hash:
                if verify_password(password, e.portal_pin_hash):
                    matched = e
                    break
            else:
                # No password set yet — accept first name (case-insensitive)
                fn = _first_name(e.name)
                if fn and password.lower() == fn.lower():
                    matched = e
                    is_initial = True
                    break

        if not matched:
            # ── Failure path: bump counter, lock if threshold crossed ────
            for e in cands:
                e.portal_failed_attempts = int(e.portal_failed_attempts or 0) + 1
                if e.portal_failed_attempts >= MAX_PORTAL_ATTEMPTS:
                    e.portal_locked_until = now_naive + timedelta(minutes=PORTAL_LOCKOUT_MINUTES)
                    e.portal_failed_attempts = 0  # reset for the next round
            db.commit()
            raise HTTPException(401, "Invalid credentials")

        # ── Success: zero the counter on EVERY alias for this matricule ──
        for e in cands:
            if e.portal_failed_attempts or e.portal_locked_until:
                e.portal_failed_attempts = 0
                e.portal_locked_until    = None
        db.commit()

        must_change = bool(getattr(matched, 'portal_must_change_password', True)) or is_initial

        token = jwt.encode(
            {
                "sub": f"emp:{matched.id}",
                "type": "portal",
                "matricule": matched.user_id,
                "exp": datetime.utcnow() + timedelta(hours=12),
            },
            SECRET_KEY, algorithm=ALGORITHM,
        )
        return {
            "access_token": token,
            "token_type": "bearer",
            "must_change_password": must_change,
            "employee": {
                "id": matched.id,
                "matricule": matched.user_id,
                "name": matched.name,
            },
        }


# ─── Change password (portal token) ───────────────────────────────────────
class ChangePasswordBody(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=6, max_length=64)


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
    with get_portal_db_session() as db:
        e = db.query(Employee).filter(Employee.id == emp_id).first()
        if not e:
            raise HTTPException(401, "Employee not found")
        if getattr(e, 'portal_disabled', False):
            raise HTTPException(403, "Portal access disabled for this employee.")
        # snapshot needed fields outside the session
        return {
            "id": e.id, "name": e.name, "matricule": e.user_id,
            "department_id": e.department_id, "user_id": e.user_id,
        }


@router.post("/portal/change-password")
def portal_change_password(body: ChangePasswordBody, me=Depends(_require_portal)):
    _require_portal_enabled()
    if body.new_password == body.current_password:
        raise HTTPException(400, "Le nouveau mot de passe doit être différent du mot de passe actuel")
    with get_portal_db_session() as db:
        # Shared employee mode: there can be several rows with the same matricule
        # (one per device). Update all of them so the old password stops working.
        rows = db.query(Employee).filter(Employee.user_id == me["matricule"]).all()
        if not rows:
            raise HTTPException(404, "Employee not found")

        # Verify current password against any of the rows
        verified = False
        for emp in rows:
            if emp.portal_pin_hash:
                if verify_password(body.current_password, emp.portal_pin_hash):
                    verified = True; break
            else:
                fn = _first_name(emp.name)
                if fn and body.current_password.lower() == fn.lower():
                    verified = True; break
        if not verified:
            raise HTTPException(401, "Mot de passe actuel incorrect")

        new_hash = get_password_hash(body.new_password)
        for emp in rows:
            emp.portal_pin_hash = new_hash
            emp.portal_must_change_password = False
        db.commit()
        return {"ok": True}


@router.get("/portal/me")
def portal_me(me=Depends(_require_portal)):
    _require_portal_enabled()
    with get_portal_db_session() as db:
        dep = db.query(Department).filter(Department.id == me["department_id"]).first() if me["department_id"] else None
        return {
            "id": me["id"], "name": me["name"], "matricule": me["matricule"],
            "department": dep.name if dep else None,
        }


@router.get("/portal/punches")
def portal_punches(start_date: str, end_date: str, me=Depends(_require_portal)):
    _require_portal_enabled()
    try:
        s = datetime.strptime(start_date, "%Y-%m-%d")
        e = datetime.combine(datetime.strptime(end_date, "%Y-%m-%d").date(), time.max)
    except ValueError:
        raise HTTPException(400, "Invalid date")

    with get_portal_db_session() as db:
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
    _require_portal_enabled()
    if not (1 <= month <= 12):
        raise HTTPException(400, "Invalid month")
    start_d = date(year, month, 1)
    end_d = (date(year + (month == 12), (month % 12) + 1, 1) - timedelta(days=1))

    with get_portal_db_session() as db:
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


# ─── Portal: Congés (balance, history, e-sign) ─────────────────────────────
@router.get("/portal/leave/balance")
def portal_leave_balance(year: Optional[int] = None, me=Depends(_require_portal)):
    """The logged-in employee's own annual leave balance."""
    _require_portal_enabled()
    from app.database.schema import LeaveBalance, AppSettings
    from app.api.leave import _balance_dict
    from datetime import date as _date
    yr = year or _date.today().year
    with get_portal_db_session() as db:
        settings = db.query(AppSettings).first()
        default_annual = float(getattr(settings, "leave_default_annual_days", 18) or 18)
        bal = (db.query(LeaveBalance)
               .filter(LeaveBalance.employee_user_id == me["matricule"],
                       LeaveBalance.year == yr).first())
        return _balance_dict(db, bal, me["matricule"], yr, default_annual)


@router.get("/portal/leave/requests")
def portal_leave_requests(me=Depends(_require_portal)):
    """The logged-in employee's own congé history (all statuses)."""
    _require_portal_enabled()
    from app.database.schema import LeaveRequest
    with get_portal_db_session() as db:
        rows = (db.query(LeaveRequest)
                .filter(LeaveRequest.employee_user_id == me["matricule"])
                .order_by(LeaveRequest.start_date.desc()).limit(500).all())
        out = []
        for r in rows:
            out.append({
                "id": r.id, "type": r.type, "status": r.status,
                "start_date": r.start_date.date().isoformat(),
                "end_date": r.end_date.date().isoformat(),
                "start_fraction": r.start_fraction, "end_fraction": r.end_fraction,
                "working_days": float(r.working_days or 0),
                "reason": r.reason,
                "employee_signed_at": r.employee_signed_at.isoformat() if r.employee_signed_at else None,
                "approved_at": r.approved_at.isoformat() if r.approved_at else None,
                "needs_signature": (r.status == "pending" and r.employee_signed_at is None),
            })
        return {"count": len(out), "requests": out}


@router.post("/portal/leave/requests/{req_id}/sign")
def portal_leave_sign(req_id: int, me=Depends(_require_portal)):
    """Employee e-signs a pending congé created for them. Sets
    employee_signed_at; HR then approves. Can only sign one's OWN pending,
    not-yet-signed request."""
    _require_portal_enabled()
    from app.database.schema import LeaveRequest
    from datetime import datetime as _dt, timezone as _tz
    with get_portal_db_session() as db:
        r = db.query(LeaveRequest).filter(LeaveRequest.id == req_id).first()
        if not r or r.employee_user_id != me["matricule"]:
            raise HTTPException(404, "Request not found")
        if r.status != "pending":
            raise HTTPException(400, "Only a pending request can be signed")
        if r.employee_signed_at is not None:
            return {"ok": True, "already_signed": True}
        r.employee_signed_at = _dt.now(_tz.utc)
        db.commit()
        return {"ok": True}
