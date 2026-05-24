"""Admin audit log — middleware that records non-GET admin actions."""
from __future__ import annotations
import json
import logging
from typing import Optional

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.core.security import decode_token
from app.database.connection import get_db_session
from app.database.schema import AdminAuditLog, User

logger = logging.getLogger(__name__)

# Paths we never log (noise / safe)
SKIP_PATHS = (
    "/api/auth/refresh",
    "/api/health",
    "/api/public/branding",
    "/api/portal/",  # employee self-service portal — has its own audit semantics
    "/docs", "/redoc", "/openapi.json",
)

# Methods we log
TRACKED_METHODS = {"POST", "PUT", "PATCH", "DELETE"}

MAX_BODY_BYTES = 4096  # truncate large payloads


def _resolve_user(auth_header: Optional[str]):
    if not auth_header or not auth_header.lower().startswith("bearer "):
        return None, None
    token = auth_header.split(" ", 1)[1].strip()
    payload = decode_token(token)
    if not payload:
        return None, None
    username = payload.get("sub")
    if not username:
        return None, None
    try:
        with get_db_session() as db:
            u = db.query(User).filter(User.username == username).first()
            if not u:
                return None, username
            return u.id, u.username
    except Exception:
        return None, username


def _redact(body_bytes: bytes) -> str:
    if not body_bytes:
        return ""
    try:
        data = json.loads(body_bytes.decode("utf-8", errors="ignore"))
        if isinstance(data, dict):
            for k in list(data.keys()):
                if k.lower() in ("password", "pwd", "secret", "token", "smtp_password", "pin"):
                    data[k] = "***"
        out = json.dumps(data, default=str)
    except Exception:
        out = body_bytes[:MAX_BODY_BYTES].decode("utf-8", errors="ignore")
    if len(out) > MAX_BODY_BYTES:
        out = out[:MAX_BODY_BYTES] + "...(truncated)"
    return out


class AdminAuditMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        method = request.method.upper()
        path = request.url.path

        if method not in TRACKED_METHODS or any(path.startswith(p) for p in SKIP_PATHS):
            return await call_next(request)

        # Capture body (must read before passing on)
        try:
            body = await request.body()
        except Exception:
            body = b""

        async def _receive():
            return {"type": "http.request", "body": body, "more_body": False}

        request = Request(request.scope, _receive)

        response = await call_next(request)

        try:
            user_id, username = _resolve_user(request.headers.get("authorization"))
            is_login = path.endswith("/auth/login")

            # Skip noise: an unauthenticated request that isn't a login attempt
            # is almost always an expired-token call that the client immediately
            # retries with a fresh token (which IS logged with the real user).
            if user_id is None and not is_login:
                return response

            # For login attempts, show the ATTEMPTED username instead of "anonyme"
            if user_id is None and is_login:
                try:
                    data = json.loads(body.decode("utf-8", errors="ignore")) if body else {}
                    username = data.get("username") or None
                except Exception:
                    username = None

            ip = (request.client.host if request.client else None) or request.headers.get("x-forwarded-for")
            action = None
            if is_login:
                action = "login success" if response.status_code < 400 else "login failed"

            with get_db_session() as db:
                db.add(AdminAuditLog(
                    user_id=user_id,
                    username=username,
                    ip=ip,
                    method=method,
                    path=path[:500],
                    status_code=response.status_code,
                    action=action,
                    payload=_redact(body) or None,
                ))
                db.commit()
        except Exception as e:
            logger.warning("audit log write failed: %s", e)

        return response
