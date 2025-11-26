"""
Diagnostic: Check actual timestamps from Device 202 vs saved timestamps
"""
import psycopg2
import os
from datetime import datetime, timezone
from zk import ZK

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASSWORD = os.getenv("DB_PASSWORD", "hk2025@AnzadbPss.")
DB_NAME = os.getenv("DB_NAME", "rtzkconnect_db")

def check_device_202():
    print("="*80)
    print("DIAGNOSTIC: Device 202 Timestamp Analysis")
    print("="*80)
    
    # Get device info from database
    conn = psycopg2.connect(
        host=DB_HOST, port=DB_PORT, user=DB_USER,
        password=DB_PASSWORD, database=DB_NAME
    )
    cursor = conn.cursor()
    
    cursor.execute("""
        SELECT id, name, ip, port, date_format 
        FROM devices 
        WHERE ip = '10.185.1.202' OR name LIKE '%202%'
    """)
    device = cursor.fetchone()
    
    if not device:
        print("❌ Device 202 not found")
        return
    
    device_id, name, ip, port, date_format = device
    print(f"\n📱 Device: {name}")
    print(f"   IP: {ip}:{port}")
    print(f"   Configured date_format: {date_format}")
    print(f"   Device ID: {device_id}")
    
    # Connect to device and get sample attendance records
    print(f"\n🔌 Connecting to device...")
    zk = ZK(ip, port=port, timeout=5, password=0)
    
    try:
        zk_conn = zk.connect()
        print("✓ Connected")
        
        print(f"\n📊 Fetching attendance records from device...")
        attendance = zk_conn.get_attendance()
        
        if not attendance:
            print("   No records found on device")
            zk_conn.disconnect()
            return
        
        # Show first 10 and last 10 records
        print(f"\n   Total records on device: {len(attendance)}")
        print(f"\n   FIRST 5 RECORDS FROM DEVICE:")
        for i, record in enumerate(list(attendance)[:5]):
            print(f"   [{i+1}] User: {record.user_id}, Timestamp: {record.timestamp}, Punch: {record.punch}")
        
        print(f"\n   LAST 5 RECORDS FROM DEVICE:")
        for i, record in enumerate(list(attendance)[-5:]):
            print(f"   [{len(attendance)-4+i}] User: {record.user_id}, Timestamp: {record.timestamp}, Punch: {record.punch}")
        
        zk_conn.disconnect()
        print("\n✓ Disconnected from device")
        
    except Exception as e:
        print(f"❌ Error connecting to device: {e}")
        return
    
    # Check employees linked to this device
    print(f"\n👥 Checking employees linked to device...")
    cursor.execute("""
        SELECT device_user_id, user_id, name, composite_id
        FROM employees
        WHERE source_device_id = %s
        ORDER BY device_user_id
    """, (device_id,))
    
    employees = cursor.fetchall()
    print(f"   Found {len(employees)} employees linked to this device")
    
    if employees:
        print(f"\n   SAMPLE EMPLOYEES:")
        for emp in employees[:5]:
            print(f"   - device_user_id={emp[0]}, user_id={emp[1]}, name={emp[2]}, composite_id={emp[3]}")
    
    # Check saved attendance records
    print(f"\n💾 Checking saved attendance in database...")
    cursor.execute("""
        SELECT COUNT(*) 
        FROM attendance 
        WHERE device_id = %s
    """, (device_id,))
    
    saved_count = cursor.fetchone()[0]
    print(f"   Saved attendance records: {saved_count}")
    
    # Check for records with employee_id = NULL (errors)
    cursor.execute("""
        SELECT COUNT(*), COUNT(DISTINCT user_id_str)
        FROM attendance 
        WHERE device_id = %s AND employee_id IS NULL
    """, (device_id,))
    
    null_count, unique_users = cursor.fetchone()
    print(f"   Records with NULL employee_id (errors): {null_count}")
    print(f"   Unique user_ids with errors: {unique_users}")
    
    if null_count > 0:
        print(f"\n   SAMPLE ERROR RECORDS:")
        cursor.execute("""
            SELECT user_id_str, timestamp, status, punch
            FROM attendance 
            WHERE device_id = %s AND employee_id IS NULL
            LIMIT 5
        """, (device_id,))
        
        for rec in cursor.fetchall():
            print(f"   - user_id={rec[0]}, timestamp={rec[1]}, status={rec[2]}, punch={rec[3]}")
    
    # Check for user_ids that exist in attendance but not in employees
    print(f"\n🔍 Finding user_ids in attendance but not in employee table...")
    cursor.execute("""
        SELECT DISTINCT a.user_id_str, COUNT(*) as record_count
        FROM attendance a
        WHERE a.device_id = %s 
        AND NOT EXISTS (
            SELECT 1 FROM employees e 
            WHERE e.source_device_id = %s 
            AND CAST(e.device_user_id AS TEXT) = a.user_id_str
        )
        GROUP BY a.user_id_str
        ORDER BY record_count DESC
        LIMIT 10
    """, (device_id, device_id))
    
    orphaned = cursor.fetchall()
    if orphaned:
        print(f"   Found {len(orphaned)} user_ids with no matching employee:")
        for user_id, count in orphaned:
            print(f"   - user_id={user_id}: {count} attendance records")
    else:
        print(f"   ✓ All user_ids have matching employees")
    
    cursor.close()
    conn.close()
    
    print("\n" + "="*80)
    print("DIAGNOSTIC COMPLETE")
    print("="*80)

if __name__ == "__main__":
    check_device_202()
