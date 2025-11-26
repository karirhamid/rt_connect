"""
Manual sync script to force sync today's attendance from all devices
Use this when automatic sync isn't working or you need to force a fresh sync
"""
import asyncio
from datetime import datetime, date, timezone
from app.services.sync_service import sync_service
from app.database import get_db_session
from app.database.schema import Attendance, Employee, Device
from sqlalchemy import func

async def main():
    print("=" * 80)
    print("MANUAL SYNC & DIAGNOSTIC TOOL")
    print("=" * 80)
    
    # Step 1: Check current state
    print("\n📊 CURRENT DATABASE STATE:")
    print("-" * 80)
    
    with get_db_session() as db:
        # Check devices
        devices = db.query(Device).all()
        print(f"\n💾 Devices in database: {len(devices)}")
        for dev in devices:
            print(f"  • {dev.name} ({dev.ip}:{dev.port})")
            print(f"    Last sync: {dev.last_sync}")
            print(f"    Last attendance sync: {dev.last_attendance_sync}")
        
        # Check employees
        total_employees = db.query(Employee).count()
        print(f"\n👥 Total employees: {total_employees}")
        
        # Check today's attendance
        today = date.today()
        day_start = datetime.combine(today, datetime.min.time())
        day_end = datetime.combine(today, datetime.max.time())
        
        today_count = db.query(Attendance).filter(
            Attendance.timestamp >= day_start,
            Attendance.timestamp <= day_end
        ).count()
        
        print(f"\n📅 Attendance records for TODAY ({today}):")
        print(f"  Total records in database: {today_count}")
        
        if today_count > 0:
            # Show breakdown by device
            by_device = db.query(
                Device.name,
                func.count(Attendance.id).label('count')
            ).join(
                Attendance, Device.id == Attendance.device_id
            ).filter(
                Attendance.timestamp >= day_start,
                Attendance.timestamp <= day_end
            ).group_by(Device.name).all()
            
            print(f"  Breakdown by device:")
            for dev_name, count in by_device:
                print(f"    • {dev_name}: {count} records")
            
            # Show unique employees
            unique_emps = db.query(
                func.count(func.distinct(Attendance.employee_id))
            ).filter(
                Attendance.timestamp >= day_start,
                Attendance.timestamp <= day_end
            ).scalar()
            
            print(f"  Unique employees who checked in today: {unique_emps}")
    
    # Step 2: Offer to force sync
    print("\n" + "=" * 80)
    print("SYNC OPTIONS:")
    print("1. Force full sync (ignores last_attendance_sync timestamp)")
    print("2. Normal incremental sync (only new records)")
    print("3. Skip sync")
    print("=" * 80)
    
    choice = input("\nEnter your choice (1/2/3): ").strip()
    
    if choice == "1":
        print("\n🔄 FORCING FULL SYNC (resetting last_attendance_sync)...")
        print("-" * 80)
        
        # Reset last_attendance_sync for all devices to force full sync
        with get_db_session() as db:
            devices = db.query(Device).all()
            for dev in devices:
                print(f"Resetting sync timestamp for {dev.name}")
                dev.last_attendance_sync = None
            db.commit()
        
        print("\n✅ Sync timestamps reset. Now triggering sync...\n")
        
        try:
            await sync_service.sync_all_devices()
            print("\n✅ SYNC COMPLETED!")
        except Exception as e:
            print(f"\n❌ SYNC FAILED: {e}")
            import traceback
            traceback.print_exc()
    
    elif choice == "2":
        print("\n🔄 TRIGGERING INCREMENTAL SYNC...")
        print("-" * 80)
        
        try:
            await sync_service.sync_all_devices()
            print("\n✅ SYNC COMPLETED!")
        except Exception as e:
            print(f"\n❌ SYNC FAILED: {e}")
            import traceback
            traceback.print_exc()
    
    else:
        print("\n⏭️  Skipping sync")
    
    # Step 3: Show results
    print("\n" + "=" * 80)
    print("FINAL STATE AFTER SYNC:")
    print("-" * 80)
    
    with get_db_session() as db:
        today = date.today()
        day_start = datetime.combine(today, datetime.min.time())
        day_end = datetime.combine(today, datetime.max.time())
        
        today_count = db.query(Attendance).filter(
            Attendance.timestamp >= day_start,
            Attendance.timestamp <= day_end
        ).count()
        
        print(f"\n📅 Attendance records for TODAY ({today}):")
        print(f"  Total records: {today_count}")
        
        if today_count > 0:
            # Show last 10 records
            recent = db.query(Attendance).join(
                Employee, Attendance.employee_id == Employee.id
            ).filter(
                Attendance.timestamp >= day_start,
                Attendance.timestamp <= day_end
            ).order_by(Attendance.timestamp.desc()).limit(10).all()
            
            print(f"\n  Last 10 records:")
            for rec in recent:
                time_str = rec.timestamp.strftime('%H:%M:%S')
                emp_name = rec.employee.name if rec.employee else 'Unknown'
                punch_type = 'Check In' if rec.punch == 0 else 'Check Out'
                print(f"    • {time_str} - {emp_name} - {punch_type}")
        else:
            print("\n  ⚠️  NO RECORDS FOUND!")
            print("  This could mean:")
            print("    1. Devices are not online/accessible")
            print("    2. No one has checked in today")
            print("    3. Device connection settings are incorrect")
            print("    4. Employees in device don't exist in database")
    
    print("\n" + "=" * 80)
    print("DONE!")
    print("=" * 80)
    print("\nNext steps:")
    print("1. Check the backend server logs for any errors")
    print("2. Verify devices are accessible (ping the device IPs)")
    print("3. Refresh the frontend attendance page")
    print("4. If still no data, check device connectivity in Device Settings")


if __name__ == "__main__":
    asyncio.run(main())
