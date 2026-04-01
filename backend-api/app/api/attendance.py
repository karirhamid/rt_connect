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


@router.get("/debug/values")
async def debug_attendance_values(db: Session = Depends(get_db)):
    """Debug endpoint to check status and punch values in recent records"""
    try:
        today_start = datetime.combine(date.today(), datetime.min.time())
        today_end = datetime.combine(date.today(), datetime.max.time())
        
        records = db.query(DBAttendance).filter(
            and_(
                DBAttendance.timestamp >= today_start,
                DBAttendance.timestamp <= today_end
            )
        ).order_by(DBAttendance.timestamp.desc()).limit(10).all()
        
        debug_info = []
        for record in records:
            debug_info.append({
                'time': record.timestamp.strftime('%H:%M:%S'),
                'employee': record.employee.name if record.employee else 'Unknown',
                'device': record.device.name if record.device else 'Unknown',
                'status': record.status,
                'punch': record.punch,
                'determined_type': 'Check In' if (record.punch == 0) else 'Check Out'
            })
        
        return {'records': debug_info, 'count': len(debug_info)}
    except Exception as e:
        logger.error(f"Error in debug endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/debug/compare")
async def debug_compare_device_vs_db(db: Session = Depends(get_db)):
    """Compare what's in the database vs what's on the devices for today"""
    try:
        from app.services.device_store import device_store
        from app.services.device_manager import ZKTecoDeviceManager
        
        today_start = datetime.combine(date.today(), datetime.min.time())
        today_end = datetime.combine(date.today(), datetime.max.time())
        
        results = {}
        
        # Get all devices
        devices = device_store.get_all()
        
        for device_config in devices:
            device_info = {
                'name': device_config.name,
                'ip': device_config.ip,
                'port': device_config.port,
                'database_records': 0,
                'device_records': 0,
                'error': None
            }
            
            # Count records in database for this device today
            db_count = db.query(DBAttendance).filter(
                and_(
                    DBAttendance.device_id == device_config.id,
                    DBAttendance.timestamp >= today_start,
                    DBAttendance.timestamp <= today_end
                )
            ).count()
            device_info['database_records'] = db_count
            
            # Try to connect to device and get today's records
            try:
                manager = ZKTecoDeviceManager(
                    ip=device_config.ip,
                    port=device_config.port,
                    timeout=15
                )
                
                # Use single connection for info + attendance
                with manager.session() as mgr:
                    info = mgr.get_device_info()
                    if not info:
                        device_info['error'] = 'Failed to connect'
                    else:
                        all_records = mgr.get_attendance() or []
                        today_records = [
                            r for r in all_records
                            if hasattr(r, 'timestamp') and 
                            r.timestamp.date() == date.today()
                        ]
                        device_info['device_records'] = len(today_records)
                        device_info['device_status'] = 'Connected'
                    
            except Exception as e:
                device_info['error'] = str(e)
                device_info['device_status'] = 'Offline'
            
            results[device_config.id] = device_info
        
        return {
            'date': date.today().isoformat(),
            'devices': results,
            'summary': {
                'total_in_db': sum(d['database_records'] for d in results.values()),
                'total_on_devices': sum(d['device_records'] for d in results.values() if d['device_records']),
                'devices_online': sum(1 for d in results.values() if not d['error']),
                'devices_offline': sum(1 for d in results.values() if d['error'])
            }
        }
    except Exception as e:
        logger.error(f"Error in debug compare endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/force-sync-today")
