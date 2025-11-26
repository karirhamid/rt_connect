from app.database import get_db_session
from sqlalchemy import text

with get_db_session() as db:
    # Check if composite_ids exist in database
    result = db.execute(text("""
        SELECT composite_id, name, user_id, source_device_id
        FROM employees 
        ORDER BY composite_id
        LIMIT 10
    """)).fetchall()
    
    print("\n=== FIRST 10 EMPLOYEES ===")
    for r in result:
        device = 'Device201' if '201' in str(r[3]) else 'Device202'
        print(f"composite_id={r[0]}, name={r[1]}, user_id={r[2]}, {device}")
    
    # Count by device
    print("\n=== COUNT BY DEVICE ===")
    counts = db.execute(text("""
        SELECT source_device_id, COUNT(*) as count
        FROM employees
        GROUP BY source_device_id
    """)).fetchall()
    
    for device_id, count in counts:
        print(f"Device {device_id[:20]}...: {count} employees")
