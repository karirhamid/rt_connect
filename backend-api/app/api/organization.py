from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from app.database import get_db
from app.database.schema import Company, Department, Position, Employee, Device as DBDevice
from app.services.device_store import device_store
from app.services.device_manager import ZKTecoDeviceManager
import logging

router = APIRouter()
logger = logging.getLogger(__name__)

# Pydantic models
class CompanyCreate(BaseModel):
    name: str
    code: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None

class CompanyUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None

class DepartmentCreate(BaseModel):
    name: str
    company_id: int
    parent_id: Optional[int] = None
    code: Optional[str] = None
    description: Optional[str] = None

class DepartmentUpdate(BaseModel):
    name: Optional[str] = None
    company_id: Optional[int] = None
    parent_id: Optional[int] = None
    code: Optional[str] = None
    description: Optional[str] = None

class PositionCreate(BaseModel):
    name: str
    code: Optional[str] = None
    department_ids: List[int]  # Many-to-many relationship
    description: Optional[str] = None

class PositionUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    department_ids: Optional[List[int]] = None
    description: Optional[str] = None


# Company endpoints
@router.get("/companies")
async def get_companies(db: Session = Depends(get_db)):
    """Get all companies"""
    companies = db.query(Company).all()
    return {"companies": [
        {
            "id": c.id,
            "name": c.name,
            "code": c.code,
            "address": c.address,
            "phone": c.phone,
            "email": c.email,
            "created_at": c.created_at.isoformat() if c.created_at else None
        }
        for c in companies
    ]}

@router.post("/companies")
async def create_company(company: CompanyCreate, db: Session = Depends(get_db)):
    """Create a new company"""
    db_company = Company(
        name=company.name,
        code=company.code,
        address=company.address,
        phone=company.phone,
        email=company.email,
        created_at=datetime.now(timezone.utc)
    )
    db.add(db_company)
    db.commit()
    db.refresh(db_company)
    
    return {
        "message": "Company created successfully",
        "company": {
            "id": db_company.id,
            "name": db_company.name,
            "code": db_company.code,
            "address": db_company.address,
            "phone": db_company.phone,
            "email": db_company.email
        }
    }

@router.put("/companies/{company_id}")
async def update_company(company_id: int, company: CompanyUpdate, db: Session = Depends(get_db)):
    """Update a company"""
    db_company = db.query(Company).filter(Company.id == company_id).first()
    if not db_company:
        raise HTTPException(status_code=404, detail="Company not found")
    
    if company.name is not None:
        db_company.name = company.name
    if company.code is not None:
        db_company.code = company.code
    if company.address is not None:
        db_company.address = company.address
    if company.phone is not None:
        db_company.phone = company.phone
    if company.email is not None:
        db_company.email = company.email
    
    db.commit()
    db.refresh(db_company)
    
    return {
        "message": "Company updated successfully",
        "company": {
            "id": db_company.id,
            "name": db_company.name,
            "code": db_company.code,
            "address": db_company.address,
            "phone": db_company.phone,
            "email": db_company.email
        }
    }

@router.delete("/companies/{company_id}")
async def delete_company(company_id: int, db: Session = Depends(get_db)):
    """Delete a company"""
    db_company = db.query(Company).filter(Company.id == company_id).first()
    if not db_company:
        raise HTTPException(status_code=404, detail="Company not found")
    
    # Check if company has departments
    dept_count = db.query(Department).filter(Department.company_id == company_id).count()
    if dept_count > 0:
        raise HTTPException(
            status_code=400, 
            detail=f"Cannot delete company with {dept_count} departments. Delete departments first."
        )
    
    db.delete(db_company)
    db.commit()
    
    return {"message": "Company deleted successfully"}


