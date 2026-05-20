import logging
import threading
import time
from collections import defaultdict
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy.dialects.postgresql import insert as pg_insert
from app.database import get_db_session
from app.database.schema import (
    Device as DBDevice,
    Employee as DBEmployee,
    Attendance as DBAttendance,
    SyncLog,
    Company,
    Department
)
from app.services.device_store import device_store
from app.services.device_manager import ZKTecoDeviceManager

logger = logging.getLogger(__name__)

# Small delay between heavy device operations to let older firmware recover
INTER_OP_DELAY = 0.8  # seconds

# Default organizational IDs (created by create_defaults.py)
DEFAULT_COMPANY_ID = 1
DEFAULT_DEPARTMENT_ID = 1
DEFAULT_POSITION_ID = 1

# One lock per device_id — prevents two simultaneous syncs of the same
# device (which would race on duplicate detection AND can crash older
# ZKTeco firmware that doesn't support concurrent sessions).
_device_locks: dict[str, threading.Lock] = defaultdict(threading.Lock)


class DeviceSyncService:
    """Service to sync device data to database (manual trigger only)."""

    def __init__(self, max_retries: int = 3, retry_delay: int = 30):
        self.max_retries = max_retries
        self.retry_delay = retry_delay
        self.is_running = False
    
    def _sync_device_blocking(self, device_id: str):
        """
        Synchronous device sync — called via asyncio.to_thread().

        Uses a SINGLE connection for get_device_info + get_users + get_attendance
        to avoid hammering older devices with multiple connect/disconnect cycles.

        Serialised per device via _device_locks so a manual UI sync and the
        scheduler's auto-sync can't both hit the same device at the same time.
        If a sync is already running for this device, the second caller
        waits for it to finish — same end result (records get synced once),
        no duplicate INSERTs, no concurrent ZKTeco sessions.
        """
        lock = _device_locks[device_id]
        acquired = lock.acquire(blocking=False)
        if not acquired:
            logger.info(f"Sync already in progress for device {device_id} — waiting…")
            lock.acquire()  # block until the other sync releases
        try:
            return self._sync_device_locked(device_id)
        finally:
            lock.release()

    def _sync_device_locked(self, device_id: str):
        device_config = device_store.get_by_id(device_id)
        if not device_config:
            logger.warning(f"Device {device_id} not found")
            return
        
        started_at = datetime.now(timezone.utc)
        sync_log = SyncLog(
            device_id=device_id,
            sync_type='full',
            status='error',
            started_at=started_at
        )
        
        try:
            with get_db_session() as db:
                # Get or create device in DB
                db_device = db.query(DBDevice).filter(DBDevice.id == device_id).first()
                if not db_device:
                    db_device = DBDevice(
                        id=device_config.id,
                        name=device_config.name,
                        ip=device_config.ip,
                        port=device_config.port,
                        tag=device_config.tag,
                        serial_number=device_config.serial_number,
                        is_active=True
                    )
                    db.add(db_device)
                    db.commit()
                    db.refresh(db_device)
                
                # Use a SINGLE connection for the entire sync operation
                # This avoids hammering the device with multiple connect/disconnect cycles
                logger.debug(f"Connecting to device {device_config.name} at {device_config.ip}:{device_config.port}")
                manager = ZKTecoDeviceManager(
                    ip=device_config.ip,
                    port=device_config.port,
                    timeout=15  # Slightly longer for older devices
                )
                
                records_synced = 0
                
                with manager.session() as mgr:
                    # Verify connection by fetching device info (lightweight)
                    try:
                        info = mgr.get_device_info()
                    except Exception as e:
                        error_msg = f'Failed to get info from device at {device_config.ip}:{device_config.port}: {e}'
                        sync_log.status = 'error'
                        sync_log.error_message = error_msg
                        db.add(sync_log)
                        db.commit()
                        logger.error(f"Could not connect to device {device_config.name}: {error_msg}")
                        raise ConnectionError(error_msg)
                    
                    # ---- Sync users (reusing same connection) ----
                    users = mgr.get_users() or []
                    logger.info(f"Syncing {len(users)} users from {device_config.name}")
                    
                    # Small delay to let old firmware recover before next heavy call
                    time.sleep(INTER_OP_DELAY)
                    
                    for user in users:
                        user_data = user if isinstance(user, dict) else {
                            'uid': user.uid,
                            'name': user.name,
                            'privilege': user.privilege,
                            'password': user.password,
                            'group_id': user.group_id,
                            'user_id': user.user_id,
                            'card': user.card
                        }
                        
                        device_privilege = user_data['privilege']
                        app_privilege = 14 if device_privilege == 6 else 0
                        
                        # Match by user_id AND source_device_id — allow same user_id on different devices
                        db_employee = db.query(DBEmployee).filter(
                            DBEmployee.user_id == user_data['user_id'],
                            DBEmployee.source_device_id == device_id
                        ).first()
                        
                        if db_employee:
                            db_employee.name = user_data['name']
                            db_employee.password = user_data.get('password')
                            db_employee.group_id = user_data.get('group_id')
                            db_employee.card_number = user_data.get('card')
                            db_employee.synced_at = datetime.now(timezone.utc)
                            if not db_employee.source_device_id or db_employee.source_device_id != device_id:
                                db_employee.source_device_id = device_id
                        else:
                            db_employee = DBEmployee(
                                company_id=DEFAULT_COMPANY_ID,
                                department_id=DEFAULT_DEPARTMENT_ID,
                                position_id=DEFAULT_POSITION_ID,
                                device_user_id=user_data['uid'],
                                user_id=user_data['user_id'],
                                name=user_data['name'],
                                privilege=app_privilege,
                                password=user_data.get('password'),
                                group_id=user_data.get('group_id'),
                                card_number=user_data.get('card'),
                                source_device_id=device_id
                            )
                            db.add(db_employee)
                            records_synced += 1
                    
                    db.commit()
                    
                    # ---- Sync attendance (reusing same connection) ----
                    # Small delay before the heaviest operation
                    time.sleep(INTER_OP_DELAY)
                    
                    last_attendance_sync = db_device.last_attendance_sync
                    
                    attendance_records = mgr.get_attendance() or []
                    logger.info(f"Fetched {len(attendance_records)} total attendance records from {device_config.name}")
                    
                    if last_attendance_sync:
                        original_count = len(attendance_records)
                        attendance_records = [
                            rec for rec in attendance_records
                            if self._get_record_timestamp(rec) > last_attendance_sync
                        ]
                        logger.info(f"Incremental sync: {len(attendance_records)} new records out of {original_count} total (since {last_attendance_sync})")
                    else:
                        logger.info(f"Initial sync: Processing all {len(attendance_records)} attendance records")
                
                # Connection is now closed (exited the 'with' block)
                # Process attendance records
                attendance_added = 0
                attendance_duplicates = 0
                
                for record in attendance_records:
                    record_data = record if isinstance(record, dict) else {
                        'uid': record.uid,
                        'user_id': record.user_id,
                        'timestamp': record.timestamp,
                        'status': record.status,
                        'punch': record.punch
                    }
                    
                    # Match by uid AND the device this punch came from. In shared
                    # mode a matricule has one Employee row per device; matching by
                    # uid alone would attribute the punch to an arbitrary device's
                    # row (.first()), splitting one person's day across two PKs.
                    db_employee = db.query(DBEmployee).filter(
                        DBEmployee.device_user_id == record_data['uid'],
                        DBEmployee.source_device_id == device_id
                    ).first()
                    if not db_employee:
                        # Fallback for legacy rows without a per-device match
                        db_employee = db.query(DBEmployee).filter(
                            DBEmployee.device_user_id == record_data['uid']
                        ).first()

                    if not db_employee:
                        logger.warning(f"Employee with device_user_id {record_data['uid']} not found for attendance record")
                        continue
                    
                    timestamp = record_data['timestamp']
                    if isinstance(timestamp, str):
                        timestamp = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
                    
                    # Atomic upsert — protected by the uq_attendance_device_uid_ts
                    # unique constraint. ON CONFLICT DO NOTHING means concurrent
                    # syncs can't insert the same row twice.
                    stmt = pg_insert(DBAttendance).values(
                        device_id=device_id,
                        employee_id=db_employee.id,
                        uid=record_data['uid'],
                        user_id_str=record_data['user_id'],
                        timestamp=timestamp,
                        status=record_data['status'],
                        punch=record_data['punch'],
                        source='device',
                    ).on_conflict_do_nothing(
                        constraint='uq_attendance_device_uid_ts'
                    )
                    result = db.execute(stmt)
                    if result.rowcount > 0:
                        attendance_added += 1
                    else:
                        attendance_duplicates += 1
                
                db.commit()
                
                logger.info(f"Attendance sync complete: {attendance_added} added, {attendance_duplicates} duplicates skipped")
                
                # Update device last sync time
                db_device.last_sync = datetime.now(timezone.utc)
                db_device.last_attendance_sync = datetime.now(timezone.utc)
                db.commit()
                
                # Log successful sync
                sync_log.status = 'success'
                sync_log.records_synced = records_synced + attendance_added
                sync_log.completed_at = datetime.now(timezone.utc)
                db.add(sync_log)
                db.commit()
                
                logger.info(f"\u2713 Successfully synced device {device_config.name}: {records_synced} users, {attendance_added} attendance records")

                # Integrity guards \u2014 flag-only, never blocks
                try:
                    from app.services.integrity_guards import scan_recent
                    scan_recent(hours=48)
                except Exception as guard_err:
                    logger.warning(f"integrity scan after sync failed: {guard_err}")
        
        except Exception as e:
            logger.error(f"Error syncing device {device_config.name}: {e}", exc_info=True)
            try:
                with get_db_session() as db:
                    sync_log.status = 'error'
                    sync_log.error_message = str(e)[:500]
                    sync_log.completed_at = datetime.now(timezone.utc)
                    db.add(sync_log)
                    db.commit()
            except Exception as log_err:
                logger.error(f"Failed to save sync error log: {log_err}")
            raise
    
    def _get_record_timestamp(self, record) -> datetime:
        """Helper method to extract timestamp from attendance record"""
        if isinstance(record, dict):
            timestamp = record['timestamp']
        else:
            timestamp = record.timestamp
        
        if isinstance(timestamp, str):
            timestamp = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
        
        return timestamp


# Global sync service instance (manual sync only — no background loop)
sync_service = DeviceSyncService()
