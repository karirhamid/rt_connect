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

# Default organizational IDs
DEFAULT_COMPANY_ID = 1
DEFAULT_DEPARTMENT_ID = 1
DEFAULT_POSITION_ID = 1

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
def sync_employee_to_devices(employee: Employee, operation: str = "update",
                             max_retries: int = 3, retry_delay: float = 5.0):
    """
    Sync employee changes to their source device.
    
    SAFETY GUARANTEE: This function ONLY affects the specific employee
    being synced. Other employees on the devices are NOT modified.
    
    Includes retry logic: if the device is busy (e.g. background sync holds
    the connection lock), we wait and retry up to ``max_retries`` times.
    
    Args:
        employee: The employee object to sync
        operation: 'create', 'update', or 'delete'
        max_retries: Number of attempts before giving up (default 3)
        retry_delay: Seconds to wait between retries (default 5)
    
    Returns:
        List of error messages (empty if all successful)
    """
    import time as _time

    # Only sync to the employee's source device
    if not employee.source_device_id:
        logger.warning(f"Employee '{employee.name}' has no source_device_id - skipping device sync")
        return ["Employee has no source device assigned"]
    
    device_config = device_store.get_by_id(str(employee.source_device_id))
    if not device_config:
        error_msg = f"Source device {employee.source_device_id} not found in device store"
        logger.error(error_msg)
        return [error_msg]
    
    logger.info(f"Starting sync of employee '{employee.name}' (UID={employee.device_user_id}) to device '{device_config.name}' - Operation: {operation}")
    
    for attempt in range(1, max_retries + 1):
        sync_errors = []
        try:
            manager = ZKTecoDeviceManager(
                ip=device_config.ip,
                port=device_config.port,
                timeout=15  # longer timeout for manual sync (device may be finishing background sync)
            )
            
            if operation == "delete":
                # SAFETY: Only deletes THIS specific employee by UID
                manager.delete_user(uid=employee.device_user_id)
                logger.info(f"Deleted employee '{employee.name}' (UID={employee.device_user_id}) from device '{device_config.name}'")
            else:
                # For create or update - use a SINGLE connection for all operations
                with manager.session() as mgr:
                    # Fetch users once — used for admin detection AND UID resolution
                    users_on_device = []
                    device_admin_code = 14
                    try:
                        users_on_device = mgr.get_users() or []
                        if any(u.privilege == 14 for u in users_on_device):
                            device_admin_code = 14
                        elif any(u.privilege == 6 for u in users_on_device):
                            device_admin_code = 6
                        else:
                            device_admin_code = 14
                    except Exception as e:
                        logger.warning(f"Could not detect device admin code on {device_config.name}: {e}. Defaulting to 14")
                        device_admin_code = 14

                    # Cache the user list so update_user can resolve real UIDs without re-fetching
                    mgr._cached_users = users_on_device

                    device_privilege = 0 if employee.privilege == 0 else device_admin_code if employee.privilege == 14 else employee.privilege
                    
                    mgr.update_user(
                        uid=employee.device_user_id,
                        name=employee.name,
                        privilege=device_privilege,
                        password=employee.password or "",
                        group_id=employee.group_id or "",
                        user_id=employee.user_id,
                        card=employee.card_number or 0
                    )
                    
                    # Verify admin took effect; if not, try alternate admin code (reusing same connection)
                    if employee.privilege == 14:
                        try:
                            users = mgr.get_users()
                            me = next((u for u in users if str(u.user_id) == str(employee.user_id) or int(u.uid) == int(employee.device_user_id)), None)
                            if me and me.privilege not in (6, 14):
                                for alt_admin in [14, 6, 3, 1]:
                                    if alt_admin == device_privilege:
                                        continue
                                    logger.info(f"Admin not applied with code {device_privilege}; retrying with {alt_admin}")
                                    mgr.update_user(
                                        uid=employee.device_user_id,
                                        name=employee.name,
                                        privilege=alt_admin,
                                        password=employee.password or "",
                                        group_id=employee.group_id or "",
                                        user_id=employee.user_id,
                                        card=employee.card_number or 0
                                    )
                                    users2 = mgr.get_users()
                                    me2 = next((u for u in users2 if str(u.user_id) == str(employee.user_id) or int(u.uid) == int(employee.device_user_id)), None)
                                    if me2 and me2.privilege in (6, 14, 3, 1):
                                        break
                        except Exception as e:
                            logger.warning(f"Admin verification/retry failed: {e}")
                            
                logger.info(f"Synced employee '{employee.name}' (UID={employee.device_user_id}, app_privilege={employee.privilege}, device_privilege={device_privilege}) to device '{device_config.name}'")
            
            # Success — break out of retry loop
            logger.info(f"✓ Successfully synced employee '{employee.name}' to device '{device_config.name}'")
            return []
                
        except (TimeoutError, ConnectionError, OSError) as e:
            is_busy = "Another operation is in progress" in str(e) or "timed out" in str(e).lower()
            if is_busy and attempt < max_retries:
                logger.warning(f"Device '{device_config.name}' is busy (attempt {attempt}/{max_retries}). "
                             f"Retrying in {retry_delay}s...")
                _time.sleep(retry_delay)
                continue
            error_msg = f"Failed to sync to device {device_config.name}: {str(e)}"
            logger.error(f"✗ {error_msg}")
            sync_errors.append(error_msg)
        except Exception as e:
            error_msg = f"Failed to sync to device {device_config.name}: {str(e)}"
            logger.error(f"✗ {error_msg}")
            sync_errors.append(error_msg)
            # Non-retryable errors — break immediately
            break
    
    return sync_errors


