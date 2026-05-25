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
from app.database.schema import User, AppSettings
from app.core.security import get_current_user
from app.services import backup_storage

router = APIRouter()
logger = logging.getLogger(__name__)

BACKUP_DIR = Path(os.getenv('BACKUP_DIR', './backups'))
BACKUP_DIR.mkdir(exist_ok=True)


# ── Models ──────────────────────────────────────────────────────────────────

class BackupInfo(BaseModel):
    filename: str
    created_at: str
    size_bytes: int
    format: str        # "pgdump" | "json"
    source: str = "local"   # "local" | "smb" | ...


class BackupListResponse(BaseModel):
    backups: List[BackupInfo]
    total_size_mb: float
    pg_dump_available: bool
    external_storage_type: str = "none"   # for the UI's storage section


class BackupResponse(BaseModel):
    message: str
    filename: str
    created_at: str
    size_bytes: int
    pushed_to_external: bool = False
    external_error: Optional[str] = None


class RestoreResponse(BaseModel):
    message: str
    restored_from: str


# Storage configuration models
class StorageConfigOut(BaseModel):
    type: str               # "none" | "smb"
    config: dict            # type-specific; password masked on read

class SmbConfigIn(BaseModel):
    server:      str
    share:       str
    username:    str
    password:    Optional[str] = None    # None = keep existing on update
    domain:      Optional[str] = None
    remote_path: Optional[str] = 'rtpointage'

class StorageConfigIn(BaseModel):
    type: str               # "none" | "smb"
    smb:  Optional[SmbConfigIn] = None


class TestStorageResponse(BaseModel):
    ok: bool
    message: str


class SmbBrowseIn(BaseModel):
    server:   str
    username: str
    password: Optional[str] = None    # None / masked = reuse saved
    domain:   Optional[str] = None
    share:    Optional[str] = None     # None → list shares; set → list folders
    path:     Optional[str] = ""       # subfolder within the share


class SmbBrowseOut(BaseModel):
    ok: bool
    message: str = ""
    shares:  List[str] = []
    folders: List[str] = []


class BackupScheduleIn(BaseModel):
    enabled:   bool = False
    frequency: str = 'daily'      # daily | weekly
    time:      str = '02:00'      # HH:MM
    weekday:   int = 0            # 0=Mon..6=Sun (weekly only)
    retention_days: int = 30      # 0 = keep all local backups


class BackupScheduleOut(BackupScheduleIn):
    last_run_at: Optional[str] = None


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

    # ── Local ──
    local_files: List[Path] = []
    if BACKUP_DIR.exists():
        local_files.extend(BACKUP_DIR.glob('*.dump'))
        local_files.extend(BACKUP_DIR.glob('*.json.gz'))
    local_files = sorted(local_files, key=lambda p: p.stat().st_mtime, reverse=True)

    backups: List[BackupInfo] = []
    total = 0
    seen_names: set = set()

    for f in local_files:
        st = f.stat()
        backups.append(BackupInfo(
            filename=f.name,
            created_at=datetime.fromtimestamp(st.st_mtime).isoformat(),
            size_bytes=st.st_size,
            format=_detect_format(f),
            source='local',
        ))
        total += st.st_size
        seen_names.add(f.name)

    # ── External ──
    ext_type = 'none'
    try:
        with get_db_session() as db:
            s = db.query(AppSettings).first()
            ext_type = (getattr(s, 'backup_storage_type', None) or 'none') if s else 'none'

        ext = backup_storage.get_external()
        if ext:
            for entry in ext.list():
                # Skip duplicates already on local (same filename was just pushed there)
                if entry['filename'] in seen_names:
                    # Mark the existing entry as also present on external
                    for b in backups:
                        if b.filename == entry['filename']:
                            b.source = f'local+{ext.name}'
                            break
                    continue
                backups.append(BackupInfo(
                    filename=entry['filename'],
                    created_at=entry['created_at'],
                    size_bytes=entry['size_bytes'],
                    format='pgdump' if entry['filename'].endswith('.dump') else 'json',
                    source=ext.name,
                ))
                total += entry['size_bytes']
    except Exception as e:
        logger.warning(f"External storage list failed: {e}")

    backups.sort(key=lambda b: b.created_at, reverse=True)
    return BackupListResponse(
        backups=backups,
        total_size_mb=round(total / (1024 * 1024), 2),
        pg_dump_available=_have_binary('pg_dump') and _have_binary('pg_restore'),
        external_storage_type=ext_type,
    )


