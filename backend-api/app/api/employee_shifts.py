"""
Employee Shift Assignment API Endpoints
Handles assigning shifts to employees
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import and_, or_
from typing import List, Optional
from datetime import date, datetime, timedelta

from app.database.connection import get_db
from app.database.schema import Employee
from app.database.shift_schema import Shift, EmployeeShift, ShiftException, ShiftTiming
from app.models.shift_schemas import (
    EmployeeShiftCreate, EmployeeShiftUpdate, EmployeeShiftResponse,
    BulkShiftAssignment, EmployeeScheduleResponse, EmployeeScheduleDay,
    ShiftResponse
)

router = APIRouter(prefix="/api/employees", tags=["employee-shifts"])


def validate_shift_dates(employee_id: int, shift_id: int, effective_from: date, effective_to: Optional[date], db: Session, exclude_assignment_id: Optional[int] = None):
    """
    Validate that new shift assignment doesn't overlap with existing assignments
    """
    query = db.query(EmployeeShift).filter(
        EmployeeShift.employee_id == employee_id
    )
    
    if exclude_assignment_id:
        query = query.filter(EmployeeShift.id != exclude_assignment_id)
    
    # Check for overlaps
    if effective_to:
        # New assignment has end date
        query = query.filter(
            or_(
                # Existing has no end date and starts before new ends
                and_(
                    EmployeeShift.effective_to.is_(None),
                    EmployeeShift.effective_from <= effective_to
                ),
                # Existing has end date and overlaps
                and_(
                    EmployeeShift.effective_to.isnot(None),
                    EmployeeShift.effective_from <= effective_to,
                    EmployeeShift.effective_to >= effective_from
                )
            )
        )
    else:
        # New assignment has no end date
        query = query.filter(
            or_(
                # Existing has no end date
                EmployeeShift.effective_to.is_(None),
                # Existing ends after new starts
                EmployeeShift.effective_to >= effective_from
            )
        )
    
    overlapping = query.first()
    if overlapping:
        raise HTTPException(
            status_code=400,
            detail=f"Shift assignment overlaps with existing assignment from {overlapping.effective_from} to {overlapping.effective_to or 'ongoing'}"
        )


@router.get("/{employee_id}/shifts", response_model=List[EmployeeShiftResponse])
async def get_employee_shifts(
    employee_id: int,
    active_only: bool = False,
    db: Session = Depends(get_db)
):
    """Get all shift assignments for an employee"""
    employee = db.query(Employee).filter(Employee.id == employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    
    query = db.query(EmployeeShift).filter(EmployeeShift.employee_id == employee_id)
    
    if active_only:
        today = date.today()
        query = query.filter(
            EmployeeShift.effective_from <= today,
            or_(
                EmployeeShift.effective_to.is_(None),
                EmployeeShift.effective_to >= today
            )
        )
    
    assignments = query.order_by(EmployeeShift.effective_from.desc()).all()
    return assignments


@router.get("/{employee_id}/current-shift", response_model=Optional[EmployeeShiftResponse])
async def get_employee_current_shift(
    employee_id: int,
    db: Session = Depends(get_db)
):
    """Get employee's current active shift (returns null if no shift assigned)"""
    employee = db.query(Employee).filter(Employee.id == employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    
    today = date.today()
    current_shift = db.query(EmployeeShift).options(
        joinedload(EmployeeShift.shift)
    ).filter(
        EmployeeShift.employee_id == employee_id,
        EmployeeShift.effective_from <= today,
        or_(
            EmployeeShift.effective_to.is_(None),
            EmployeeShift.effective_to >= today
        )
    ).first()
    
    # Return None instead of 404 if no shift assigned
    return current_shift


@router.post("/{employee_id}/shifts", response_model=EmployeeShiftResponse)
async def assign_shift_to_employee(
    employee_id: int,
    assignment: EmployeeShiftCreate,
    db: Session = Depends(get_db)
):
    """Assign a shift to an employee"""
    # Validate employee exists
    employee = db.query(Employee).filter(Employee.id == employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    
    # Validate shift exists
    shift = db.query(Shift).filter(Shift.id == assignment.shift_id).first()
    if not shift:
        raise HTTPException(status_code=404, detail="Shift not found")
    
    # Validate dates don't overlap with existing assignments
    validate_shift_dates(
        employee_id,
        assignment.shift_id,
        assignment.effective_from,
        assignment.effective_to,
        db
    )
    
    # Create assignment
    db_assignment = EmployeeShift(
        employee_id=employee_id,
        **assignment.model_dump()
    )
    db.add(db_assignment)
    db.commit()
    db.refresh(db_assignment)
    
    return db_assignment


@router.put("/{employee_id}/shifts/{assignment_id}", response_model=EmployeeShiftResponse)
async def update_employee_shift_assignment(
    employee_id: int,
    assignment_id: int,
    assignment: EmployeeShiftUpdate,
    db: Session = Depends(get_db)
):
    """Update an employee's shift assignment"""
    db_assignment = db.query(EmployeeShift).filter(
        EmployeeShift.id == assignment_id,
        EmployeeShift.employee_id == employee_id
    ).first()
    
    if not db_assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    
    update_data = assignment.model_dump(exclude_unset=True)
    
    # If dates are being updated, validate no overlaps
    if 'effective_from' in update_data or 'effective_to' in update_data:
        new_from = update_data.get('effective_from', db_assignment.effective_from)
        new_to = update_data.get('effective_to', db_assignment.effective_to)
        shift_id = update_data.get('shift_id', db_assignment.shift_id)
        
        validate_shift_dates(
            employee_id,
            shift_id,
            new_from,
            new_to,
            db,
            exclude_assignment_id=assignment_id
        )
    
    for field, value in update_data.items():
        setattr(db_assignment, field, value)
    
    db.commit()
    db.refresh(db_assignment)
    return db_assignment


@router.delete("/{employee_id}/shifts/{assignment_id}")
async def delete_employee_shift_assignment(
    employee_id: int,
    assignment_id: int,
    db: Session = Depends(get_db)
):
    """Delete an employee's shift assignment"""
    db_assignment = db.query(EmployeeShift).filter(
        EmployeeShift.id == assignment_id,
        EmployeeShift.employee_id == employee_id
    ).first()
    
    if not db_assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    
    db.delete(db_assignment)
    db.commit()
    return {"success": True, "message": "Shift assignment deleted successfully"}


@router.post("/bulk-shift-assignment")
async def bulk_assign_shifts(
    bulk: BulkShiftAssignment,
    db: Session = Depends(get_db)
):
    """Assign the same shift to multiple employees"""
    # Validate shift exists
    shift = db.query(Shift).filter(Shift.id == bulk.shift_id).first()
    if not shift:
        raise HTTPException(status_code=404, detail="Shift not found")
    
    results = {
        "success": [],
        "failed": []
    }
    
    for employee_id in bulk.employee_ids:
        try:
            # Validate employee exists
            employee = db.query(Employee).filter(Employee.id == employee_id).first()
            if not employee:
                results["failed"].append({
                    "employee_id": employee_id,
                    "error": "Employee not found"
                })
                continue
            
            # Validate no overlaps
            validate_shift_dates(
                employee_id,
                bulk.shift_id,
                bulk.effective_from,
                bulk.effective_to,
                db
            )
            
            # Create assignment
            db_assignment = EmployeeShift(
                employee_id=employee_id,
                shift_id=bulk.shift_id,
                effective_from=bulk.effective_from,
                effective_to=bulk.effective_to,
                assigned_by=bulk.assigned_by,
                notes=bulk.notes
            )
            db.add(db_assignment)
            db.flush()
            
            results["success"].append({
                "employee_id": employee_id,
                "employee_name": employee.name,
                "assignment_id": db_assignment.id
            })
        
        except HTTPException as e:
            results["failed"].append({
                "employee_id": employee_id,
                "error": e.detail
            })
        except Exception as e:
            results["failed"].append({
                "employee_id": employee_id,
                "error": str(e)
            })
    
    db.commit()
    
    return {
        "total": len(bulk.employee_ids),
        "successful": len(results["success"]),
        "failed": len(results["failed"]),
        "results": results
    }


@router.get("/{employee_id}/schedule")
async def get_employee_schedule(
    employee_id: int,
    start_date: date = Query(..., description="Start date for schedule"),
    end_date: date = Query(..., description="End date for schedule"),
    db: Session = Depends(get_db)
):
    """Get employee's schedule for a date range including holidays and exceptions"""
    from app.database.shift_schema import Holiday
    
    employee = db.query(Employee).filter(Employee.id == employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    
    # Get holidays in date range
    holidays = db.query(Holiday).filter(
        Holiday.date >= start_date,
        Holiday.date <= end_date
    ).all()
    holidays_dict = {h.date: h for h in holidays}
    
    # Get shift exceptions in date range
    exceptions = db.query(ShiftException).filter(
        ShiftException.employee_id == employee_id,
        ShiftException.exception_date >= start_date,
        ShiftException.exception_date <= end_date
    ).all()
    exceptions_dict = {e.exception_date: e for e in exceptions}
    
    # Build schedule day by day
    schedule = []
    current_date = start_date
    
    while current_date <= end_date:
        # Find active shift for this date
        shift_assignment = db.query(EmployeeShift).filter(
            EmployeeShift.employee_id == employee_id,
            EmployeeShift.effective_from <= current_date,
            or_(
                EmployeeShift.effective_to.is_(None),
                EmployeeShift.effective_to >= current_date
            )
        ).first()
        
        shift = shift_assignment.shift if shift_assignment else None
        holiday = holidays_dict.get(current_date)
        exception = exceptions_dict.get(current_date)
        
        # If there's an exception, use exception shift instead
        if exception and exception.exception_shift:
            shift = exception.exception_shift
        elif exception and exception.exception_shift_id is None:
            # Exception with no shift means day off
            shift = None
        
        schedule.append({
            "date": current_date,
            "shift": shift,
            "is_holiday": holiday is not None,
            "holiday_name": holiday.name if holiday else None,
            "is_exception": exception is not None,
            "exception_reason": exception.reason if exception else None
        })
        
        current_date += timedelta(days=1)
    
    # Get current shift
    today = date.today()
    current_shift_assignment = db.query(EmployeeShift).filter(
        EmployeeShift.employee_id == employee_id,
        EmployeeShift.effective_from <= today,
        or_(
            EmployeeShift.effective_to.is_(None),
            EmployeeShift.effective_to >= today
        )
    ).first()
    
    return {
        "employee_id": employee_id,
        "employee_name": employee.name,
        "current_shift": current_shift_assignment.shift if current_shift_assignment else None,
        "schedule": schedule
    }
