"""
Pydantic schemas for Shift Management API
"""
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, date, time
from enum import Enum


class ShiftType(str, Enum):
    """Types of shifts"""
    REGULAR = "regular"
    NIGHT = "night"
    WEEKEND = "weekend"
    GUARD = "guard"
    HOLIDAY = "holiday"
    AID = "aid"


class HolidayType(str, Enum):
    """Types of holidays"""
    PUBLIC_HOLIDAY = "public_holiday"
    AID = "aid"
    NATIONAL_DAY = "national_day"
    CUSTOM = "custom"


# Shift Timing Schemas
class ShiftTimingBase(BaseModel):
    day_of_week: Optional[int] = Field(None, ge=0, le=6, description="0=Monday, 6=Sunday, None=All days")
    start_time: time
    end_time: time
    break_duration_minutes: int = Field(default=0, ge=0)
    is_overnight: bool = False
    late_grace_minutes: int = Field(default=15, ge=0)
    early_leave_grace_minutes: int = Field(default=15, ge=0)


class ShiftTimingCreate(ShiftTimingBase):
    pass


class ShiftTimingUpdate(BaseModel):
    day_of_week: Optional[int] = Field(None, ge=0, le=6)
    start_time: Optional[time] = None
    end_time: Optional[time] = None
    break_duration_minutes: Optional[int] = Field(None, ge=0)
    is_overnight: Optional[bool] = None
    late_grace_minutes: Optional[int] = Field(None, ge=0)
    early_leave_grace_minutes: Optional[int] = Field(None, ge=0)


class ShiftTimingResponse(ShiftTimingBase):
    id: int
    shift_id: int
    created_at: datetime

    class Config:
        from_attributes = True


# Shift Schemas
class ShiftBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    shift_type: ShiftType = ShiftType.REGULAR
    color: str = Field(default="#3B82F6", pattern="^#[0-9A-Fa-f]{6}$")
    description: Optional[str] = None
    is_active: bool = True


class ShiftCreate(ShiftBase):
    timings: Optional[List[ShiftTimingCreate]] = []


class ShiftUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    shift_type: Optional[ShiftType] = None
    color: Optional[str] = Field(None, pattern="^#[0-9A-Fa-f]{6}$")
    description: Optional[str] = None
    is_active: Optional[bool] = None


class ShiftResponse(ShiftBase):
    id: int
    created_at: datetime
    updated_at: datetime
    timings: List[ShiftTimingResponse] = []

    class Config:
        from_attributes = True


class ShiftListResponse(BaseModel):
    id: int
    name: str
    shift_type: ShiftType
    color: str
    is_active: bool

    class Config:
        from_attributes = True


# Employee Shift Assignment Schemas
class EmployeeShiftBase(BaseModel):
    employee_id: int
    shift_id: int
    effective_from: date
    effective_to: Optional[date] = None
    notes: Optional[str] = None


class EmployeeShiftCreate(BaseModel):
    shift_id: int
    effective_from: date
    effective_to: Optional[date] = None
    assigned_by: Optional[str] = None
    notes: Optional[str] = None


class EmployeeShiftUpdate(BaseModel):
    shift_id: Optional[int] = None
    effective_from: Optional[date] = None
    effective_to: Optional[date] = None
    notes: Optional[str] = None


class EmployeeShiftResponse(EmployeeShiftBase):
    id: int
    assigned_by: Optional[str]
    created_at: datetime
    updated_at: datetime
    shift: ShiftListResponse

    class Config:
        from_attributes = True


class BulkShiftAssignment(BaseModel):
    employee_ids: List[int]
    shift_id: int
    effective_from: date
    effective_to: Optional[date] = None
    assigned_by: Optional[str] = None
    notes: Optional[str] = None


# Holiday Schemas
class HolidayBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    date: date
    holiday_type: HolidayType = HolidayType.PUBLIC_HOLIDAY
    is_paid: bool = True
    country: str = Field(default="MA", max_length=2)
    region: Optional[str] = Field(None, max_length=100)
    description: Optional[str] = None


class HolidayCreate(HolidayBase):
    pass


class HolidayUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    date: Optional[date] = None
    holiday_type: Optional[HolidayType] = None
    is_paid: Optional[bool] = None
    country: Optional[str] = Field(None, max_length=2)
    region: Optional[str] = Field(None, max_length=100)
    description: Optional[str] = None


class HolidayResponse(HolidayBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


# Shift Exception Schemas
class ShiftExceptionBase(BaseModel):
    employee_id: int
    exception_date: date
    original_shift_id: Optional[int] = None
    exception_shift_id: Optional[int] = None
    holiday_id: Optional[int] = None
    reason: Optional[str] = None


class ShiftExceptionCreate(BaseModel):
    exception_date: date
    original_shift_id: Optional[int] = None
    exception_shift_id: Optional[int] = None
    holiday_id: Optional[int] = None
    reason: Optional[str] = None
    approved_by: Optional[str] = None


class ShiftExceptionUpdate(BaseModel):
    exception_date: Optional[date] = None
    original_shift_id: Optional[int] = None
    exception_shift_id: Optional[int] = None
    holiday_id: Optional[int] = None
    reason: Optional[str] = None
    approved_by: Optional[str] = None


class ShiftExceptionResponse(ShiftExceptionBase):
    id: int
    approved_by: Optional[str]
    created_at: datetime
    updated_at: datetime
    original_shift: Optional[ShiftListResponse] = None
    exception_shift: Optional[ShiftListResponse] = None

    class Config:
        from_attributes = True


# Employee Schedule View
class EmployeeScheduleDay(BaseModel):
    date: date
    shift: Optional[ShiftResponse] = None
    is_holiday: bool = False
    holiday_name: Optional[str] = None
    is_exception: bool = False
    exception_reason: Optional[str] = None


class EmployeeScheduleResponse(BaseModel):
    employee_id: int
    employee_name: str
    current_shift: Optional[ShiftResponse] = None
    schedule: List[EmployeeScheduleDay]
