"""
Find attendance records for employee 29
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

# Find employee 29
cursor.execute("SELECT id, name, user_id FROM employees WHERE id = 29")
employee = cursor.fetchone()

if employee:
    emp_id, emp_name, user_id = employee
    print(f"Employee: {emp_name} (ID: {emp_id}, user_id: {user_id})")
    print("\nSearching for ALL attendance records for this employee...")
    
    cursor.execute("""
        SELECT id, timestamp, status, punch 
        FROM attendance 
        WHERE employee_id = %s 
        ORDER BY timestamp DESC
        LIMIT 20
    """, (emp_id,))
    
    records = cursor.fetchall()
    
    if records:
        print(f"\nFound {len(records)} recent record(s):")
        for rec_id, ts, status, punch in records:
            print(f"  ID: {rec_id}, Time: {ts}, Status: {status}, Punch: {punch}")
    else:
        print("\n❌ No attendance records found for this employee")
else:
    print("Employee 29 not found")

cursor.close()
conn.close()
