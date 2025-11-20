from fastapi import APIRouter, HTTPException
from sqlalchemy import func, and_
from datetime import datetime, timedelta
from app.database import get_db
from app.database.schema import Device, Employee, Attendance

router = APIRouter(prefix="/api")


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
        
        # Active devices (status check - for now, all are offline since we don't have real-time status)
        # In a real implementation, you'd ping devices or check last sync time
        active_devices = 0  # TODO: Implement real device status checking
        
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
            # Count users associated with this device
            user_count = db.query(Employee).filter(
                Employee.device_id == device.id
            ).count()
            
            recent_devices.append({
                'name': device.name,
                'serial_number': device.serial_number,
                'ip': device.ip,
                'port': device.port,
                'status': 'offline',  # TODO: Implement real device status checking
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
