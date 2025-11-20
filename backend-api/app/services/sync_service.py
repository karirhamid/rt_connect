import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy.orm import Session
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

# Default organizational IDs (created by create_defaults.py)
DEFAULT_COMPANY_ID = 1
DEFAULT_DEPARTMENT_ID = 1
DEFAULT_POSITION_ID = 1


class DeviceSyncService:
    """Background service to sync device data to database"""
    
    def __init__(self, sync_interval: int = 300, max_retries: int = 3, retry_delay: int = 30):
        """
        Initialize sync service
        
        Args:
            sync_interval: Interval in seconds between syncs (default 5 minutes)
            max_retries: Maximum retry attempts for failed syncs (default 3)
            retry_delay: Delay in seconds between retries (default 30)
        """
        self.sync_interval = sync_interval
        self.max_retries = max_retries
        self.retry_delay = retry_delay
        self.is_running = False
        self._task = None
        self.pending_syncs = {}  # Track pending syncs for offline devices
    
    async def start(self):
        """Start the background sync service"""
        if self.is_running:
            logger.warning("Sync service is already running")
            return
        
        self.is_running = True
        self._task = asyncio.create_task(self._sync_loop())
        logger.info(f"Sync service started with interval of {self.sync_interval} seconds")
    
    async def stop(self):
        """Stop the background sync service"""
        self.is_running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("Sync service stopped")
    
    async def _sync_loop(self):
        """Main sync loop"""
        # Wait before first sync
        logger.info(f"Background sync will start in {self.sync_interval} seconds")
        await asyncio.sleep(self.sync_interval)
        
        while self.is_running:
            try:
                await self.sync_all_devices()
            except Exception as e:
                logger.error(f"Error in sync loop: {e}")
            
            # Wait for next sync
            await asyncio.sleep(self.sync_interval)
    
    async def sync_all_devices(self):
        """Sync all registered devices"""
        devices = device_store.get_all()
        
        if not devices:
            logger.debug("No devices to sync")
            return
        
        logger.info(f"Starting sync for {len(devices)} devices")
        
        for device_config in devices:
            try:
                await self.sync_device_with_retry(device_config.id)
            except Exception as e:
                logger.error(f"Failed to sync device {device_config.name} after {self.max_retries} attempts: {e}")
                # Add to pending queue for retry on next cycle
                self.pending_syncs[device_config.id] = {
                    'device_name': device_config.name,
                    'failed_at': datetime.now(timezone.utc),
                    'attempts': 0
                }
        
        logger.info("Completed sync for all devices")
    
    async def sync_device_with_retry(self, device_id: str):
        """
        Sync a device with retry logic
        
        Args:
            device_id: Device ID to sync
        """
        for attempt in range(self.max_retries):
            try:
                await self.sync_device(device_id)
                # Success - remove from pending queue if present
                if device_id in self.pending_syncs:
                    device_name = self.pending_syncs[device_id]['device_name']
                    del self.pending_syncs[device_id]
                    logger.info(f"✓ Device {device_name} recovered and synced successfully")
                return
            except Exception as e:
                if attempt < self.max_retries - 1:
                    wait_time = self.retry_delay * (attempt + 1)  # Exponential backoff
                    logger.warning(f"Sync attempt {attempt + 1}/{self.max_retries} failed for device {device_id}: {e}. Retrying in {wait_time}s...")
                    await asyncio.sleep(wait_time)
                else:
                    logger.error(f"All {self.max_retries} sync attempts failed for device {device_id}: {e}")
                    raise
    
    async def sync_device(self, device_id: str):
        """
        Sync a specific device
        
        Args:
            device_id: Device ID to sync
        """
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
                
                # Connect to device with timeout
                logger.debug(f"Attempting to connect to device {device_config.name} at {device_config.ip}:{device_config.port}")
                manager = ZKTecoDeviceManager(
                    ip=device_config.ip,
                    port=device_config.port,
                    timeout=10  # Increased timeout for reliability
                )
                
                info = manager.get_device_info()
                if not info:
                    error_msg = f'Failed to connect to device at {device_config.ip}:{device_config.port}'
                    sync_log.status = 'error'
                    sync_log.error_message = error_msg
                    db.add(sync_log)
                    db.commit()
                    logger.error(f"Could not connect to device {device_config.name}: {error_msg}")
                    raise ConnectionError(error_msg)
                
                records_synced = 0
                
                # Sync users to employees table
                users = manager.get_users() or []
                logger.info(f"Syncing {len(users)} users from {device_config.name}")
                
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
                    
                    # Check if employee exists by device_user_id and user_id
                    db_employee = db.query(DBEmployee).filter(
                        DBEmployee.device_user_id == user_data['uid'],
                        DBEmployee.user_id == user_data['user_id']
                    ).first()
                    
                    if db_employee:
                        # Update existing employee
                        db_employee.name = user_data['name']
                        db_employee.privilege = user_data['privilege']
                        db_employee.password = user_data.get('password')
                        db_employee.group_id = user_data.get('group_id')
                        db_employee.card_number = user_data.get('card')
                        db_employee.synced_at = datetime.now(timezone.utc)
                        # Update source device if not set or if it's different
                        if not db_employee.source_device_id or db_employee.source_device_id != device_id:
                            db_employee.source_device_id = device_id
                    else:
                        # Create new employee with default organization
                        db_employee = DBEmployee(
                            company_id=DEFAULT_COMPANY_ID,
                            department_id=DEFAULT_DEPARTMENT_ID,
                            position_id=DEFAULT_POSITION_ID,
                            device_user_id=user_data['uid'],
                            user_id=user_data['user_id'],
                            name=user_data['name'],
                            privilege=user_data['privilege'],
                            password=user_data.get('password'),
                            group_id=user_data.get('group_id'),
                            card_number=user_data.get('card'),
                            source_device_id=device_id  # Track which device this employee came from
                        )
                        db.add(db_employee)
                        records_synced += 1
                
                db.commit()
                
                # Sync attendance records (incremental - only new records)
                # Get last sync timestamp for this device
                last_attendance_sync = db_device.last_attendance_sync
                
                attendance_records = manager.get_attendance() or []
                logger.info(f"Fetched {len(attendance_records)} total attendance records from {device_config.name}")
                
                # Filter to only new records if we have a last sync timestamp
                if last_attendance_sync:
                    original_count = len(attendance_records)
                    attendance_records = [
                        rec for rec in attendance_records
                        if self._get_record_timestamp(rec) > last_attendance_sync
                    ]
                    logger.info(f"Incremental sync: {len(attendance_records)} new records out of {original_count} total (since {last_attendance_sync})")
                else:
                    logger.info(f"Initial sync: Processing all {len(attendance_records)} attendance records")
                
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
                    
                    # Get employee from DB
                    db_employee = db.query(DBEmployee).filter(
                        DBEmployee.device_user_id == record_data['uid']
                    ).first()
                    
                    if not db_employee:
                        logger.warning(f"Employee with device_user_id {record_data['uid']} not found for attendance record")
                        continue
                    
                    # Check if attendance record exists
                    timestamp = record_data['timestamp']
                    if isinstance(timestamp, str):
                        timestamp = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
                    
                    existing = db.query(DBAttendance).filter(
                        DBAttendance.device_id == device_id,
                        DBAttendance.uid == record_data['uid'],
                        DBAttendance.timestamp == timestamp
                    ).first()
                    
                    if not existing:
                        db_attendance = DBAttendance(
                            device_id=device_id,
                            employee_id=db_employee.id,
                            uid=record_data['uid'],
                            user_id_str=record_data['user_id'],
                            timestamp=timestamp,
                            status=record_data['status'],
                            punch=record_data['punch']
                        )
                        db.add(db_attendance)
                        attendance_added += 1
                    else:
                        attendance_duplicates += 1
                
                db.commit()
                
                logger.info(f"Attendance sync complete: {attendance_added} added, {attendance_duplicates} duplicates skipped")
                
                # Update device last sync time
                db_device.last_sync = datetime.now(timezone.utc)
                # Update last attendance sync to current time for incremental syncs
                db_device.last_attendance_sync = datetime.now(timezone.utc)
                db.commit()
                
                # Log successful sync
                sync_log.status = 'success'
                sync_log.records_synced = records_synced + attendance_added
                sync_log.completed_at = datetime.now(timezone.utc)
                db.add(sync_log)
                db.commit()
                
                logger.info(f"\u2713 Successfully synced device {device_config.name}: {records_synced} users, {attendance_added} attendance records")
        
        except Exception as e:
            logger.error(f"Error syncing device {device_config.name}: {e}", exc_info=True)
            with get_db_session() as db:
                sync_log.status = 'error'
                sync_log.error_message = str(e)
                sync_log.completed_at = datetime.now(timezone.utc)
                db.add(sync_log)
                db.commit()
            # Re-raise to trigger retry logic
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
    
    async def trigger_sync(self, device_id: Optional[str] = None):
        """
        Trigger an immediate sync
        
        Args:
            device_id: Specific device ID to sync, or None to sync all
        """
        if device_id:
            await self.sync_device(device_id)
        else:
            await self.sync_all_devices()


# Global sync service instance
sync_service = DeviceSyncService(sync_interval=300)  # 5 minutes
