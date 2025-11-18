from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
import uuid
import asyncio
from concurrent.futures import ThreadPoolExecutor
from app.services.device_store import device_store, Device
from app.services.device_manager import ZKTecoDeviceManager

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
async def get_statistics():
    """Get dashboard statistics across all devices"""
    devices = device_store.get_all()
    total_devices = len(devices)
    total_users = 0
    today_attendance = 0
    active_devices = 0
    
    from datetime import datetime, timedelta
    today = datetime.now().date()
    week_ago = today - timedelta(days=7)
    
    weekly_attendance = {i: 0 for i in range(7)}
    device_status = {"online": 0, "offline": 0}
    recent_devices = []
    
    # If no devices, return empty statistics
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
    
    # Helper function to process a single device
    def process_device(device):
        manager = ZKTecoDeviceManager(ip=device.ip, port=device.port, timeout=3)
        info = manager.get_device_info()
        
        device_data = {
            "name": device.name,
            "ip": device.ip,
            "port": device.port,
            "serial_number": device.serial_number or "N/A",
            "status": "offline",
            "user_count": 0,
            "users": [],
            "attendance": []
        }
        
        if info:
            device_data["status"] = "online"
            serial_num = info.get("serial_number", "N/A") if isinstance(info, dict) else getattr(info, "serial_number", "N/A")
            device_data["serial_number"] = serial_num
            
            users = manager.get_users() or []
            device_data["user_count"] = len(users)
            device_data["users"] = users
            
            attendance = manager.get_attendance() or []
            device_data["attendance"] = attendance
        
        return device_data
    
    # Process all devices in parallel using ThreadPoolExecutor
    with ThreadPoolExecutor(max_workers=min(5, total_devices)) as executor:
        device_results = list(executor.map(process_device, devices))
    
    # Process results
    for device_data in device_results:
        if device_data["status"] == "online":
            active_devices += 1
            device_status["online"] += 1
            total_users += device_data["user_count"]
            
            # Count today's and weekly attendance
            for record in device_data["attendance"]:
                # Handle both dict and Attendance object
                if hasattr(record, 'timestamp'):
                    record_date = record.timestamp.date()
                elif isinstance(record, dict):
                    timestamp = record.get("timestamp")
                    if isinstance(timestamp, str):
                        record_date = datetime.fromisoformat(timestamp.replace('Z', '+00:00')).date()
                    else:
                        record_date = timestamp.date()
                else:
                    continue
                
                if record_date == today:
                    today_attendance += 1
                
                # Weekly attendance
                if record_date >= week_ago:
                    days_ago = (today - record_date).days
                    if 0 <= days_ago < 7:
                        weekly_attendance[6 - days_ago] += 1
        else:
            device_status["offline"] += 1
        
        recent_devices.append({
            "name": device_data["name"],
            "serial_number": device_data["serial_number"],
            "ip": device_data["ip"],
            "port": device_data["port"],
            "status": device_data["status"],
            "user_count": device_data["user_count"]
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
