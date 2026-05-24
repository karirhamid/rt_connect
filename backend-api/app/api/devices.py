from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from pydantic import BaseModel
from typing import Optional
import uuid
import asyncio
import socket
from concurrent.futures import ThreadPoolExecutor
from sqlalchemy.orm import Session
from sqlalchemy import func
from sqlalchemy.dialects.postgresql import insert as pg_insert
from datetime import datetime, timedelta, timezone
import logging
from app.services.device_store import device_store, Device
from app.services.device_manager import ZKTecoDeviceManager
from app.database import get_db
from app.database.schema import Device as DBDevice, Employee as DBEmployee, Attendance as DBAttendance
from app.services.sync_service import sync_service, _device_locks

router = APIRouter()
logger = logging.getLogger(__name__)

# Default organizational IDs for employees synced from devices
DEFAULT_COMPANY_ID = 1
DEFAULT_DEPARTMENT_ID = 1
DEFAULT_POSITION_ID = 1


def ensure_device_in_postgres(db: Session, device) -> DBDevice:
    """Make sure a device from the in-memory store also exists in PostgreSQL.
    
    This is needed because devices were historically only stored in the JSON
    file (device_store). The PL/pgSQL trigger ``assign_composite_id()`` on
    the employees table requires the device row to be present in PostgreSQL.
    
    Returns the existing or newly-created DBDevice row.
    """
    existing = db.query(DBDevice).filter(DBDevice.id == device.id).first()
    if existing:
        return existing
    
    db_device = DBDevice(
        id=device.id,
        name=device.name,
        ip=device.ip,
        port=int(device.port),
        tag=getattr(device, "tag", None),
        serial_number=getattr(device, "serial_number", None),
        date_format=getattr(device, "date_format", "YYYY-MM-DD"),
        is_active=True,
    )
    db.add(db_device)
    db.commit()
    logger.info(f"Inserted missing device '{device.name}' ({device.id}) into PostgreSQL")
    return db_device


class DeviceCreate(BaseModel):
    name: str
    ip: str
    port: int
    tag: Optional[str] = None
    serial_number: Optional[str] = None
    date_format: Optional[str] = "YYYY-MM-DD"  # YYYY-MM-DD, DD/MM/YYYY, MM/DD/YYYY
    sync_data: Optional[bool] = False  # If True, sync users+attendance after adding

class DeviceDiscovery(BaseModel):
    ip: str
    port: int = 4370

@router.get("/devices")
async def get_devices():
    """Get all registered devices"""
    devices = device_store.get_all()
    return {"devices": [d.dict() for d in devices]}


@router.get("/devices/status")
async def get_devices_status(db: Session = Depends(get_db)):
    """Heartbeat status for every active device.

    is_online = the last successful ping was within (2 * interval).
    Two intervals of slack tolerate one missed heartbeat (e.g. a brief
    network blip) without flipping the badge to red.
    """
    from app.database.schema import AppSettings
    settings = db.query(AppSettings).first()
    interval_sec = int(getattr(settings, 'device_heartbeat_interval_sec', 300) or 300) if settings else 300
    online_window = timedelta(seconds=2 * interval_sec)
    # last_seen_at is stored as a naive UTC timestamp; strip tz from `now`
    # so the subtraction in the comparison below doesn't blow up.
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    rows = db.query(DBDevice).filter(DBDevice.is_active == True).all()
    out = []
    for d in rows:
        last_seen = d.last_seen_at
        # Defensive: if a row was somehow saved with tz, normalize to naive UTC
        if last_seen and last_seen.tzinfo is not None:
            last_seen = last_seen.astimezone(timezone.utc).replace(tzinfo=None)
        is_online = bool(last_seen and (now - last_seen) <= online_window)
        out.append({
            "id":            d.id,
            "name":          d.name,
            "ip":            d.ip,
            "port":          d.port,
            "is_online":     is_online,
            "last_seen_at":  last_seen.isoformat() if last_seen else None,
            "last_ping_at":  d.last_ping_at.isoformat() if d.last_ping_at else None,
        })
    return {
        "devices":      out,
        "interval_sec": interval_sec,
        "online_count": sum(1 for x in out if x["is_online"]),
        "total_count":  len(out),
    }


@router.post("/devices/{device_id}/ping")
async def force_ping_device(device_id: str):
    """Manually trigger a heartbeat on one device. Returns the result immediately."""
    from app.services.device_heartbeat import ping_now
    ok = ping_now(device_id)
    return {"id": device_id, "is_online": ok}

def _check_port(ip: str, port: int, timeout: float = 5.0) -> bool:
    """Test if a TCP port is reachable (quick connectivity check)."""
    try:
        with socket.create_connection((ip, port), timeout=timeout) as sock:
            return True
    except (socket.timeout, ConnectionRefusedError, OSError):
        return False


@router.post("/devices")
async def add_device(device_data: DeviceCreate, background_tasks: BackgroundTasks,
                     db: Session = Depends(get_db)):
    """Add a new device after verifying the device responds on its port.
    
    If sync_data=True in the request body, a full sync (users + attendance)
    is triggered in the background after the device is added.
    Otherwise the device is just registered with no data sync.
    """
    # Quick TCP port check to verify the device is reachable
    reachable = await asyncio.to_thread(
        _check_port, device_data.ip, int(device_data.port)
    )
    if not reachable:
        raise HTTPException(
            status_code=400,
            detail=f"Device not responding on {device_data.ip}:{device_data.port}. "
                   "Please verify the IP address, port, and that the device is powered on."
        )
    
    device_id = str(uuid.uuid4())
    device = Device(
        id=device_id,
        name=device_data.name,
        ip=device_data.ip,
        port=device_data.port,
        tag=device_data.tag,
        serial_number=device_data.serial_number,
        date_format=device_data.date_format or "YYYY-MM-DD"
    )
    # Save to in-memory store (JSON file)
    device_store.add(device)
    
    # Also save to PostgreSQL so triggers/FKs can reference the device
    db_device = DBDevice(
        id=device_id,
        name=device_data.name,
        ip=device_data.ip,
        port=int(device_data.port),
        tag=device_data.tag,
        serial_number=device_data.serial_number,
        date_format=device_data.date_format or "YYYY-MM-DD",
        is_active=True
    )
    db.add(db_device)
    db.commit()
    
    if device_data.sync_data:
        def _safe_background_sync(dev_id):
            try:
                sync_service._sync_device_blocking(dev_id)
            except Exception as exc:
                logger.warning(f"Background sync for device {dev_id} failed: {exc}")
        background_tasks.add_task(_safe_background_sync, device_id)
        logger.info(f"Device {device_data.name} ({device_data.ip}:{device_data.port}) added — background sync started")
        return {"message": "Device added — sync started in background", "device": device.dict()}
    
    logger.info(f"Device {device_data.name} ({device_data.ip}:{device_data.port}) added (no sync)")
    return {"message": "Device added successfully", "device": device.dict()}