# Employee endpoints
class EmployeeCreate(BaseModel):
    device_user_id: int
    user_id: str
    name: str
    company_id: int
    department_id: int
    position_id: Optional[int] = None
    source_device_id: Optional[str] = None  # Which device this employee belongs to
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
    source_device_id: Optional[str] = None  # Allow updating which device the employee belongs to
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

class BulkPrivilegeUpdate(BaseModel):
    employee_ids: List[int]
    privilege: int  # 0=user, 14=admin


@router.post("/employees/sync-from-devices")
async def sync_employees_from_devices(db: Session = Depends(get_db)):
    """Force sync all employees from all devices"""
    try:
        devices = device_store.get_all()
        results = {
            'devices': {},
            'total_fetched': 0,
            'total_added': 0,
            'total_updated': 0,
            'details': []
        }
        
        for device_config in devices:
            device_result = {
                'name': device_config.name,
                'fetched': 0,
                'added': 0,
                'updated': 0,
                'errors': [],
                'users': []
            }
            
            try:
                # Use a SINGLE connection per device for info + users
                manager = ZKTecoDeviceManager(
                    ip=device_config.ip,
                    port=device_config.port,
                    timeout=15
                )
                
                with manager.session() as mgr:
                    info = mgr.get_device_info()
                    if not info:
                        device_result['errors'].append('Failed to connect to device')
                        results['devices'][device_config.id] = device_result
                        continue
                    
                    # Get all users from device (reusing same connection)
                    users = mgr.get_users() or []
                
                # Connection is now closed; process the fetched data
                device_result['fetched'] = len(users)
                results['total_fetched'] += len(users)
                
                # Store user details for debugging
                device_result['users'] = [
                    {
                        'uid': user.uid,
                        'user_id': user.user_id,
                        'name': user.name
                    } for user in users[:10]  # Show first 10 for preview
                ]
                
                # Process each user
                for user in users:
                    user_data = {
                        'uid': user.uid,
                        'user_id': user.user_id,
                        'name': user.name,
                        'privilege': user.privilege,
                        'password': user.password,
                        'group_id': user.group_id,
                        'card': user.card
                    }
                    
                    # Check if employee exists by user_id
                    db_employee = db.query(Employee).filter(
                        Employee.user_id == user_data['user_id']
                    ).first()
                    
                    if db_employee:
                        # Update existing employee
                        db_employee.name = user_data['name']
                        db_employee.device_user_id = user_data['uid']
                        db_employee.privilege = user_data['privilege']
                        db_employee.password = user_data.get('password')
                        db_employee.group_id = user_data.get('group_id')
                        db_employee.card_number = user_data.get('card')
                        db_employee.synced_at = datetime.now(timezone.utc)
                        device_result['updated'] += 1
                        results['total_updated'] += 1
                    else:
                        # Create new employee
                        db_employee = Employee(
                            company_id=DEFAULT_COMPANY_ID,
                            department_id=DEFAULT_DEPARTMENT_ID,
                            position_id=DEFAULT_POSITION_ID,
                            device_user_id=user_data['uid'],
                            user_id=user_data['user_id'],
                            name=user_data['name'],
                            privilege=user_data['privilege'],
                            password=user_data.get('password'),
                            group_id=user_data.get('group_id'),
                            card_number=user_data.get('card'),
                            source_device_id=device_config.id
                        )
                        db.add(db_employee)
                        device_result['added'] += 1
                        results['total_added'] += 1
                
                db.commit()
                
            except Exception as e:
                error_msg = f"Error syncing device {device_config.name}: {str(e)}"
                device_result['errors'].append(error_msg)
                logger.error(error_msg)
            
            results['devices'][device_config.id] = device_result
        
        return results
        
    except Exception as e:
        logger.error(f"Error in employee sync: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/employees")
