"""
Find attendance records on 2025-11-21 with time around 11:13
"""
import psycopg2

conn = psycopg2.connect(
    host="localhost",
    port=5432,
    database="rtzkconnect_db",
    user="postgres",
    password="hk2025@AnzadbPss."
)
cursor = conn.cursor()

print("Searching for attendance records on 2025-11-21 with time around 11:13...")

cursor.execute("""
    SELECT a.id, a.timestamp, a.status, a.punch, e.id, e.name, e.user_id
    FROM attendance a
    JOIN employees e ON a.employee_id = e.id
    WHERE a.timestamp >= '2025-11-21 11:10:00'
    AND a.timestamp <= '2025-11-21 11:20:00'
    ORDER BY a.timestamp
""")

records = cursor.fetchall()

if records:
    print(f"\nFound {len(records)} record(s):")
    for att_id, ts, status, punch, emp_id, emp_name, user_id in records:
        print(f"\n  Attendance ID: {att_id}")
        print(f"  Time: {ts}")
        print(f"  Employee ID: {emp_id}, Name: {emp_name}, user_id: {user_id}")
        print(f"  Status: {status}, Punch: {punch}")
else:
    print("\n❌ No records found at that time")
    
    # Try to find ANY records on that date
    print("\nSearching for ANY records on 2025-11-21...")
    cursor.execute("""
        SELECT a.id, a.timestamp, e.id, e.name
        FROM attendance a
        JOIN employees e ON a.employee_id = e.id
        WHERE a.timestamp >= '2025-11-21 00:00:00'
        AND a.timestamp < '2025-11-22 00:00:00'
        ORDER BY a.timestamp
        LIMIT 10
    """)
    
    records = cursor.fetchall()
    if records:
        print(f"\nFound {len(records)} record(s) on 2025-11-21:")
        for att_id, ts, emp_id, emp_name in records:
            print(f"  ID: {att_id}, Time: {ts}, Employee: {emp_name} (ID: {emp_id})")
    else:
        print("❌ No records found on 2025-11-21")

cursor.close()
conn.close()
