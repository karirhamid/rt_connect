from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Boolean, Text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from datetime import datetime

Base = declarative_base()


class Device(Base):
    __tablename__ = "devices"
    
    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    ip = Column(String, nullable=False)
    port = Column(Integer, nullable=False)
    tag = Column(String, nullable=True)
    serial_number = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)
    last_sync = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    users = relationship("User", back_populates="device", cascade="all, delete-orphan")
    attendance = relationship("Attendance", back_populates="device", cascade="all, delete-orphan")


class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    device_id = Column(String, ForeignKey("devices.id"), nullable=False)
    uid = Column(Integer, nullable=False)
    name = Column(String, nullable=False)
    privilege = Column(Integer, default=0)
    password = Column(String, nullable=True)
    group_id = Column(String, nullable=True)
    user_id = Column(String, nullable=False)
    card = Column(Integer, nullable=True)
    synced_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    device = relationship("Device", back_populates="users")
    attendance = relationship("Attendance", back_populates="user", cascade="all, delete-orphan")


class Attendance(Base):
    __tablename__ = "attendance"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    device_id = Column(String, ForeignKey("devices.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    uid = Column(Integer, nullable=False)
    user_id_str = Column(String, nullable=False)
    timestamp = Column(DateTime, nullable=False)
    status = Column(Integer, nullable=False)
    punch = Column(Integer, nullable=False)
    synced_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    device = relationship("Device", back_populates="attendance")
    user = relationship("User", back_populates="attendance")


class SyncLog(Base):
    __tablename__ = "sync_logs"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    device_id = Column(String, ForeignKey("devices.id"), nullable=False)
    sync_type = Column(String, nullable=False)  # 'users', 'attendance', 'full'
    status = Column(String, nullable=False)  # 'success', 'error', 'partial'
    records_synced = Column(Integer, default=0)
    error_message = Column(Text, nullable=True)
    started_at = Column(DateTime, nullable=False)
    completed_at = Column(DateTime, nullable=True)
