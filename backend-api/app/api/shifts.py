"""
Shift Management API Endpoints
Handles shifts, timings, and shift assignments
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import date, datetime

from app.database.connection import get_db
from app.database.shift_schema import Shift, ShiftTiming, EmployeeShift, ShiftException
from app.models.shift_schemas import (
    ShiftCreate, ShiftUpdate, ShiftResponse, ShiftListResponse,
    ShiftTimingCreate, ShiftTimingUpdate, ShiftTimingResponse,
    EmployeeShiftCreate, EmployeeShiftUpdate, EmployeeShiftResponse,
    BulkShiftAssignment, ShiftExceptionCreate, ShiftExceptionUpdate, ShiftExceptionResponse
)

router = APIRouter(prefix="/api/shifts", tags=["shifts"])


# ==================== SHIFT CRUD ====================

@router.get("", response_model=List[ShiftListResponse])
async def list_shifts(
    is_active: Optional[bool] = None,
    shift_type: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Get list of all shifts"""
    query = db.query(Shift)
    
    if is_active is not None:
        query = query.filter(Shift.is_active == is_active)
    
    if shift_type:
        query = query.filter(Shift.shift_type == shift_type)
    
    shifts = query.order_by(Shift.name).all()
    return shifts


@router.post("", response_model=ShiftResponse)
async def create_shift(
    shift: ShiftCreate,
    db: Session = Depends(get_db)
):
    """Create a new shift with timings"""
    # Create shift
    db_shift = Shift(
        name=shift.name,
        shift_type=shift.shift_type,
        color=shift.color,
        description=shift.description,
        is_active=shift.is_active
    )
    db.add(db_shift)
    db.flush()  # Get the shift ID
    
    # Add timings if provided
    if shift.timings:
        for timing in shift.timings:
            db_timing = ShiftTiming(
                shift_id=db_shift.id,
                **timing.model_dump()
            )
            db.add(db_timing)
    
    db.commit()
    db.refresh(db_shift)
    return db_shift


@router.get("/{shift_id}", response_model=ShiftResponse)
async def get_shift(shift_id: int, db: Session = Depends(get_db)):
    """Get shift details by ID"""
    shift = db.query(Shift).filter(Shift.id == shift_id).first()
    if not shift:
        raise HTTPException(status_code=404, detail="Shift not found")
    return shift


@router.put("/{shift_id}", response_model=ShiftResponse)
async def update_shift(
    shift_id: int,
    shift: ShiftUpdate,
    db: Session = Depends(get_db)
):
    """Update shift details"""
    db_shift = db.query(Shift).filter(Shift.id == shift_id).first()
    if not db_shift:
        raise HTTPException(status_code=404, detail="Shift not found")
    
    update_data = shift.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_shift, field, value)
    
    db.commit()
    db.refresh(db_shift)
    return db_shift


@router.delete("/{shift_id}")
async def delete_shift(shift_id: int, db: Session = Depends(get_db)):
    """Delete a shift (if not assigned to employees)"""
    db_shift = db.query(Shift).filter(Shift.id == shift_id).first()
    if not db_shift:
        raise HTTPException(status_code=404, detail="Shift not found")
    
    # Check if shift is assigned to any employees
    assignments = db.query(EmployeeShift).filter(
        EmployeeShift.shift_id == shift_id,
        (EmployeeShift.effective_to.is_(None)) | (EmployeeShift.effective_to >= date.today())
    ).count()
    
    if assignments > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete shift: currently assigned to {assignments} employee(s)"
        )
    
    db.delete(db_shift)
    db.commit()
    return {"success": True, "message": "Shift deleted successfully"}


# ==================== SHIFT TIMINGS ====================

@router.get("/{shift_id}/timings", response_model=List[ShiftTimingResponse])
async def get_shift_timings(shift_id: int, db: Session = Depends(get_db)):
    """Get all timings for a shift"""
    shift = db.query(Shift).filter(Shift.id == shift_id).first()
    if not shift:
        raise HTTPException(status_code=404, detail="Shift not found")
    
    return shift.timings


@router.post("/{shift_id}/timings", response_model=ShiftTimingResponse)
async def add_shift_timing(
    shift_id: int,
    timing: ShiftTimingCreate,
    db: Session = Depends(get_db)
):
    """Add a timing to a shift"""
    shift = db.query(Shift).filter(Shift.id == shift_id).first()
    if not shift:
        raise HTTPException(status_code=404, detail="Shift not found")
    
    # Check for duplicate day_of_week
    if timing.day_of_week is not None:
        existing = db.query(ShiftTiming).filter(
            ShiftTiming.shift_id == shift_id,
            ShiftTiming.day_of_week == timing.day_of_week
        ).first()
        if existing:
            raise HTTPException(
                status_code=400,
                detail=f"Timing for day {timing.day_of_week} already exists"
            )
    
    db_timing = ShiftTiming(shift_id=shift_id, **timing.model_dump())
    db.add(db_timing)
    db.commit()
    db.refresh(db_timing)
    return db_timing


@router.put("/{shift_id}/timings/{timing_id}", response_model=ShiftTimingResponse)
async def update_shift_timing(
    shift_id: int,
    timing_id: int,
    timing: ShiftTimingUpdate,
    db: Session = Depends(get_db)
):
    """Update a shift timing"""
    db_timing = db.query(ShiftTiming).filter(
        ShiftTiming.id == timing_id,
        ShiftTiming.shift_id == shift_id
    ).first()
    if not db_timing:
        raise HTTPException(status_code=404, detail="Timing not found")
    
    update_data = timing.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_timing, field, value)
    
    db.commit()
    db.refresh(db_timing)
    return db_timing


@router.delete("/{shift_id}/timings/{timing_id}")
async def delete_shift_timing(
    shift_id: int,
    timing_id: int,
    db: Session = Depends(get_db)
):
    """Delete a shift timing"""
    db_timing = db.query(ShiftTiming).filter(
        ShiftTiming.id == timing_id,
        ShiftTiming.shift_id == shift_id
    ).first()
    if not db_timing:
        raise HTTPException(status_code=404, detail="Timing not found")
    
    db.delete(db_timing)
    db.commit()
    return {"success": True, "message": "Timing deleted successfully"}


# ==================== EMPLOYEE SHIFT ASSIGNMENTS ====================

@router.get("/{shift_id}/employees")
async def get_shift_employees(
    shift_id: int,
    active_only: bool = True,
    db: Session = Depends(get_db)
):
    """Get all employees assigned to a shift"""
    from app.database.schema import Employee
    
    query = db.query(EmployeeShift).join(Employee).filter(EmployeeShift.shift_id == shift_id)
    
    if active_only:
        query = query.filter(
            EmployeeShift.effective_from <= date.today(),
            (EmployeeShift.effective_to.is_(None)) | (EmployeeShift.effective_to >= date.today())
        )
    
    assignments = query.all()
    
    return [
        {
            "assignment_id": a.id,
            "employee_id": a.employee_id,
            "employee_name": a.employee.name,
            "effective_from": a.effective_from,
            "effective_to": a.effective_to,
            "notes": a.notes
        }
        for a in assignments
    ]
