from fastapi import APIRouter, HTTPException, Query, Depends
from typing import List, Optional
from datetime import datetime, date
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, func
from app.database import get_db
from app.database.schema import (
    Attendance as DBAttendance,
    Employee as DBEmployee,
    Department as DBDepartment,
    Company as DBCompany,
    AppSettings as DBAppSettings,
)
import logging

router = APIRouter()
logger = logging.getLogger(__name__)



@router.get("/latest-log-date")
async def latest_log_date(
    device_id: Optional[str] = Query(None, description="Limit to one device"),
    db: Session = Depends(get_db),
):
    """Return the date of the most recent stored punch (device-local).

    Used by the 'sync since last logs' feature: it syncs from this date
    (start of day) up to now, so the gap since the last sync is filled.
    Pass device_id to get the last punch for a single device.
    """
    q = db.query(func.max(DBAttendance.timestamp))
    if device_id:
        q = q.filter(DBAttendance.device_id == device_id)
    max_ts = q.scalar()
    return {
        "latest_timestamp": max_ts.isoformat() if max_ts else None,
        "latest_date": max_ts.date().isoformat() if max_ts else None,
    }


@router.get("/expected-working")
async def expected_working(
    target_date: Optional[str] = Query(None, description="Date YYYY-MM-DD, defaults to today"),
    db: Session = Depends(get_db),
):
    """How many employees are EXPECTED to work on the given date.

    A day is non-working for an employee when their weekly schedule
    (EmployeeSchedule, else the DepartmentSchedule fallback) marks that
    weekday as a day off. Employees with no schedule at all are assumed to
    work (current behaviour). Used by the Today page to compute 'absent'
    correctly — a person off on Sunday is not counted absent.

    Note: night-guard / holiday-duty handling is NOT applied here yet — see
    docs/NIGHT_SHIFT_GUARD.md for the planned feature.
    """
    from app.database.shift_schema import EmployeeSchedule, DepartmentSchedule
    from app.database.schema import AppSettings as _AS

    if target_date:
        try:
            day = datetime.strptime(target_date, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    else:
        day = date.today()
    weekday = day.weekday()  # 0=Mon .. 6=Sun — matches schedule day_of_week

    settings = db.query(DBAppSettings).first()
    shared = (getattr(settings, 'employee_mode', None) or 'shared') == 'shared'

    employees = db.query(DBEmployee).filter(DBEmployee.is_active == True).all()  # noqa: E712

    # Preload schedules for this weekday
    emp_off = {
        s.employee_id: s.is_day_off
        for s in db.query(EmployeeSchedule).filter(EmployeeSchedule.day_of_week == weekday).all()
    }
    dept_off = {
        s.department_id: s.is_day_off
        for s in db.query(DepartmentSchedule).filter(DepartmentSchedule.day_of_week == weekday).all()
    }

    def is_working(emp) -> bool:
        if emp.id in emp_off:
            return not emp_off[emp.id]
        if emp.department_id in dept_off:
            return not dept_off[emp.department_id]
        return True  # no schedule defined → assume working

    # Dedup by matricule in shared mode so a person on two devices counts once
    working_ids, off_ids = set(), set()
    for e in employees:
        key = e.user_id if shared else e.id
        if is_working(e):
            working_ids.add(key)
        else:
            off_ids.add(key)
    # If any alias is working, the person is working
    off_ids -= working_ids

    return {
        "date": day.isoformat(),
        "weekday": weekday,
        "expected_working": len(working_ids),
        "day_off": len(off_ids),
    }


@router.get("/today")
async def get_today_attendance(
    target_date: Optional[str] = Query(None, description="Date to view (YYYY-MM-DD), defaults to today"),
    db: Session = Depends(get_db)
):
    """Get today's (or specified date's) attendance records with employee and department info"""
    try:
        # Parse target date or use today
        if target_date:
            try:
                target_day = datetime.strptime(target_date, "%Y-%m-%d").date()
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
        else:
            target_day = date.today()
        
        day_start = datetime.combine(target_day, datetime.min.time())
        day_end = datetime.combine(target_day, datetime.max.time())
        
        records = db.query(DBAttendance).join(
            DBEmployee, DBAttendance.employee_id == DBEmployee.id
        ).join(
            DBDepartment, DBEmployee.department_id == DBDepartment.id
        ).filter(
            and_(
                DBAttendance.timestamp >= day_start,
                DBAttendance.timestamp <= day_end
            )
        ).order_by(DBAttendance.timestamp.desc()).all()
        
        # Read employee_mode setting
        _settings = db.query(DBAppSettings).first()
        employee_mode = getattr(_settings, 'employee_mode', None) or 'shared'
        shared = employee_mode == 'shared'
        
        # Return all individual records (not grouped)
        attendance_list = []
        for record in records:
            # Determine check-in vs check-out
            # ZKTeco uses punch field: 0 = check-in, 1 = check-out, others = break states
            # Some devices use status field similarly
            is_check_in = (record.punch == 0) or (record.status == 0 and record.punch is None)
            
            attendance_list.append({
                'id': record.id,
                'employee_id': record.employee.user_id if shared else record.employee_id,
                'employee_name': record.employee.name,
                'department': record.employee.department.name,
                'company': record.employee.company.name,
                'timestamp': record.timestamp.isoformat(),
                'date': record.timestamp.strftime('%Y-%m-%d'),
                'time': record.timestamp.strftime('%H:%M:%S'),
                'device_id': record.device_id,
                'device_name': record.device.name if record.device else 'Unknown',
                'status': record.status,
                'punch': record.punch,
                'type': 'check_in' if is_check_in else 'check_out',
                'status_label': 'Check In' if is_check_in else 'Check Out'
            })
        
        return {
            'attendance': attendance_list,
            'count': len(attendance_list),
            'date': target_day.isoformat(),
            'employee_mode': employee_mode,
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
        
        # Format results with all attendance records
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
                'punch': record.punch,
                'date': record.timestamp.strftime('%Y-%m-%d'),
                'time': record.timestamp.strftime('%H:%M:%S')
            })
        
        return {
            'attendance': results,
            'count': len(results)
        }
    except Exception as e:
        logger.error(f"Error filtering attendance: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{attendance_id}")