# ── Create ──────────────────────────────────────────────────────────────────

def _perform_backup() -> dict:
    """Create a pg_dump backup, push to external storage (best-effort), and
    apply retention. Reused by the HTTP endpoint AND the backup scheduler.
    Raises RuntimeError on failure."""
    if not _have_binary('pg_dump'):
        raise RuntimeError("pg_dump binary not found in the backend container. "
                           "Install 'postgresql-client' in the Dockerfile and rebuild.")

    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    filename = f'rtpointage_{timestamp}.dump'
    target = BACKUP_DIR / filename
    cmd = [
        'pg_dump', '--format=custom', '--compress=6', '--no-owner', '--no-privileges',
        '--host', DB_HOST, '--port', str(DB_PORT), '--username', DB_USER,
        '--dbname', DB_NAME, '--file', str(target),
    ]
    logger.info(f"Running: pg_dump → {filename}")
    try:
        proc = subprocess.run(cmd, env=_pg_env(), capture_output=True, text=True, timeout=600)
    except subprocess.TimeoutExpired:
        target.unlink(missing_ok=True)
        raise RuntimeError('pg_dump timed out after 10 minutes')
    if proc.returncode != 0:
        target.unlink(missing_ok=True)
        err = (proc.stderr or proc.stdout or '').strip().splitlines()[-1:] or ['(no output)']
        raise RuntimeError(f'pg_dump failed: {err[0]}')

    size = target.stat().st_size
    logger.info(f"Backup OK: {filename} ({size / 1024:.1f} KB)")

    pushed = False
    ext_error: Optional[str] = None
    try:
        ext = backup_storage.get_external()
        if ext:
            logger.info(f"Pushing {filename} to {ext.name} ...")
            ext.upload(target)
            pushed = True
    except Exception as e:
        ext_error = str(e)
        logger.warning(f"External push failed for {filename}: {e}")

    try:
        cleanup_old_backups()
    except Exception as e:
        logger.warning(f"Backup retention cleanup failed: {e}")

    return {'filename': filename, 'size': size, 'pushed': pushed,
            'ext_error': ext_error, 'created_at': datetime.now().isoformat()}


def cleanup_old_backups() -> int:
    """Delete LOCAL backups older than backup_retention_days (0 = keep all).
    External copies are left untouched. Returns count deleted."""
    from app.database.connection import get_db_session
    with get_db_session() as db:
        s = db.query(AppSettings).first()
        days = int(getattr(s, 'backup_retention_days', 30) or 0) if s else 0
    if days <= 0:
        return 0
    cutoff = datetime.now().timestamp() - days * 86400
    removed = 0
    for pattern in ('*.dump', '*.json.gz'):
        for f in BACKUP_DIR.glob(pattern):
            try:
                if f.stat().st_mtime < cutoff:
                    f.unlink(missing_ok=True)
                    removed += 1
            except Exception:
                pass
    if removed:
        logger.info(f"Retention: deleted {removed} local backup(s) older than {days}d")
    return removed


@router.post('/maintenance/backup', response_model=BackupResponse,
             dependencies=[Depends(get_current_user)])
