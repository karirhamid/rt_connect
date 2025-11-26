import psycopg2

# Connect to database
conn = psycopg2.connect(
    host="localhost",
    port=5432,
    database="rtzkconnect_db",
    user="postgres",
    password="123456789"
)

cur = conn.cursor()

# Check devices
cur.execute("SELECT COUNT(*) FROM devices WHERE is_active = true")
device_count = cur.fetchone()[0]
print(f"Active Devices: {device_count}")

if device_count > 0:
    cur.execute("SELECT id, name, ip, port FROM devices WHERE is_active = true")
    devices = cur.fetchall()
    for d in devices:
        print(f"  - {d[1]} ({d[2]}:{d[3]}) - ID: {d[0]}")

print()

# Check employees
cur.execute("SELECT COUNT(*) FROM employees")
employee_count = cur.fetchone()[0]
print(f"Total Employees: {employee_count}")

if employee_count > 0:
    cur.execute("SELECT id, name, device_user_id, source_device_id FROM employees LIMIT 5")
    employees = cur.fetchall()
    for e in employees:
        print(f"  - {e[1]} (Device User ID: {e[2]}, Source Device: {e[3]})")

cur.close()
conn.close()
