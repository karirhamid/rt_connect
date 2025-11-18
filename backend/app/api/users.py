from fastapi import APIRouter, HTTPException
from typing import List
from app.models import User, UserCreate, ResponseMessage
from app.services import device_manager
import logging

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/", response_model=List[User])
async def get_users():
    """Get all users from the device"""
    try:
        users = device_manager.get_users()
        return users
    except Exception as e:
        logger.error(f"Error getting users: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/", response_model=ResponseMessage)
async def add_user(user: UserCreate):
    """Add a new user to the device"""
    try:
        device_manager.add_user(
            uid=user.uid,
            name=user.name,
            privilege=user.privilege,
            password=user.password,
            group_id=user.group_id,
            user_id=user.user_id,
            card=user.card
        )
        return ResponseMessage(
            success=True,
            message=f"User {user.name} added successfully",
            data={"uid": user.uid, "name": user.name}
        )
    except Exception as e:
        logger.error(f"Error adding user: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{uid}", response_model=ResponseMessage)
async def delete_user(uid: int):
    """Delete a user from the device"""
    try:
        device_manager.delete_user(uid)
        return ResponseMessage(
            success=True,
            message=f"User {uid} deleted successfully",
            data={"uid": uid}
        )
    except Exception as e:
        logger.error(f"Error deleting user: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
