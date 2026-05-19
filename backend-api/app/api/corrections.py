"""Manual punch / correction API.

- POST /api/corrections           — create a punch (op=add) or edit/delete an existing one
- GET  /api/corrections           — list history (filterable)
- GET  /api/corrections/employee/{id}  — history for one employee
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from sqlalchemy import desc

from app.database.connection import get_db_session
from app.database.schema import (
    Attendance, AttendanceCorrection, Employee, User,
)
from app.core.security import get_current_user, user_has_permission

router = APIRouter()


class CorrectionCreate(BaseModel):
    op: str = Field(..., pattern="^(add|edit|delete)$")
    employee_id: int
    reason: str = Field(..., min_length=3, max_length=500)
    original_attendance_id: Optional[int] = None  # required for edit/delete
    new_timestamp: Optional[datetime] = None       # required for add/edit
    new_punch_type: Optional[int] = None           # 0=in, 1=out — for add/edit
    device_id: Optional[str] = None                # optional anchor for add


def _require_perm(user):
    if not (user_has_permission(user, "attendance.write")
            or user_has_permission(user, "roles.manage")
            or user_has_permission(user, "manage_users")):
        raise HTTPException(403, "Not authorized to correct attendance")


@router.post("/corrections")
def create_correction(body: CorrectionCreate, current: User = Depends(get_current_user)):
    _require_perm(current)

    with get_db_session() as db:
        emp = db.query(Employee).filter(Employee.id == body.employee_id).first()
        if not emp:
            raise HTTPException(404, "employee not found")

        original = None
        if body.op in ("edit", "delete"):
            if not body.original_attendance_id:
                raise HTTPException(400, f"original_attendance_id required for op={body.op}")
            original = db.query(Attendance).filter(Attendance.id == body.original_attendance_id).first()
            if not original:
                raise HTTPException(404, "original attendance row not found")

        if body.op in ("add", "edit"):
            if not body.new_timestamp:
                raise HTTPException(400, f"new_timestamp required for op={body.op}")
            if body.new_punch_type not in (0, 1):
                raise HTTPException(400, "new_punch_type must be 0 (in) or 1 (out)")

        # Insert the correction row first (we want its id)
        c = AttendanceCorrection(
            created_by=current.id,
            employee_id=body.employee_id,
            op=body.op,
            original_attendance_id=body.original_attendance_id,
            new_timestamp=body.new_timestamp.replace(tzinfo=None) if body.new_timestamp else None,
            new_punch_type=body.new_punch_type,
            reason=body.reason,
        )
        db.add(c)
        db.flush()

        # Apply the effect on attendance
        if body.op == "delete" and original:
            original.voided_by_correction_id = c.id

        elif body.op == "edit" and original:
            original.voided_by_correction_id = c.id
            # Insert a replacement row with source='corrected'
            replacement = Attendance(
                device_id=original.device_id,
                employee_id=original.employee_id,
                uid=original.uid,
                user_id_str=original.user_id_str,
                timestamp=body.new_timestamp.replace(tzinfo=None),
                status=original.status,
                punch=body.new_punch_type,
                source='corrected',
            )
            db.add(replacement)

        elif body.op == "add":
            # Pick any device the employee has used, or fall back to provided device_id
            anchor_dev = body.device_id
            if not anchor_dev:
                anchor = db.query(Attendance.device_id).filter(Attendance.employee_id == body.employee_id).first()
                anchor_dev = anchor[0] if anchor else None
            if not anchor_dev:
                raise HTTPException(400, "No device available to anchor punch — pass device_id")
            new_row = Attendance(
                device_id=anchor_dev,
                employee_id=body.employee_id,
                uid=emp.device_user_id or 0,
                user_id_str=emp.user_id or '',
                timestamp=body.new_timestamp.replace(tzinfo=None),
                status=0,
                punch=body.new_punch_type,
                source='manual',
            )
            db.add(new_row)

        db.commit()
        db.refresh(c)
        return {
            "id": c.id, "op": c.op, "employee_id": c.employee_id,
            "created_at": c.created_at.isoformat() if c.created_at else None,
        }


@router.get("/corrections")
def list_corrections(
    employee_id: Optional[int] = None,
    limit: int = 100,
    offset: int = 0,
    current: User = Depends(get_current_user),
):
    with get_db_session() as db:
        q = db.query(AttendanceCorrection)
        if employee_id:
            q = q.filter(AttendanceCorrection.employee_id == employee_id)
        total = q.count()
        rows = q.order_by(desc(AttendanceCorrection.id)).offset(offset).limit(limit).all()

        # Resolve user/employee names
        emp_ids = list({r.employee_id for r in rows if r.employee_id})
        user_ids = list({r.created_by for r in rows if r.created_by})
        emp_map = {e.id: e.name for e in db.query(Employee).filter(Employee.id.in_(emp_ids)).all()} if emp_ids else {}
        user_map = {u.id: u.username for u in db.query(User).filter(User.id.in_(user_ids)).all()} if user_ids else {}

        return {
            "total": total,
            "items": [{
                "id": r.id,
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "created_by_username": user_map.get(r.created_by),
                "employee_id": r.employee_id,
                "employee_name": emp_map.get(r.employee_id),
                "op": r.op,
                "original_attendance_id": r.original_attendance_id,
                "new_timestamp": r.new_timestamp.isoformat() if r.new_timestamp else None,
                "new_punch_type": r.new_punch_type,
                "reason": r.reason,
            } for r in rows],
        }
