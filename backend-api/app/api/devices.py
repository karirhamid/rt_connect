from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
import uuid
import asyncio
from concurrent.futures import ThreadPoolExecutor
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timedelta, timezone
import logging
from app.services.device_store import device_store, Device
from app.services.device_manager import ZKTecoDeviceManager
from app.database import get_db
from app.database.schema import Device as DBDevice, Employee as DBEmployee, Attendance as DBAttendance
from app.services.sync_service import sync_service

router = APIRouter()
logger = logging.getLogger(__name__)

# Default organizational IDs for employees synced from devices
DEFAULT_COMPANY_ID = 1
DEFAULT_DEPARTMENT_ID = 1
DEFAULT_POSITION_ID = 1

class DeviceCreate(BaseModel):
    name: str
    ip: str
    port: int
    tag: Optional[str] = None
    serial_number: Optional[str] = None
    date_format: Optional[str] = "YYYY-MM-DD"  # YYYY-MM-DD, DD/MM/YYYY, MM/DD/YYYY

class DeviceDiscovery(BaseModel):
    ip: str
    port: int = 4370

@router.get("/devices")
async def get_devices():
    """Get all registered devices"""
    devices = device_store.get_all()
    return {"devices": [d.dict() for d in devices]}

@router.post("/devices")
async def add_device(device_data: DeviceCreate):
    """Add a new device and sync it immediately"""
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
    device_store.add(device)
    
    # Trigger immediate sync for the new device
    await sync_service.sync_device(device_id)
    
    return {"message": "Device added and synced successfully", "device": device.dict()}

@router.delete("/devices/{device_id}")
async def delete_device(device_id: str, db: Session = Depends(get_db)):
    """Delete a device and its data from database"""
    if device_store.delete(device_id):
        # Delete device and related data from database
        db_device = db.query(DBDevice).filter(DBDevice.id == device_id).first()
        if db_device:
            db.delete(db_device)
            db.commit()
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
    """Discover device by IP and retrieve information"""
    manager = ZKTecoDeviceManager(
        ip=discovery_data.ip,
        port=discovery_data.port,
        timeout=10
    )
    
    info = manager.get_device_info()
    if not info:
        raise HTTPException(status_code=400, detail="Failed to connect to device")
    
    return info