@router.delete("/devices/{device_id}")
async def delete_device(device_id: str, db: Session = Depends(get_db)):
    """Delete a device and all its related data (employees, attendance, sync logs)"""
    if device_store.delete(device_id):
        # Delete from PostgreSQL: attendance → employees → device (respecting FK order)
        # First delete attendance records that reference employees of this device
        db.execute(
            DBAttendance.__table__.delete().where(
                DBAttendance.employee_id.in_(
                    db.query(DBEmployee.id).filter(DBEmployee.source_device_id == device_id)
                )
            )
        )
        # Also delete attendance records directly linked to the device
        db.execute(
            DBAttendance.__table__.delete().where(DBAttendance.device_id == device_id)
        )
        # Delete employees synced from this device
        db.query(DBEmployee).filter(DBEmployee.source_device_id == device_id).delete(synchronize_session=False)
        # Delete the device itself (cascade handles sync_logs)
        db_device = db.query(DBDevice).filter(DBDevice.id == device_id).first()
        if db_device:
            db.delete(db_device)
        db.commit()
        logger.info(f"Device {device_id} and all related data deleted from PostgreSQL")
        return {"message": "Device deleted successfully"}
    raise HTTPException(status_code=404, detail="Device not found")

@router.put("/devices/{device_id}")
async def update_device(device_id: str, device_data: DeviceCreate, db: Session = Depends(get_db)):
    """Update device information"""
    device = device_store.get_by_id(device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    # Update device in memory store
    updated_device = Device(
        id=device_id,
        name=device_data.name,
        ip=device_data.ip,
        port=device_data.port,
        tag=device_data.tag,
        serial_number=device_data.serial_number,
        date_format=device_data.date_format or "YYYY-MM-DD"
    )
    device_store.update(device_id, updated_device)
    
    # Update device in database
    db_device = db.query(DBDevice).filter(DBDevice.id == device_id).first()
    if db_device:
        db_device.name = device_data.name
        db_device.ip = device_data.ip
        db_device.port = device_data.port
        db_device.tag = device_data.tag
        db_device.serial_number = device_data.serial_number
        # Only set date_format if the column exists
        if hasattr(db_device, 'date_format'):
            db_device.date_format = device_data.date_format or "YYYY-MM-DD"
        db.commit()
    
    return {"message": "Device updated successfully", "device": updated_device.dict()}


@router.post("/device/discover")
async def discover_device(discovery_data: DeviceDiscovery):
    """Discover device by IP and retrieve information.
    
    Uses a short timeout (20s hard limit) since discovery should be fast.
    Only 1 connection retry to avoid long waits on unreachable IPs.
    """
    DISCOVERY_TIMEOUT = 20  # hard limit in seconds
    
    manager = ZKTecoDeviceManager(
        ip=discovery_data.ip,
        port=discovery_data.port,
        timeout=8,
        max_retries=1  # single attempt for discovery — fail fast
    )
    
    try:
        info = await asyncio.wait_for(
            asyncio.to_thread(manager.get_device_info),
            timeout=DISCOVERY_TIMEOUT
        )
    except asyncio.TimeoutError:
        logger.warning(f"Discovery hard-timeout for {discovery_data.ip}:{discovery_data.port}")
        # Force cleanup the manager so the socket/lock are released
        try:
            manager.disconnect()
        except Exception:
            pass
        raise HTTPException(
            status_code=408,
            detail=f"Connection to {discovery_data.ip}:{discovery_data.port} timed out after {DISCOVERY_TIMEOUT}s. "
                   "Make sure the IP address is correct and the device is powered on."
        )
    except TimeoutError as e:
        logger.warning(f"Discovery timed out for {discovery_data.ip}:{discovery_data.port}: {e}")
        raise HTTPException(
            status_code=408,
            detail=f"Connection to {discovery_data.ip}:{discovery_data.port} timed out. "
                   "Make sure the IP address is correct and the device is powered on."
        )
    except ConnectionError as e:
        logger.warning(f"Discovery failed for {discovery_data.ip}:{discovery_data.port}: {e}")
        raise HTTPException(
            status_code=400,
            detail=str(e)
        )
    except Exception as e:
        logger.warning(f"Discovery failed for {discovery_data.ip}:{discovery_data.port}: "
                       f"{type(e).__name__}: {e}")
        raise HTTPException(
            status_code=400,
            detail=f"Could not connect to device at {discovery_data.ip}:{discovery_data.port}: {e}"
        )
    
    if not info:
        raise HTTPException(status_code=400, detail="Device returned no information")
    return info

@router.get("/device/{device_id}/info")
async def get_device_info(device_id: str):
    """Get information for a specific device"""
    device = device_store.get_by_id(device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    manager = ZKTecoDeviceManager(ip=device.ip, port=device.port, timeout=15)
    try:
        info = await asyncio.to_thread(manager.get_device_info)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to get device info: {e}")
    
    if not info:
        raise HTTPException(status_code=400, detail="Failed to connect to device")
    
    return info

@router.get("/device/{device_id}/users")
async def get_device_users(device_id: str):
    """Get users from a specific device"""
    device = device_store.get_by_id(device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    manager = ZKTecoDeviceManager(ip=device.ip, port=device.port, timeout=10)
    users = await asyncio.to_thread(manager.get_users)
    
    if users is None:
        raise HTTPException(status_code=400, detail="Failed to fetch users")
    
    return {"users": users, "count": len(users)}

@router.get("/device/{device_id}/attendance")
async def get_device_attendance(
    device_id: str,
    user_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None
):
    """Get attendance records from a specific device"""
    device = device_store.get_by_id(device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    manager = ZKTecoDeviceManager(ip=device.ip, port=device.port, timeout=15)
    attendance = await asyncio.to_thread(manager.get_attendance)
    
    if attendance is None:
        raise HTTPException(status_code=400, detail="Failed to fetch attendance")
    
    # Apply filters
    if user_id:
        attendance = [a for a in attendance if str(a.get("user_id")) == user_id]
    
    if start_date or end_date:
        from datetime import datetime
        filtered = []
        for record in attendance:
            timestamp = record.get("timestamp")
            if isinstance(timestamp, str):
                record_date = datetime.fromisoformat(timestamp.replace('Z', '+00:00')).date()
            else:
                record_date = timestamp.date()
            
            if start_date and record_date < datetime.fromisoformat(start_date).date():
                continue
            if end_date and record_date > datetime.fromisoformat(end_date).date():
                continue
            filtered.append(record)
        attendance = filtered
    
    return {"attendance": attendance, "count": len(attendance)}

@router.get("/statistics")
async def get_statistics(db: Session = Depends(get_db)):
    """Get dashboard statistics from database (fast!)"""
    today = datetime.now().date()
    week_ago = today - timedelta(days=7)
    
    # Get total devices
    total_devices = db.query(DBDevice).filter(DBDevice.is_active == True).count()
    
    if total_devices == 0:
        days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
        weekly_data = [{"day": days[i], "count": 0} for i in range(7)]
        status_data = [
            {"name": "Online", "value": 0},
            {"name": "Offline", "value": 0}
        ]
        
        return {
            "total_devices": 0,
            "total_users": 0,
            "today_attendance": 0,
            "active_devices": 0,
            "weekly_attendance": weekly_data,
            "device_status": status_data,
            "recent_devices": []
        }
    
    # Get total users (depends on employee_mode setting)
    from app.database.schema import AppSettings as _AppSettings
    _settings = db.query(_AppSettings).first()
    employee_mode = getattr(_settings, 'employee_mode', None) or 'shared'

    if employee_mode == 'shared':
        total_users = db.query(func.count(func.distinct(DBEmployee.user_id))).scalar()
    else:
        total_users = db.query(DBEmployee).count()
    
    # Get today's attendance count
    today_start = datetime.combine(today, datetime.min.time())
    today_end = datetime.combine(today, datetime.max.time())
    today_attendance = db.query(DBAttendance).filter(
        DBAttendance.timestamp >= today_start,
        DBAttendance.timestamp <= today_end
    ).count()
    
    # Get weekly attendance
    weekly_attendance = {i: 0 for i in range(7)}
    week_start = datetime.combine(week_ago, datetime.min.time())
    
    weekly_records = db.query(
        func.date(DBAttendance.timestamp).label('date'),
        func.count(DBAttendance.id).label('count')
    ).filter(
        DBAttendance.timestamp >= week_start
    ).group_by(func.date(DBAttendance.timestamp)).all()
    
    for record in weekly_records:
        record_date = record.date if isinstance(record.date, datetime) else datetime.strptime(str(record.date), '%Y-%m-%d').date()
        days_ago = (today - record_date).days
        if 0 <= days_ago < 7:
            weekly_attendance[6 - days_ago] = record.count
    
    # Get device status and recent devices
    all_devices = db.query(DBDevice).filter(DBDevice.is_active == True).all()
    device_status = {"online": 0, "offline": 0}
    recent_devices = []
    active_devices = 0
    
    for device in all_devices:
        # Check if device was recently synced (within last 10 minutes)
        now = datetime.now(timezone.utc)
        if device.last_sync:
            # Ensure device.last_sync is timezone-aware
            last_sync = device.last_sync if device.last_sync.tzinfo else device.last_sync.replace(tzinfo=timezone.utc)
            is_online = (now - last_sync).seconds < 600
        else:
            is_online = False
        
        if is_online:
            device_status["online"] += 1
            active_devices += 1
        else:
            device_status["offline"] += 1
        
        # Get employee count per device
        if employee_mode == 'shared':
            user_count = db.query(func.count(func.distinct(DBEmployee.user_id))).filter(DBEmployee.source_device_id == device.id).scalar()
        else:
            user_count = db.query(DBEmployee).filter(DBEmployee.source_device_id == device.id).count()
        
        recent_devices.append({
            "name": device.name,
            "serial_number": device.serial_number or "N/A",
            "ip": device.ip,
            "port": device.port,
            "status": "online" if is_online else "offline",
            "user_count": user_count,
            "last_sync": device.last_sync.isoformat() if device.last_sync else None
        })
    
    # Format weekly attendance for chart
    days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    weekly_data = [{"day": days[i], "count": weekly_attendance[i]} for i in range(7)]
    
    # Format device status for pie chart
    status_data = [
        {"name": "Online", "value": device_status["online"]},
        {"name": "Offline", "value": device_status["offline"]}
    ]
    
    return {
        "total_devices": total_devices,
        "total_users": total_users,
        "today_attendance": today_attendance,
        "active_devices": active_devices,
        "weekly_attendance": weekly_data,
        "device_status": status_data,
        "recent_devices": recent_devices[:5],  # Last 5 devices
        "employee_mode": employee_mode,
    }


@router.post("/sync")
@router.get("/sync")
async def trigger_sync(device_id: Optional[str] = None, background_tasks: BackgroundTasks = None):
    """Trigger manual sync of devices (runs in background)"""
    if device_id:
        background_tasks.add_task(sync_service._sync_device_blocking, device_id)
    else:
        # Sync all devices — each in its own thread via the sync service
        for device_config in device_store.get_all():
            background_tasks.add_task(sync_service._sync_device_blocking, device_config.id)
    return {"message": "Sync triggered in background"}


@router.get("/devices/{device_id}/time")
async def get_device_time(device_id: str):
    """Get time settings from a specific device"""
    device = device_store.get(device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    try:
        manager = ZKTecoDeviceManager(ip=device.ip, port=device.port, timeout=10)
        time_info = await asyncio.to_thread(manager.get_time)
        return {
            "device_id": device_id,
            "device_name": device.name,
            **time_info
        }
    except Exception as e:
        logger.exception("Failed to get device time for %s: %s", device_id, e)
        # Surface a generic error to the client; details are in server log
        raise HTTPException(status_code=500, detail=f"Failed to get device time: {str(e)}")


@router.post("/devices/{device_id}/time")
async def set_device_time(device_id: str, timezone_offset: Optional[int] = None):
    """Set time on a specific device based on timezone offset (in hours from UTC)"""
    device = device_store.get(device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    try:
        from datetime import datetime, timezone as tz, timedelta
        
        # Calculate target time based on timezone offset
        if timezone_offset is not None:
            target_time = datetime.now(tz.utc) + timedelta(hours=timezone_offset)
        else:
            target_time = datetime.now(tz.utc)
        
        manager = ZKTecoDeviceManager(ip=device.ip, port=device.port, timeout=10)
        await asyncio.to_thread(manager.set_time, target_time)
        
        return {
            "message": "Device time updated successfully",
            "device_id": device_id,
            "device_name": device.name,
            "new_time": target_time.isoformat(),
            "timezone_offset": timezone_offset
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to set device time: {str(e)}")


@router.post("/devices/time/bulk")
async def set_all_devices_time(timezone_offset: int):
    """Set time on all devices based on timezone offset (in hours from UTC)"""
    devices = device_store.get_all()
    if not devices:
        raise HTTPException(status_code=404, detail="No devices found")
    
    from datetime import datetime, timezone as tz, timedelta
    
    # Calculate target time based on timezone offset
    target_time = datetime.now(tz.utc) + timedelta(hours=timezone_offset)
    
    results = []
    errors = []
    
    for device in devices:
        try:
            manager = ZKTecoDeviceManager(ip=device.ip, port=device.port, timeout=10)
            await asyncio.to_thread(manager.set_time, target_time)
            results.append({
                "device_id": device.id,
                "device_name": device.name,
                "status": "success"
            })
        except Exception as e:
            errors.append({
                "device_id": device.id,
                "device_name": device.name,
                "error": str(e)
            })
    
    return {
        "message": f"Time update completed for {len(results)} devices",
        "timezone_offset": timezone_offset,
        "new_time": target_time.isoformat(),
        "successful": results,
        "failed": errors
    }


@router.post("/devices/{device_id}/sync-employees")
async def sync_employees_from_device(
    device_id: str, 
    preview_only: bool = False,
    db: Session = Depends(get_db)
):
    """Fetch employees from a device and return a preview for user confirmation.
    
    Always returns preview data so the user can review new vs existing employees
    before confirming the sync. Use confirm-sync to actually persist.
    """
    device = device_store.get_by_id(device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    # Ensure device row exists in PostgreSQL (required by triggers/FKs)
    ensure_device_in_postgres(db, device)
    
    try:
        # Connect to device with adequate timeout
        manager = ZKTecoDeviceManager(ip=device.ip, port=device.port, timeout=15)
        
        # Get all users from device (runs in thread to avoid blocking event loop)
        try:
            users = await asyncio.to_thread(manager.get_users) or []
        except Exception as e:
            raise HTTPException(
                status_code=502,
                detail=f"Could not fetch users from device {device.name} ({device.ip}): {e}"
            )
        
        if not users:
            return {
                "success": True,
                "device_id": device_id,
                "device_name": device.name,
                "total_fetched": 0,
                "preview_mode": True,
                "preview_data": []
            }
        
        # Log all fetched data to console
        logger.info(f"="*80)
        logger.info(f"DEVICE SYNC - Fetched {len(users)} users from {device.name} ({device.ip})")
        logger.info(f"="*80)
        for user in users:
            logger.info(f"  User ID: {user.user_id:4} | UID: {user.uid:4} | Name: {user.name:30} | Privilege: {user.privilege}")
        logger.info(f"="*80)
        
        # Build preview: compare each device user against the DB
        preview_data = []
        for user in users:
            existing = db.query(DBEmployee).filter(
                DBEmployee.source_device_id == device_id,
                DBEmployee.device_user_id == user.uid
            ).first()
            
            app_privilege = 14 if user.privilege in (6, 14) else 0
            status = "existing" if existing else "new"
            
            preview_data.append({
                "user_id": user.user_id,
                "uid": user.uid,
                "name": user.name,
                "privilege": user.privilege,
                "app_privilege": app_privilege,
                "status": status,
                "existing_name": existing.name if existing else None
            })
        
        new_count = sum(1 for u in preview_data if u["status"] == "new")
        existing_count = sum(1 for u in preview_data if u["status"] == "existing")
        
        return {
            "success": True,
            "device_id": device_id,
            "device_name": device.name,
            "total_fetched": len(users),
            "new_count": new_count,
            "existing_count": existing_count,
            "preview_mode": True,
            "preview_data": preview_data
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to fetch employees for device {device_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to fetch employees: {str(e)}")


@router.post("/devices/{device_id}/confirm-sync")
async def confirm_employee_sync(device_id: str, db: Session = Depends(get_db)):
    """Confirm employee sync: re-fetch from device and add only NEW employees.
    
    Existing employees (already in the DB for this device) are left untouched.
    """
    device = device_store.get_by_id(device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    # Ensure device row exists in PostgreSQL
    ensure_device_in_postgres(db, device)

    try:
        # Re-fetch users from device
        manager = ZKTecoDeviceManager(ip=device.ip, port=device.port, timeout=15)
        try:
            users = await asyncio.to_thread(manager.get_users) or []
        except Exception as e:
            raise HTTPException(
                status_code=502,
                detail=f"Could not fetch users from device {device.name} ({device.ip}): {e}"
            )

        added = 0
        skipped = 0
        errors = []

        for user in users:
            try:
                # Match by device uid scoped to this device — allow same user_id on different devices
                existing = db.query(DBEmployee).filter(
                    DBEmployee.source_device_id == device_id,
                    DBEmployee.device_user_id == user.uid
                ).first()

                if existing:
                    # Update sync timestamp
                    existing.synced_at = datetime.now(timezone.utc)
                    skipped += 1
                    continue

                # New employee — insert
                app_privilege = 14 if user.privilege in (6, 14) else 0
                logger.info(f"Adding new employee '{user.name}' (uid={user.uid}, user_id={user.user_id}): privilege={app_privilege}")
                new_employee = DBEmployee(
                    name=user.name,
                    device_user_id=user.uid,
                    user_id=str(user.user_id),
                    source_device_id=device_id,
                    privilege=app_privilege,
                    company_id=DEFAULT_COMPANY_ID,
                    department_id=DEFAULT_DEPARTMENT_ID,
                    position_id=DEFAULT_POSITION_ID,
                    created_at=datetime.now(timezone.utc),
                    updated_at=datetime.now(timezone.utc)
                )
                db.add(new_employee)
                added += 1
            except Exception as e:
                errors.append({
                    "user_id": user.user_id,
                    "name": user.name,
                    "error": str(e)
                })

        db.commit()
        logger.info(f"✅ Confirm-sync completed: {added} added, {skipped} skipped (existing), {len(errors)} errors")

        return {
            "success": True,
            "device_id": device_id,
            "device_name": device.name,
            "total_fetched": len(users),
            "added": added,
            "skipped": skipped,
            "errors": errors,
            "preview_mode": False
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"confirm-sync failed for device {device_id}: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Sync failed: {e}")


@router.post("/devices/{device_id}/confirm-attendance-sync")
async def confirm_attendance_sync(
    device_id: str,
    days: int = 30,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Confirm and execute attendance sync — re-fetches from device and inserts only new records."""
    device = device_store.get_by_id(device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    ensure_device_in_postgres(db, device)

    try:
        result = await sync_attendance_from_device(
            device_id=device_id, days=days, preview_only=False,
            start_date=start_date, end_date=end_date, db=db
        )
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"confirm-attendance-sync failed for device {device_id}: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Attendance sync failed: {e}")


class SetPrivilegePayload(BaseModel):
    uid: int
    privilege: int

@router.post("/devices/{device_id}/set-user-privilege")
async def set_user_privilege(device_id: str, payload: SetPrivilegePayload):
    """Debug endpoint: set raw privilege code for a user on a device (use carefully)."""
    device = device_store.get_by_id(device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    try:
        manager = ZKTecoDeviceManager(ip=device.ip, port=device.port, timeout=10)
        await asyncio.to_thread(
            manager.update_user,
            uid=payload.uid,
            name="",  # keep name unchanged by reusing existing? device requires name; we'll fetch existing
            privilege=payload.privilege,
            password="",
            group_id="",
            user_id=str(payload.uid),
            card=0
        )
        return {"status": "ok", "uid": payload.uid, "privilege": payload.privilege}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/devices/{device_id}/sync-attendance")
async def sync_attendance_from_device(
    device_id: str,
    days: int = 30,
    preview_only: bool = False,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    start_datetime: Optional[str] = None,  # ISO; second-precision lower bound (inclusive)
    end_datetime: Optional[str] = None,    # ISO; second-precision upper bound (inclusive)
    db: Session = Depends(get_db)
):
    """Sync attendance logs from a specific device.

    Performance-optimized:
      - Single batch query for employees (dict lookup instead of per-record query)
      - Single batch query for existing attendance (set lookup instead of per-record query)
      - Records processed in one pass
      - Hard asyncio timeout on device communication

    Args:
        device_id: The device ID to sync from
        days: Number of days to sync (default 30, use 0 for all)
        preview_only: If True, return preview data without inserting
    """
    import time as _time
    from app.utils.timestamp_validator import validate_and_correct_timestamp

    device = device_store.get_by_id(device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    # ── Per-device lock — serialise syncs of the same device ──
    # Prevents concurrent calls (e.g. user + scheduler) from racing on the
    # ZKTeco session (older firmware crashes) AND from racing on the
    # duplicate-detection set. If another sync is in progress, wait for it.
    lock = _device_locks[device_id]
    if not lock.acquire(blocking=False):
        # In preview mode we don't want to wait — fail fast
        if preview_only:
            raise HTTPException(status_code=409, detail="A sync is already running for this device")
        logger.info(f"sync-attendance: another sync in progress for {device_id} — waiting…")
        await asyncio.to_thread(lock.acquire)
    try:
        return await _sync_attendance_locked(
            device, device_id, days, preview_only, start_date, end_date, db,
            start_datetime, end_datetime
        )
    finally:
        lock.release()


async def _sync_attendance_locked(
    device, device_id, days, preview_only, start_date, end_date, db,
    start_datetime=None, end_datetime=None
):
    import time as _time
    from app.utils.timestamp_validator import validate_and_correct_timestamp
    ensure_device_in_postgres(db, device)

    FETCH_TIMEOUT = 300  # hard limit — K40 with 50k records takes ~150s

    # ── Step 1: Fetch records from device ────────────────────────────────
    t0 = _time.perf_counter()
    try:
        manager = ZKTecoDeviceManager(ip=device.ip, port=device.port, timeout=15)
        try:
            attendance_records = await asyncio.wait_for(
                asyncio.to_thread(manager.get_attendance),
                timeout=FETCH_TIMEOUT
            ) or []
        except asyncio.TimeoutError:
            try:
                manager.disconnect()
            except Exception:
                pass
            raise HTTPException(
                status_code=408,
                detail=f"Attendance download from {device.name} timed out after {FETCH_TIMEOUT}s."
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"Could not fetch attendance from {device.name} ({device.ip}): {e}"
        )

    fetch_time = _time.perf_counter() - t0
    logger.info(f"Fetched {len(attendance_records)} records from {device.name} in {fetch_time:.1f}s")

    if not attendance_records:
        return {
            "success": True, "device_id": device_id, "device_name": device.name,
            "total_fetched": 0, "added": 0, "skipped": 0, "errors": []
        }

    # ── Step 2: Date range filter ────────────────────────────────────────
    cutoff_date = None
    end_cutoff = None
    if start_date:
        try:
            cutoff_date = datetime.strptime(start_date, "%Y-%m-%d")
        except ValueError:
            pass
    if end_date:
        try:
            end_cutoff = datetime.strptime(end_date, "%Y-%m-%d") + timedelta(days=1)  # inclusive
        except ValueError:
            pass
    if cutoff_date is None and days > 0:
        cutoff_date = datetime.utcnow() - timedelta(days=days)

    # Second-precision overrides (gap-fill "from last sync → click time").
    # When provided, these win over the date-level cutoffs so no second is
    # missed and no extra day is re-scanned. Stored timestamps are naive,
    # second-truncated; match that here.
    def _parse_iso_naive(s):
        try:
            dt = datetime.fromisoformat(s.replace('Z', '+00:00'))
            if dt.tzinfo is not None:
                dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
            return dt.replace(microsecond=0)
        except Exception:
            return None

    if start_datetime:
        sd = _parse_iso_naive(start_datetime)
        if sd is not None:
            cutoff_date = sd                       # inclusive lower bound (timestamp < cutoff is skipped)
    if end_datetime:
        ed = _parse_iso_naive(end_datetime)
        if ed is not None:
            end_cutoff = ed + timedelta(seconds=1)  # inclusive of the click second

    # ── Step 3: Batch-load employees for this device (1 query) ───────────
    t1 = _time.perf_counter()
    emp_rows = db.query(DBEmployee).filter(DBEmployee.source_device_id == device_id).all()
    emp_map = {str(e.device_user_id): e for e in emp_rows}  # device_user_id → Employee
    logger.info(f"Loaded {len(emp_map)} employees for device {device_id} in {_time.perf_counter()-t1:.2f}s")

    # ── Step 4: Batch-load existing attendance keys (1 query) ────────────
    t2 = _time.perf_counter()
    existing_rows = (
        db.query(DBAttendance.employee_id, DBAttendance.timestamp)
        .filter(DBAttendance.device_id == device_id)
        .all()
    )
    # Strip tzinfo AND truncate to whole seconds so small precision
    # differences between device reads never cause false "new" records.
    def _normalise_ts(ts):
        if ts is None:
            return ts
        if ts.tzinfo is not None:
            ts = ts.replace(tzinfo=None)
        return ts.replace(microsecond=0)

    existing_set = {
        (row.employee_id, _normalise_ts(row.timestamp))
        for row in existing_rows
    }
    logger.info(f"Loaded {len(existing_set)} existing attendance keys in {_time.perf_counter()-t2:.2f}s")

    # ── Step 5: Validate timestamps setting ──────────────────────────────
    from app.database.schema import AppSettings
    settings = db.query(AppSettings).first()
    validate_timestamps = settings.validate_timestamps if (settings and hasattr(settings, 'validate_timestamps')) else True
    device_date_fmt = device.date_format if hasattr(device, 'date_format') else "YYYY-MM-DD"

    # ── Step 6: Single-pass processing ───────────────────────────────────
    t3 = _time.perf_counter()
    preview_data = []
    new_records = []      # DBAttendance objects to bulk-insert
    filtered_count = 0
    skipped = 0
    errors = []

    for record in attendance_records:
        try:
            timestamp = record.timestamp
            # Normalise to naive UTC truncated to whole seconds — the DB
            # stores naive datetimes and device reads may carry varying
            # sub-second precision, so we canonicalise early to guarantee
            # stable duplicate detection across fetches.
            if timestamp.tzinfo is not None:
                timestamp = timestamp.replace(tzinfo=None)
            timestamp = timestamp.replace(microsecond=0)

            # Validate timestamp
            ts_error = None
            if validate_timestamps:
                timestamp, ts_error = validate_and_correct_timestamp(timestamp, device_date_format=device_date_fmt)
                # Ensure result is still naive and second-precision after validation
                if timestamp.tzinfo is not None:
                    timestamp = timestamp.replace(tzinfo=None)
                timestamp = timestamp.replace(microsecond=0)

            # Date filter
            if cutoff_date is not None and timestamp < cutoff_date:
                filtered_count += 1
                continue
            if end_cutoff is not None and timestamp >= end_cutoff:
                filtered_count += 1
                continue

            # Employee lookup (O(1) dict)
            employee = emp_map.get(str(record.user_id))
            if not employee:
                err = "Employee not found"
                if ts_error:
                    err = f"{err}; {ts_error}"
                if preview_only:
                    preview_data.append({
                        "user_id": record.user_id, "employee_name": "Unknown",
                        "timestamp": timestamp.isoformat(), "punch": record.punch,
                        "status": record.status, "exists": False, "error": err
                    })
                else:
                    errors.append({"user_id": record.user_id, "timestamp": timestamp.isoformat(), "error": err})
                continue

            # Duplicate check (O(1) set) — MUST normalise the same way the
            # set was built (no tzinfo, microseconds=0). Otherwise a record
            # that's already in the DB shows up as "new" because the raw
            # device timestamp has tz/microsecond noise the set doesn't.
            ts_key = _normalise_ts(timestamp)
            is_dup = (employee.id, ts_key) in existing_set

            if preview_only:
                preview_data.append({
                    "user_id": record.user_id,
                    "employee_name": employee.name,
                    "timestamp": timestamp.isoformat(),
                    "punch": record.punch,
                    "status": record.status,
                    "exists": is_dup,
                    "error": ts_error
                })
            else:
                if is_dup:
                    skipped += 1
                elif ts_error and "rejected" in ts_error.lower():
                    errors.append({"user_id": record.user_id, "timestamp": str(record.timestamp), "error": ts_error})
                else:
                    new_records.append(DBAttendance(
                        employee_id=employee.id,
                        device_id=device_id,
                        uid=record.user_id,
                        user_id_str=str(record.user_id),
                        timestamp=timestamp,
                        punch=record.punch,
                        status=record.status
                    ))
                    # Add to set so later duplicates in the same batch are caught
                    existing_set.add((employee.id, ts_key))

        except Exception as e:
            if preview_only:
                preview_data.append({
                    "user_id": record.user_id, "employee_name": "Error",
                    "timestamp": str(record.timestamp), "punch": getattr(record, 'punch', None),
                    "status": getattr(record, 'status', None), "exists": False, "error": str(e)
                })
            else:
                errors.append({"user_id": record.user_id, "timestamp": str(record.timestamp), "error": str(e)})

    process_time = _time.perf_counter() - t3
    logger.info(f"Processed {len(attendance_records)} records in {process_time:.2f}s")

    # ── Step 7: Return preview or commit inserts ─────────────────────────
    if preview_only:
        new_count = sum(1 for r in preview_data if not r["exists"] and not r.get("error"))
        dup_count = sum(1 for r in preview_data if r["exists"])
        err_count = sum(1 for r in preview_data if r.get("error"))
        logger.info(
            f"Preview for {device.name}: new={new_count}, dup={dup_count}, "
            f"err={err_count}, filtered={filtered_count}, "
            f"existing_set_size={len(existing_set)}"
        )
        # Log a few "new" records for debugging duplicate-detection issues
        if new_count > 0 and dup_count == 0:
            sample_new = [r for r in preview_data if not r["exists"] and not r.get("error")][:3]
            for r in sample_new:
                logger.warning(
                    f"DEBUG new record: user_id={r['user_id']}, ts={r['timestamp']}, "
                    f"emp={r['employee_name']}"
                )
        return {
            "success": True,
            "device_id": device_id,
            "device_name": device.name,
            "days_range": days if days > 0 else "all",
            "total_fetched": len(attendance_records),
            "filtered_count": filtered_count,
            "new_count": new_count,
            "duplicate_count": dup_count,
            "error_count": err_count,
            "preview_mode": True,
            "requires_confirmation": True,
            "range_from": cutoff_date.isoformat() if cutoff_date is not None else None,
            "range_to": (end_cutoff - timedelta(seconds=1)).isoformat() if end_cutoff is not None else None,
            "preview_data": preview_data[:200]
        }

    # Bulk insert — atomic upsert so a concurrent sync (or the scheduler's
    # auto-sync of the same device) can't crash this one with a UniqueViolation.
    # The uq_attendance_device_uid_ts constraint absorbs any duplicate rows
    # the in-memory existing_set didn't catch (e.g. ones added between the
    # initial SELECT and this INSERT by another sync).
    t4 = _time.perf_counter()
    count_before = db.query(DBAttendance).filter(DBAttendance.device_id == device_id).count()
    inserted_now = 0
    try:
        if new_records:
            values = [{
                'employee_id': r.employee_id,
                'device_id':   r.device_id,
                'uid':         r.uid,
                'user_id_str': r.user_id_str,
                'timestamp':   r.timestamp,
                'punch':       r.punch,
                'status':      r.status,
                'source':      'device',
            } for r in new_records]
            stmt = pg_insert(DBAttendance).values(values).on_conflict_do_nothing(
                constraint='uq_attendance_device_uid_ts'
            )
            result = db.execute(stmt)
            inserted_now = result.rowcount or 0
            # Any row in new_records that DIDN'T insert is a dup we missed in-memory
            absorbed_dups = len(new_records) - inserted_now
            if absorbed_dups > 0:
                skipped += absorbed_dups
                logger.info(
                    f"ON CONFLICT absorbed {absorbed_dups} duplicate rows that "
                    f"existing_set didn't catch (likely a concurrent sync)"
                )
        db.commit()
    except Exception as e:
        db.rollback()
        logger.error(f"Bulk insert failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Database insert failed: {e}")

    count_after = db.query(DBAttendance).filter(DBAttendance.device_id == device_id).count()
    logger.info(
        f"DB attendance for device: {count_before} → {count_after} (+{count_after - count_before})"
    )

    insert_time = _time.perf_counter() - t4
    total_time = _time.perf_counter() - t0
    logger.info(
        f"Attendance sync complete: {len(new_records)} added, {skipped} skipped, "
        f"{len(errors)} errors in {total_time:.1f}s "
        f"(fetch={fetch_time:.1f}s, process={process_time:.1f}s, insert={insert_time:.1f}s)"
    )

    return {
        "success": True,
        "device_id": device_id,
        "device_name": device.name,
        "days_range": days if days > 0 else "all",
        "total_fetched": len(attendance_records),
        "added": count_after - count_before,
        "skipped": skipped,
        "filtered_count": filtered_count,
        "range_from": cutoff_date.isoformat() if cutoff_date is not None else None,
        "range_to": (end_cutoff - timedelta(seconds=1)).isoformat() if end_cutoff is not None else None,
        "errors": errors[:20]
    }


# ── Device Backup & Restore ───────────────────────────────────────────────────

class RestoreOptions(BaseModel):
    overwrite_existing: bool = True   # If False, skip users already on the device


@router.get("/devices/{device_id}/backup")
async def backup_device(device_id: str):
    """Download a full backup of all users + fingerprint templates from a device.

    The backup is a JSON file containing every user record and all their
    fingerprint templates (templates stored as hex strings via pyzk's built-in
    ``Finger.json_pack()``).  The file can later be uploaded to
    ``POST /api/devices/{device_id}/restore`` to recreate all users/fingerprints.

    The device is connected for the minimum time needed: users are fetched first,
    then all templates are fetched in one call.
    """
    from fastapi.responses import StreamingResponse
    import json as _json
    from zk.finger import Finger

    device = device_store.get_by_id(device_id)
    if not device:
        raise HTTPException(status_code=404, detail=f"Device {device_id} not found")

    manager = ZKTecoDeviceManager(ip=device.ip, port=device.port, timeout=30)

    try:
        with manager.session() as mgr:
            try:
                raw_users = mgr.conn.get_users() or []
            except Exception as e:
                raise HTTPException(status_code=503, detail=f"Cannot connect to device '{device.name}': {e}")

            try:
                all_templates = mgr.conn.get_templates() or []
            except Exception as e:
                logger.warning(f"Backup: could not read templates from '{device.name}': {e}")
                all_templates = []

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Device communication error: {e}")

    # Build template index: uid → list of finger dicts
    fp_index: dict = {}
    for f in all_templates:
        uid_key = int(f.uid)
        fp_index.setdefault(uid_key, []).append(f.json_pack())

    backup = {
        "version": 1,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "device_id": device_id,
        "device_name": device.name,
        "users": [
            {
                "uid": u.uid,
                "name": u.name,
                "privilege": u.privilege,
                "password": u.password if hasattr(u, "password") else "",
                "group_id": u.group_id if hasattr(u, "group_id") else "",
                "user_id": u.user_id,
                "card": u.card if hasattr(u, "card") else 0,
                "fingerprints": fp_index.get(int(u.uid), []),
            }
            for u in raw_users
        ],
    }

    payload = _json.dumps(backup, ensure_ascii=False, indent=2).encode("utf-8")
    safe_name = "".join(c if c.isalnum() or c in "-_" else "_" for c in device.name)
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    filename = f"backup_{safe_name}_{ts}.json"

    return StreamingResponse(
        iter([payload]),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# The restore endpoint — receives the backup JSON as the raw request body
from fastapi import Request as _Request

@router.post("/devices/{device_id}/restore-backup")
async def restore_device_backup(
    device_id: str,
    request: _Request,
    overwrite_existing: bool = True,
):
    """Restore a device from a backup JSON (the file content sent as request body).

    Body: the JSON file produced by GET /api/devices/{device_id}/backup.
    Query param: overwrite_existing (default true) — if false, skip users that
    already exist on the device (matched by user_id string).
    """
    import json as _json
    from zk.finger import Finger

    device = device_store.get_by_id(device_id)
    if not device:
        raise HTTPException(status_code=404, detail=f"Device {device_id} not found")

    try:
        body_bytes = await request.body()
        backup = _json.loads(body_bytes)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid JSON backup file: {e}")

    users_in_backup = backup.get("users", [])
    if not users_in_backup:
        raise HTTPException(status_code=400, detail="Backup contains no users.")

    results = []

    manager = ZKTecoDeviceManager(ip=device.ip, port=device.port, timeout=30)
    try:
        with manager.session() as mgr:
            try:
                existing_raw = mgr.conn.get_users() or []
            except Exception as e:
                raise HTTPException(status_code=503, detail=f"Cannot connect to device '{device.name}': {e}")

            # Map user_id → pyzk user object for quick lookup
            existing_by_userid = {str(getattr(u, "user_id", "")): u for u in existing_raw}

            for u in users_in_backup:
                uid = int(u.get("uid", 0))
                user_id_str = str(u.get("user_id", ""))
                name = u.get("name", "")
                fingerprints_data = u.get("fingerprints", [])

                try:
                    if user_id_str in existing_by_userid:
                        if not overwrite_existing:
                            results.append({
                                "uid": uid, "name": name,
                                "status": "skipped", "fingerprints_restored": 0, "error": None,
                            })
                            continue
                        # Overwrite: delete existing (clears old templates)
                        existing_uid = int(existing_by_userid[user_id_str].uid)
                        try:
                            mgr.conn.delete_user(uid=existing_uid)
                        except Exception:
                            pass

                    # Write user record
                    mgr.conn.set_user(
                        uid=uid,
                        name=name,
                        privilege=int(u.get("privilege", 0)),
                        password=u.get("password") or "",
                        group_id=u.get("group_id") or "",
                        user_id=user_id_str,
                        card=int(u.get("card") or 0),
                    )

                    # Write fingerprints
                    fp_restored = 0
                    if fingerprints_data:
                        # Build pyzk Finger objects from backup
                        fingers = []
                        for fp in fingerprints_data:
                            try:
                                f = Finger.json_unpack(fp)
                                f.uid = uid  # ensure UID matches
                                fingers.append(f)
                            except Exception as fe:
                                logger.warning(f"Restore: could not unpack finger for uid={uid}: {fe}")

                        if fingers:
                            # Get fresh user object (needed by save_user_template)
                            refreshed = mgr.conn.get_users() or []
                            pyzk_user = next(
                                (u2 for u2 in refreshed if int(u2.uid) == uid), None
                            )
                            if pyzk_user:
                                mgr.conn.save_user_template(pyzk_user, fingers)
                                fp_restored = len(fingers)
                                # Update cache for subsequent iterations
                                existing_by_userid[user_id_str] = pyzk_user
                            else:
                                logger.warning(f"Restore: user uid={uid} not found after set_user; fingerprints skipped.")

                    results.append({
                        "uid": uid, "name": name,
                        "status": "restored", "fingerprints_restored": fp_restored, "error": None,
                    })

                except Exception as e:
                    logger.error(f"Restore: error for uid={uid} ({name}): {e}")
                    results.append({
                        "uid": uid, "name": name,
                        "status": "error", "fingerprints_restored": 0, "error": str(e),
                    })

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Device communication error: {e}")

    restored = sum(1 for r in results if r["status"] == "restored")
    skipped = sum(1 for r in results if r["status"] == "skipped")
    errors = sum(1 for r in results if r["status"] == "error")
    total_fp = sum(r["fingerprints_restored"] for r in results)

    return {
        "success": True,
        "device_id": device_id,
        "device_name": device.name,
        "total": len(results),
        "restored": restored,
        "skipped": skipped,
        "errors": errors,
        "fingerprints_restored": total_fp,
        "results": results,
    }
