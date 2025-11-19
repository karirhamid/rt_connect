from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from sqlalchemy.ext.declarative import declarative_base
from datetime import datetime, timezone

Base = declarative_base()


class Company(Base):
    __tablename__ = "companies"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(255), nullable=False)
    code = Column(String(50), unique=True, nullable=False)
    address = Column(Text, nullable=True)
    phone = Column(String(50), nullable=True)
    email = Column(String(100), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    
    # Relationships
    departments = relationship("Department", back_populates="company", cascade="all, delete-orphan")
    employees = relationship("Employee", back_populates="company")


class Department(Base):
    __tablename__ = "departments"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    name = Column(String(255), nullable=False)
    code = Column(String(50), nullable=False)
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    
    # Relationships
    company = relationship("Company", back_populates="departments")
    positions = relationship("Position", back_populates="department", cascade="all, delete-orphan")
    employees = relationship("Employee", back_populates="department")


class Position(Base):
    __tablename__ = "positions"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    department_id = Column(Integer, ForeignKey("departments.id"), nullable=False)
    name = Column(String(255), nullable=False)
    code = Column(String(50), nullable=False)
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    
    # Relationships
    department = relationship("Department", back_populates="positions")
    employees = relationship("Employee", back_populates="position")


class Employee(Base):
    """
    Employee table that maps to ZKTeco device user structure.
    This combines organizational data (company/department/position) 
    with device-specific fields.
    """
    __tablename__ = "employees"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    
    # Organizational fields
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    department_id = Column(Integer, ForeignKey("departments.id"), nullable=False)
    position_id = Column(Integer, ForeignKey("positions.id"), nullable=True)
    
    # ZKTeco device fields (from device user structure)
    device_user_id = Column(Integer, nullable=False, index=True)  # uid from device
    user_id = Column(String(100), nullable=False, index=True)  # user_id string from device
    name = Column(String(255), nullable=False)
    privilege = Column(Integer, default=0)  # 0=User, 14=Admin
    password = Column(String(100), nullable=True)
    group_id = Column(String(50), nullable=True)
    card_number = Column(Integer, nullable=True)  # card field from device
    
    # Additional employee information
    email = Column(String(100), nullable=True)
    phone = Column(String(50), nullable=True)
    hire_date = Column(DateTime, nullable=True)
    birth_date = Column(DateTime, nullable=True)
    gender = Column(String(10), nullable=True)
    address = Column(Text, nullable=True)
    emergency_contact_name = Column(String(255), nullable=True)
    emergency_contact_phone = Column(String(50), nullable=True)
    
    # Status and metadata
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    synced_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    
    # Relationships
    company = relationship("Company", back_populates="employees")
    department = relationship("Department", back_populates="employees")
    position = relationship("Position", back_populates="employees")
    attendance = relationship("Attendance", back_populates="employee", cascade="all, delete-orphan")


class Device(Base):
    """Device metadata for ZKTeco devices"""
    __tablename__ = "devices"
    
    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    ip = Column(String, nullable=False)
    port = Column(Integer, nullable=False)
    tag = Column(String, nullable=True)
    serial_number = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)
    last_sync = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    
    # Relationships
    attendance = relationship("Attendance", back_populates="device", cascade="all, delete-orphan")
    sync_logs = relationship("SyncLog", back_populates="device", cascade="all, delete-orphan")


class Attendance(Base):
    """
    Attendance records from ZKTeco devices.
    Links to Employee table via device_user_id and user_id_str.
    """
    __tablename__ = "attendance"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    device_id = Column(String, ForeignKey("devices.id"), nullable=False)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=True)  # Link to employee
    
    # Device-specific fields
    uid = Column(Integer, nullable=False)
    user_id_str = Column(String, nullable=False)
    timestamp = Column(DateTime, nullable=False, index=True)
    status = Column(Integer, nullable=False)
    punch = Column(Integer, nullable=False)
    synced_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    
    # Relationships
    device = relationship("Device", back_populates="attendance")
    employee = relationship("Employee", back_populates="attendance")


class SyncLog(Base):
    """Track synchronization operations from devices"""
    __tablename__ = "sync_logs"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    device_id = Column(String, ForeignKey("devices.id"), nullable=False)
    sync_type = Column(String, nullable=False)  # 'users', 'attendance', 'full'
    status = Column(String, nullable=False)  # 'success', 'error', 'partial'
    records_synced = Column(Integer, default=0)
    error_message = Column(Text, nullable=True)
    started_at = Column(DateTime, nullable=False)
    completed_at = Column(DateTime, nullable=True)
    
    # Relationships
    device = relationship("Device", back_populates="sync_logs")
