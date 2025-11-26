from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional
from app.database.connection import get_db_session
from app.database.schema import AppSettings
from app.services.sync_service import sync_service
import logging

logger = logging.getLogger(__name__)

router = APIRouter()


class GeneralSettings(BaseModel):
    sync_enabled: bool = Field(default=True, description="Enable background sync every N seconds")
    sync_interval_sec: int = Field(default=300, ge=60, le=86400, description="Background sync interval in seconds (min 60)")
    require_sync_confirmation: bool = Field(default=True, description="Require confirmation before syncing data from devices")
    validate_timestamps: bool = Field(default=True, description="Validate and correct malformed timestamps from devices")


@router.get("/settings/general", response_model=GeneralSettings)
async def get_general_settings():
    with get_db_session() as db:
        row = db.query(AppSettings).first()
        if not row:
            row = AppSettings(sync_enabled=True, sync_interval_sec=300, require_sync_confirmation=True, validate_timestamps=True)
            db.add(row)
            db.commit()
            db.refresh(row)
        return GeneralSettings(
            sync_enabled=row.sync_enabled, 
            sync_interval_sec=row.sync_interval_sec,
            require_sync_confirmation=row.require_sync_confirmation,
            validate_timestamps=row.validate_timestamps if hasattr(row, 'validate_timestamps') else True
        )


@router.put("/settings/general", response_model=GeneralSettings)
async def update_general_settings(payload: GeneralSettings):
    with get_db_session() as db:
        row = db.query(AppSettings).first()
        if not row:
            row = AppSettings()
            db.add(row)
        row.sync_enabled = payload.sync_enabled
        row.sync_interval_sec = max(60, int(payload.sync_interval_sec))
        row.require_sync_confirmation = payload.require_sync_confirmation
        row.validate_timestamps = payload.validate_timestamps
        db.commit()
        db.refresh(row)

    # Apply to running service
    # Update interval regardless; enforce min 60s
    sync_service.sync_interval = max(60, int(payload.sync_interval_sec))

    if payload.sync_enabled:
        # Ensure service is running
        if not sync_service.is_running:
            logger.info("Settings toggled ON: starting background sync service")
            await sync_service.start()
        else:
            logger.info("Settings updated: background sync already running; interval updated")
    else:
        if sync_service.is_running:
            logger.info("Settings toggled OFF: stopping background sync service")
            await sync_service.stop()
        else:
            logger.info("Settings updated: background sync already stopped")

    return payload
