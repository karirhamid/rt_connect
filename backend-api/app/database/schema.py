from sqlalchemy import Column, Integer, BigInteger, String, Boolean, DateTime, ForeignKey, Text, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.ext.declarative import declarative_base
from datetime import datetime, timezone

Base = declarative_base()


class Company(Base):
    __tablename__ = "companies"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(255), nullable=False)
    code = Column(String(50), unique=True, nullable=True)
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
    parent_id = Column(Integer, ForeignKey("departments.id"), nullable=True)  # Self-referencing for hierarchy
    name = Column(String(255), nullable=False)
    code = Column(String(50), nullable=True)
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    
    # Relationships
    company = relationship("Company", back_populates="departments")
    parent = relationship("Department", remote_side=[id], back_populates="children")
    children = relationship("Department", back_populates="parent", cascade="all, delete-orphan")
    positions = relationship("Position", back_populates="department", cascade="all, delete-orphan")
    employees = relationship("Employee", back_populates="department")


class Position(Base):
    __tablename__ = "positions"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    department_id = Column(Integer, ForeignKey("departments.id"), nullable=False)
    name = Column(String(255), nullable=False)
    code = Column(String(50), nullable=True)
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
    
    Uses composite_id as unique identifier: device prefix (last 3 digits of IP) + counter
    Example: Device 192.168.1.201 -> IDs 20101, 20102, 20103...
             Device 192.168.1.202 -> IDs 20201, 20202, 20203...
    """
    __tablename__ = "employees"
    __table_args__ = (
        UniqueConstraint("user_id", "source_device_id", name="uq_employee_userid_deviceid"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)  # Legacy ID, kept for compatibility
    composite_id = Column(BigInteger, unique=True, nullable=True, index=True)  # New composite key (device prefix + counter)

    # Organizational fields
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    department_id = Column(Integer, ForeignKey("departments.id"), nullable=False)
    position_id = Column(Integer, ForeignKey("positions.id"), nullable=True)

    # ZKTeco device fields (from device user structure)
    device_user_id = Column(Integer, nullable=False, index=True)  # uid from device
    user_id = Column(String(100), nullable=False, index=True)  # user_id string from device (can be duplicate across devices)
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
    source_device_id = Column(String, ForeignKey("devices.id"), nullable=True)  # Track which device this employee was synced from

    # Status and metadata
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    synced_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    # Relationships
    company = relationship("Company", back_populates="employees")
    department = relationship("Department", back_populates="employees")
    position = relationship("Position", back_populates="employees")
    source_device = relationship("Device", foreign_keys=[source_device_id])
    attendance = relationship("Attendance", back_populates="employee", cascade="all, delete-orphan")
    shift_assignments = relationship("EmployeeShift", back_populates="employee", cascade="all, delete-orphan")
    shift_exceptions = relationship("ShiftException", back_populates="employee", cascade="all, delete-orphan")
    schedule = relationship("EmployeeSchedule", back_populates="employee", cascade="all, delete-orphan")
    daily_shift_records = relationship("DailyShiftRecord", back_populates="employee", cascade="all, delete-orphan")


class Device(Base):
    """Device metadata for ZKTeco devices"""
    __tablename__ = "devices"
    
    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    ip = Column(String, nullable=False)
    port = Column(Integer, nullable=False)
    tag = Column(String, nullable=True)
    serial_number = Column(String, nullable=True)
    date_format = Column(String, nullable=True, default="YYYY-MM-DD")  # Date format used by device: YYYY-MM-DD, DD/MM/YYYY, MM/DD/YYYY
    is_active = Column(Boolean, default=True)
    last_sync = Column(DateTime, nullable=True)
    last_attendance_sync = Column(DateTime, nullable=True)  # Track last attendance sync for incremental updates
    last_seen_at = Column(DateTime, nullable=True)  # Last successful heartbeat / ping
    last_ping_at = Column(DateTime, nullable=True)  # Last heartbeat attempt (success or fail)
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
    __table_args__ = (
        # One punch from a given device for the same uid at the same instant
        # cannot legitimately occur twice. Concurrent syncs trying to insert
        # the same row will fail this constraint at the DB level — the sync
        # code uses ON CONFLICT DO NOTHING to skip them silently.
        UniqueConstraint("device_id", "uid", "timestamp", name="uq_attendance_device_uid_ts"),
    )

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
    # Provenance: device | manual | imported | corrected
    source = Column(String(16), nullable=False, server_default="device", default="device", index=True)

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


class AppSettings(Base):
    """Application-wide settings (single row)."""
    __tablename__ = "app_settings"

    id = Column(Integer, primary_key=True, autoincrement=True)
    sync_enabled = Column(Boolean, default=True, nullable=False)
    sync_interval_sec = Column(Integer, default=300, nullable=False)  # default 5 minutes
    require_sync_confirmation = Column(Boolean, default=True, nullable=False)  # Require confirmation before syncing data
    validate_timestamps = Column(Boolean, default=True, nullable=False)  # Validate and correct malformed timestamps
    timing_enabled = Column(Boolean, default=False, nullable=False)  # Enable timing/classification feature
    timing_mode = Column(String(20), default='off', nullable=False)  # off | employee | department | both
    attendance_mode = Column(String(20), default='simple', nullable=False)  # simple | strict
    employee_mode = Column(String(20), default='shared', nullable=False)  # shared | separate
    pdf_style = Column(String(20), default='style1', nullable=False)  # style1 | style2
    pdf_show_overtime = Column(Boolean, default=True, nullable=False)  # Show overtime column in PDF
    pdf_show_total_worked = Column(Boolean, default=True, nullable=False)  # Show total worked column in PDF
    punch_merge_window_min = Column(Integer, default=5, nullable=False)    # Merge punches within N min (0 = disabled)

    # Branding (shown on login + sidebar)
    app_name    = Column(String(100), nullable=True, default='RTPointage')
    client_name = Column(String(255), nullable=True)  # The customer org using this install

    # Device heartbeat (network ping to verify devices are reachable)
    device_heartbeat_enabled      = Column(Boolean, default=True,  nullable=False)
    device_heartbeat_interval_sec = Column(Integer, default=300,   nullable=False)  # 5 min

    # External backup storage destination (SMB / S3 / SFTP / ...)
    # backup_storage_type   : 'none' | 'smb' (more types later)
    # backup_storage_config : JSON string with type-specific fields
    backup_storage_type   = Column(String(20),  default='none',  nullable=False)
    backup_storage_config = Column(Text,        nullable=True)

    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


# ── Email & Scheduled Reports ─────────────────────────────────────────────────

class EmailSettings(Base):
    """SMTP configuration — single row."""
    __tablename__ = 'email_settings'

    id           = Column(Integer, primary_key=True, autoincrement=True)
    is_enabled   = Column(Boolean, default=False, nullable=False)
    host         = Column(String(255), nullable=True)
    port         = Column(Integer, default=587, nullable=False)
    username     = Column(String(255), nullable=True)
    password     = Column(String(500), nullable=True)   # stored as-is; use env secrets in prod
    use_tls      = Column(Boolean, default=True, nullable=False)
    use_ssl      = Column(Boolean, default=False, nullable=False)
    from_name    = Column(String(255), nullable=True)
    from_address = Column(String(255), nullable=True)
    updated_at   = Column(DateTime, default=lambda: datetime.now(timezone.utc),
                          onupdate=lambda: datetime.now(timezone.utc))


class ReportSchedule(Base):
    """Automated report schedule with email template."""
    __tablename__ = 'report_schedules'

    id            = Column(Integer, primary_key=True, autoincrement=True)
    name          = Column(String(255), nullable=False)
    is_active     = Column(Boolean, default=True, nullable=False)

    # ── When to send ──────────────────────────────────────────────────────────
    # schedule_type: daily | weekly | monthly_day | monthly_last
    schedule_type = Column(String(20), nullable=False, default='daily')
    send_hour     = Column(Integer, default=20, nullable=False)   # 0–23
    send_minute   = Column(Integer, default=0,  nullable=False)   # 0–59
    week_day      = Column(Integer, nullable=True)                # 0=Mon … 6=Sun (weekly only)
    month_day     = Column(Integer, nullable=True)                # 1–31 (monthly_day only)

    # ── What data to include ──────────────────────────────────────────────────
    # data_period: today | yesterday | current_week | last_week | current_month | last_month
    data_period   = Column(String(30), nullable=False, default='yesterday')
    device_ids    = Column(Text, nullable=True)       # JSON [id, ...] or NULL = all devices
    company_id    = Column(Integer, nullable=True)
    department_id = Column(Integer, nullable=True)
    language      = Column(String(10), default='fr', nullable=False)
    group_by      = Column(String(20), nullable=True, default='employee')  # employee | date | department | none

    # ── Email template ────────────────────────────────────────────────────────
    # Supports {{variables}}: company_name, period_label, period_type,
    #   total_employees, total_records, generated_at, send_date,
    #   report_date (daily), week_start/week_end (weekly),
    #   month_name/year (monthly)
    email_subject = Column(String(500), nullable=True)
    email_body    = Column(Text, nullable=True)       # HTML

    # ── Recipients ────────────────────────────────────────────────────────────
    recipients    = Column(Text, nullable=False, default='[]')   # JSON ["a@b.com", ...]

    # ── Tracking ──────────────────────────────────────────────────────────────
    last_run_at   = Column(DateTime, nullable=True)
    next_run_at   = Column(DateTime, nullable=True)
    created_at    = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at    = Column(DateTime, default=lambda: datetime.now(timezone.utc),
                           onupdate=lambda: datetime.now(timezone.utc))

    logs = relationship('ReportScheduleLog', back_populates='schedule',
                        cascade='all, delete-orphan', order_by='ReportScheduleLog.executed_at.desc()')


class ReportScheduleLog(Base):
    """Execution history for a report schedule."""
    __tablename__ = 'report_schedule_logs'

    id               = Column(Integer, primary_key=True, autoincrement=True)
    schedule_id      = Column(Integer, ForeignKey('report_schedules.id', ondelete='CASCADE'), nullable=False)
    executed_at      = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    status           = Column(String(20), nullable=False)   # success | failed
    error_message    = Column(Text, nullable=True)
    recipients_count = Column(Integer, default=0)
    period_start     = Column(DateTime, nullable=True)
    period_end       = Column(DateTime, nullable=True)

    schedule = relationship('ReportSchedule', back_populates='logs')


# RBAC Models: Users, Roles, Permissions
from sqlalchemy import Table

user_roles = Table(
    'user_roles', Base.metadata,
    Column('user_id', Integer, ForeignKey('users.id', ondelete='CASCADE'), primary_key=True),
    Column('role_id', Integer, ForeignKey('roles.id', ondelete='CASCADE'), primary_key=True)
)

role_permissions = Table(
    'role_permissions', Base.metadata,
    Column('role_id', Integer, ForeignKey('roles.id', ondelete='CASCADE'), primary_key=True),
    Column('permission_id', Integer, ForeignKey('permissions.id', ondelete='CASCADE'), primary_key=True)
)


class User(Base):
    __tablename__ = 'users'
    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(80), unique=True, nullable=False, index=True)
    email = Column(String(120), unique=True, nullable=True, index=True)
    password_hash = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    roles = relationship('Role', secondary=user_roles, back_populates='users')


class Role(Base):
    __tablename__ = 'roles'
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(80), unique=True, nullable=False)
    description = Column(Text, nullable=True)

    users = relationship('User', secondary=user_roles, back_populates='roles')
    permissions = relationship('Permission', secondary=role_permissions, back_populates='roles')


class Permission(Base):
    __tablename__ = 'permissions'
    id = Column(Integer, primary_key=True, autoincrement=True)
    code = Column(String(150), unique=True, nullable=False, index=True)
    description = Column(Text, nullable=True)

    roles = relationship('Role', secondary=role_permissions, back_populates='permissions')


class Anomaly(Base):
    """Flagged punch / day with integrity issue, surfaces in anomaly inbox."""
    __tablename__ = 'anomalies'
    __table_args__ = (
        UniqueConstraint('kind', 'attendance_id', 'employee_id', 'day', name='uq_anomaly_dedupe'),
    )

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False, index=True)
    kind = Column(String(40), nullable=False, index=True)
    # kind ∈ future_timestamp | before_hire | inactive_employee | unmatched_user
    #        | orphan_in | orphan_out | odd_hours | duplicate_minute
    #        | huge_gap | merged_cluster_large | multi_device_same_minute
    severity = Column(String(10), nullable=False, default='warn')  # info|warn|critical
    attendance_id = Column(Integer, ForeignKey('attendance.id', ondelete='SET NULL'), nullable=True, index=True)
    employee_id = Column(Integer, ForeignKey('employees.id', ondelete='SET NULL'), nullable=True, index=True)
    device_id = Column(String, ForeignKey('devices.id', ondelete='SET NULL'), nullable=True)
    day = Column(DateTime, nullable=True, index=True)
    detail = Column(Text, nullable=True)  # short human description
    status = Column(String(16), nullable=False, default='open', index=True)  # open|ack|ignored|resolved
    resolved_by = Column(Integer, ForeignKey('users.id'), nullable=True)
    resolved_at = Column(DateTime, nullable=True)
    resolution_note = Column(Text, nullable=True)


class AdminAuditLog(Base):
    """One row per non-GET admin action — append-only, read via UI."""
    __tablename__ = 'admin_audit_log'

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=True, index=True)
    username = Column(String(150), nullable=True)
    ip = Column(String(64), nullable=True)
    method = Column(String(10), nullable=False)
    path = Column(String(500), nullable=False, index=True)
    status_code = Column(Integer, nullable=True)
    action = Column(String(120), nullable=True)  # human label, optional
    payload = Column(Text, nullable=True)        # JSON-encoded request body (truncated)
    extra = Column(Text, nullable=True)          # JSON-encoded notes (before/after, etc.)