def create_backup(current_user: User = Depends(get_current_user)):
    """Create a full database backup using pg_dump custom format."""
    _require_admin(current_user)
    try:
        r = _perform_backup()
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    return BackupResponse(
        message='Backup created successfully',
        filename=r['filename'],
        created_at=r['created_at'],
        size_bytes=r['size'],
        pushed_to_external=r['pushed'],
        external_error=r['ext_error'],
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


# ── Verify (read TOC of a .dump without restoring) ─────────────────────────

class VerifyResponse(BaseModel):
    valid: bool
    format: str
    table_count: int
    sequence_count: int
    item_count: int
    sample_tables: List[str]
    message: str


@router.get('/maintenance/backup/{filename}/verify', response_model=VerifyResponse,
            dependencies=[Depends(get_current_user)])
def verify_backup(filename: str, current_user: User = Depends(get_current_user)):
    """Check that a .dump file is a valid pg_restore-readable archive.

    Reads the table-of-contents without modifying the database. Returns
    counts and a sample of table names so you can sanity-check that the
    file really contains what you expect.

    Legacy .json.gz files: opens the gzip and counts top-level keys.
    """
    _require_admin(current_user)
    path = _safe_backup_path(filename)
    fmt = _detect_format(path)

    if fmt == 'pgdump':
        if not _have_binary('pg_restore'):
            raise HTTPException(status_code=500,
                                detail='pg_restore binary not found in container')
        proc = subprocess.run(
            ['pg_restore', '--list', str(path)],
            capture_output=True, text=True, timeout=30,
        )
        if proc.returncode != 0:
            return VerifyResponse(
                valid=False, format='pgdump', table_count=0,
                sequence_count=0, item_count=0, sample_tables=[],
                message=(proc.stderr or 'pg_restore --list failed').strip().splitlines()[-1],
            )
        lines = [l for l in proc.stdout.splitlines() if l and not l.startswith(';')]
        tables  = [l for l in lines if ' TABLE DATA ' in l or l.rstrip().endswith(' TABLE')]
        seqs    = [l for l in lines if ' SEQUENCE ' in l]
        # Extract table names: line format is "N; OID NN TABLE schema name owner"
        sample = []
        for l in lines:
            if ' TABLE ' in l and ' TABLE DATA ' not in l:
                parts = l.split()
                if len(parts) >= 6:
                    sample.append(parts[5])
                    if len(sample) >= 8:
                        break
        return VerifyResponse(
            valid=True, format='pgdump',
            table_count=len(tables), sequence_count=len(seqs),
            item_count=len(lines), sample_tables=sample,
            message=f'Valid pg_dump archive — {len(lines)} entries in TOC',
        )
    else:
        # Legacy .json.gz
        try:
            with gzip.open(path, 'rt', encoding='utf-8') as f:
                data = json.load(f)
            data.pop('_metadata', None)
            return VerifyResponse(
                valid=True, format='json',
                table_count=len(data), sequence_count=0, item_count=len(data),
                sample_tables=list(data.keys())[:8],
                message=f'Valid legacy JSON backup — {len(data)} tables',
            )
        except Exception as e:
            return VerifyResponse(
                valid=False, format='json', table_count=0,
                sequence_count=0, item_count=0, sample_tables=[],
                message=f'Invalid JSON backup: {e}',
            )


# ── Delete ──────────────────────────────────────────────────────────────────

@router.delete('/maintenance/backup/{filename}',
               dependencies=[Depends(get_current_user)])
def delete_backup(filename: str, current_user: User = Depends(get_current_user)):
    _require_admin(current_user)
    path = _safe_backup_path(filename)
    path.unlink()
    return {'message': 'Backup deleted successfully'}


# ── External storage configuration ──────────────────────────────────────────

_PWD_MASK = '••••••••'

def _mask_password(cfg: dict) -> dict:
    out = dict(cfg or {})
    if out.get('password'):
        out['password'] = _PWD_MASK
    return out


@router.get('/maintenance/storage', response_model=StorageConfigOut,
            dependencies=[Depends(get_current_user)])
def get_storage_config(current_user: User = Depends(get_current_user)):
    """Return the configured external storage destination (password masked)."""
    _require_admin(current_user)
    with get_db_session() as db:
        s = db.query(AppSettings).first()
        if not s:
            return StorageConfigOut(type='none', config={})
        kind = (getattr(s, 'backup_storage_type', None) or 'none')
        raw  = getattr(s, 'backup_storage_config', None)
    cfg = {}
    if raw:
        try: cfg = json.loads(raw)
        except Exception: cfg = {}
    return StorageConfigOut(type=kind, config=_mask_password(cfg))


def _merge_with_existing_password(new_cfg: dict, kind: str) -> dict:
    """If incoming password is None or masked, keep the existing one."""
    pwd = (new_cfg.get('password') or '').strip()
    if pwd and pwd != _PWD_MASK:
        return new_cfg
    with get_db_session() as db:
        s = db.query(AppSettings).first()
        existing_raw = getattr(s, 'backup_storage_config', None) if s else None
        existing_type = (getattr(s, 'backup_storage_type', None) or '') if s else ''
    if existing_raw and existing_type == kind:
        try:
            existing = json.loads(existing_raw)
            if existing.get('password'):
                new_cfg['password'] = existing['password']
        except Exception:
            pass
    return new_cfg


@router.put('/maintenance/storage', response_model=StorageConfigOut,
            dependencies=[Depends(get_current_user)])
def update_storage_config(payload: StorageConfigIn,
                          current_user: User = Depends(get_current_user)):
    """Save the external storage destination config."""
    _require_admin(current_user)
    kind = (payload.type or 'none').lower()
    if kind not in ('none', 'smb'):
        raise HTTPException(status_code=400, detail=f'Unsupported storage type: {kind}')

    cfg: dict = {}
    if kind == 'smb':
        if not payload.smb:
            raise HTTPException(status_code=400, detail='Missing smb config block')
        cfg = payload.smb.model_dump(exclude_none=True)
        cfg = _merge_with_existing_password(cfg, 'smb')
        # Validate constructable
        try:
            backup_storage.SmbStorage(**cfg)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f'Invalid SMB config: {e}')

    with get_db_session() as db:
        s = db.query(AppSettings).first()
        if not s:
            s = AppSettings()
            db.add(s)
        s.backup_storage_type = kind
        if kind != 'none' and cfg:
            from app.core.crypto import encrypt_secret
            stored = dict(cfg)
            if stored.get('password'):
                stored['password'] = encrypt_secret(stored['password'])
            s.backup_storage_config = json.dumps(stored)
        else:
            s.backup_storage_config = None
        db.commit()

    return StorageConfigOut(type=kind, config=_mask_password(cfg))


