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


@router.get("/settings/general", response_model=GeneralSettings)
async def get_general_settings():
    with get_db_session() as db:
        row = db.query(AppSettings).first()
        if not row:
            row = AppSettings(require_sync_confirmation=True, validate_timestamps=True)
            db.add(row)
            db.commit()
            db.refresh(row)
        return GeneralSettings(
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
        row.require_sync_confirmation = payload.require_sync_confirmation
        row.validate_timestamps = payload.validate_timestamps
        db.commit()
        db.refresh(row)

    logger.info("Sync settings saved")
    return payload
