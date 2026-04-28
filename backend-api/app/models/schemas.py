from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class DeviceInfo(BaseModel):
    serial_number: str
    device_name: str
    firmware_version: str
    platform: str
    fingerprint_count: int
    user_count: int
    face_count: int
    attendance_count: int
    ip_address: str
    mac_address: str
    date_format: str = "YYYY-MM-DD"  # Detected date format: YYYY-MM-DD, DD/MM/YYYY, MM/DD/YYYY


class User(BaseModel):
    uid: int
    name: str
    privilege: int
    password: Optional[str] = None
    group_id: str
    user_id: str
    card: Optional[int] = None


class Attendance(BaseModel):
    uid: int
    user_id: str
    timestamp: datetime
    status: int
    punch: int


class ResponseMessage(BaseModel):
    success: bool
    message: str
    data: Optional[dict] = None


class UserCreate(BaseModel):
    uid: int
    name: str
    privilege: int = 0
    password: str = ""
    group_id: str = ""
    user_id: str
    card: int = 0