@router.post('/maintenance/storage/test', response_model=TestStorageResponse,
             dependencies=[Depends(get_current_user)])
def test_storage_connection(payload: StorageConfigIn,
                            current_user: User = Depends(get_current_user)):
    """Test the connection to the configured (or proposed) external storage."""
    _require_admin(current_user)
    kind = (payload.type or 'none').lower()
    if kind == 'none':
        return TestStorageResponse(ok=True, message='No external storage configured')
    if kind == 'smb':
        if not payload.smb:
            return TestStorageResponse(ok=False, message='Missing SMB config')
        cfg = payload.smb.model_dump(exclude_none=True)
        cfg = _merge_with_existing_password(cfg, 'smb')
        from app.core.crypto import decrypt_secret
        if cfg.get('password'):
            cfg['password'] = decrypt_secret(cfg['password'])  # plaintext passes through
        try:
            storage = backup_storage.SmbStorage(**cfg)
        except Exception as e:
            return TestStorageResponse(ok=False, message=f'Invalid config: {e}')
        ok, msg = storage.test_connection()
        return TestStorageResponse(ok=ok, message=msg)
    return TestStorageResponse(ok=False, message=f'Unsupported type: {kind}')


@router.post('/maintenance/storage/smb-browse', response_model=SmbBrowseOut,
             dependencies=[Depends(get_current_user)])
