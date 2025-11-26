"""
Script to clean all device-synced data from the PostgreSQL database.
This will delete all employees and attendance records that were synced from devices.
NOTE: This ONLY cleans the database, NOT the devices themselves.
"""
import psycopg2

# PostgreSQL connection parameters
DB_CONFIG = {
    'host': 'localhost',
    'port': 5432,
    'database': 'rtzkconnect_db',
    'user': 'postgres',
    'password': 'Pa$$word02'
}

def clean_device_data():
    """Clean all device-synced employees and attendance records"""
    
    conn = None
    cursor = None
    
    try:
        print("=" * 60)
        print("CLEANING DEVICE DATA FROM DATABASE")
        print("=" * 60)
        
        # Connect to database
        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor()
        
        # Count records before deletion
        cursor.execute("SELECT COUNT(*) FROM employees WHERE source_device_id IS NOT NULL")
        employee_count = cursor.fetchone()[0]
        
        cursor.execute("SELECT COUNT(*) FROM attendance")
        attendance_count = cursor.fetchone()[0]
        
        print(f"\n📊 Current data:")
        print(f"   - Employees from devices: {employee_count}")
        print(f"   - Attendance records: {attendance_count}")
        
        if employee_count == 0 and attendance_count == 0:
            print("\n✅ Database is already clean - no device data found.")
            return
        
        # Ask for confirmation
        print(f"\n⚠️  WARNING: This will delete:")
        print(f"   - {employee_count} employees synced from devices")
        print(f"   - {attendance_count} attendance records")
        print(f"\n   This action CANNOT be undone!")
        print(f"   Devices will keep their data - only database will be cleaned.")
        
        response = input("\nType 'YES' to confirm deletion: ")
        
        if response != 'YES':
            print("\n❌ Deletion cancelled.")
            return
        
        print("\n🗑️  Deleting data...")
        
        # Delete attendance records first (foreign key constraint)
        cursor.execute("DELETE FROM attendance")
        deleted_attendance = cursor.rowcount
        print(f"   ✓ Deleted {deleted_attendance} attendance records")
        
        # Delete employees from devices
        cursor.execute("DELETE FROM employees WHERE source_device_id IS NOT NULL")
        deleted_employees = cursor.rowcount
        print(f"   ✓ Deleted {deleted_employees} employees")
        
        # Commit the changes
        conn.commit()
        
        print("\n" + "=" * 60)
        print("✅ DATABASE CLEANED SUCCESSFULLY!")
        print("=" * 60)
        print("\nYou can now sync data from devices again.")
        print("The devices still have all their data intact.")
        
    except Exception as e:
        if conn:
            conn.rollback()
        print(f"\n❌ Error cleaning database: {str(e)}")
        return 1
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

if __name__ == "__main__":
    clean_device_data()
