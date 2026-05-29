"""Congés (leave) management API — Phase 2.

Endpoints
  Balances (view: leave.request|leave.manage ; edit: leave.manage)
    GET  /api/leave/balances?year=                  — all employees + used/remaining
    GET  /api/leave/balance/{user_id}?year=         — one employee
    PUT  /api/leave/balance                         — upsert entitlement

  Requests (create: leave.request ; approve/reject: leave.manage)
    GET    /api/leave/requests?status=&employee_id=&year=
    POST   /api/leave/requests
    POST   /api/leave/requests/{id}/approve
    POST   /api/leave/requests/{id}/reject
    POST   /api/leave/requests/{id}/cancel

Only an APPROVED request affects attendance (Phase 3 wires the report
exclusion). Sick leave never decrements the annual balance.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime, date, timedelta, timezone

from app.database.connection import get_db_session
from app.database.schema import (
    LeaveBalance, LeaveRequest, Employee, AppSettings, User,
)
from app.core.security import get_current_user, user_has_permission

router = APIRouter()

_FRACTIONS = ("full", "am", "pm")
_TYPES = ("annual", "sick", "other")


# ── Permission helpers ────────────────────────────────────────────────────
def _can_view(user) -> bool:
    return (user_has_permission(user, "leave.request")
            or user_has_permission(user, "leave.manage")
            or user_has_permission(user, "roles.manage"))


def _can_request(user) -> bool:
    return (user_has_permission(user, "leave.request")
            or user_has_permission(user, "leave.manage")
            or user_has_permission(user, "roles.manage"))


def _can_manage(user) -> bool:
    return (user_has_permission(user, "leave.manage")
            or user_has_permission(user, "roles.manage"))


def _uid(user) -> Optional[int]:
    try:
        return getattr(user, "id", None)
    except Exception:
        return None


# ── Working-days computation (honours weekend setting + half-days) ─────────
def compute_working_days(start: date, end: date,
                         start_fraction: str, end_fraction: str,
                         count_saturday: bool, count_sunday: bool,
                         holidays: Optional[set] = None) -> float:
    """Chargeable congé days for [start, end].

    Mon–Fri always count. Saturday counts only if count_saturday; Sunday only
    if count_sunday. Any date in `holidays` (a set of date objects — public
    holidays) never counts, even if it's a working weekday. Half-day
    fractions knock 0.5 off the first / last counted day. A single-day
    request uses start_fraction only.
    """
    if end < start:
        return 0.0
    holidays = holidays or set()

    def counts(d: date) -> bool:
        if d in holidays:
            return False                 # public holiday — never charged
        wd = d.weekday()                 # Mon=0 .. Sun=6
        if wd < 5:
            return True                  # Mon–Fri
        if wd == 5:
            return count_saturday
        return count_sunday              # wd == 6 (Sunday)

    # Single day
    if start == end:
        if not counts(start):
            return 0.0
        return 0.5 if start_fraction in ("am", "pm") else 1.0

    total = 0.0
    d = start
    while d <= end:
        if counts(d):
            total += 1.0
        d += timedelta(days=1)
    if total <= 0:
        return 0.0
    # Apply half-day deductions only if that boundary day is itself counted.
    if start_fraction in ("am", "pm") and counts(start):
        total -= 0.5
    if end_fraction in ("am", "pm") and counts(end):
        total -= 0.5
    return max(0.0, total)


def approved_leave_days(db, start: date, end: date) -> dict:
    """Return {(user_id, date): type} for every calendar day covered by an
    APPROVED leave request overlapping [start, end].

    Used by reports + the Today page to (a) move on-leave employees out of
    the 'Absent' list into a Congés section and (b) skip their congé days in
    the lateness ranking. Covers every calendar day in the request range
    (weekends included — they're irrelevant for absent-suppression). The
    balance-charging 'working_days' is a separate, half-day-aware figure.
    """
    rows = (db.query(LeaveRequest)
            .filter(LeaveRequest.status == "approved",
                    LeaveRequest.start_date <= datetime.combine(end, datetime.max.time()),
                    LeaveRequest.end_date >= datetime.combine(start, datetime.min.time()))
            .all())
    out: dict = {}
    for r in rows:
        d = max(r.start_date.date(), start)
        last = min(r.end_date.date(), end)
        while d <= last:
            out[(r.employee_user_id, d)] = r.type
            d += timedelta(days=1)
    return out


def _annual_used(db, user_id: str, year: int) -> float:
    """Sum of approved ANNUAL leave working_days in the year for this user."""
    y0 = datetime(year, 1, 1)
    y1 = datetime(year, 12, 31, 23, 59, 59)
    rows = (db.query(LeaveRequest)
            .filter(LeaveRequest.employee_user_id == user_id,
                    LeaveRequest.type == "annual",
                    LeaveRequest.status == "approved",
                    LeaveRequest.start_date >= y0,
                    LeaveRequest.start_date <= y1)
            .all())
    return round(sum(float(r.working_days or 0) for r in rows), 2)


def _balance_dict(db, bal: Optional[LeaveBalance], user_id: str, year: int,
                  default_annual: float) -> dict:
    entitled = float(bal.entitled_days) if bal else float(default_annual)
    carried = float(bal.carried_over) if bal else 0.0
    used = _annual_used(db, user_id, year)
    return {
        "employee_user_id": user_id,
        "year": year,
        "entitled_days": entitled,
        "carried_over": carried,
        "used_days": used,
        "remaining_days": round(entitled + carried - used, 2),
        "note": bal.note if bal else None,
        "has_explicit_balance": bal is not None,
    }


# ── Balances ───────────────────────────────────────────────────────────────
@router.get("/leave/balances")
def list_balances(year: Optional[int] = Query(None),
                  current=Depends(get_current_user)):
    if not _can_view(current):
        raise HTTPException(403, "Not authorized")
    yr = year or date.today().year
    with get_db_session() as db:
        settings = db.query(AppSettings).first()
        default_annual = float(getattr(settings, "leave_default_annual_days", 18) or 18)
        # Distinct employees by matricule
        emps = db.query(Employee).filter(Employee.is_active == True).all()  # noqa: E712
        seen, out = set(), []
        bal_by_user = {b.employee_user_id: b for b in
                       db.query(LeaveBalance).filter(LeaveBalance.year == yr).all()}
        for e in emps:
            if e.user_id in seen:
                continue
            seen.add(e.user_id)
            d = _balance_dict(db, bal_by_user.get(e.user_id), e.user_id, yr, default_annual)
            d["employee_name"] = e.name
            d["department"] = e.department.name if e.department else "-"
            out.append(d)
        out.sort(key=lambda x: x["employee_name"])
        return {"year": yr, "count": len(out), "balances": out}


@router.get("/leave/balance/{user_id}")
def get_balance(user_id: str, year: Optional[int] = Query(None),
                current=Depends(get_current_user)):
    if not _can_view(current):
        raise HTTPException(403, "Not authorized")
    yr = year or date.today().year
    with get_db_session() as db:
        settings = db.query(AppSettings).first()
        default_annual = float(getattr(settings, "leave_default_annual_days", 18) or 18)
        bal = (db.query(LeaveBalance)
               .filter(LeaveBalance.employee_user_id == user_id,
                       LeaveBalance.year == yr).first())
        return _balance_dict(db, bal, user_id, yr, default_annual)


class BalanceIn(BaseModel):
    employee_user_id: str
    year: int
    entitled_days: float = Field(ge=0, le=365)
    carried_over: float = Field(default=0, ge=0, le=365)
    note: Optional[str] = None


@router.put("/leave/balance")
def upsert_balance(payload: BalanceIn, current=Depends(get_current_user)):
    if not _can_manage(current):
        raise HTTPException(403, "Only HR-congé can edit balances")
    with get_db_session() as db:
        bal = (db.query(LeaveBalance)
               .filter(LeaveBalance.employee_user_id == payload.employee_user_id,
                       LeaveBalance.year == payload.year).first())
        if bal:
            bal.entitled_days = payload.entitled_days
            bal.carried_over = payload.carried_over
            bal.note = payload.note
            bal.updated_by = _uid(current)
        else:
            db.add(LeaveBalance(
                employee_user_id=payload.employee_user_id, year=payload.year,
                entitled_days=payload.entitled_days, carried_over=payload.carried_over,
                note=payload.note, updated_by=_uid(current),
            ))
        db.commit()
        return {"ok": True}


# ── Requests ─────────────────────────────────────────────────────────────
def _request_dict(r: LeaveRequest, emp_name: str = None) -> dict:
    return {
        "id": r.id,
        "employee_user_id": r.employee_user_id,
        "employee_name": emp_name,
        "type": r.type,
        "start_date": r.start_date.date().isoformat() if r.start_date else None,
        "end_date": r.end_date.date().isoformat() if r.end_date else None,
        "start_fraction": r.start_fraction,
        "end_fraction": r.end_fraction,
        "working_days": float(r.working_days or 0),
        "reason": r.reason,
        "status": r.status,
        "certificate_path": r.certificate_path,
        "employee_signed_at": r.employee_signed_at.isoformat() if r.employee_signed_at else None,
        "approved_at": r.approved_at.isoformat() if r.approved_at else None,
        "reject_reason": r.reject_reason,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }


@router.get("/leave/requests")
def list_requests(status: Optional[str] = Query(None),
                  employee_id: Optional[str] = Query(None),
                  year: Optional[int] = Query(None),
                  current=Depends(get_current_user)):
    if not _can_view(current):
        raise HTTPException(403, "Not authorized")
    with get_db_session() as db:
        q = db.query(LeaveRequest)
        if status:
            q = q.filter(LeaveRequest.status == status)
        if employee_id:
            q = q.filter(LeaveRequest.employee_user_id == employee_id)
        if year:
            q = q.filter(LeaveRequest.start_date >= datetime(year, 1, 1),
                         LeaveRequest.start_date <= datetime(year, 12, 31, 23, 59, 59))
        rows = q.order_by(LeaveRequest.start_date.desc()).limit(1000).all()
        # name lookup
        names = {e.user_id: e.name for e in db.query(Employee).all()}
        return {"count": len(rows),
                "requests": [_request_dict(r, names.get(r.employee_user_id)) for r in rows]}


class RequestIn(BaseModel):
    employee_user_id: str
    type: str = Field(default="annual")
    start_date: str   # YYYY-MM-DD
    end_date: str     # YYYY-MM-DD
    start_fraction: str = Field(default="full")
    end_fraction: str = Field(default="full")
    reason: Optional[str] = None


@router.post("/leave/requests")
def create_request(payload: RequestIn, current=Depends(get_current_user)):
    if not _can_request(current):
        raise HTTPException(403, "Not authorized to create congé requests")
    if payload.type not in _TYPES:
        raise HTTPException(400, f"type must be one of {_TYPES}")
    if payload.start_fraction not in _FRACTIONS or payload.end_fraction not in _FRACTIONS:
        raise HTTPException(400, f"fraction must be one of {_FRACTIONS}")
    try:
        sd = datetime.strptime(payload.start_date, "%Y-%m-%d").date()
        ed = datetime.strptime(payload.end_date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(400, "Invalid date format. Use YYYY-MM-DD")
    if ed < sd:
        raise HTTPException(400, "end_date is before start_date")

    with get_db_session() as db:
        emp = db.query(Employee).filter(Employee.user_id == payload.employee_user_id).first()
        if not emp:
            raise HTTPException(404, "Employee not found")
        settings = db.query(AppSettings).first()
        count_sat = bool(getattr(settings, "leave_count_saturday", True))
        count_sun = bool(getattr(settings, "leave_count_sunday", False))
        # Public holidays within the span are never charged.
        from app.database.shift_schema import Holiday as _HOL
        hol = {h.date for h in db.query(_HOL)
               .filter(_HOL.date >= sd, _HOL.date <= ed).all()}
        wd = compute_working_days(sd, ed, payload.start_fraction, payload.end_fraction,
                                  count_sat, count_sun, hol)
        if wd <= 0:
            raise HTTPException(400, "Selected range has 0 chargeable days (weekend / holidays only?)")
        req = LeaveRequest(
            employee_user_id=payload.employee_user_id,
            type=payload.type,
            start_date=datetime.combine(sd, datetime.min.time()),
            end_date=datetime.combine(ed, datetime.min.time()),
            start_fraction=payload.start_fraction,
            end_fraction=payload.end_fraction,
            working_days=wd,
            reason=payload.reason,
            status="pending",
            created_by=_uid(current),
        )
        db.add(req)
        db.commit()
        db.refresh(req)
        return {"ok": True, "id": req.id, "working_days": wd}


@router.post("/leave/requests/{req_id}/approve")
def approve_request(req_id: int, current=Depends(get_current_user)):
    if not _can_manage(current):
        raise HTTPException(403, "Only HR-congé can approve")
    with get_db_session() as db:
        r = db.query(LeaveRequest).filter(LeaveRequest.id == req_id).first()
        if not r:
            raise HTTPException(404, "Request not found")
        if r.status not in ("pending",):
            raise HTTPException(400, f"Cannot approve a '{r.status}' request")
        r.status = "approved"
        r.approved_by = _uid(current)
        r.approved_at = datetime.now(timezone.utc)
        r.reject_reason = None
        db.commit()
        return {"ok": True, "status": "approved"}


class RejectIn(BaseModel):
    reason: Optional[str] = None


@router.post("/leave/requests/{req_id}/reject")
def reject_request(req_id: int, payload: Optional[RejectIn] = None,
                   current=Depends(get_current_user)):
    if not _can_manage(current):
        raise HTTPException(403, "Only HR-congé can reject")
    with get_db_session() as db:
        r = db.query(LeaveRequest).filter(LeaveRequest.id == req_id).first()
        if not r:
            raise HTTPException(404, "Request not found")
        if r.status not in ("pending",):
            raise HTTPException(400, f"Cannot reject a '{r.status}' request")
        r.status = "rejected"
        r.approved_by = _uid(current)
        r.approved_at = datetime.now(timezone.utc)
        r.reject_reason = (payload.reason if payload else None)
        db.commit()
        return {"ok": True, "status": "rejected"}


@router.post("/leave/requests/{req_id}/cancel")
def cancel_request(req_id: int, current=Depends(get_current_user)):
    # Creator or a manager can cancel a still-pending request.
    if not _can_request(current):
        raise HTTPException(403, "Not authorized")
    with get_db_session() as db:
        r = db.query(LeaveRequest).filter(LeaveRequest.id == req_id).first()
        if not r:
            raise HTTPException(404, "Request not found")
        if r.status == "approved" and not _can_manage(current):
            raise HTTPException(403, "Only HR-congé can cancel an approved congé")
        r.status = "cancelled"
        db.commit()
        return {"ok": True, "status": "cancelled"}