def smb_browse(payload: SmbBrowseIn, current_user: User = Depends(get_current_user)):
    """Dynamic explorer: list a server's shares, or folders within a share.

    Lets the admin enter a server IP and navigate to a destination instead of
    typing the UNC path by hand. Password may be omitted/masked to reuse the
    saved (encrypted) one.
    """
    _require_admin(current_user)
    from app.core.crypto import decrypt_secret

    pwd = (payload.password or '').strip()
    if not pwd or pwd == _PWD_MASK:
        # Reuse the saved SMB password
        with get_db_session() as db:
            s = db.query(AppSettings).first()
            raw = getattr(s, 'backup_storage_config', None) if s else None
        if raw:
            try:
                pwd = decrypt_secret((json.loads(raw) or {}).get('password')) or ''
            except Exception:
                pwd = ''

    try:
        storage = backup_storage.SmbStorage(
            server=payload.server, share=(payload.share or 'IPC$'),
            username=payload.username, password=pwd, domain=payload.domain,
        )
    except Exception as e:
        return SmbBrowseOut(ok=False, message=f'Config invalide : {e}')

    # No share chosen yet → enumerate shares
    if not payload.share:
        try:
            shares = storage.list_shares()
            return SmbBrowseOut(ok=True, shares=shares)
        except Exception as e:
            return SmbBrowseOut(
                ok=False,
                message=("Impossible de lister les partages automatiquement. "
                         "Saisissez le nom du partage manuellement puis parcourez les dossiers. "
                         f"({e})"),
            )

    # Share chosen → list its sub-folders at the given path
    try:
        folders = storage.list_folders(payload.share, payload.path or '')
        return SmbBrowseOut(ok=True, folders=[f['name'] for f in folders])
    except Exception as e:
        return SmbBrowseOut(ok=False, message=f'{type(e).__name__}: {e}')


@router.get('/maintenance/backup-schedule', response_model=BackupScheduleOut,
            dependencies=[Depends(get_current_user)])
def get_backup_schedule(current_user: User = Depends(get_current_user)):
    _require_admin(current_user)
    with get_db_session() as db:
        s = db.query(AppSettings).first()
        if not s:
            return BackupScheduleOut()
        lr = getattr(s, 'backup_last_run_at', None)
        return BackupScheduleOut(
            enabled=bool(getattr(s, 'backup_schedule_enabled', False)),
            frequency=getattr(s, 'backup_schedule_frequency', 'daily') or 'daily',
            time=getattr(s, 'backup_schedule_time', '02:00') or '02:00',
            weekday=int(getattr(s, 'backup_schedule_weekday', 0) or 0),
            retention_days=int(getattr(s, 'backup_retention_days', 30) or 0),
            last_run_at=lr.isoformat() if lr else None,
        )


@router.put('/maintenance/backup-schedule', response_model=BackupScheduleOut,
            dependencies=[Depends(get_current_user)])
def update_backup_schedule(payload: BackupScheduleIn,
                           current_user: User = Depends(get_current_user)):
    _require_admin(current_user)
    freq = payload.frequency if payload.frequency in ('daily', 'weekly') else 'daily'
    # validate HH:MM
    try:
        hh, mm = [int(x) for x in (payload.time or '02:00').split(':')]
        assert 0 <= hh <= 23 and 0 <= mm <= 59
        tstr = f"{hh:02d}:{mm:02d}"
    except Exception:
        raise HTTPException(status_code=400, detail="Heure invalide (format HH:MM)")
    with get_db_session() as db:
        s = db.query(AppSettings).first()
        if not s:
            s = AppSettings(); db.add(s)
        s.backup_schedule_enabled = bool(payload.enabled)
        s.backup_schedule_frequency = freq
        s.backup_schedule_time = tstr
        s.backup_schedule_weekday = max(0, min(6, int(payload.weekday or 0)))
        s.backup_retention_days = max(0, min(3650, int(payload.retention_days or 0)))
        db.commit()
        lr = getattr(s, 'backup_last_run_at', None)
        return BackupScheduleOut(
            enabled=s.backup_schedule_enabled, frequency=s.backup_schedule_frequency,
            time=s.backup_schedule_time, weekday=s.backup_schedule_weekday,
            retention_days=s.backup_retention_days,
            last_run_at=lr.isoformat() if lr else None,
        )
