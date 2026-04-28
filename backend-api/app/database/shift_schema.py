"""
Shift Management Database Schema
Handles shifts, schedules, holidays, and employee assignments
"""
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text, Time, Date, Enum as SQLEnum, UniqueConstraint
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
import enum

from .schema import Base


class ShiftType(str, enum.Enum):
    """Types of shifts"""
    REGULAR = "regular"
    NIGHT = "night"
    WEEKEND = "weekend"
    GUARD = "guard"
    HOLIDAY = "holiday"
    AID = "aid"


class HolidayType(str, enum.Enum):
    """Types of holidays"""
    PUBLIC_HOLIDAY = "public_holiday"
    AID = "aid"
    NATIONAL_DAY = "national_day"
    CUSTOM = "custom"


class Shift(Base):
    """
    Shift definitions (e.g., Morning Shift, Night Shift, etc.)
    """
    __tablename__ = "shifts"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(255), nullable=False)
    shift_type = Column(SQLEnum(ShiftType), nullable=False, default=ShiftType.REGULAR)
    color = Column(String(7), nullable=False, default="#3B82F6")  # Hex color for UI
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    
    # Relationships
    timings = relationship("ShiftTiming", back_populates="shift", cascade="all, delete-orphan")
    employee_assignments = relationship("EmployeeShift", back_populates="shift")
    exceptions_as_original = relationship("ShiftException", foreign_keys="ShiftException.original_shift_id", back_populates="original_shift")
    exceptions_as_exception = relationship("ShiftException", foreign_keys="ShiftException.exception_shift_id", back_populates="exception_shift")


class ShiftTiming(Base):
    """
    Timing details for shifts (can vary by day of week)
    """
    __tablename__ = "shift_timings"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    shift_id = Column(Integer, ForeignKey("shifts.id"), nullable=False)
    
    # Day of week: 0=Monday, 1=Tuesday, ..., 6=Sunday
    # NULL means applies to all days (unless overridden)
    day_of_week = Column(Integer, nullable=True)
    
    start_time = Column(Time, nullable=False)
    end_time = Column(Time, nullable=False)
    break_duration_minutes = Column(Integer, default=0)
    
    # For shifts that span midnight (e.g., 22:00 to 06:00)
    is_overnight = Column(Boolean, default=False)
    
    # Grace periods
    late_grace_minutes = Column(Integer, default=15)  # Late after this many minutes
    early_leave_grace_minutes = Column(Integer, default=15)
    
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    
    # Relationships
    shift = relationship("Shift", back_populates="timings")


class EmployeeShift(Base):
    """
    Assignment of shifts to employees with effective date ranges
    """
    __tablename__ = "employee_shifts"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False)
    shift_id = Column(Integer, ForeignKey("shifts.id"), nullable=False)
    
    effective_from = Column(Date, nullable=False)
    effective_to = Column(Date, nullable=True)  # NULL means ongoing
    
    assigned_by = Column(String(255), nullable=True)  # Username or system
    notes = Column(Text, nullable=True)
    
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    
    # Relationships
    from .schema import Employee
    employee = relationship("Employee", back_populates="shift_assignments")
    shift = relationship("Shift", back_populates="employee_assignments")


class Holiday(Base):
    """
    Holiday calendar (public holidays, Aids, etc.)
    """
    __tablename__ = "holidays"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(255), nullable=False)
    date = Column(Date, nullable=False, unique=True, index=True)
    holiday_type = Column(SQLEnum(HolidayType), nullable=False, default=HolidayType.PUBLIC_HOLIDAY)
    
    is_paid = Column(Boolean, default=True)
    country = Column(String(2), default="MA")  # ISO country code
    region = Column(String(100), nullable=True)  # For regional holidays
    
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    
    # Relationships
    shift_exceptions = relationship("ShiftException", back_populates="holiday")


