from fastapi import APIRouter, HTTPException
from sqlalchemy import func, and_
from datetime import datetime, timedelta
from app.database import get_db
from app.database.schema import Device, Employee, Attendance
from app.services.device_manager import ZKTecoDeviceManager
import logging

router = APIRouter(prefix="/api")
logger = logging.getLogger(__name__)


def check_device_online(ip: str, port: int, timeout: int = 3) -> bool:
    """Check if a device is online by attempting to connect"""
    try:
        manager = ZKTecoDeviceManager(ip=ip, port=port, timeout=timeout)
        manager.connect()
        manager.disconnect()
        return True
    except Exception as e:
        logger.debug(f"Device {ip}:{port} is offline: {str(e)}")
        return False


@router.get("/statistics")
async def get_dashboard_statistics():
    """Get dashboard statistics including device count, user count, attendance, and charts data"""
    db = next(get_db())
    
    try:
        # Total devices
        total_devices = db.query(Device).count()
        
        # Total users/employees
        total_users = db.query(Employee).count()
        
        # Today's attendance count
        today = datetime.now().date()
        today_attendance = db.query(Attendance).filter(
            func.date(Attendance.timestamp) == today
        ).count()
        
        # Get all devices and check their status
        all_devices = db.query(Device).all()
        active_devices = 0
        device_statuses = {}
        
        # Check each device's connectivity
        for device in all_devices:
            is_online = check_device_online(device.ip, device.port)
            device_statuses[device.id] = is_online
            if is_online:
                active_devices += 1
        
        logger.info(f"Device status check: {active_devices}/{len(all_devices)} devices online")
        
        # Weekly attendance data (last 7 days)
        weekly_data = []
        days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
        
        # Get start of current week (Monday)
        today_datetime = datetime.now()
        start_of_week = today_datetime - timedelta(days=today_datetime.weekday())
        
        for i in range(7):
            day_date = (start_of_week + timedelta(days=i)).date()
            count = db.query(Attendance).filter(
                func.date(Attendance.timestamp) == day_date
            ).count()
            weekly_data.append({
                'day': days[i],
                'count': count
            })
        
        # Device status for pie chart
        # For now, all devices are offline (0 online)
        device_status = [
            {'name': 'Online', 'value': active_devices},
            {'name': 'Offline', 'value': total_devices - active_devices}
        ]
        
        # Recent devices with status
        recent_devices = []
        devices = db.query(Device).limit(10).all()
        
        for device in devices:
            # Count users associated with this device (by source_device_id)
            user_count = db.query(Employee).filter(
                Employee.source_device_id == device.id
            ).count()
            
            # Get online status from our check above
            is_online = device_statuses.get(device.id, False)
            
            recent_devices.append({
                'name': device.name,
                'serial_number': device.serial_number,
                'ip': device.ip,
                'port': device.port,
                'status': 'online' if is_online else 'offline',
                'user_count': user_count
            })
        
        return {
            'total_devices': total_devices,
            'total_users': total_users,
            'today_attendance': today_attendance,
            'active_devices': active_devices,
            'weekly_attendance': weekly_data,
            'device_status': device_status,
            'recent_devices': recent_devices
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch statistics: {str(e)}")
    finally:
        db.close()
