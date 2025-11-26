"""
Check database for Device 202 issues
"""
import psycopg2
import os

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASSWORD = os.getenv("DB_PASSWORD", "hk2025@AnzadbPss.")
DB_NAME = os.getenv("DB_NAME", "rtzkconnect_db")

conn = psycopg2.connect(
    host=DB_HOST, port=DB_PORT, user=DB_USER,
    password=DB_PASSWORD, database=DB_NAME
)
cursor = conn.cursor()

print("="*80)
print("DEVICE 202 DATABASE ANALYSIS")
print("="*80)

# Get device info
cursor.execute("""
    SELECT id, name, ip, date_format 
    FROM devices 
    WHERE ip = '10.185.1.202'
""")
device = cursor.fetchone()
device_id = device[0]

print(f"\n📱 Device: {device[1]} ({device[2]})")
print(f"   Date Format: {device[3]}")

# Count employees
cursor.execute("""
    SELECT COUNT(*), COUNT(DISTINCT device_user_id)
    FROM employees
    WHERE source_device_id = %s
""", (device_id,))
emp_count, unique_ids = cursor.fetchone()
print(f"\n👥 Employees: {emp_count} total, {unique_ids} unique device_user_ids")

# Sample employees
cursor.execute("""
    SELECT device_user_id, user_id, name
    FROM employees
    WHERE source_device_id = %s
    ORDER BY device_user_id
    LIMIT 10
""", (device_id,))
print("\n   Sample employees:")
for row in cursor.fetchall():
    print(f"   - device_user_id={row[0]}, user_id={row[1]}, name={row[2]}")

# Count attendance records
cursor.execute("""
    SELECT 
        COUNT(*) as total,
        COUNT(employee_id) as with_employee,
        COUNT(*) - COUNT(employee_id) as without_employee
    FROM attendance
    WHERE device_id = %s
""", (device_id,))
att_stats = cursor.fetchone()
print(f"\n💾 Attendance records: {att_stats[0]} total")
print(f"   - With employee link: {att_stats[1]}")
print(f"   - WITHOUT employee link (ERRORS): {att_stats[2]}")

# Find orphaned user_ids (in attendance but not in employees)
cursor.execute("""
    SELECT DISTINCT a.user_id_str, a.uid, COUNT(*) as count
    FROM attendance a
    WHERE a.device_id = %s 
    AND a.employee_id IS NULL
    GROUP BY a.user_id_str, a.uid
    ORDER BY count DESC
""", (device_id,))

orphaned = cursor.fetchall()
if orphaned:
    print(f"\n❌ Found {len(orphaned)} user_ids with NO employee match:")
    for user_id_str, uid, count in orphaned[:20]:
        # Check if this uid exists in employees
        cursor.execute("""
            SELECT device_user_id, name
            FROM employees
            WHERE source_device_id = %s AND device_user_id = %s
        """, (device_id, uid))
        
        emp = cursor.fetchone()
        if emp:
            print(f"   - user_id_str='{user_id_str}', uid={uid}, records={count} -> EMPLOYEE EXISTS: {emp[1]} (device_user_id={emp[0]})")
        else:
            print(f"   - user_id_str='{user_id_str}', uid={uid}, records={count} -> NO MATCHING EMPLOYEE")

# Check if there's a mismatch between uid and user_id_str
print(f"\n🔍 Checking for uid vs user_id_str mismatches...")
cursor.execute("""
    SELECT DISTINCT a.uid, a.user_id_str
    FROM attendance a
    WHERE a.device_id = %s 
    AND CAST(a.uid AS TEXT) != a.user_id_str
    LIMIT 10
""", (device_id,))

mismatches = cursor.fetchall()
if mismatches:
    print(f"   Found {len(mismatches)} records where uid != user_id_str:")
    for uid, user_id_str in mismatches:
        print(f"   - uid={uid}, user_id_str='{user_id_str}'")
else:
    print(f"   ✓ No mismatches found")

# Check actual linking logic
print(f"\n🔗 Testing employee linking logic...")
cursor.execute("""
    SELECT DISTINCT a.uid, a.user_id_str
    FROM attendance a
    WHERE a.device_id = %s AND a.employee_id IS NULL
    LIMIT 5
""", (device_id,))

for uid, user_id_str in cursor.fetchall():
    print(f"\n   Testing uid={uid}, user_id_str='{user_id_str}':")
    
    # Try the actual query used in sync
    cursor.execute("""
        SELECT id, device_user_id, name
        FROM employees
        WHERE source_device_id = %s AND device_user_id = %s
    """, (device_id, uid))
    
    emp = cursor.fetchone()
    if emp:
        print(f"      ✓ MATCH FOUND: {emp[2]} (id={emp[0]}, device_user_id={emp[1]})")
    else:
        print(f"      ❌ NO MATCH with device_user_id={uid}")
        
        # Check if user exists with different device_user_id
        cursor.execute("""
            SELECT id, device_user_id, user_id, name
            FROM employees
            WHERE source_device_id = %s
            LIMIT 5
        """, (device_id,))
        print(f"      Available employees from this device:")
        for e in cursor.fetchall():
            print(f"         - id={e[0]}, device_user_id={e[1]}, user_id={e[2]}, name={e[3]}")

cursor.close()
conn.close()

print("\n" + "="*80)
