from fastapi import APIRouter, Depends, Query
from sqlalchemy import desc
from typing import Optional

from app.database.connection import get_db_session
from app.database.schema import AdminAuditLog
from app.core.security import get_current_user, user_has_permission

router = APIRouter()


@router.get("/audit-log")
def list_audit_log(
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    method: Optional[str] = None,
    username: Optional[str] = None,
    path_contains: Optional[str] = None,
    current=Depends(get_current_user),
):
    # Only admins (users with manage_users or audit_view permission)
    if not (user_has_permission(current, "manage_users") or user_has_permission(current, "audit_view")):
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Not authorized to view audit log")

    with get_db_session() as db:
        q = db.query(AdminAuditLog)
        if method:
            q = q.filter(AdminAuditLog.method == method.upper())
        if username:
            q = q.filter(AdminAuditLog.username == username)
        if path_contains:
            q = q.filter(AdminAuditLog.path.ilike(f"%{path_contains}%"))
        total = q.count()
        rows = q.order_by(desc(AdminAuditLog.id)).offset(offset).limit(limit).all()
        return {
            "total": total,
            "items": [{
                "id": r.id,
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "username": r.username,
                "ip": r.ip,
                "method": r.method,
                "path": r.path,
                "status_code": r.status_code,
                "payload": r.payload,
            } for r in rows],
        }
