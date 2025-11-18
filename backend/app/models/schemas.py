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


class DeviceConnection(BaseModel):
    ip: str
    port: int
    timeout: int = 10


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


class AttendanceQuery(BaseModel):
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    user_id: Optional[str] = None