@router.get("/device/{device_id}/info")
async def get_device_info(device_id: str):
    """Get information for a specific device"""
    device = device_store.get_by_id(device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    manager = ZKTecoDeviceManager(ip=device.ip, port=device.port)
    info = manager.get_device_info()
    
    if not info:
        raise HTTPException(status_code=400, detail="Failed to connect to device")
    
    return info

@router.get("/device/{device_id}/users")
async def get_device_users(device_id: str):
    """Get users from a specific device"""
    device = device_store.get_by_id(device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    manager = ZKTecoDeviceManager(ip=device.ip, port=device.port)
    users = manager.get_users()
    
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
    
    manager = ZKTecoDeviceManager(ip=device.ip, port=device.port)
    attendance = manager.get_attendance()
    
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
    
    # Get total users (employees)
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
        
        # Get employee count (all employees in system)
        user_count = db.query(DBEmployee).count()
        
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
        "recent_devices": recent_devices[:5]  # Last 5 devices
    }


@router.post("/sync")
@router.get("/sync")
async def trigger_sync(device_id: Optional[str] = None):
    """Trigger manual sync of devices"""
    await sync_service.trigger_sync(device_id)
    return {"message": "Sync triggered successfully"}


@router.get("/devices/{device_id}/time")
async def get_device_time(device_id: str):
    """Get time settings from a specific device"""
    device = device_store.get(device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    try:
        manager = ZKTecoDeviceManager(ip=device.ip, port=device.port)
        time_info = manager.get_time()
        return {
            "device_id": device_id,
            "device_name": device.name,
            **time_info
        }
    except Exception as e:
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
        
        manager = ZKTecoDeviceManager(ip=device.ip, port=device.port)
        manager.set_time(target_time)
        
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
            manager = ZKTecoDeviceManager(ip=device.ip, port=device.port)
            manager.set_time(target_time)
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
    """Manually sync employees from a specific device to the database
    
    Args:
        device_id: Device ID to sync from
        preview_only: If True, only fetch and return preview data without saving to DB
    """
    device = device_store.get_by_id(device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    # Get device settings from DB
    db_device = db.query(DBDevice).filter(DBDevice.id == device_id).first()
    
    try:
        # Connect to device
        manager = ZKTecoDeviceManager(ip=device.ip, port=device.port, timeout=10)
        
        # Get all users from device (this will connect and disconnect)
        users = manager.get_users() or []
        
        if not users:
            return {
                "success": True,
                "device_id": device_id,
                "device_name": device.name,
                "total_fetched": 0,
                "added": 0,
                "updated": 0,
                "errors": [],
                "preview_data": []
            }
        
        # Log all fetched data to console
        logger.info(f"="*80)
        logger.info(f"DEVICE SYNC - Fetched {len(users)} users from {device.name} ({device.ip})")
        logger.info(f"="*80)
        for user in users:
            logger.info(f"  User ID: {user.user_id:4} | UID: {user.uid:4} | Name: {user.name:30} | Privilege: {user.privilege}")
        logger.info(f"="*80)
        
        # Check global setting for confirmation requirement
        from app.database.schema import AppSettings
        settings = db.query(AppSettings).first()
        require_confirmation = settings.require_sync_confirmation if settings else True
        
        # If preview_only or confirmation required, return preview data
        if preview_only or require_confirmation:
            preview_data = []
            for user in users:
                existing = db.query(DBEmployee).filter(
                    DBEmployee.source_device_id == device_id,
                    DBEmployee.device_user_id == user.user_id
                ).first()
                
                app_privilege = 14 if user.privilege in (6, 14) else 0
                status = "update" if existing else "new"
                
                preview_data.append({
                    "user_id": user.user_id,
                    "uid": user.uid,
                    "name": user.name,
                    "privilege": user.privilege,
                    "app_privilege": app_privilege,
                    "status": status,
                    "existing_name": existing.name if existing else None
                })
            
            return {
                "success": True,
                "device_id": device_id,
                "device_name": device.name,
                "total_fetched": len(users),
                "preview_mode": True,
                "requires_confirmation": require_confirmation,
                "preview_data": preview_data
            }
        
        # Proceed with actual sync
        added = 0
        updated = 0
        errors = []
        
        # Process each user
        for user in users:
            try:
                # Check if employee already exists (device_user_id is Integer in DB)
                existing = db.query(DBEmployee).filter(
                    DBEmployee.source_device_id == device_id,
                    DBEmployee.device_user_id == user.user_id  # Compare as integer
                ).first()
                
                if existing:
                    # Update existing employee only if something changed
                    has_changes = False
                    if existing.name != user.name:
                        existing.name = user.name
                        has_changes = True
                    # DON'T sync privilege from device - it's managed in the frontend
                    # Privilege changes are pushed from frontend → device, not pulled from device → backend
                    # This preserves manual role assignments made in the UI
                    
                    if has_changes:
                        existing.updated_at = datetime.now(timezone.utc)
                        updated += 1
                else:
                    # Add new employee with default organizational values
                    # For new employees, map device privilege to app privilege: 6→14 (admin), 0→0 (user)
                    # Map device admin to app admin. Some firmwares use 14, others use 6.
                    app_privilege = 14 if user.privilege in (6, 14) else 0
                    logger.info(f"New employee '{user.name}' (UID={user.user_id}): device_privilege={user.privilege} -> app_privilege={app_privilege}")
                    new_employee = DBEmployee(
                        name=user.name,
                        device_user_id=user.user_id,  # Use integer directly
                        user_id=str(user.user_id),  # Use string for user_id field
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
        
        logger.info(f"✅ Sync completed: {added} added, {updated} updated, {len(errors)} errors")
        
        return {
            "success": True,
            "device_id": device_id,
            "device_name": device.name,
            "total_fetched": len(users),
            "added": added,
            "updated": updated,
            "errors": errors,
            "preview_mode": False
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to sync employees: {str(e)}")


@router.post("/devices/{device_id}/confirm-sync")
async def confirm_employee_sync(device_id: str, db: Session = Depends(get_db)):
    """Confirm and execute employee sync after preview
    
    This endpoint performs the actual sync, bypassing the confirmation requirement.
    Use after user confirms the preview data.
    """
    # Temporarily disable global confirmation for this sync
    from app.database.schema import AppSettings
    settings = db.query(AppSettings).first()
    if settings:
        original_setting = settings.require_sync_confirmation
        settings.require_sync_confirmation = False
        db.commit()
        
        try:
            result = await sync_employees_from_device(device_id=device_id, preview_only=False, db=db)
            return result
        finally:
            # Restore original setting
            settings.require_sync_confirmation = original_setting
            db.commit()
    else:
        # No settings, just call sync
        return await sync_employees_from_device(device_id=device_id, preview_only=False, db=db)


@router.post("/devices/{device_id}/confirm-attendance-sync")
async def confirm_attendance_sync(device_id: str, days: int = 30, db: Session = Depends(get_db)):
    """Confirm and execute attendance sync after preview
    
    This endpoint performs the actual sync, bypassing the confirmation requirement.
    Use after user confirms the preview data.
    """
    # Temporarily disable global confirmation for this sync
    from app.database.schema import AppSettings
    settings = db.query(AppSettings).first()
    if settings:
        original_setting = settings.require_sync_confirmation
        settings.require_sync_confirmation = False
        db.commit()
        
        try:
            result = await sync_attendance_from_device(device_id=device_id, days=days, preview_only=False, db=db)
            return result
        finally:
            # Restore original setting
            settings.require_sync_confirmation = original_setting
            db.commit()
    else:
        # No settings, just call sync
        return await sync_attendance_from_device(device_id=device_id, days=days, preview_only=False, db=db)


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
        manager.update_user(
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
    db: Session = Depends(get_db)
):
    """Manually sync attendance logs from a specific device
    
    Args:
        device_id: The device ID to sync from
        days: Number of days to sync (default: 30 for recent logs, use 0 for all logs)
        preview_only: If True, only return preview data without syncing
    """
    device = device_store.get_by_id(device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    try:
        # Connect to device
        manager = ZKTecoDeviceManager(ip=device.ip, port=device.port, timeout=10)
        
        # Get all attendance records from device (this will connect and disconnect)
        try:
            attendance_records = manager.get_attendance() or []
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to get attendance from device: {str(e)}")
        
        if not attendance_records:
            return {
                "success": True,
                "device_id": device_id,
                "device_name": device.name,
                "total_fetched": 0,
                "added": 0,
                "skipped": 0,
                "errors": []
            }
        
        # Calculate cutoff date for filtering (if needed)
        cutoff_date = None
        if days > 0:
            cutoff_date = datetime.now(timezone.utc) - timedelta(days=days)
        
        # Log fetched attendance records to console
        logger.info(f"="*80)
        logger.info(f"ATTENDANCE SYNC - Fetched {len(attendance_records)} records from {device.name} ({device.ip})")
        if days > 0:
            logger.info(f"Date range: Last {days} days")
        else:
            logger.info(f"Date range: All records")
        logger.info(f"="*80)
        
        # Check global setting for confirmation requirement
        from app.database.schema import AppSettings
        from app.utils.timestamp_validator import validate_and_correct_timestamp
        settings = db.query(AppSettings).first()
        require_confirmation = settings.require_sync_confirmation if settings else True
        validate_timestamps = settings.validate_timestamps if (settings and hasattr(settings, 'validate_timestamps')) else True
        
        # Process and categorize records
        preview_data = []
        filtered_count = 0
        
        for record in attendance_records:
            try:
                # Ensure timestamp is timezone-aware
                timestamp = record.timestamp
                if timestamp.tzinfo is None:
                    timestamp = timestamp.replace(tzinfo=timezone.utc)
                
                # Validate and correct timestamp if enabled
                timestamp_error = None
                if validate_timestamps:
                    timestamp, timestamp_error = validate_and_correct_timestamp(
                        timestamp,
                        device_date_format=device.date_format if hasattr(device, 'date_format') else "YYYY-MM-DD"
                    )
                
                # Apply date filter
                if cutoff_date is not None:
                    if timestamp < cutoff_date:
                        filtered_count += 1
                        continue  # Skip old records
                
                # Find employee
                employee = db.query(DBEmployee).filter(
                    DBEmployee.source_device_id == device_id,
                    DBEmployee.device_user_id == record.user_id
                ).first()
                
                if not employee:
                    error_msg = "Employee not found"
                    if timestamp_error:
                        error_msg = f"{error_msg}; {timestamp_error}"
                    preview_data.append({
                        "user_id": record.user_id,
                        "employee_name": "Unknown Employee",
                        "timestamp": timestamp.isoformat(),
                        "punch": record.punch,
                        "status": record.status,
                        "exists": False,
                        "error": error_msg
                    })
                    continue
                
                # Check if record already exists
                existing = db.query(DBAttendance).filter(
                    DBAttendance.employee_id == employee.id,
                    DBAttendance.timestamp == timestamp,
                    DBAttendance.device_id == device_id
                ).first()
                
                # Report timestamp validation errors even for valid records
                error_msg = timestamp_error if timestamp_error else None
                
                preview_data.append({
                    "user_id": record.user_id,
                    "employee_name": employee.name,
                    "timestamp": timestamp.isoformat(),
                    "punch": record.punch,
                    "status": record.status,
                    "exists": existing is not None,
                    "error": error_msg
                })
                
            except Exception as e:
                preview_data.append({
                    "user_id": record.user_id,
                    "employee_name": "Error",
                    "timestamp": str(record.timestamp),
                    "punch": record.punch if hasattr(record, 'punch') else None,
                    "status": record.status if hasattr(record, 'status') else None,
                    "exists": False,
                    "error": str(e)
                })
        
        # Count new vs existing
        new_count = sum(1 for r in preview_data if not r["exists"] and not r["error"])
        duplicate_count = sum(1 for r in preview_data if r["exists"])
        error_count = sum(1 for r in preview_data if r["error"])
        
        # If preview_only or confirmation required, return preview data
        if preview_only or require_confirmation:
            return {
                "success": True,
                "device_id": device_id,
                "device_name": device.name,
                "days_range": days if days > 0 else "all",
                "total_fetched": len(attendance_records),
                "filtered_count": filtered_count,
                "new_count": new_count,
                "duplicate_count": duplicate_count,
                "error_count": error_count,
                "preview_mode": True,
                "requires_confirmation": require_confirmation,
                "preview_data": preview_data[:100]  # Limit to first 100 for UI
            }
        
        # Proceed with actual sync
        added = 0
        skipped = 0
        errors = []
        
        # Process each attendance record
        for record in attendance_records:
            try:
                # Ensure timestamp is timezone-aware first
                timestamp = record.timestamp
                if timestamp.tzinfo is None:
                    # If naive, assume UTC
                    timestamp = timestamp.replace(tzinfo=timezone.utc)
                
                # Validate and correct timestamp if enabled
                timestamp_error = None
                if validate_timestamps:
                    timestamp, timestamp_error = validate_and_correct_timestamp(
                        timestamp,
                        device_date_format=device.date_format if hasattr(device, 'date_format') else "YYYY-MM-DD"
                    )
                    
                    # If timestamp validation failed critically, skip this record
                    if timestamp_error and "rejected" in timestamp_error.lower():
                        errors.append({
                            "user_id": record.user_id,
                            "timestamp": str(record.timestamp),
                            "error": timestamp_error
                        })
                        continue
                
                # Apply date filter after normalization
                if cutoff_date is not None:
                    if timestamp < cutoff_date:
                        continue  # Skip old records
                
                # Find employee by device_user_id and source_device_id
                employee = db.query(DBEmployee).filter(
                    DBEmployee.source_device_id == device_id,
                    DBEmployee.device_user_id == record.user_id
                ).first()
                
                if not employee:
                    errors.append({
                        "user_id": record.user_id,
                        "timestamp": timestamp.isoformat(),
                        "error": "Employee not found in database"
                    })
                    continue
                
                # Check if this exact attendance record already exists
                existing = db.query(DBAttendance).filter(
                    DBAttendance.employee_id == employee.id,
                    DBAttendance.timestamp == timestamp,
                    DBAttendance.device_id == device_id
                ).first()
                
                if existing:
                    skipped += 1
                    continue
                
                # Add new attendance record
                new_attendance = DBAttendance(
                    employee_id=employee.id,
                    device_id=device_id,
                    uid=record.user_id,  # Required field
                    user_id_str=str(record.user_id),  # Required field
                    timestamp=timestamp,
                    punch=record.punch,
                    status=record.status
                )
                db.add(new_attendance)
                added += 1
                
            except Exception as e:
                errors.append({
                    "user_id": record.user_id,
                    "timestamp": record.timestamp.isoformat() if hasattr(record.timestamp, 'isoformat') else str(record.timestamp),
                    "error": str(e)
                })
        
        db.commit()
        
        return {
            "success": True,
            "device_id": device_id,
            "device_name": device.name,
            "days_range": days if days > 0 else "all",
            "total_fetched": len(attendance_records),
            "added": added,
            "skipped": skipped,
            "errors": errors[:10]  # Limit errors to first 10
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to sync attendance: {str(e)}")
