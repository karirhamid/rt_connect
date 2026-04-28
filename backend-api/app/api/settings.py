from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional
from app.database.connection import get_db_session
from app.database.schema import AppSettings
import logging

logger = logging.getLogger(__name__)

router = APIRouter()


class GeneralSettings(BaseModel):
    require_sync_confirmation: bool = Field(default=True, description="Require confirmation before syncing data from devices")
    validate_timestamps: bool = Field(default=True, description="Validate and correct malformed timestamps from devices")
    timing_enabled: bool = Field(default=False, description="Legacy: enable timing (kept for backwards compat)")
    timing_mode: str = Field(default="off", description="Timing mode: off | employee | department | both")
    attendance_mode: str = Field(default="simple", description="Attendance display mode: simple | strict")
    employee_mode: str = Field(default="shared", description="Employee mode: shared (same employees across devices, merge reports) | separate (each device has unique employees)")
    pdf_style: str = Field(default="style1", description="PDF report style: style1 | style2")
    pdf_show_overtime: bool = Field(default=True, description="Show overtime column in PDF reports")
    pdf_show_total_worked: bool = Field(default=True, description="Show total worked column in PDF reports")


@router.get("/settings/general", response_model=GeneralSettings)
async def get_general_settings():
    with get_db_session() as db:
        row = db.query(AppSettings).first()
        if not row:
            row = AppSettings(require_sync_confirmation=True, validate_timestamps=True, timing_enabled=False, timing_mode='off')
            db.add(row)
            db.commit()
            db.refresh(row)
        timing_mode = getattr(row, 'timing_mode', None) or 'off'
        # Keep timing_enabled in sync with timing_mode for backwards compat
        timing_enabled = timing_mode != 'off'
        attendance_mode = getattr(row, 'attendance_mode', None) or 'simple'
        employee_mode = getattr(row, 'employee_mode', None) or 'shared'
        return GeneralSettings(
            require_sync_confirmation=row.require_sync_confirmation,
            validate_timestamps=row.validate_timestamps if hasattr(row, 'validate_timestamps') else True,
            timing_enabled=timing_enabled,
            timing_mode=timing_mode,
            attendance_mode=attendance_mode,
            employee_mode=employee_mode,
            pdf_style=getattr(row, 'pdf_style', None) or 'style1',
            pdf_show_overtime=getattr(row, 'pdf_show_overtime', True) if hasattr(row, 'pdf_show_overtime') else True,
            pdf_show_total_worked=getattr(row, 'pdf_show_total_worked', True) if hasattr(row, 'pdf_show_total_worked') else True,
        )


@router.put("/settings/general", response_model=GeneralSettings)
async def update_general_settings(payload: GeneralSettings):
    with get_db_session() as db:
        row = db.query(AppSettings).first()
        if not row:
            row = AppSettings()
            db.add(row)
        row.require_sync_confirmation = payload.require_sync_confirmation
        row.validate_timestamps = payload.validate_timestamps
        # timing_mode is the source of truth; sync timing_enabled from it
        row.timing_mode = payload.timing_mode
        row.timing_enabled = payload.timing_mode != 'off'
        row.attendance_mode = payload.attendance_mode if payload.attendance_mode in ('simple', 'strict') else 'simple'
        row.employee_mode = payload.employee_mode if payload.employee_mode in ('shared', 'separate') else 'shared'
        row.pdf_style = payload.pdf_style if payload.pdf_style in ('style1', 'style2') else 'style1'
        row.pdf_show_overtime = payload.pdf_show_overtime
        row.pdf_show_total_worked = payload.pdf_show_total_worked
        db.commit()
        db.refresh(row)

    logger.info("General settings saved (timing_mode=%s, attendance_mode=%s, employee_mode=%s)", payload.timing_mode, payload.attendance_mode, payload.employee_mode)
    return GeneralSettings(
        require_sync_confirmation=row.require_sync_confirmation,
        validate_timestamps=row.validate_timestamps,
        timing_enabled=row.timing_enabled,
        timing_mode=row.timing_mode,
        attendance_mode=getattr(row, 'attendance_mode', None) or 'simple',
        employee_mode=getattr(row, 'employee_mode', None) or 'shared',
        pdf_style=getattr(row, 'pdf_style', None) or 'style1',
        pdf_show_overtime=getattr(row, 'pdf_show_overtime', True) if hasattr(row, 'pdf_show_overtime') else True,
        pdf_show_total_worked=getattr(row, 'pdf_show_total_worked', True) if hasattr(row, 'pdf_show_total_worked') else True,
    )
