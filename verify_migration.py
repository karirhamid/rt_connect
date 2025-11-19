import sys
sys.path.insert(0, "backend-api")

from app.database.connection import get_db_session
from app.database.schema import Employee, Attendance, Device, Company, Department

print("=" * 60)
print("PostgreSQL Database Verification")
print("=" * 60)

try:
    with get_db_session() as db:
        # Count employees
        employee_count = db.query(Employee).count()
        print(f"\n[OK] Total Employees: {employee_count}")
        
        # Count attendance
        attendance_count = db.query(Attendance).count()
        print(f"[OK] Total Attendance Records: {attendance_count}")
        
        # Count devices
        device_count = db.query(Device).count()
        print(f"[OK] Total Devices: {device_count}")
        
        # Show sample employees
        print("\nSample Employees:")
        employees = db.query(Employee).limit(5).all()
        for emp in employees:
            print(f"  - {emp.name} (device_user_id: {emp.device_user_id}, Company: {emp.company_id}, Dept: {emp.department_id})")
        
        # Show organization
        company = db.query(Company).first()
        department = db.query(Department).first()
        print(f"\n[OK] Organization: {company.name} / {department.name}")
        
        print("\n" + "=" * 60)
        print("[SUCCESS] PostgreSQL migration verified!")
        print("=" * 60)
        
except Exception as e:
    print(f"\n[ERROR] Verification failed: {e}")
    import traceback
    traceback.print_exc()
