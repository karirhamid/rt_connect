"""
Script to diagnose and fix attendance/employee sync issues
Run this to:
1. Check employee counts per device
2. View yesterday's attendance (21/11/2025)
3. Trigger a fresh sync
"""
import asyncio
from datetime import datetime, date
from sqlalchemy import func
from app.database import get_db_session
from app.database.schema import Employee, Device, Attendance
from app.services.sync_service import sync_service


async def main():
    print("=" * 80)
    print("ATTENDANCE & EMPLOYEE DIAGNOSTIC TOOL")
    print("=" * 80)
    
    with get_db_session() as db:
        # Check devices
        print("\n📱 DEVICES IN DATABASE:")
        print("-" * 80)
        devices = db.query(Device).all()
        for device in devices:
            print(f"  • {device.name}")
            print(f"    ID: {device.id}")
            print(f"    IP: {device.ip}:{device.port}")
            print(f"    Last Sync: {device.last_sync}")
            print(f"    Active: {device.is_active}")
            print()
        
        # Check employees per device
        print("\n👥 EMPLOYEES PER DEVICE (by source_device_id):")
        print("-" * 80)
        for device in devices:
            count = db.query(Employee).filter(
                Employee.source_device_id == device.id
            ).count()
            print(f"  • {device.name}: {count} employees")
        
        # Check total unique employees
        total_employees = db.query(Employee).count()
        print(f"\n  📊 Total unique employees in database: {total_employees}")
        
        # Check for duplicate user_ids
        print("\n🔍 CHECKING FOR DUPLICATE USER_IDs:")
        print("-" * 80)
        duplicates = db.query(
            Employee.user_id,
            func.count(Employee.id).label('count')
        ).group_by(Employee.user_id).having(func.count(Employee.id) > 1).all()
        
        if duplicates:
            print(f"  ⚠️ Found {len(duplicates)} duplicate user_ids:")
            for user_id, count in duplicates:
                print(f"    • {user_id}: {count} records")
                employees = db.query(Employee).filter(Employee.user_id == user_id).all()
                for emp in employees:
                    print(f"      - ID: {emp.id}, Name: {emp.name}, Device: {emp.source_device_id}")
        else:
            print("  ✅ No duplicate user_ids found")
        
        # Check yesterday's attendance (21/11/2025)
        print("\n📅 ATTENDANCE FOR 21/11/2025:")
        print("-" * 80)
        target_date = date(2025, 11, 21)
        day_start = datetime.combine(target_date, datetime.min.time())
        day_end = datetime.combine(target_date, datetime.max.time())
        
        attendance_records = db.query(Attendance).filter(
            Attendance.timestamp >= day_start,
            Attendance.timestamp <= day_end
        ).all()
        
        print(f"  Total records: {len(attendance_records)}")
        
        if attendance_records:
            # Group by employee
            by_employee = {}
            for record in attendance_records:
                emp_id = record.employee_id
                if emp_id not in by_employee:
                    by_employee[emp_id] = {
                        'name': record.employee.name,
                        'user_id': record.employee.user_id,
                        'records': []
                    }
                by_employee[emp_id]['records'].append({
                    'time': record.timestamp.strftime('%H:%M:%S'),
                    'type': 'Check In' if record.status == 0 else 'Check Out',
                    'device': record.device.name if record.device else 'Unknown'
                })
            
            print(f"  Unique employees: {len(by_employee)}")
            print("\n  Employee breakdown:")
            for emp_data in by_employee.values():
                print(f"    • {emp_data['name']} ({emp_data['user_id']})")
                for rec in emp_data['records']:
                    print(f"      - {rec['time']}: {rec['type']} @ {rec['device']}")
        
        # Check today's attendance
        print("\n📅 ATTENDANCE FOR TODAY:")
        print("-" * 80)
        today_start = datetime.combine(date.today(), datetime.min.time())
        today_end = datetime.combine(date.today(), datetime.max.time())
        
        today_records = db.query(Attendance).filter(
            Attendance.timestamp >= today_start,
            Attendance.timestamp <= today_end
        ).count()
        
        print(f"  Total records today: {today_records}")
    
    # Ask if user wants to sync
    print("\n" + "=" * 80)
    response = input("Do you want to trigger a fresh sync from all devices? (yes/no): ")
    
    if response.lower() in ['yes', 'y']:
        print("\n🔄 Triggering sync from all devices...")
        try:
            await sync_service.sync_all_devices()
            print("✅ Sync completed successfully!")
            print("\nPlease check the attendance again in the web interface.")
        except Exception as e:
            print(f"❌ Sync failed: {e}")
    else:
        print("\nSkipping sync. Run this script again if you want to sync later.")
    
    print("\n" + "=" * 80)
    print("DIAGNOSTIC COMPLETE")
    print("=" * 80)


if __name__ == "__main__":
    asyncio.run(main())