async def update_attendance(
    attendance_id: int,
    timestamp: Optional[str] = Query(None, description="New timestamp (ISO format)"),
    status: Optional[int] = Query(None, description="Status (0=check-in, 1=check-out)"),
    punch: Optional[int] = Query(None, description="Punch type"),
    db: Session = Depends(get_db)
):
    """Update an attendance record in the database"""
    try:
        record = db.query(DBAttendance).filter(DBAttendance.id == attendance_id).first()
        if not record:
            raise HTTPException(status_code=404, detail="Attendance record not found")

        original_timestamp = record.timestamp.isoformat()

        if timestamp:
            record.timestamp = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
        if status is not None:
            record.status = status
        if punch is not None:
            record.punch = punch

        db.commit()
        db.refresh(record)

        logger.info(f"Updated attendance record {attendance_id} for employee {record.employee.name}: {original_timestamp} -> {record.timestamp.isoformat()}")

        return {
            'success': True,
            'message': 'Attendance record updated successfully in database',
            'record': {
                'id': record.id,
                'timestamp': record.timestamp.isoformat(),
                'employee_id': record.employee.user_id,
                'employee_name': record.employee.name,
                'status': record.status,
                'punch': record.punch
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating attendance: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{attendance_id}")
async def delete_attendance(
    attendance_id: int,
    db: Session = Depends(get_db)
):
    """Delete a single attendance record"""
    try:
        record = db.query(DBAttendance).filter(DBAttendance.id == attendance_id).first()
        if not record:
            raise HTTPException(status_code=404, detail="Attendance record not found")

        db.delete(record)
        db.commit()

        return {
            'success': True,
            'message': 'Attendance record deleted successfully'
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting attendance: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