# Department endpoints
@router.get("/departments")
async def get_departments(company_id: Optional[int] = None, db: Session = Depends(get_db)):
    """Get all departments, optionally filtered by company"""
    query = db.query(Department)
    if company_id:
        query = query.filter(Department.company_id == company_id)
    
    departments = query.all()
    return {"departments": [
        {
            "id": d.id,
            "name": d.name,
            "company_id": d.company_id,
            "company_name": d.company.name if d.company else None,
            "parent_id": d.parent_id,
            "parent_name": d.parent.name if d.parent else None,
            "code": d.code,
            "description": d.description,
            "created_at": d.created_at.isoformat() if d.created_at else None
        }
        for d in departments
    ]}

@router.post("/departments")
async def create_department(department: DepartmentCreate, db: Session = Depends(get_db)):
    """Create a new department"""
    # Check if company exists
    company = db.query(Company).filter(Company.id == department.company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    
    db_department = Department(
        name=department.name,
        company_id=department.company_id,
        parent_id=department.parent_id,
        code=department.code,
        description=department.description,
        created_at=datetime.now(timezone.utc)
    )
    db.add(db_department)
    db.commit()
    db.refresh(db_department)
    
    return {
        "message": "Department created successfully",
        "department": {
            "id": db_department.id,
            "name": db_department.name,
            "company_id": db_department.company_id,
            "parent_id": db_department.parent_id,
            "code": db_department.code,
            "description": db_department.description
        }
    }

@router.put("/departments/{department_id}")
async def update_department(department_id: int, department: DepartmentUpdate, db: Session = Depends(get_db)):
    """Update a department"""
    db_department = db.query(Department).filter(Department.id == department_id).first()
    if not db_department:
        raise HTTPException(status_code=404, detail="Department not found")
    
    if department.name is not None:
        db_department.name = department.name
    if department.code is not None:
        db_department.code = department.code
    if department.parent_id is not None:
        db_department.parent_id = department.parent_id
    if department.company_id is not None:
        # Check if company exists
        company = db.query(Company).filter(Company.id == department.company_id).first()
        if not company:
            raise HTTPException(status_code=404, detail="Company not found")
        db_department.company_id = department.company_id
    if department.description is not None:
        db_department.description = department.description
    
    db.commit()
    db.refresh(db_department)
    
    return {
        "message": "Department updated successfully",
        "department": {
            "id": db_department.id,
            "name": db_department.name,
            "company_id": db_department.company_id,
            "description": db_department.description
        }
    }

@router.delete("/departments/{department_id}")
async def delete_department(department_id: int, db: Session = Depends(get_db)):
    """Delete a department"""
    db_department = db.query(Department).filter(Department.id == department_id).first()
    if not db_department:
        raise HTTPException(status_code=404, detail="Department not found")
    
    # Check if department has positions
    position_count = db.query(Position).filter(Position.department_id == department_id).count()
    if position_count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete department with {position_count} positions. Delete or reassign positions first."
        )
    
    db.delete(db_department)
    db.commit()
    
    return {"message": "Department deleted successfully"}


# Position endpoints
@router.get("/positions")
async def get_positions(department_id: Optional[int] = None, db: Session = Depends(get_db)):
    """Get all positions, optionally filtered by department"""
    query = db.query(Position)
    if department_id:
        query = query.filter(Position.department_id == department_id)
    
    positions = query.all()
    return {"positions": [
        {
            "id": p.id,
            "name": p.name,
            "code": p.code,
            "department_id": p.department_id,
            "department_name": p.department.name if p.department else None,
            "description": p.description,
            "created_at": p.created_at.isoformat() if p.created_at else None
        }
        for p in positions
    ]}

