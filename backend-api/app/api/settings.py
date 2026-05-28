from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import Optional
from app.database.connection import get_db_session
from app.database.schema import AppSettings
from app.core.security import get_current_user, user_has_permission
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
    app_name: Optional[str] = Field(default="RTPointage", description="System name shown on login + sidebar")
    client_name: Optional[str] = Field(default=None, description="Client / customer organization name shown on login")
    device_heartbeat_enabled: bool = Field(default=True, description="Periodically ping devices to track online status")
    device_heartbeat_interval_sec: int = Field(default=300, ge=60, le=3600, description="Seconds between device heartbeats (60–3600)")
    punch_merge_window_min: int = Field(default=5, ge=0, le=30, description="Merge punches within N minutes (0 disables)")
    portal_enabled: bool = Field(default=False, description="Enable the employee self-service portal (super admin only)")


class PublicBranding(BaseModel):
    """Public branding info, no auth required (used by login page)."""
    app_name: str = "RTPointage"
    client_name: Optional[str] = None


@router.get("/public/branding", response_model=PublicBranding)
async def get_public_branding():
    """Return branding info shown on the login page. No auth required."""
    with get_db_session() as db:
        row = db.query(AppSettings).first()
        if not row:
            return PublicBranding()
        return PublicBranding(
            app_name=(getattr(row, 'app_name', None) or 'RTPointage'),
            client_name=getattr(row, 'client_name', None),
        )


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
            app_name=getattr(row, 'app_name', None) or 'RTPointage',
            client_name=getattr(row, 'client_name', None),
            device_heartbeat_enabled=bool(getattr(row, 'device_heartbeat_enabled', True)),
            device_heartbeat_interval_sec=int(getattr(row, 'device_heartbeat_interval_sec', 300) or 300),
            punch_merge_window_min=int(getattr(row, 'punch_merge_window_min', 5) or 0),
            portal_enabled=bool(getattr(row, 'portal_enabled', False)),
        )


@router.put("/settings/general", response_model=GeneralSettings)
async def update_general_settings(payload: GeneralSettings, current=Depends(get_current_user)):
    with get_db_session() as db:
        row = db.query(AppSettings).first()
        if not row:
            row = AppSettings()
            db.add(row)
        # Gate: only roles.manage (super admin) can toggle the portal feature flag.
        prev_portal_enabled = bool(getattr(row, 'portal_enabled', False))
        if bool(payload.portal_enabled) != prev_portal_enabled:
            if not user_has_permission(current, "roles.manage"):
                raise HTTPException(status_code=403,
                                    detail="Only a super administrator can enable or disable the employee portal.")
            row.portal_enabled = bool(payload.portal_enabled)
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
        if payload.app_name is not None:
            row.app_name = payload.app_name.strip() or 'RTPointage'
        if payload.client_name is not None:
            row.client_name = payload.client_name.strip() or None
        row.device_heartbeat_enabled = bool(payload.device_heartbeat_enabled)
        row.device_heartbeat_interval_sec = max(60, min(3600, int(payload.device_heartbeat_interval_sec or 300)))
        row.punch_merge_window_min = max(0, min(30, int(payload.punch_merge_window_min if payload.punch_merge_window_min is not None else 5)))
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
        app_name=getattr(row, 'app_name', None) or 'RTPointage',
        client_name=getattr(row, 'client_name', None),
        device_heartbeat_enabled=bool(getattr(row, 'device_heartbeat_enabled', True)),
        device_heartbeat_interval_sec=int(getattr(row, 'device_heartbeat_interval_sec', 300) or 300),
        punch_merge_window_min=int(getattr(row, 'punch_merge_window_min', 5) or 0),
        portal_enabled=bool(getattr(row, 'portal_enabled', False)),
    )


# ---------------------------------------------------------------------------
# Reports module toggle — lives on its own endpoint so the Settings → Rapports
# sub-page can read/write just this one flag without pulling in the entire
# general-settings payload (which would require settings.manage too).
# Super admin (roles.manage) only.
# ---------------------------------------------------------------------------
class ReportsModuleSettings(BaseModel):
    lateness_module_enabled: bool = Field(
        default=False,
        description="Enable the lateness reports module (Retards tab + endpoints). Super admin only.",
    )


@router.get("/settings/reports-module", response_model=ReportsModuleSettings)
async def get_reports_module_settings(current=Depends(get_current_user)):
    """Read the reports module flags. Visible to anyone with settings.manage
    (so managers can SEE the state) — only roles.manage may change it."""
    if not (user_has_permission(current, "settings.manage")
            or user_has_permission(current, "roles.manage")):
        raise HTTPException(status_code=403, detail="Not authorized")
    with get_db_session() as db:
        row = db.query(AppSettings).first()
        if not row:
            row = AppSettings()
            db.add(row); db.commit(); db.refresh(row)
        return ReportsModuleSettings(
            lateness_module_enabled=bool(getattr(row, 'lateness_module_enabled', False)),
        )


@router.put("/settings/reports-module", response_model=ReportsModuleSettings)
async def update_reports_module_settings(payload: ReportsModuleSettings,
                                          current=Depends(get_current_user)):
    """Toggle the reports module flags. Super admin only."""
    if not user_has_permission(current, "roles.manage"):
        raise HTTPException(status_code=403,
                            detail="Only a super administrator can change the reports module settings.")
    with get_db_session() as db:
        row = db.query(AppSettings).first()
        if not row:
            row = AppSettings(); db.add(row)
        row.lateness_module_enabled = bool(payload.lateness_module_enabled)
        db.commit(); db.refresh(row)
        logger.info("Reports module toggled: lateness=%s", row.lateness_module_enabled)
        return ReportsModuleSettings(
            lateness_module_enabled=bool(row.lateness_module_enabled),
        )


@router.get("/settings/reports-module/public")
async def get_reports_module_public():
    """Tiny public-ish endpoint the frontend can hit on every page to know
    whether to show the Retards tab. No permission required — only exposes
    which optional UI is visible, no business data. Other auth still applies
    to the actual endpoints behind the flag."""
    with get_db_session() as db:
        row = db.query(AppSettings).first()
        return {
            "lateness_module_enabled": bool(getattr(row, 'lateness_module_enabled', False)) if row else False,
        }
