from zk import ZK
from typing import Optional, List
from datetime import datetime
import logging
import socket
import struct
import threading
import time
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError
from app.core import settings
from app.models import DeviceInfo, User, Attendance

logger = logging.getLogger(__name__)

# Per-device connection locks to prevent concurrent connections to same device
_device_locks: dict[str, threading.Lock] = {}
_locks_lock = threading.Lock()

# Timeout for the TCP/UDP handshake
CONNECT_TIMEOUT = 8
# Maximum time to wait for disconnect (force-kill after this)
DISCONNECT_TIMEOUT = 5
# Maximum time for a single heavy operation (get_attendance on big data)
# K40 with ~50k records takes ~150s; 300s gives comfortable headroom.
HEAVY_OP_TIMEOUT = 300
# Short delay between successive connections to same device (K14 needs recovery time)
RECONNECT_DELAY = 2.0
# Number of retry attempts when connecting to a device
CONNECT_RETRIES = 3
# Thread pool for running blocking device I/O with hard timeout
_thread_pool = ThreadPoolExecutor(max_workers=4, thread_name_prefix="zk-io")


def _get_device_lock(ip: str) -> threading.Lock:
    """Get or create a per-device lock to prevent concurrent connections"""
    with _locks_lock:
        if ip not in _device_locks:
            _device_locks[ip] = threading.Lock()
        return _device_locks[ip]


def _run_with_timeout(func, timeout_sec: float, description: str = "operation",
                      zk_instance=None):
    """Run a blocking function in a thread with a hard timeout.
    
    If the function doesn't complete within timeout_sec, **force-closes the
    underlying socket** so the thread unblocks from its recv() call and the
    device's session is freed immediately.  This is the key fix: without
    socket destruction, the background thread stays stuck forever and the
    device thinks a session is still active, refusing all future connections.
    
    Args:
        func: blocking callable
        timeout_sec: hard deadline in seconds
        description: human-readable label for log messages
        zk_instance: the ZK object whose __sock we kill on timeout
    """
    future = _thread_pool.submit(func)
    try:
        return future.result(timeout=timeout_sec)
    except FuturesTimeoutError:
        future.cancel()
        # Force-close the socket so the blocked recv() in the worker thread
        # raises an exception and the thread actually terminates.
        if zk_instance:
            _force_close_zk_socket(zk_instance, description)
        raise TimeoutError(f"Device {description} timed out after {timeout_sec}s")


def _force_close_zk_socket(zk_instance, label: str = ""):
    """Destroy the raw socket on a ZK instance to unblock any pending recv()."""
    try:
        sock = getattr(zk_instance, '_ZK__sock', None)
        if sock:
            logger.warning(f"Force-closing socket for {label}")
            try:
                sock.shutdown(socket.SHUT_RDWR)
            except Exception:
                pass
            try:
                sock.close()
            except Exception:
                pass
    except Exception:
        pass


def _try_clear_stale_session(ip: str, port: int):
    """Send a raw ZK CMD_EXIT via TCP to force the device to drop any stale
    session.  This is a best-effort attempt — if it fails the caller should
    fall back to retry-with-delay.
    
    ZKTeco devices only allow ONE active session.  If a previous connection
    timed out and the socket was force-closed on our side, the device may
    still think the session is alive.  Sending CMD_EXIT (command id 1001)
    with session_id=0 tells the firmware to reset.
    """
    CMD_EXIT = 1001
    for protocol in ('tcp', 'udp'):
        try:
            if protocol == 'tcp':
                s = socket.create_connection((ip, port), timeout=3)
                header = struct.pack('<HHHH', CMD_EXIT, 0, 0, 0)
                # ZK TCP wraps the payload with a 4-byte length prefix
                s.sendall(b'\x50\x50\x82\x7e' + struct.pack('<H', len(header)) + b'\x00\x00' + header)
            else:
                s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
                s.settimeout(3)
                header = struct.pack('<HHHH', CMD_EXIT, 0, 0, 0)
                s.sendto(header, (ip, port))
            try:
                s.recv(64)
            except Exception:
                pass
            s.close()
            logger.info(f"Sent CMD_EXIT ({protocol.upper()}) to {ip}:{port} to clear stale session")
            return True
        except Exception as e:
            logger.debug(f"CMD_EXIT {protocol.upper()} to {ip}:{port} failed: {e}")
            try:
                s.close()
            except Exception:
                pass
    return False