@router.post("/positions")
async def create_position(position: PositionCreate, db: Session = Depends(get_db)):
    """Create a new position"""
    # For now, use the first department_id (simplified many-to-many)
    if not position.department_ids:
        raise HTTPException(status_code=400, detail="At least one department is required")
    
    department_id = position.department_ids[0]
    
    # Check if department exists
    department = db.query(Department).filter(Department.id == department_id).first()
    if not department:
        raise HTTPException(status_code=404, detail="Department not found")
    
    db_position = Position(
        name=position.name,
        code=position.code,
        department_id=department_id,
        description=position.description,
        created_at=datetime.now(timezone.utc)
    )
    db.add(db_position)
    db.commit()
    db.refresh(db_position)
    
    return {
        "message": "Position created successfully",
        "position": {
            "id": db_position.id,
            "name": db_position.name,
            "code": db_position.code,
            "department_id": db_position.department_id,
            "description": db_position.description
        }
    }

@router.put("/positions/{position_id}")
async def update_position(position_id: int, position: PositionUpdate, db: Session = Depends(get_db)):
    """Update a position"""
    db_position = db.query(Position).filter(Position.id == position_id).first()
    if not db_position:
        raise HTTPException(status_code=404, detail="Position not found")
    
    if position.name is not None:
        db_position.name = position.name
    if position.code is not None:
        db_position.code = position.code
    if position.department_ids is not None and position.department_ids:
        department_id = position.department_ids[0]
        # Check if department exists
        department = db.query(Department).filter(Department.id == department_id).first()
        if not department:
            raise HTTPException(status_code=404, detail="Department not found")
        db_position.department_id = department_id
    if position.description is not None:
        db_position.description = position.description
    
    db.commit()
    db.refresh(db_position)
    
    return {
        "message": "Position updated successfully",
        "position": {
            "id": db_position.id,
            "name": db_position.name,
            "department_id": db_position.department_id,
            "description": db_position.description
        }
    }

@router.delete("/positions/{position_id}")
async def delete_position(position_id: int, db: Session = Depends(get_db)):
    """Delete a position"""
    db_position = db.query(Position).filter(Position.id == position_id).first()
    if not db_position:
        raise HTTPException(status_code=404, detail="Position not found")
    
    db.delete(db_position)
    db.commit()
    
    return {"message": "Position deleted successfully"}


# Helper function to sync employee to devices
def sync_employee_to_devices(employee: Employee, operation: str = "update"):
    """
    Sync employee changes to all active devices.
    
    SAFETY GUARANTEE: This function ONLY affects the specific employee
    being synced. Other employees on the devices are NOT modified.
    
    Args:
        employee: The employee object to sync
        operation: 'create', 'update', or 'delete'
    
    Returns:
        List of error messages (empty if all successful)
    """
    devices = device_store.get_all()
    sync_errors = []
    
    if not devices:
        logger.warning("No devices registered - employee not synced to any device")
        return ["No devices available to sync"]
    
    logger.info(f"Starting sync of employee '{employee.name}' (UID={employee.device_user_id}) to {len(devices)} device(s) - Operation: {operation}")
    
    for device_config in devices:
        try:
            manager = ZKTecoDeviceManager(
                ip=device_config.ip,
                port=device_config.port,
                timeout=5
            )
            
            if operation == "delete":
                # SAFETY: Only deletes THIS specific employee by UID
                manager.delete_user(uid=employee.device_user_id)
                logger.info(f"✓ Deleted employee '{employee.name}' (UID={employee.device_user_id}) from device '{device_config.name}'")
            else:
                # For create or update
                # SAFETY: Only updates THIS specific employee by UID
                manager.update_user(
                    uid=employee.device_user_id,
                    name=employee.name,
                    privilege=employee.privilege,
                    password=employee.password or "",
                    group_id=employee.group_id or "",
                    user_id=employee.user_id,
                    card=employee.card_number or 0
                )
                logger.info(f"✓ Synced employee '{employee.name}' (UID={employee.device_user_id}, privilege={employee.privilege}) to device '{device_config.name}'")
                
        except Exception as e:
            error_msg = f"Failed to sync to device {device_config.name}: {str(e)}"
            logger.error(f"✗ {error_msg}")
            sync_errors.append(error_msg)
    
    if not sync_errors:
        logger.info(f"✓ Successfully synced employee '{employee.name}' to all {len(devices)} device(s)")
    else:
        logger.warning(f"Partial sync failure for employee '{employee.name}': {len(sync_errors)}/{len(devices)} devices failed")
    
    return sync_errors


