from fastapi import APIRouter, HTTPException, Query, Depends
from typing import List, Optional
from datetime import datetime, date
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, func
from app.models import Attendance, ResponseMessage
from app.services import device_manager
from app.database import get_db
from app.database.schema import (
    Attendance as DBAttendance,
    Employee as DBEmployee,
    Department as DBDepartment,
    Company as DBCompany
)
import logging

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/today")
async def get_today_attendance(db: Session = Depends(get_db)):
    """Get today's attendance records with employee and department info"""
    try:
        today_start = datetime.combine(date.today(), datetime.min.time())
        today_end = datetime.combine(date.today(), datetime.max.time())
        
        records = db.query(DBAttendance).join(
            DBEmployee, DBAttendance.employee_id == DBEmployee.id
        ).join(
            DBDepartment, DBEmployee.department_id == DBDepartment.id
        ).filter(
            and_(
                DBAttendance.timestamp >= today_start,
                DBAttendance.timestamp <= today_end
            )
        ).all()
        
        # Group by employee to get check-in and check-out
        employee_records = {}
        for record in records:
            emp_id = record.employee_id
            if emp_id not in employee_records:
                employee_records[emp_id] = {
                    'employee_id': record.employee.user_id,
                    'employee_name': record.employee.name,
                    'department': record.employee.department.name,
                    'company': record.employee.company.name,
                    'check_in': None,
                    'check_out': None,
                    'device_name': None,
                    'status': 'present'
                }
            
            # Determine check-in/check-out (status 0 = check-in, 1 = check-out)
            if record.status == 0 or record.punch == 0:
                if not employee_records[emp_id]['check_in']:
                    employee_records[emp_id]['check_in'] = record.timestamp.isoformat()
                    employee_records[emp_id]['device_name'] = record.device.name if record.device else 'Unknown'
            else:
                employee_records[emp_id]['check_out'] = record.timestamp.isoformat()
            
            # Check if late (after 9 AM)
            if record.timestamp.hour >= 9 and record.timestamp.minute > 0:
                employee_records[emp_id]['status'] = 'late'
        
        return {
            'attendance': list(employee_records.values()),
            'count': len(employee_records)
        }
    except Exception as e:
        logger.error(f"Error getting today's attendance: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/filter")
async def filter_attendance(
    start_date: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="End date (YYYY-MM-DD)"),
    employee_id: Optional[str] = Query(None, description="Employee user ID"),
    employee_name: Optional[str] = Query(None, description="Employee name (partial match)"),
    department_id: Optional[int] = Query(None, description="Department ID"),
    company_id: Optional[int] = Query(None, description="Company ID"),
    status: Optional[str] = Query(None, description="Status filter (present/late/absent)"),
    db: Session = Depends(get_db)
):
    """Filter attendance records with advanced search"""
    try:
        query = db.query(DBAttendance).join(
            DBEmployee, DBAttendance.employee_id == DBEmployee.id
        ).join(
            DBDepartment, DBEmployee.department_id == DBDepartment.id
        ).join(
            DBCompany, DBEmployee.company_id == DBCompany.id
        )
        
        # Apply filters
        filters = []
        
        if start_date:
            start_dt = datetime.strptime(start_date, "%Y-%m-%d")
            filters.append(DBAttendance.timestamp >= start_dt)
        
        if end_date:
            end_dt = datetime.strptime(end_date + " 23:59:59", "%Y-%m-%d %H:%M:%S")
            filters.append(DBAttendance.timestamp <= end_dt)
        
        if employee_id:
            filters.append(DBEmployee.user_id == employee_id)
        
        if employee_name:
            filters.append(DBEmployee.name.ilike(f"%{employee_name}%"))
        
        if department_id:
            filters.append(DBEmployee.department_id == department_id)
        
        if company_id:
            filters.append(DBEmployee.company_id == company_id)
        
        if filters:
            query = query.filter(and_(*filters))
        
        records = query.order_by(DBAttendance.timestamp.desc()).limit(1000).all()
        
        # Format results
        results = []
        for record in records:
            results.append({
                'id': record.id,
                'timestamp': record.timestamp.isoformat(),
                'employee_id': record.employee.user_id,
                'employee_name': record.employee.name,
                'department': record.employee.department.name,
                'company': record.employee.company.name,
                'device_name': record.device.name if record.device else 'Unknown',
                'status': record.status,
                'punch': record.punch
            })
        
        return {
            'attendance': results,
            'count': len(results)
        }
    except Exception as e:
        logger.error(f"Error filtering attendance: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/", response_model=List[Attendance])
async def get_attendance(
    start_date: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="End date (YYYY-MM-DD)"),
    user_id: Optional[str] = Query(None, description="Filter by user ID")
):
    """Get attendance records from the device with optional filtering"""
    try:
        attendance_records = device_manager.get_attendance()
        
        # Filter by date range if provided
        if start_date:
            start_dt = datetime.strptime(start_date, "%Y-%m-%d")
            attendance_records = [
                record for record in attendance_records 
                if record.timestamp >= start_dt
            ]
        
        if end_date:
            end_dt = datetime.strptime(end_date, "%Y-%m-%d")
            attendance_records = [
                record for record in attendance_records 
                if record.timestamp <= end_dt
            ]
        
        # Filter by user_id if provided
        if user_id:
            attendance_records = [
                record for record in attendance_records 
                if record.user_id == user_id
            ]
        
        return attendance_records
    except Exception as e:
        logger.error(f"Error getting attendance: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/clear", response_model=ResponseMessage)
async def clear_attendance():
    """Clear all attendance records from the device"""
    try:
        device_manager.clear_attendance()
        return ResponseMessage(
            success=True,
            message="Attendance records cleared successfully"
        )
    except Exception as e:
        logger.error(f"Error clearing attendance: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
