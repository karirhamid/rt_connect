import sys
sys.path.insert(0, 'backend-api')

from app.database.connection import SessionLocal
from app.database.schema import Device, Employee

db = SessionLocal()

print('Database Check:')
print('=' * 50)
devices = db.query(Device).all()
print(f'Devices: {len(devices)}')
for d in devices:
    print(f'  - {d.name}: {d.ip}:{d.port} (ID: {d.id})')

print()
employees = db.query(Employee).all()
print(f'Employees: {len(employees)}')
for e in employees[:5]:  # Show first 5
    print(f'  - {e.name} (Device User ID: {e.device_user_id}, Source Device: {e.source_device_id})')

if len(employees) > 5:
    print(f'  ... and {len(employees) - 5} more')

db.close()
