from fastapi import APIRouter, HTTPException, Query
from typing import List, Optional
from datetime import datetime
from app.models import Attendance, ResponseMessage
from app.services import device_manager
import logging

router = APIRouter()
logger = logging.getLogger(__name__)


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