class ZKTecoDeviceManager:
    """Manager class for ZKTeco device operations.
    
    Key design for older devices (K14 fw 4.0.4 etc):
    - Per-device locking prevents concurrent connections that overwhelm the device
    - All heavy I/O runs with a hard timeout to prevent infinite hangs
    - disable_device() is called before bulk reads to prevent mid-transfer interference
    - enable_device() is always restored on disconnect
    - Forced socket cleanup if disconnect hangs
    - Small delay between reconnections to let the device recover
    
    Usage patterns:
    
    1. Simple (auto connect/disconnect per call):
        manager = ZKTecoDeviceManager(ip="10.185.1.202", port=4370)
        users = manager.get_users()
    
    2. Reuse connection (single connect for multiple operations):
        with manager.session() as mgr:
            users = mgr.get_users()
            attendance = mgr.get_attendance()
    """
    
    def __init__(self, ip: str = None, port: int = None, timeout: int = None,
                 password: int = None, force_udp: bool = False,
                 max_retries: int = None):
        self.ip = ip or settings.DEVICE_IP
        self.port = port or settings.DEVICE_PORT
        self.timeout = timeout or settings.DEVICE_TIMEOUT
        self.password = password or settings.DEVICE_PASSWORD
        self.force_udp = force_udp
        self.max_retries = max_retries if max_retries is not None else CONNECT_RETRIES
        self.conn = None
        self.zk = None
        self._in_session = False
        self._device_lock = _get_device_lock(self.ip)
        self._lock_acquired = False
        # Cache users fetched during this session to avoid redundant reads
        self._cached_users = None
        
    def connect(self) -> bool:
        """Establish connection to the ZKTeco device.
        
        Acquires a per-device lock, then tries TCP first, then UDP.
        If the device rejects the ZK handshake (connection reset — usually a
        stale session), we send a raw CMD_EXIT to clear it and retry up to
        CONNECT_RETRIES times with a delay between each attempt.
        """
        if not self._lock_acquired:
            acquired = self._device_lock.acquire(timeout=self.timeout + 30)
            if not acquired:
                raise TimeoutError(
                    f"Another operation is in progress on device {self.ip}. "
                    "Please wait and try again."
                )
            self._lock_acquired = True
        
        last_error = None
        
        for attempt in range(1, self.max_retries + 1):
            for force_udp in ([False, True] if not self.force_udp else [True]):
                try:
                    protocol = "UDP" if force_udp else "TCP"
                    logger.info(f"Connecting via {protocol} to {self.ip}:{self.port} "
                                f"(attempt {attempt}/{self.max_retries})")
                    
                    self.zk = ZK(
                        self.ip,
                        port=self.port,
                        timeout=CONNECT_TIMEOUT,
                        password=self.password,
                        force_udp=force_udp,
                        ommit_ping=True,
                        verbose=False
                    )
                    
                    self.conn = self.zk.connect()
                    
                    # Set per-socket timeout for data operations.
                    if self.conn and hasattr(self.zk, '_ZK__sock') and self.zk._ZK__sock:
                        self.zk._ZK__sock.settimeout(self.timeout)
                    
                    logger.info(f"Connected via {protocol} to {self.ip}:{self.port}")
                    return True
                    
                except Exception as e:
                    last_error = e
                    err_str = str(e)
                    is_reset = ("10054" in err_str or "reset" in err_str.lower()
                                or "fermée" in err_str.lower()
                                or "established connection was aborted" in err_str.lower())
                    logger.warning(
                        f"Connection via {protocol} to {self.ip} failed "
                        f"(attempt {attempt}): {e}"
                    )
                    self._force_cleanup()
                    
                    # If connection reset, try to clear the stale device session
                    if is_reset and attempt < self.max_retries:
                        logger.info(f"Attempting to clear stale session on {self.ip}")
                        _try_clear_stale_session(self.ip, self.port)
                    continue
            
            # Pause before next retry attempt
            if attempt < self.max_retries:
                logger.info(f"Waiting {RECONNECT_DELAY}s before retry...")
                time.sleep(RECONNECT_DELAY)
        
        self._release_lock()
        raise ConnectionError(
            f"Failed to connect to device {self.ip}:{self.port} after "
            f"{self.max_retries} attempts. Last error: {last_error}"
        )
    
    def disconnect(self):
        """Disconnect from the device. Always force-closes socket as a final safety net."""
        try:
            if self.conn:
                # Re-enable the device so it doesn't stay in "disabled" mode
                try:
                    self.conn.enable_device()
                except Exception:
                    pass
                
                # Run disconnect in a thread with a hard timeout
                t = threading.Thread(target=self._safe_disconnect, daemon=True)
                t.start()
                t.join(timeout=DISCONNECT_TIMEOUT)
                
                if t.is_alive():
                    logger.warning(
                        f"Disconnect from {self.ip} timed out after "
                        f"{DISCONNECT_TIMEOUT}s — forcing socket close"
                    )
        except Exception as e:
            logger.error(f"Disconnect error for {self.ip}: {e}")
        finally:
            # ALWAYS force-close the socket regardless of whether disconnect
            # succeeded. This guarantees the device session is freed.
            self._force_cleanup()
            self.conn = None
            self.zk = None
            self._cached_users = None
            self._release_lock()
            # Small delay to let the device fully release the session
            time.sleep(0.5)
    
    def _safe_disconnect(self):
        try:
            if self.conn:
                self.conn.disconnect()
        except Exception as e:
            logger.debug(f"Safe disconnect error: {e}")
    
    def _force_cleanup(self):
        """Force-close the underlying socket to prevent hung connections."""
        try:
            if self.zk and hasattr(self.zk, '_ZK__sock') and self.zk._ZK__sock:
                try:
                    self.zk._ZK__sock.shutdown(socket.SHUT_RDWR)
                except Exception:
                    pass
                try:
                    self.zk._ZK__sock.close()
                except Exception:
                    pass
        except Exception:
            pass
        self.conn = None
        self.zk = None
    
    def _release_lock(self):
        if self._lock_acquired:
            try:
                self._device_lock.release()
            except RuntimeError:
                pass
            self._lock_acquired = False
    
    def _ensure_connected(self):
        if not self.conn:
            self.connect()
    
    # ── Session context manager ──────────────────────────────────────────
    
    class _Session:
        def __init__(self, manager: 'ZKTecoDeviceManager'):
            self._mgr = manager
        def __enter__(self) -> 'ZKTecoDeviceManager':
            self._mgr._in_session = True
            self._mgr.connect()
            return self._mgr
        def __exit__(self, exc_type, exc_val, exc_tb):
            self._mgr._in_session = False
            self._mgr.disconnect()
            return False
    
    def session(self) -> '_Session':
        """Keep one connection open for multiple operations.
        
            with manager.session() as mgr:
                users = mgr.get_users()
                attendance = mgr.get_attendance()
        """
        return self._Session(self)
    
    # ── Device info (lightweight) ────────────────────────────────────────
    
    def get_device_info(self) -> DeviceInfo:
        """Get device metadata without downloading attendance records."""
        need_disconnect = not self._in_session
        try:
            self._ensure_connected()
            
            serial_number = self.conn.get_serialnumber()
            device_name = self.conn.get_device_name()
            firmware_version = self.conn.get_firmware_version()
            platform = self.conn.get_platform()
            mac = self.conn.get_mac()
            
            # read_sizes() is cheap and gives us record counts without
            # downloading the actual data
            user_count = 0
            rec_count = 0
            fp_count = 0
            try:
                self.conn.read_sizes()
                user_count = self.conn.users
                rec_count = self.conn.records
                fp_count = self.conn.fingers
            except Exception as e:
                logger.warning(f"read_sizes failed on {self.ip}: {e}")
            
            # Try to read the device's ExtendFmt to determine date format
            # ExtendFmt 0 = standard (YYYY-MM-DD), 1 = extended
            # ZKTeco devices always return datetime objects via pyzk,
            # so YYYY-MM-DD is the safe default for all standard devices.
            date_format = "YYYY-MM-DD"
            try:
                extend_fmt = self.conn.get_extend_fmt()
                logger.debug(f"Device {self.ip} ExtendFmt={extend_fmt}")
                # extend_fmt 0 or None → standard YYYY-MM-DD
                # All known formats map to YYYY-MM-DD since pyzk decodes
                # binary timestamps to Python datetime consistently.
            except Exception as e:
                logger.debug(f"Could not read ExtendFmt from {self.ip}: {e}")
            
            return DeviceInfo(
                serial_number=serial_number or "Unknown",
                device_name=device_name or "ZKTeco Device",
                firmware_version=firmware_version or "Unknown",
                platform=platform or "Unknown",
                fingerprint_count=fp_count,
                user_count=user_count,
                face_count=0,
                attendance_count=rec_count,
                ip_address=self.ip,
                mac_address=mac or "Unknown",
                date_format=date_format
            )
        except Exception as e:
            logger.error(f"Error getting device info from {self.ip}: {e}")
            raise
        finally:
            if need_disconnect:
                self.disconnect()
    
    # ── Users ────────────────────────────────────────────────────────────
    
    def get_users(self) -> List[User]:
        """Get all users from the device."""
        need_disconnect = not self._in_session
        try:
            self._ensure_connected()
            
            # In a session, cache users to avoid redundant reads.
            # pyzk's get_attendance() internally calls get_users() again,
            # so caching here prevents double-reading users from the device.
            if self._in_session and self._cached_users is not None:
                logger.debug(f"Returning {len(self._cached_users)} cached users for {self.ip}")
                return self._cached_users
            
            def _fetch():
                return self.conn.get_users()
            
            users = _run_with_timeout(_fetch, self.timeout, f"{self.ip} get_users",
                                      zk_instance=self.zk)
            
            user_list = []
            for u in users:
                user_list.append(User(
                    uid=u.uid,
                    name=u.name,
                    privilege=u.privilege,
                    password=u.password if hasattr(u, 'password') else None,
                    group_id=u.group_id,
                    user_id=u.user_id,
                    card=u.card if hasattr(u, 'card') else None
                ))
            
            if self._in_session:
                self._cached_users = user_list
            
            return user_list
        except Exception as e:
            logger.error(f"Error getting users from {self.ip}: {e}")
            raise
        finally:
            if need_disconnect:
                self.disconnect()
    
    # ── Attendance ───────────────────────────────────────────────────────
    
    def get_attendance(self) -> List[Attendance]:
        """Get all attendance records from the device.
        
        IMPORTANT for older devices (K14 etc):
        - Disables the device during transfer to prevent fingerprint scan
          interference that causes the device to freeze.
        - Runs with a hard timeout so the system recovers if the device stalls.
        - Re-enables device after transfer (also guaranteed by disconnect).
        """
        need_disconnect = not self._in_session
        try:
            self._ensure_connected()
            
            # Disable device during bulk read to prevent interference
            # from fingerprint scans that can corrupt the data stream
            # on older firmwares (K14 fw 4.0.4 etc.)
            try:
                self.conn.disable_device()
                logger.debug(f"Device {self.ip} disabled for attendance download")
            except Exception as e:
                logger.debug(f"disable_device on {self.ip} not required: {e}")
            
            logger.info(f"Fetching attendance from {self.ip}...")
            
            # Bump socket timeout for the heavy transfer
            original_timeout = self.timeout
            if hasattr(self.zk, '_ZK__sock') and self.zk._ZK__sock:
                self.zk._ZK__sock.settimeout(HEAVY_OP_TIMEOUT)
            
            try:
                def _fetch():
                    return self.conn.get_attendance()
                
                records = _run_with_timeout(
                    _fetch, HEAVY_OP_TIMEOUT,
                    f"{self.ip} get_attendance",
                    zk_instance=self.zk
                )
            finally:
                # Restore socket timeout
                if hasattr(self.zk, '_ZK__sock') and self.zk._ZK__sock:
                    try:
                        self.zk._ZK__sock.settimeout(original_timeout)
                    except Exception:
                        pass
                # Re-enable device
                try:
                    self.conn.enable_device()
                    logger.debug(f"Device {self.ip} re-enabled after attendance download")
                except Exception:
                    pass
            
            # Return raw pyzk records directly — they have the same
            # .uid / .user_id / .timestamp / .status / .punch attributes
            # as our Pydantic Attendance model.  Skipping the conversion
            # loop saves ~130s on 50k records.
            records = list(records) if records else []
            logger.info(f"Fetched {len(records)} attendance records from {self.ip}")
            return records
        except TimeoutError:
            logger.error(
                f"Attendance download from {self.ip} timed out after "
                f"{HEAVY_OP_TIMEOUT}s — socket destroyed to free device session"
            )
            # Socket was already killed by _run_with_timeout; mark as gone
            self.conn = None
            self.zk = None
            raise
        except Exception as e:
            logger.error(f"Error getting attendance from {self.ip}: {e}")
            raise
        finally:
            if need_disconnect:
                self.disconnect()
    
    # ── User modification ────────────────────────────────────────────────
    
    def add_user(self, uid: int, name: str, privilege: int = 0, password: str = "",
                 group_id: str = "", user_id: str = "", card: int = 0) -> bool:
        need_disconnect = not self._in_session
        try:
            self._ensure_connected()
            self.conn.set_user(uid=uid, name=name, privilege=privilege,
                               password=password, group_id=group_id,
                               user_id=user_id, card=card)
            logger.info(f"User {name} added to {self.ip}")
            self._cached_users = None  # invalidate cache
            return True
        except Exception as e:
            logger.error(f"Error adding user to {self.ip}: {e}")
            raise
        finally:
            if need_disconnect:
                self.disconnect()
    
    def update_user(self, uid: int, name: str, privilege: int = 0, password: str = "",
                    group_id: str = "", user_id: str = "", card: int = 0) -> bool:
        """Update a specific user on the device (delete + re-add).
        
        Handles UID/user_id mismatches: on some ZKTeco devices the internal UID
        differs from user_id.  We first look up the real UID on the device by
        matching ``user_id``, then fall back to the supplied ``uid``.
        """
        need_disconnect = not self._in_session
        try:
            self._ensure_connected()
            
            # Resolve the REAL device UID for this user_id.
            # On many devices uid == user_id, but some (Unibio 202 etc.)
            # assign their own internal UIDs that don't match.
            real_uid = uid
            if user_id:
                try:
                    existing_users = self._cached_users
                    if existing_users is None:
                        existing_users = self.conn.get_users() or []
                    for u in existing_users:
                        if str(getattr(u, 'user_id', '')) == str(user_id):
                            real_uid = int(u.uid)
                            if real_uid != uid:
                                logger.info(f"UID resolved: user_id={user_id} → device UID={real_uid} (supplied uid={uid}) on {self.ip}")
                            break
                except Exception as e:
                    logger.warning(f"Could not resolve real UID for user_id={user_id} on {self.ip}: {e}")
            
            logger.info(f"Updating user UID={real_uid} (user_id={user_id}) on {self.ip}")
            
            user_existed = False
            try:
                self.conn.delete_user(uid=real_uid)
                user_existed = True
            except Exception:
                pass
            
            self.conn.set_user(uid=real_uid, name=name, privilege=privilege,
                               password=password, group_id=group_id,
                               user_id=user_id, card=card)
            try:
                self.conn.enable_device()
            except Exception:
                pass
            
            self._cached_users = None
            action = "updated" if user_existed else "created"
            logger.info(f"User {name} (UID:{real_uid}) {action} on {self.ip}")
            return True
        except Exception as e:
            logger.error(f"Error updating user UID={uid} on {self.ip}: {e}")
            raise
        finally:
            if need_disconnect:
                self.disconnect()
    
    def delete_user(self, uid: int) -> bool:
        need_disconnect = not self._in_session
        try:
            self._ensure_connected()
            self.conn.delete_user(uid=uid)
            self._cached_users = None
            logger.info(f"User {uid} deleted from {self.ip}")
            return True
        except Exception as e:
            logger.error(f"Error deleting user from {self.ip}: {e}")
            raise
        finally:
            if need_disconnect:
                self.disconnect()
    
    # ── Attendance management ────────────────────────────────────────────
    
    def clear_attendance(self) -> bool:
        need_disconnect = not self._in_session
        try:
            self._ensure_connected()
            self.conn.clear_attendance()
            logger.info(f"Attendance records cleared on {self.ip}")
            return True
        except Exception as e:
            logger.error(f"Error clearing attendance on {self.ip}: {e}")
            raise
        finally:
            if need_disconnect:
                self.disconnect()
    
    # ── Device control ───────────────────────────────────────────────────
    
    def enable_device(self) -> bool:
        need_disconnect = not self._in_session
        try:
            self._ensure_connected()
            self.conn.enable_device()
            logger.info(f"Device {self.ip} enabled")
            return True
        except Exception as e:
            logger.error(f"Error enabling device {self.ip}: {e}")
            raise
        finally:
            if need_disconnect:
                self.disconnect()
    
    def disable_device(self) -> bool:
        need_disconnect = not self._in_session
        try:
            self._ensure_connected()
            self.conn.disable_device()
            logger.info(f"Device {self.ip} disabled")
            return True
        except Exception as e:
            logger.error(f"Error disabling device {self.ip}: {e}")
            raise
        finally:
            if need_disconnect:
                self.disconnect()
    
    def restart_device(self) -> bool:
        need_disconnect = not self._in_session
        try:
            self._ensure_connected()
            self.conn.restart()
            logger.info(f"Device {self.ip} restart command sent")
            return True
        except Exception as e:
            logger.error(f"Error restarting device {self.ip}: {e}")
            raise
        finally:
            if need_disconnect:
                self.disconnect()
    
    def poweroff_device(self) -> bool:
        need_disconnect = not self._in_session
        try:
            self._ensure_connected()
            self.conn.poweroff()
            logger.info(f"Device {self.ip} poweroff command sent")
            return True
        except Exception as e:
            logger.error(f"Error powering off device {self.ip}: {e}")
            raise
        finally:
            if need_disconnect:
                self.disconnect()
    
    def test_voice(self, index: int = 0) -> bool:
        need_disconnect = not self._in_session
        try:
            self._ensure_connected()
            self.conn.test_voice(index=index)
            logger.info(f"Voice test {index} executed on {self.ip}")
            return True
        except Exception as e:
            logger.error(f"Error testing voice on {self.ip}: {e}")
            raise
        finally:
            if need_disconnect:
                self.disconnect()
    
    def get_time(self) -> dict:
        need_disconnect = not self._in_session
        try:
            self._ensure_connected()
            device_time = self.conn.get_time()
            return {
                "device_time": device_time.isoformat() if device_time else None,
                "timezone_offset": 0
            }
        except Exception as e:
            logger.error(f"Error getting device time from {self.ip}: {e}")
            raise
        finally:
            if need_disconnect:
                self.disconnect()
    
    def set_time(self, timestamp=None) -> bool:
        need_disconnect = not self._in_session
        try:
            from datetime import timezone as tz
            self._ensure_connected()
            if timestamp is None:
                timestamp = datetime.now(tz.utc)
            self.conn.set_time(timestamp)
            logger.info(f"Device {self.ip} time set to: {timestamp}")
            return True
        except Exception as e:
            logger.error(f"Error setting device time on {self.ip}: {e}")
            raise
        finally:
            if need_disconnect:
                self.disconnect()


# Singleton instance
device_manager = ZKTecoDeviceManager()
