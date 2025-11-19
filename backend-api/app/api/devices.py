from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
import uuid
import asyncio
from concurrent.futures import ThreadPoolExecutor
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timedelta
from app.services.device_store import device_store, Device
from app.services.device_manager import ZKTecoDeviceManager
from app.database import get_db
from app.database.schema import Device as DBDevice, User as DBUser, Attendance as DBAttendance
from app.services.sync_service import sync_service

router = APIRouter()

class DeviceCreate(BaseModel):
    name: str
    ip: str
    port: int
    tag: Optional[str] = None
    serial_number: Optional[str] = None

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
    """Add a new device"""
    device_id = str(uuid.uuid4())
    device = Device(
        id=device_id,
        name=device_data.name,
        ip=device_data.ip,
        port=device_data.port,
        tag=device_data.tag,
        serial_number=device_data.serial_number
    )
    device_store.add(device)
    return {"message": "Device added successfully", "device": device.dict()}

@router.delete("/devices/{device_id}")
async def delete_device(device_id: str):
    """Delete a device"""
    if device_store.delete(device_id):
        return {"message": "Device deleted successfully"}
    raise HTTPException(status_code=404, detail="Device not found")

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
    
    # Get total users
    total_users = db.query(DBUser).count()
    
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
        is_online = device.last_sync and (datetime.utcnow() - device.last_sync).seconds < 600
        
        if is_online:
            device_status["online"] += 1
            active_devices += 1
        else:
            device_status["offline"] += 1
        
        # Get user count for this device
        user_count = db.query(DBUser).filter(DBUser.device_id == device.id).count()
        
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
async def trigger_sync(device_id: Optional[str] = None):
    """Trigger manual sync of devices"""
    await sync_service.trigger_sync(device_id)
    return {"message": "Sync triggered successfully"}
