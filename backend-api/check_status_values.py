"""
Quick script to check the actual status and punch values in attendance records
"""
from datetime import datetime, date
from sqlalchemy import create_engine, text
import os

# Get database URL from environment or use default
DATABASE_URL = os.getenv('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/attendance_db')

engine = create_engine(DATABASE_URL)

print("=" * 80)
print("CHECKING ATTENDANCE STATUS VALUES")
print("=" * 80)

# Get today's records
today = date.today()
day_start = datetime.combine(today, datetime.min.time())
day_end = datetime.combine(today, datetime.max.time())

with engine.connect() as conn:
    query = text("""
        SELECT 
            a.timestamp,
            e.name as employee_name,
            e.user_id as employee_user_id,
            d.name as device_name,
            a.status,
            a.punch
        FROM attendance a
        LEFT JOIN employees e ON a.employee_id = e.id
        LEFT JOIN devices d ON a.device_id = d.id
        WHERE a.timestamp >= :day_start AND a.timestamp <= :day_end
        ORDER BY a.timestamp DESC
        LIMIT 20
    """)
    
    result = conn.execute(query, {"day_start": day_start, "day_end": day_end})
    records = result.fetchall()
    
    print(f"\nToday's records ({len(records)} shown):")
    print("-" * 80)
    
    for record in records:
        time_str = record[0].strftime('%H:%M:%S') if record[0] else 'N/A'
        emp_name = record[1] or 'Unknown'
        emp_id = record[2] or 'N/A'
        device = record[3] or 'Unknown'
        status = record[4]
        punch = record[5]
        
        print(f"\nTime: {time_str}")
        print(f"Employee: {emp_name} ({emp_id})")
        print(f"Device: {device}")
        print(f"⚠️  STATUS VALUE: {status} (type: {type(status).__name__})")
        print(f"⚠️  PUNCH VALUE: {punch} (type: {type(punch).__name__})")
        
        # Determine type based on punch value (most reliable)
        if punch == 0:
            determined_type = "Check In (ENTRÉE)"
        elif punch == 1:
            determined_type = "Check Out (SORTIE)"
        else:
            determined_type = f"Unknown (punch={punch})"
        
        print(f"✅ SHOULD DISPLAY AS: {determined_type}")

print("\n" + "=" * 80)
print("LEGEND:")
print("  According to ZKTeco documentation:")
print("  - punch = 0  → Check In (ENTRÉE / Entry)")
print("  - punch = 1  → Check Out (SORTIE / Exit)")
print("  - status field may vary by device model")
print("=" * 80)
