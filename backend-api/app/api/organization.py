from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from app.database import get_db
from app.database.schema import Company, Department, Position

router = APIRouter()

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
