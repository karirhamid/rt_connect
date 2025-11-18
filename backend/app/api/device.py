from fastapi import APIRouter, HTTPException
from typing import List
from app.models import DeviceInfo, User, Attendance, ResponseMessage, UserCreate
from app.services import device_manager
import logging

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/info", response_model=DeviceInfo)
async def get_device_info():
    """Get device information including user count, attendance count, etc."""
    try:
        device_info = device_manager.get_device_info()
        return device_info
    except Exception as e:
        logger.error(f"Error getting device info: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/enable", response_model=ResponseMessage)
async def enable_device():
    """Enable (unlock) the device"""
    try:
        device_manager.enable_device()
        return ResponseMessage(success=True, message="Device enabled successfully")
    except Exception as e:
        logger.error(f"Error enabling device: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/disable", response_model=ResponseMessage)
async def disable_device():
    """Disable (lock) the device"""
    try:
        device_manager.disable_device()
        return ResponseMessage(success=True, message="Device disabled successfully")
    except Exception as e:
        logger.error(f"Error disabling device: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/restart", response_model=ResponseMessage)
async def restart_device():
    """Restart the device"""
    try:
        device_manager.restart_device()
        return ResponseMessage(success=True, message="Device restart command sent")
    except Exception as e:
        logger.error(f"Error restarting device: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/poweroff", response_model=ResponseMessage)
async def poweroff_device():
    """Power off the device"""
    try:
        device_manager.poweroff_device()
        return ResponseMessage(success=True, message="Device poweroff command sent")
    except Exception as e:
        logger.error(f"Error powering off device: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/test-voice/{index}", response_model=ResponseMessage)
async def test_voice(index: int = 0):
    """Test voice on the device"""
    try:
        device_manager.test_voice(index)
        return ResponseMessage(success=True, message=f"Voice test {index} executed")
    except Exception as e:
        logger.error(f"Error testing voice: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