class ShiftException(Base):
    """
    Exceptions to regular shift schedules (one-time changes, holiday shifts, etc.)
    """
    __tablename__ = "shift_exceptions"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False)
    
    # Original shift (if changing from regular shift)
    original_shift_id = Column(Integer, ForeignKey("shifts.id"), nullable=True)
    
    # Exception shift (if working different shift), NULL means day off
    exception_shift_id = Column(Integer, ForeignKey("shifts.id"), nullable=True)
    
    exception_date = Column(Date, nullable=False, index=True)
    
    # Link to holiday if exception is due to holiday
    holiday_id = Column(Integer, ForeignKey("holidays.id"), nullable=True)
    
    reason = Column(Text, nullable=True)
    approved_by = Column(String(255), nullable=True)
    
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    
    # Relationships
    from .schema import Employee
    employee = relationship("Employee", back_populates="shift_exceptions")
    original_shift = relationship("Shift", foreign_keys=[original_shift_id], back_populates="exceptions_as_original")
    exception_shift = relationship("Shift", foreign_keys=[exception_shift_id], back_populates="exceptions_as_exception")
    holiday = relationship("Holiday", back_populates="shift_exceptions")


class DetectionMethod(str, enum.Enum):
    """How the shift was determined for a given day"""
    SCHEDULE = "schedule"       # From employee_schedules personal schedule
    ASSIGNED = "assigned"       # From employee_shifts assignment
    AUTO = "auto"               # Auto-detected from first punch
    NONE = "none"               # No shift could be determined


class EmployeeSchedule(Base):
    """
    Per-employee custom work timing, one row per day of week.
    Overrides department schedule when present.
    day_of_week: 0=Monday, 1=Tuesday, ..., 6=Sunday
    """
    __tablename__ = "employee_schedules"

    id = Column(Integer, primary_key=True, autoincrement=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False)
    day_of_week = Column(Integer, nullable=False)       # 0=Mon .. 6=Sun

    is_day_off = Column(Boolean, default=False)          # True = not working this day
    work_start = Column(Time, nullable=True)             # e.g. 07:00
    work_end = Column(Time, nullable=True)               # e.g. 16:00
    has_break = Column(Boolean, default=False)
    break_start = Column(Time, nullable=True)            # e.g. 13:00
    break_end = Column(Time, nullable=True)              # e.g. 14:00

    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        UniqueConstraint("employee_id", "day_of_week", name="uq_employee_schedule_day"),
    )

    # Relationships
    from .schema import Employee
    employee = relationship("Employee", back_populates="schedule")


class DepartmentSchedule(Base):
    """
    Per-department default work timing, one row per day of week.
    Used as template when employee has no personal schedule.
    day_of_week: 0=Monday, 1=Tuesday, ..., 6=Sunday
    """
    __tablename__ = "department_schedules"

    id = Column(Integer, primary_key=True, autoincrement=True)
    department_id = Column(Integer, ForeignKey("departments.id"), nullable=False)
    day_of_week = Column(Integer, nullable=False)       # 0=Mon .. 6=Sun

    is_day_off = Column(Boolean, default=False)
    work_start = Column(Time, nullable=True)
    work_end = Column(Time, nullable=True)
    has_break = Column(Boolean, default=False)
    break_start = Column(Time, nullable=True)
    break_end = Column(Time, nullable=True)

    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        UniqueConstraint("department_id", "day_of_week", name="uq_department_schedule_day"),
    )

    # Relationships
    from .schema import Department
    department = relationship("Department", backref="schedules")


class DailyShiftRecord(Base):
    """
    Cached/locked shift assignment per employee per day.
    Once the first punch of the day determines the shift, it is locked here
    so subsequent punches are classified against the same schedule.
    """
    __tablename__ = "daily_shift_records"

    id = Column(Integer, primary_key=True, autoincrement=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False)
    date = Column(Date, nullable=False, index=True)

    shift_id = Column(Integer, ForeignKey("shifts.id"), nullable=True)
    detection_method = Column(SQLEnum(DetectionMethod), nullable=False, default=DetectionMethod.NONE)

    # Effective times for this day (copied from schedule/shift at detection time)
    work_start = Column(Time, nullable=True)
    work_end = Column(Time, nullable=True)
    break_start = Column(Time, nullable=True)
    break_end = Column(Time, nullable=True)

    locked = Column(Boolean, default=True)

    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        UniqueConstraint("employee_id", "date", name="uq_employee_day"),
    )

    # Relationships
    from .schema import Employee
    employee = relationship("Employee", back_populates="daily_shift_records")
    shift = relationship("Shift")


# Update Employee model to include shift relationships
# This should be added to the Employee class in schema.py:
# shift_assignments = relationship("EmployeeShift", back_populates="employee", cascade="all, delete-orphan")
# shift_exceptions = relationship("ShiftException", back_populates="employee", cascade="all, delete-orphan")
