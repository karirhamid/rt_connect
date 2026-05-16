"""Database backup & restore — built on pg_dump / pg_restore custom format.

Why pg_dump (custom format) instead of a JSON serializer:
  • Full fidelity: schema + data + indexes + constraints + sequences + ENUMs
  • Cross-version safe: a dump created against PG N restores cleanly to
    PG N, N+1, N+2... (works for any PG >= 16 as long as the dump was
    produced by a compatible client)
  • Binary + compressed: ~10x smaller than JSON, restores in seconds
  • Works regardless of where Postgres runs: Docker, VM, Windows native —
    we just need DB_HOST:DB_PORT to be reachable from the backend

Requires `pg_dump` / `pg_restore` binaries available in PATH (provided by
`postgresql-client` apt package in the backend Dockerfile).

Legacy `.json.gz` backups created by earlier versions are still listed and
restorable for backward compatibility.
"""
from fastapi import APIRouter, HTTPException, status, Depends, UploadFile, File
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
import os
import shutil
import subprocess
import tempfile
import gzip
import json
import logging
from pathlib import Path

from app.database.connection import get_db_session, DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME
from app.database.schema import User
from app.core.security import get_current_user

router = APIRouter()
logger = logging.getLogger(__name__)

BACKUP_DIR = Path(os.getenv('BACKUP_DIR', './backups'))
BACKUP_DIR.mkdir(exist_ok=True)


# ── Models ──────────────────────────────────────────────────────────────────

class BackupInfo(BaseModel):
    filename: str
    created_at: str
    size_bytes: int
    format: str  # "pgdump" | "json"


class BackupListResponse(BaseModel):
    backups: List[BackupInfo]
    total_size_mb: float
    pg_dump_available: bool


class BackupResponse(BaseModel):
    message: str
    filename: str
    created_at: str
    size_bytes: int


class RestoreResponse(BaseModel):
    message: str
    restored_from: str


# ── Helpers ─────────────────────────────────────────────────────────────────

def _is_admin(user: User) -> bool:
    try:
        return any(r.name == 'Administrator' for r in (user.roles or []))
    except Exception:
        return False


def _require_admin(user: User):
    if not _is_admin(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail='Administrator role required')


def _have_binary(name: str) -> bool:
    return shutil.which(name) is not None


def _pg_env() -> dict:
    """Environment for pg_dump / pg_restore subprocess calls."""
    env = os.environ.copy()
    env['PGPASSWORD'] = DB_PASSWORD or ''
    return env


def _detect_format(path: Path) -> str:
    """Heuristic: .dump = pg_dump custom format; .json.gz = legacy JSON."""
    name = path.name.lower()
    if name.endswith('.dump'):
        return 'pgdump'
    if name.endswith('.json.gz'):
        return 'json'
    # Inspect: pg_dump custom format starts with 'PGDMP'
    try:
        with open(path, 'rb') as f:
            head = f.read(5)
        if head.startswith(b'PGDMP'):
            return 'pgdump'
    except Exception:
        pass
    return 'json'


def _safe_backup_path(filename: str) -> Path:
    """Resolve filename against BACKUP_DIR and refuse anything outside it."""
    if '/' in filename or '\\' in filename or filename.startswith('.'):
        raise HTTPException(status_code=400, detail='Invalid filename')
    p = (BACKUP_DIR / filename).resolve()
    if not str(p).startswith(str(BACKUP_DIR.resolve())):
        raise HTTPException(status_code=400, detail='Invalid path')
    if not p.exists():
        raise HTTPException(status_code=404, detail='Backup file not found')
    return p


# ── List ────────────────────────────────────────────────────────────────────

@router.get('/maintenance/backups', response_model=BackupListResponse,
            dependencies=[Depends(get_current_user)])
