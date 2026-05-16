"""External backup storage abstraction.

The local copy under BACKUP_DIR is always kept (safety net). After a
successful backup we OPTIONALLY push the same file to one configured
external destination — currently SMB (Windows shared folder / Samba).

Future destinations: S3, SFTP, etc. — add a new subclass implementing
the small `BackupStorage` interface and wire it into `get_external()`.

Configuration is stored in app_settings:
    backup_storage_type   : 'none' | 'smb'
    backup_storage_config : JSON string with type-specific fields
"""
from __future__ import annotations
import json
import logging
from abc import ABC, abstractmethod
from datetime import datetime
from pathlib import Path
from typing import Iterable, List, Optional

logger = logging.getLogger(__name__)


# ── Common shape returned by list() ─────────────────────────────────────────

def _entry(name: str, size: int, mtime: datetime, source: str) -> dict:
    return {
        'filename':    name,
        'size_bytes':  int(size),
        'created_at':  mtime.isoformat(),
        'source':      source,                  # 'local' | 'smb' | ...
    }


# ── Abstract interface ─────────────────────────────────────────────────────

class BackupStorage(ABC):
    name: str = 'unknown'

    @abstractmethod
    def upload(self, local_path: Path) -> None:
        """Push a local file to this destination. Overwrites if it exists."""

    @abstractmethod
    def list(self) -> List[dict]:
        """List backup files at this destination, sorted newest first."""

    @abstractmethod
    def download(self, remote_name: str, local_path: Path) -> None:
        """Pull one file from the destination into a local path."""

    @abstractmethod
    def delete(self, remote_name: str) -> None: ...

    @abstractmethod
    def test_connection(self) -> tuple[bool, str]:
        """Return (ok, message). Used by the 'Test connection' button."""


# ── SMB implementation ─────────────────────────────────────────────────────

class SmbStorage(BackupStorage):
    """SMB v2/v3 client (works with Windows shares and Samba on Linux).

    Required config: server, share, username, password.
    Optional:        domain (Windows), remote_path (default 'rtpointage').
    """
    name = 'smb'

    def __init__(self, *, server: str, share: str, username: str, password: str,
                 domain: Optional[str] = None, remote_path: str = 'rtpointage'):
        self.server      = (server or '').strip()
        self.share       = (share or '').strip()
        self.username    = (username or '').strip()
        self.password    = password or ''
        self.domain      = (domain or '').strip() or None
        self.remote_path = (remote_path or 'rtpointage').strip('/\\')

        if not (self.server and self.share and self.username):
            raise ValueError("SMB config requires server, share, and username")

    def _connect(self):
        from smbclient import ClientConfig, register_session
        ClientConfig(username=self.username, password=self.password)
        register_session(self.server, username=self.username,
                         password=self.password, encrypt=True)

    def _disconnect(self):
        try:
            from smbclient import delete_session
            delete_session(self.server)
        except Exception:
            pass

    def _full_path(self, name: str = '') -> str:
        # smbclient expects: //server/share/path
        base = f"//{self.server}/{self.share}/{self.remote_path}"
        return f"{base}/{name}" if name else base

    def _ensure_dir(self):
        from smbclient import makedirs
        try:
            makedirs(self._full_path(), exist_ok=True)
        except Exception:
            pass  # best-effort

    def upload(self, local_path: Path) -> None:
        from smbclient import open_file
        self._connect()
        try:
            self._ensure_dir()
            remote = self._full_path(local_path.name)
            with open(local_path, 'rb') as src, open_file(remote, mode='wb') as dst:
                while True:
                    chunk = src.read(64 * 1024)
                    if not chunk: break
                    dst.write(chunk)
        finally:
            self._disconnect()

    def list(self) -> List[dict]:
        from smbclient import scandir
        self._connect()
        out: List[dict] = []
        try:
            self._ensure_dir()
            for entry in scandir(self._full_path()):
                try:
                    if not entry.is_file(): continue
                    if not (entry.name.endswith('.dump') or entry.name.endswith('.json.gz')):
                        continue
                    st = entry.stat()
                    out.append(_entry(
                        entry.name, st.st_size,
                        datetime.fromtimestamp(st.st_mtime), 'smb',
                    ))
                except Exception as e:
                    logger.warning(f"SMB scandir entry error: {e}")
        finally:
            self._disconnect()
        return sorted(out, key=lambda x: x['created_at'], reverse=True)

    def download(self, remote_name: str, local_path: Path) -> None:
        from smbclient import open_file
        self._connect()
        try:
            with open_file(self._full_path(remote_name), mode='rb') as src, \
                 open(local_path, 'wb') as dst:
                while True:
                    chunk = src.read(64 * 1024)
                    if not chunk: break
                    dst.write(chunk)
        finally:
            self._disconnect()

    def delete(self, remote_name: str) -> None:
        from smbclient import remove
        self._connect()
        try:
            remove(self._full_path(remote_name))
        finally:
            self._disconnect()

    def test_connection(self) -> tuple[bool, str]:
        try:
            from smbclient import stat as smb_stat
            self._connect()
            try:
                smb_stat(f"//{self.server}/{self.share}")
            finally:
                self._disconnect()
            return True, f"Connexion OK : //{self.server}/{self.share}"
        except Exception as e:
            return False, f"{type(e).__name__}: {e}"


# ── Factory ─────────────────────────────────────────────────────────────────

def get_external() -> Optional[BackupStorage]:
    """Build the configured external storage (or None if 'none')."""
    from app.database.connection import get_db_session
    from app.database.schema import AppSettings
    with get_db_session() as db:
        s = db.query(AppSettings).first()
        if not s:
            return None
        kind = (getattr(s, 'backup_storage_type', None) or 'none').lower()
        raw  = getattr(s, 'backup_storage_config', None)
    if kind == 'none' or not raw:
        return None
    try:
        cfg = json.loads(raw)
    except Exception:
        return None
    if kind == 'smb':
        try:
            return SmbStorage(**cfg)
        except Exception as e:
            logger.error(f"SMB storage config invalid: {e}")
            return None
    logger.warning(f"Unknown backup storage type: {kind}")
    return None
