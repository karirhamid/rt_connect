"""
Script to fix attendance record for employee 29 on 2025-11-21
Changes time from 11:13:25 to 08:25:00
"""
import psycopg2
from datetime import datetime

def fix_attendance():
    # Database connection
    conn = psycopg2.connect(
        host="localhost",
        port=5432,
        database="rtzkconnect_db",
        user="postgres",
        password="hk2025@AnzadbPss."
    )
    cursor = conn.cursor()
    
    try:
        # Find employee 29
        cursor.execute("SELECT id, name, user_id FROM employees WHERE id = 29")
        employee = cursor.fetchone()
        
        if not employee:
            print("❌ Employee with ID 29 not found")
            return
        
        emp_id, emp_name, user_id = employee
        print(f"✓ Found employee: {emp_name} (ID: {emp_id}, user_id: {user_id})")
        
        # Find attendance records on 2025-11-21
        cursor.execute("""
            SELECT id, timestamp, status, punch 
            FROM attendance 
            WHERE employee_id = %s 
            AND timestamp >= '2025-11-21 00:00:00'
            AND timestamp < '2025-11-22 00:00:00'
            ORDER BY timestamp
        """, (emp_id,))
        
        records = cursor.fetchall()
        
        if not records:
            print("❌ No attendance records found for employee 29 on 2025-11-21")
            return
        
        print(f"\nFound {len(records)} record(s) on 2025-11-21:")
        for i, (rec_id, ts, status, punch) in enumerate(records, 1):
            print(f"  {i}. ID: {rec_id}, Time: {ts}, Status: {status}, Punch: {punch}")
        
        # Find the 11:13 record
        target_record = None
        for rec_id, ts, status, punch in records:
            if ts.hour == 11 and ts.minute == 13:
                target_record = (rec_id, ts, status, punch)
                break
        
        if not target_record:
            print("\n⚠ No record found at 11:13. Using first record...")
            target_record = records[0]
        
        rec_id, old_time, status, punch = target_record
        new_time = datetime(2025, 11, 21, 8, 25, 0)
        
        print(f"\n📝 Updating attendance record:")
        print(f"   Record ID: {rec_id}")
        print(f"   Employee: {emp_name} (ID: {emp_id})")
        print(f"   Old time: {old_time}")
        print(f"   New time: {new_time}")
        
        # Update the record
        cursor.execute("""
            UPDATE attendance 
            SET timestamp = %s 
            WHERE id = %s
        """, (new_time, rec_id))
        
        conn.commit()
        
        print("\n✅ Attendance record updated successfully in database!")
        print("\n⚠️  IMPORTANT NOTE:")
        print("   - The change is saved in the application database")
        print("   - This app will now show the updated time (08:25:00)")
        print("   - ZKBio application will still show the original time (11:13:25)")
        print("   - This is because ZKTeco devices do NOT support updating attendance records")
        print("   - The device firmware only allows reading or clearing ALL records")
        
    except Exception as e:
        print(f"\n❌ Error: {str(e)}")
        conn.rollback()
    finally:
        cursor.close()
        conn.close()

if __name__ == "__main__":
    fix_attendance()