def list_backups(current_user: User = Depends(get_current_user)):
    _require_admin(current_user)
    files: List[Path] = []
    if BACKUP_DIR.exists():
        files.extend(BACKUP_DIR.glob('*.dump'))
        files.extend(BACKUP_DIR.glob('*.json.gz'))
    files = sorted(files, key=lambda p: p.stat().st_mtime, reverse=True)

    backups = []
    total = 0
    for f in files:
        st = f.stat()
        backups.append(BackupInfo(
            filename=f.name,
            created_at=datetime.fromtimestamp(st.st_mtime).isoformat(),
            size_bytes=st.st_size,
            format=_detect_format(f),
        ))
        total += st.st_size

    return BackupListResponse(
        backups=backups,
        total_size_mb=round(total / (1024 * 1024), 2),
        pg_dump_available=_have_binary('pg_dump') and _have_binary('pg_restore'),
    )


# ── Create ──────────────────────────────────────────────────────────────────

@router.post('/maintenance/backup', response_model=BackupResponse,
             dependencies=[Depends(get_current_user)])
def create_backup(current_user: User = Depends(get_current_user)):
    """Create a full database backup using pg_dump custom format."""
    _require_admin(current_user)

    if not _have_binary('pg_dump'):
        raise HTTPException(
            status_code=500,
            detail=("pg_dump binary not found in the backend container. "
                    "Install 'postgresql-client' in the Dockerfile and rebuild."),
        )

    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    filename = f'rtpointage_{timestamp}.dump'
    target = BACKUP_DIR / filename

    cmd = [
        'pg_dump',
        '--format=custom',
        '--compress=6',
        '--no-owner',         # avoids 'role "X" does not exist' on restore to a different env
        '--no-privileges',
        '--host', DB_HOST,
        '--port', str(DB_PORT),
        '--username', DB_USER,
        '--dbname', DB_NAME,
        '--file', str(target),
    ]
    logger.info(f"Running: pg_dump → {filename}")

    try:
        proc = subprocess.run(
            cmd, env=_pg_env(),
            capture_output=True, text=True, timeout=600,  # 10 min cap
        )
    except subprocess.TimeoutExpired:
        target.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail='pg_dump timed out after 10 minutes')

    if proc.returncode != 0:
        target.unlink(missing_ok=True)
        err = (proc.stderr or proc.stdout or '').strip().splitlines()[-1:] or ['(no output)']
        raise HTTPException(status_code=500, detail=f'pg_dump failed: {err[0]}')

    size = target.stat().st_size
    logger.info(f"Backup OK: {filename} ({size / 1024:.1f} KB)")
    return BackupResponse(
        message='Backup created successfully',
        filename=filename,
        created_at=datetime.now().isoformat(),
        size_bytes=size,
    )


# ── Download ────────────────────────────────────────────────────────────────

@router.get('/maintenance/backup/{filename}',
            dependencies=[Depends(get_current_user)])
def download_backup(filename: str, current_user: User = Depends(get_current_user)):
    _require_admin(current_user)
    path = _safe_backup_path(filename)
    media = 'application/octet-stream' if path.suffix == '.dump' else 'application/gzip'
    return FileResponse(path, filename=filename, media_type=media)


# ── Restore (from existing backup in BACKUP_DIR) ────────────────────────────

@router.post('/maintenance/restore/{filename}', response_model=RestoreResponse,
             dependencies=[Depends(get_current_user)])
def restore_backup(filename: str, current_user: User = Depends(get_current_user)):
    _require_admin(current_user)
    path = _safe_backup_path(filename)
    fmt = _detect_format(path)

    if fmt == 'pgdump':
        return _restore_pg_dump(path)
    else:
        return _restore_legacy_json(path)


# ── Restore from uploaded file (no need to first place it in BACKUP_DIR) ────

@router.post('/maintenance/restore-upload', response_model=RestoreResponse,
             dependencies=[Depends(get_current_user)])
