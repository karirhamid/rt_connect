"""
Create default company and department for initial setup
"""
import sys
sys.path.insert(0, "backend-api")

from app.database.connection import get_db_session
from app.database.schema import Company, Department, Position

print("=" * 60)
print("Creating Default Company & Department")
print("=" * 60)

try:
    with get_db_session() as db:
        # Check if default company exists
        company = db.query(Company).filter(Company.code == "DEFAULT").first()
        
        if not company:
            print("\n[1] Creating default company...")
            company = Company(
                name="Default Company",
                code="DEFAULT",
                address="",
                phone="",
                email="",
                is_active=True
            )
            db.add(company)
            db.flush()
            print(f"    [OK] Created company: {company.name} (ID: {company.id})")
        else:
            print(f"\n[1] Company already exists: {company.name} (ID: {company.id})")
        
        # Check if default department exists
        department = db.query(Department).filter(
            Department.company_id == company.id,
            Department.code == "GENERAL"
        ).first()
        
        if not department:
            print("\n[2] Creating default department...")
            department = Department(
                company_id=company.id,
                name="General",
                code="GENERAL",
                description="Default department for all employees",
                is_active=True
            )
            db.add(department)
            db.flush()
            print(f"    [OK] Created department: {department.name} (ID: {department.id})")
        else:
            print(f"\n[2] Department already exists: {department.name} (ID: {department.id})")
        
        # Check if default position exists
        position = db.query(Position).filter(
            Position.department_id == department.id,
            Position.code == "EMPLOYEE"
        ).first()
        
        if not position:
            print("\n[3] Creating default position...")
            position = Position(
                department_id=department.id,
                name="Employee",
                code="EMPLOYEE",
                description="General employee position",
                is_active=True
            )
            db.add(position)
            db.flush()
            print(f"    [OK] Created position: {position.name} (ID: {position.id})")
        else:
            print(f"\n[3] Position already exists: {position.name} (ID: {position.id})")
        
        db.commit()
        
        print("\n" + "=" * 60)
        print("[SUCCESS] Default organizational structure created!")
        print("=" * 60)
        print(f"\nCompany ID: {company.id}")
        print(f"Department ID: {department.id}")
        print(f"Position ID: {position.id}")
        
except Exception as e:
    print(f"\n[ERROR] Failed: {e}")
    import traceback
    traceback.print_exc()