# Employee endpoints
class EmployeeCreate(BaseModel):
    device_user_id: int
    user_id: str
    name: str
    company_id: int
    department_id: int
    position_id: Optional[int] = None
    privilege: int = 0
    password: Optional[str] = None
    group_id: Optional[str] = None
    card_number: Optional[int] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    hire_date: Optional[str] = None
    birth_date: Optional[str] = None
    gender: Optional[str] = None
    address: Optional[str] = None

class EmployeeUpdate(BaseModel):
    device_user_id: Optional[int] = None
    user_id: Optional[str] = None
    name: Optional[str] = None
    company_id: Optional[int] = None
    department_id: Optional[int] = None
    position_id: Optional[int] = None
    privilege: Optional[int] = None
    password: Optional[str] = None
    group_id: Optional[str] = None
    card_number: Optional[int] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    hire_date: Optional[str] = None
    birth_date: Optional[str] = None
    gender: Optional[str] = None
    address: Optional[str] = None


@router.get("/employees")
async def get_employees(
    company_id: Optional[int] = None,
    department_id: Optional[int] = None,
    device_id: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Get all employees with optional filters"""
    query = db.query(Employee).join(
        Company, Employee.company_id == Company.id
    ).join(
        Department, Employee.department_id == Department.id
    ).outerjoin(
        Position, Employee.position_id == Position.id
    )
    
    if company_id:
        query = query.filter(Employee.company_id == company_id)
    if department_id:
        query = query.filter(Employee.department_id == department_id)
    if device_id:
        query = query.filter(Employee.source_device_id == device_id)
    
    employees = query.all()
    
    return {"employees": [
        {
            "id": e.id,
            "device_user_id": e.device_user_id,
            "user_id": e.user_id,
            "name": e.name,
            "email": e.email,
            "phone": e.phone,
            "company_id": e.company_id,
            "company_name": e.company.name if e.company else None,
            "department_id": e.department_id,
            "department_name": e.department.name if e.department else None,
            "position_id": e.position_id,
            "position_name": e.position.name if e.position else None,
            "privilege": e.privilege,
            "card_number": e.card_number,
            "hire_date": e.hire_date.isoformat() if e.hire_date else None,
            "birth_date": e.birth_date.isoformat() if e.birth_date else None,
            "gender": e.gender,
            "address": e.address,
            "is_active": e.is_active,
            "source_device_id": e.source_device_id,
            "source_device_name": e.source_device.name if e.source_device else None,
            "created_at": e.created_at.isoformat() if e.created_at else None
        }
        for e in employees
    ]}


@router.post("/employees")
async def create_employee(employee: EmployeeCreate, db: Session = Depends(get_db)):
    """Create a new employee"""
    # Check if company exists
    company = db.query(Company).filter(Company.id == employee.company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    
    # Check if department exists
    department = db.query(Department).filter(Department.id == employee.department_id).first()
    if not department:
        raise HTTPException(status_code=404, detail="Department not found")
    
    # Check if position exists (if provided)
    if employee.position_id:
        position = db.query(Position).filter(Position.id == employee.position_id).first()
        if not position:
            raise HTTPException(status_code=404, detail="Position not found")
    
    # Check if user_id or device_user_id already exists
    existing = db.query(Employee).filter(
        (Employee.user_id == employee.user_id) | 
        (Employee.device_user_id == employee.device_user_id)
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Employee with this user_id or device_user_id already exists")
    
    db_employee = Employee(
        device_user_id=employee.device_user_id,
        user_id=employee.user_id,
        name=employee.name,
        company_id=employee.company_id,
        department_id=employee.department_id,
        position_id=employee.position_id,
        privilege=employee.privilege,
        password=employee.password,
        group_id=employee.group_id,
        card_number=employee.card_number,
        email=employee.email,
        phone=employee.phone,
        hire_date=datetime.fromisoformat(employee.hire_date) if employee.hire_date else None,
        birth_date=datetime.fromisoformat(employee.birth_date) if employee.birth_date else None,
        gender=employee.gender,
        address=employee.address,
        created_at=datetime.now(timezone.utc)
    )
    db.add(db_employee)
    db.commit()
    db.refresh(db_employee)
    
    # Sync to all devices
    sync_errors = sync_employee_to_devices(db_employee, operation="create")
    
    response = {
        "message": "Employee created successfully",
        "employee": {
            "id": db_employee.id,
            "device_user_id": db_employee.device_user_id,
            "user_id": db_employee.user_id,
            "name": db_employee.name
        }
    }
    
    if sync_errors:
        response["sync_warnings"] = sync_errors
    
    return response


@router.put("/employees/{employee_id}")
async def update_employee(employee_id: int, employee: EmployeeUpdate, db: Session = Depends(get_db)):
    """Update an employee"""
    db_employee = db.query(Employee).filter(Employee.id == employee_id).first()
    if not db_employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    
    # Update fields if provided
    if employee.device_user_id is not None:
        # Check for duplicates
        existing = db.query(Employee).filter(
            Employee.device_user_id == employee.device_user_id,
            Employee.id != employee_id
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="Device user ID already exists")
        db_employee.device_user_id = employee.device_user_id
    
    if employee.user_id is not None:
        # Check for duplicates
        existing = db.query(Employee).filter(
            Employee.user_id == employee.user_id,
            Employee.id != employee_id
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="User ID already exists")
        db_employee.user_id = employee.user_id
    
    if employee.name is not None:
        db_employee.name = employee.name
    if employee.company_id is not None:
        db_employee.company_id = employee.company_id
    if employee.department_id is not None:
        db_employee.department_id = employee.department_id
    if employee.position_id is not None:
        db_employee.position_id = employee.position_id
    if employee.privilege is not None:
        db_employee.privilege = employee.privilege
    if employee.password is not None:
        db_employee.password = employee.password
    if employee.group_id is not None:
        db_employee.group_id = employee.group_id
    if employee.card_number is not None:
        db_employee.card_number = employee.card_number
    if employee.email is not None:
        db_employee.email = employee.email
    if employee.phone is not None:
        db_employee.phone = employee.phone
    if employee.hire_date is not None:
        db_employee.hire_date = datetime.fromisoformat(employee.hire_date) if employee.hire_date else None
    if employee.birth_date is not None:
        db_employee.birth_date = datetime.fromisoformat(employee.birth_date) if employee.birth_date else None
    if employee.gender is not None:
        db_employee.gender = employee.gender
    if employee.address is not None:
        db_employee.address = employee.address
    
    db_employee.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(db_employee)
    
    # Sync changes to all devices
    sync_errors = sync_employee_to_devices(db_employee, operation="update")
    
    response = {
        "message": "Employee updated successfully",
        "employee": {
            "id": db_employee.id,
            "name": db_employee.name
        }
    }
    
    if sync_errors:
        response["sync_warnings"] = sync_errors
        logger.warning(f"Employee updated in DB but some devices failed: {sync_errors}")
    
    return response


@router.delete("/employees/{employee_id}")
async def delete_employee(employee_id: int, db: Session = Depends(get_db)):
    """Delete an employee"""
    db_employee = db.query(Employee).filter(Employee.id == employee_id).first()
    if not db_employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    
    # Sync deletion to all devices before deleting from DB
    sync_errors = sync_employee_to_devices(db_employee, operation="delete")
    
    # Delete from database
    db.delete(db_employee)
    db.commit()
    
    response = {"message": "Employee deleted successfully"}
    
    if sync_errors:
        response["sync_warnings"] = sync_errors
        logger.warning(f"Employee deleted from DB but some devices failed: {sync_errors}")
    
    return response