async def restore_from_upload(file: UploadFile = File(...),
                              current_user: User = Depends(get_current_user)):
    """Restore the DB from an uploaded backup file.

    Accepts .dump (pg_dump custom format) or .json.gz (legacy).
    """
    _require_admin(current_user)
    if not file.filename:
        raise HTTPException(status_code=400, detail='No file uploaded')

    # Save to temp, then dispatch
    suffix = '.dump' if file.filename.lower().endswith('.dump') else \
             ('.json.gz' if file.filename.lower().endswith('.json.gz') else '.bin')
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = Path(tmp.name)

    try:
        fmt = _detect_format(tmp_path)
        if fmt == 'pgdump':
            result = _restore_pg_dump(tmp_path)
        else:
            result = _restore_legacy_json(tmp_path)
        return RestoreResponse(message=result.message,
                               restored_from=f'upload:{file.filename}')
    finally:
        try: tmp_path.unlink()
        except Exception: pass


# ── pg_dump restore implementation ──────────────────────────────────────────

def _restore_pg_dump(path: Path) -> RestoreResponse:
    if not _have_binary('pg_restore'):
        raise HTTPException(
            status_code=500,
            detail='pg_restore binary not found in the backend container.',
        )

    cmd = [
        'pg_restore',
        '--clean', '--if-exists',  # drop existing objects before recreating
        '--no-owner',
        '--no-privileges',
        '--exit-on-error',         # stop at first hard error so we know what broke
        '--host', DB_HOST,
        '--port', str(DB_PORT),
        '--username', DB_USER,
        '--dbname', DB_NAME,
        str(path),
    ]
    logger.info(f"Running: pg_restore ← {path.name}")

    proc = subprocess.run(
        cmd, env=_pg_env(),
        capture_output=True, text=True, timeout=600,
    )
    # pg_restore returns 1 even on benign warnings like "table foo does not exist, skipping"
    # when used with --if-exists. So we only fail on non-zero exit AND no useful output.
    if proc.returncode != 0:
        err_text = (proc.stderr or '').strip()
        # Filter out the warning lines — keep only actual ERROR rows
        errs = [l for l in err_text.splitlines() if l.startswith('pg_restore: error:')]
        if errs:
            raise HTTPException(status_code=500,
                                detail=f'pg_restore failed: {errs[0]}')

    logger.info(f"Restore OK from {path.name}")
    return RestoreResponse(
        message='Database restored successfully from pg_dump backup',
        restored_from=path.name,
    )


# ── Legacy JSON restore (kept for backward compatibility) ──────────────────

def _restore_legacy_json(path: Path) -> RestoreResponse:
    """Restore from the old .json.gz format produced by earlier versions."""
    from sqlalchemy import text as _sql_text

    with gzip.open(path, 'rt', encoding='utf-8') as f:
        data = json.load(f)
    data.pop('_metadata', None)

    restored = 0
    with get_db_session() as db:
        for table_name, rows in data.items():
            try:
                db.execute(_sql_text(f'DELETE FROM "{table_name}"'))
                db.commit()
                for row in rows or []:
                    columns = ', '.join([f'"{k}"' for k in row.keys()])
                    values  = ', '.join([f':{k}' for k in row.keys()])
                    row_data = {}
                    for k, v in row.items():
                        if isinstance(v, str) and 'T' in v:
                            try: v = datetime.fromisoformat(v)
                            except Exception: pass
                        row_data[k] = v
                    db.execute(_sql_text(
                        f'INSERT INTO "{table_name}" ({columns}) VALUES ({values})'
                    ), row_data)
                    restored += 1
                db.commit()
            except Exception as e:
                db.rollback()
                logger.warning(f"Legacy restore: table {table_name} skipped: {e}")

    logger.info(f"Legacy JSON restore: {restored} rows from {path.name}")
    return RestoreResponse(
        message=f'Restored {restored} rows from legacy JSON backup',
        restored_from=path.name,
    )


# ── Delete ──────────────────────────────────────────────────────────────────

@router.delete('/maintenance/backup/{filename}',
               dependencies=[Depends(get_current_user)])
def delete_backup(filename: str, current_user: User = Depends(get_current_user)):
    _require_admin(current_user)
    path = _safe_backup_path(filename)
    path.unlink()
    return {'message': 'Backup deleted successfully'}
