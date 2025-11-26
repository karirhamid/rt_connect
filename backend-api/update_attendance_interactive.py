"""
Interactive script to update attendance records
"""
import psycopg2
from datetime import datetime

def update_attendance_record():
    conn = psycopg2.connect(
        host="localhost",
        port=5432,
        database="rtzkconnect_db",
        user="postgres",
        password="hk2025@AnzadbPss."
    )
    cursor = conn.cursor()
    
    print("=== Attendance Record Update Tool ===\n")
    
    # Show recent records
    print("Recent attendance records on 2025-11-21:\n")
    cursor.execute("""
        SELECT a.id, a.timestamp, e.name, e.id
        FROM attendance a
        JOIN employees e ON a.employee_id = e.id
        WHERE a.timestamp >= '2025-11-21 00:00:00'
        AND a.timestamp < '2025-11-22 00:00:00'
        ORDER BY a.timestamp
    """)
    
    records = cursor.fetchall()
    for att_id, ts, emp_name, emp_id in records:
        print(f"  {att_id}: {ts} - {emp_name} (Employee ID: {emp_id})")
    
    print("\n" + "="*60)
    print("Enter the Attendance ID to update (or 'q' to quit):")
    att_id_input = input("> ").strip()
    
    if att_id_input.lower() == 'q':
        print("Cancelled.")
        return
    
    try:
        att_id = int(att_id_input)
    except ValueError:
        print("❌ Invalid ID")
        return
    
    # Get the record
    cursor.execute("""
        SELECT a.id, a.timestamp, a.status, a.punch, e.name, e.id
        FROM attendance a
        JOIN employees e ON a.employee_id = e.id
        WHERE a.id = %s
    """, (att_id,))
    
    record = cursor.fetchone()
    if not record:
        print(f"❌ Record ID {att_id} not found")
        return
    
    att_id, old_ts, status, punch, emp_name, emp_id = record
    
    print(f"\nCurrent record:")
    print(f"  Attendance ID: {att_id}")
    print(f"  Employee: {emp_name} (ID: {emp_id})")
    print(f"  Current time: {old_ts}")
    print(f"  Status: {status}, Punch: {punch}")
    
    print(f"\nEnter new time (format: HH:MM or HH:MM:SS, e.g., 08:25 or 08:25:00):")
    time_input = input("> ").strip()
    
    try:
        if ':' in time_input:
            parts = time_input.split(':')
            if len(parts) == 2:
                hour, minute = int(parts[0]), int(parts[1])
                second = 0
            elif len(parts) == 3:
                hour, minute, second = int(parts[0]), int(parts[1]), int(parts[2])
            else:
                raise ValueError("Invalid format")
            
            new_ts = old_ts.replace(hour=hour, minute=minute, second=second)
        else:
            raise ValueError("Invalid format")
    except Exception as e:
        print(f"❌ Invalid time format: {e}")
        return
    
    print(f"\nUpdate:")
    print(f"  From: {old_ts}")
    print(f"  To:   {new_ts}")
    print(f"\nConfirm? (y/n)")
    
    confirm = input("> ").strip().lower()
    if confirm != 'y':
        print("Cancelled.")
        return
    
    # Update the record
    cursor.execute("""
        UPDATE attendance 
        SET timestamp = %s 
        WHERE id = %s
    """, (new_ts, att_id))
    
    conn.commit()
    
    print("\n✅ Attendance record updated successfully!")
    print("\n⚠️  IMPORTANT NOTE:")
    print("   - Change saved in application database only")
    print("   - This app will show the new time")
    print("   - ZKBio will still show the original device time")
    print("   - ZKTeco devices cannot update individual attendance records")
    
    cursor.close()
    conn.close()

if __name__ == "__main__":
    try:
        update_attendance_record()
    except KeyboardInterrupt:
        print("\n\nCancelled by user")
    except Exception as e:
        print(f"\n❌ Error: {e}")