async def force_sync_today(db: Session = Depends(get_db)):
    """Force a complete sync of today's attendance from all devices, ignoring last_sync timestamps"""
    try:
        from app.services.device_store import device_store
        from app.services.device_manager import ZKTecoDeviceManager
        from app.database.schema import Device as DBDevice, Employee as DBEmployee
        
        today_start = datetime.combine(date.today(), datetime.min.time())
        today_end = datetime.combine(date.today(), datetime.max.time())
        
        results = {
            'devices': {},
            'total_fetched': 0,
            'total_added': 0,
            'total_skipped': 0,
            'skipped_reasons': []
        }
        
        devices = device_store.get_all()
        
        for device_config in devices:
            device_result = {
                'name': device_config.name,
                'fetched': 0,
                'added': 0,
                'skipped': 0,
                'errors': []
            }
            
            try:
                # Use single connection for info + attendance
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
                    
                    # Get all attendance records and filter for today
                    all_records = mgr.get_attendance() or []
                
                today_records = [
                    r for r in all_records
                    if hasattr(r, 'timestamp') and r.timestamp.date() == date.today()
                ]
                
                device_result['fetched'] = len(today_records)
                results['total_fetched'] += len(today_records)
                
                # Process each record
                for record in today_records:
                    record_data = {
                        'uid': record.uid,
                        'user_id': record.user_id,
                        'timestamp': record.timestamp,
                        'status': record.status,
                        'punch': record.punch
                    }
                    
                    # Find employee by user_id
                    db_employee = db.query(DBEmployee).filter(
                        DBEmployee.user_id == record_data['user_id']
                    ).first()
                    
                    if not db_employee:
                        device_result['skipped'] += 1
                        results['total_skipped'] += 1
                        skip_reason = f"Employee user_id '{record_data['user_id']}' not found in database (device: {device_config.name})"
                        results['skipped_reasons'].append(skip_reason)
                        device_result['errors'].append(skip_reason)
                        continue
                    
                    # Check if record already exists
                    existing = db.query(DBAttendance).filter(
                        DBAttendance.device_id == device_config.id,
                        DBAttendance.uid == record_data['uid'],
                        DBAttendance.timestamp == record_data['timestamp']
                    ).first()
                    
                    if not existing:
                        # Add new record
                        db_attendance = DBAttendance(
                            device_id=device_config.id,
                            employee_id=db_employee.id,
                            uid=record_data['uid'],
                            user_id_str=record_data['user_id'],
                            timestamp=record_data['timestamp'],
                            status=record_data['status'],
                            punch=record_data['punch']
                        )
                        db.add(db_attendance)
                        device_result['added'] += 1
                        results['total_added'] += 1
                    else:
                        device_result['skipped'] += 1
                        results['total_skipped'] += 1
                
                db.commit()
                
            except Exception as e:
                error_msg = f"Error syncing device {device_config.name}: {str(e)}"
                device_result['errors'].append(error_msg)
                logger.error(error_msg)
            
            results['devices'][device_config.id] = device_result
        
        return results
        
    except Exception as e:
        logger.error(f"Error in force sync: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


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
        
        # Return all individual records (not grouped)
        attendance_list = []
        for record in records:
            # Determine check-in vs check-out
            # ZKTeco uses punch field: 0 = check-in, 1 = check-out, others = break states
            # Some devices use status field similarly
            is_check_in = (record.punch == 0) or (record.status == 0 and record.punch is None)
            
            attendance_list.append({
                'id': record.id,
                'employee_id': record.employee.user_id,
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
            'date': target_day.isoformat()
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


@router.put("/{attendance_id}")
async def update_attendance(
    attendance_id: int,
    timestamp: Optional[str] = Query(None, description="New timestamp (ISO format)"),
    status: Optional[int] = Query(None, description="Status (0=check-in, 1=check-out)"),
    punch: Optional[int] = Query(None, description="Punch type"),
    db: Session = Depends(get_db)
):
    """Update an attendance record in the database
    
    IMPORTANT: ZKTeco devices do NOT support updating individual attendance records.
    This only updates the record in the application database.
    The device will retain the original timestamp.
    
    To see updated times in this application, use the database records (which this updates).
    The ZKBio application shows device data, which cannot be modified without clearing
    all attendance and re-uploading (not recommended as it loses all records).
    """
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
            'warning': 'Note: Device firmware does not support updating attendance records. The change is only in the application database.',
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