async def get_employees(
    company_id: Optional[int] = None,
    department_id: Optional[int] = None,
    device_id: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Get all employees with optional filters
    
    Returns all employees registered in the system, optionally filtered by device source
    """
    query = db.query(Employee).join(
        Company, Employee.company_id == Company.id
    ).join(
        Department, Employee.department_id == Department.id
    ).outerjoin(
        Position, Employee.position_id == Position.id
    ).outerjoin(
        DBDevice, Employee.source_device_id == DBDevice.id
    )
    
    if company_id:
        query = query.filter(Employee.company_id == company_id)
    if department_id:
        query = query.filter(Employee.department_id == department_id)
    if device_id:
        # Show employees whose source device matches
        query = query.filter(Employee.source_device_id == device_id)
    
    employees = query.all()
    
    return {"employees": [
        {
            "id": e.id,
            "composite_id": e.composite_id,
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
    
    # Check if user_id or device_user_id already exists for the same device
    # (allows same IDs on different devices due to composite key system)
    if employee.source_device_id:
        existing = db.query(Employee).filter(
            Employee.source_device_id == employee.source_device_id,
            (
                (Employee.user_id == employee.user_id) | 
                (Employee.device_user_id == employee.device_user_id)
            )
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="Employee with this user_id or device_user_id already exists for this device")
    
    db_employee = Employee(
        device_user_id=employee.device_user_id,
        user_id=employee.user_id,
        name=employee.name,
        company_id=employee.company_id,
        department_id=employee.department_id,
        position_id=employee.position_id,
        source_device_id=employee.source_device_id,
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
        # Check for duplicates within the same device
        existing = db.query(Employee).filter(
            Employee.device_user_id == employee.device_user_id,
            Employee.source_device_id == db_employee.source_device_id,
            Employee.id != employee_id
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="Device user ID already exists for this device")
        db_employee.device_user_id = employee.device_user_id
    
    if employee.user_id is not None:
        # Check for duplicates within the same device (user_id can be duplicate across devices)
        existing = db.query(Employee).filter(
            Employee.user_id == employee.user_id,
            Employee.source_device_id == db_employee.source_device_id,
            Employee.id != employee_id
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="User ID already exists for this device")
        db_employee.user_id = employee.user_id
    
    if employee.name is not None:
        db_employee.name = employee.name
    if employee.company_id is not None:
        db_employee.company_id = employee.company_id
    if employee.department_id is not None:
        db_employee.department_id = employee.department_id
    if employee.position_id is not None:
        db_employee.position_id = employee.position_id
    if employee.source_device_id is not None:
        db_employee.source_device_id = employee.source_device_id
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
    
    # Sync changes to devices (only if employee has a source device)
    sync_errors = []
    try:
        if db_employee.source_device_id:
            sync_errors = sync_employee_to_devices(db_employee, operation="update")
        else:
            logger.info(f"Employee '{db_employee.name}' has no source device - skipping device sync")
    except Exception as e:
        error_msg = f"Device sync failed but database updated: {str(e)}"
        logger.error(error_msg)
        sync_errors = [error_msg]
    
    response = {
        "message": "Employee updated successfully",
        "employee": {
            "id": db_employee.id,
            "name": db_employee.name
        }
    }
    
    if sync_errors:
        response["sync_warnings"] = sync_errors
        logger.warning(f"Employee updated in DB but device sync had issues: {sync_errors}")
    
    return response

@router.post("/employees/bulk/privilege")
async def bulk_update_privilege(payload: BulkPrivilegeUpdate, db: Session = Depends(get_db)):
    """Bulk promote/demote employees and sync each to its source device.

    Constraints:
    - Only privileges 0 (User) and 14 (Admin) are allowed.
    - Each employee is synced individually; failures reported per employee.
    """
    if payload.privilege not in (0, 14):
        raise HTTPException(status_code=400, detail="Invalid privilege. Use 0 (User) or 14 (Admin).")

    results = {
        "target_privilege": payload.privilege,
        "updated": [],
        "errors": []
    }

    for emp_id in payload.employee_ids:
        emp = db.query(Employee).filter(Employee.id == emp_id).first()
        if not emp:
            results["errors"].append({"employee_id": emp_id, "error": "Not found"})
            continue
        try:
            old_priv = emp.privilege
            if old_priv == payload.privilege:
                results["updated"].append({"employee_id": emp.id, "name": emp.name, "status": "unchanged"})
                continue
            emp.privilege = payload.privilege
            emp.updated_at = datetime.now(timezone.utc)
            db.commit()
            db.refresh(emp)
            sync_errors = []
            if emp.source_device_id:
                sync_errors = sync_employee_to_devices(emp, operation="update")
            results["updated"].append({
                "employee_id": emp.id,
                "name": emp.name,
                "old_privilege": old_priv,
                "new_privilege": emp.privilege,
                "sync_errors": sync_errors
            })
        except Exception as e:
            db.rollback()
            results["errors"].append({"employee_id": emp_id, "error": str(e)})

    return results


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
