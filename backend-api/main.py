from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
import logging
from contextlib import asynccontextmanager
from app.core import settings
from app.api.users import router as users_router
from app.api.attendance import router as attendance_router
from app.api import auth as auth_module
from app.api.devices import router as devices_router
from app.api.organization import router as organization_router
from app.api.shifts import router as shifts_router
from app.api.employee_shifts import router as employee_shifts_router
from app.api.holidays import router as holidays_router
from app.api.settings import router as settings_router
from app.api.reports import router as reports_router
from app.api.maintenance import router as maintenance_router
from app.api.employee_schedules import router as employee_schedules_router
from app.api.email_settings import router as email_settings_router
from app.api.report_schedules import router as report_schedules_router
from app.api.audit import router as audit_router
from app.api.anomalies import router as anomalies_router
from app.api.corrections import router as corrections_router
from app.api.payroll_export import router as payroll_export_router
from app.api.employee_portal import router as employee_portal_router
from app.database import init_db
from app.database.connection import get_db_session
from app.database.schema import AppSettings

# Configure logging
logging.basicConfig(
    level=logging.DEBUG,  # Changed to DEBUG for more detailed logging
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events"""
    # Startup
    logger.info("Initializing database...")
    init_db()
    logger.info("Database initialized")

    # Auto-migrate: add columns that may not exist in older databases
    try:
        from app.database.connection import engine
        with engine.connect() as conn:
            sa_text = __import__('sqlalchemy').text
            conn.execute(sa_text(
                "ALTER TABLE report_schedules ADD COLUMN IF NOT EXISTS group_by VARCHAR(20) DEFAULT 'employee'"
            ))
            conn.execute(sa_text(
                "ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS app_name VARCHAR(100) DEFAULT 'RTPointage'"
            ))
            conn.execute(sa_text(
                "ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS client_name VARCHAR(255)"
            ))
            conn.execute(sa_text(
                "ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS device_heartbeat_enabled BOOLEAN DEFAULT TRUE"
            ))
            conn.execute(sa_text(
                "ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS device_heartbeat_interval_sec INTEGER DEFAULT 300"
            ))
            conn.execute(sa_text(
                "ALTER TABLE devices ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMP"
            ))
            conn.execute(sa_text(
                "ALTER TABLE devices ADD COLUMN IF NOT EXISTS last_ping_at TIMESTAMP"
            ))
            conn.execute(sa_text(
                "ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS backup_storage_type VARCHAR(20) DEFAULT 'none'"
            ))
            conn.execute(sa_text(
                "ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS backup_storage_config TEXT"
            ))
            conn.execute(sa_text(
                "ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS punch_merge_window_min INTEGER DEFAULT 5"
            ))
            # Phase A — punch source tracking
            conn.execute(sa_text(
                "ALTER TABLE attendance ADD COLUMN IF NOT EXISTS source VARCHAR(16) NOT NULL DEFAULT 'device'"
            ))
            conn.execute(sa_text(
                "CREATE INDEX IF NOT EXISTS ix_attendance_source ON attendance(source)"
            ))
            # Phase C — corrections
            conn.execute(sa_text(
                "ALTER TABLE attendance ADD COLUMN IF NOT EXISTS voided_by_correction_id BIGINT"
            ))
            conn.execute(sa_text(
                "CREATE INDEX IF NOT EXISTS ix_attendance_voided ON attendance(voided_by_correction_id)"
            ))
            # Phase F — employee portal PIN
            conn.execute(sa_text(
                "ALTER TABLE employees ADD COLUMN IF NOT EXISTS portal_pin_hash VARCHAR(255)"
            ))
            # Phase D — device health alert recipient
            conn.execute(sa_text(
                "ALTER TABLE email_settings ADD COLUMN IF NOT EXISTS alerts_enabled BOOLEAN DEFAULT FALSE NOT NULL"
            ))
            conn.execute(sa_text(
                "ALTER TABLE email_settings ADD COLUMN IF NOT EXISTS alerts_recipient_email VARCHAR(255)"
            ))
            # Add suppression timestamps so we don't spam (one alert per device per hour)
            conn.execute(sa_text("""
                CREATE TABLE IF NOT EXISTS device_alert_state (
                    device_id   VARCHAR PRIMARY KEY,
                    last_offline_alert TIMESTAMP,
                    last_state         VARCHAR(16)
                )
            """))
            # Phase B — anomalies inbox (table created by metadata.create_all,
            # but ensure unique constraint is in place even on existing schemas)
            conn.execute(sa_text("""
                DO $$ BEGIN
                    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='uq_anomaly_dedupe') THEN
                        BEGIN
                            ALTER TABLE anomalies
                            ADD CONSTRAINT uq_anomaly_dedupe UNIQUE (kind, attendance_id, employee_id, day);
                        EXCEPTION WHEN undefined_table THEN
                            -- table does not exist yet; create_all will handle it
                            NULL;
                        END;
                    END IF;
                END $$;
            """))
            conn.commit()

        # Dedupe attendance + add unique constraint (idempotent).
        # Earlier versions had a check-then-insert race condition: two
        # concurrent syncs (e.g. scheduler auto-sync + manual UI sync) could
        # each insert the same row. We collapse any existing duplicates,
        # keeping the LOWEST id, then add a unique constraint so it can't
        # happen again. The sync code uses ON CONFLICT DO NOTHING from now on.
        with engine.connect() as conn:
            res = conn.execute(sa_text("""
                SELECT to_regclass('public.attendance') IS NOT NULL AS exists,
                       EXISTS (
                           SELECT 1 FROM pg_constraint
                           WHERE conname = 'uq_attendance_device_uid_ts'
                       ) AS has_uq
            """)).first()
            if res and res.exists:
                if not res.has_uq:
                    deleted = conn.execute(sa_text("""
                        DELETE FROM attendance a USING attendance b
                        WHERE a.id > b.id
                          AND a.device_id = b.device_id
                          AND a.uid       = b.uid
                          AND a.timestamp = b.timestamp
                    """)).rowcount
                    if deleted:
                        logger.warning(f"Removed {deleted} duplicate attendance row(s) before adding unique constraint")
                    conn.execute(sa_text(
                        "ALTER TABLE attendance ADD CONSTRAINT uq_attendance_device_uid_ts "
                        "UNIQUE (device_id, uid, timestamp)"
                    ))
                    logger.info("Added uq_attendance_device_uid_ts constraint on attendance")
                    conn.commit()
    except Exception as e:
        logger.warning(f"Auto-migration warning (safe to ignore on fresh DB): {e}")

    # Recompute next_run_at for all active schedules so the timezone fix
    # (send_hour/minute now treated as local time, not UTC) takes effect on
    # existing rows. Without this, old next_run_at values stay wrong.
    try:
        from app.database.schema import ReportSchedule
        from app.api.report_schedules import _calc_next
        with get_db_session() as db:
            for sch in db.query(ReportSchedule).filter(ReportSchedule.is_active == True).all():
                sch.next_run_at = _calc_next(sch)
            db.commit()
        logger.info("Recomputed next_run_at for all active schedules")
    except Exception as e:
        logger.warning(f"Could not recompute next_run_at: {e}")

    # Ensure default app settings exist
    with get_db_session() as db:
        settings_row = db.query(AppSettings).first()
        if not settings_row:
            settings_row = AppSettings(require_sync_confirmation=True, validate_timestamps=True)
            db.add(settings_row)
            db.commit()
            db.refresh(settings_row)
            logger.info("Created default AppSettings")

    # Seed default permissions, roles, and users
    try:
        from app.database.schema import Permission, Role, User
        from app.core.security import get_password_hash
        with get_db_session() as db:
            # Full permission set
            default_perms = [
                ('users.create',     'Create system users'),
                ('users.read',       'View system users'),
                ('users.update',     'Edit system users'),
                ('users.delete',     'Delete system users'),
                ('roles.read',       'View roles'),
                ('roles.manage',     'Create and edit roles'),
                ('devices.manage',   'Add, edit and delete devices'),
                ('devices.sync',     'Sync users and logs from devices'),
                ('attendance.read',  'View attendance records'),
                ('reports.view',     'Generate and view reports'),
                ('settings.manage',  'Manage application settings'),
                ('shifts.manage',    'Manage shifts and schedules'),
                ('employees.manage', 'Add, edit and delete employees'),
            ]
            for code, desc in default_perms:
                if not db.query(Permission).filter(Permission.code == code).first():
                    db.add(Permission(code=code, description=desc))
            db.commit()

            def _get_perms(codes):
                return db.query(Permission).filter(Permission.code.in_(codes)).all()

            # ── Super Admin (Administrator) — full access ──────────────────
            super_role = db.query(Role).filter(Role.name == 'Administrator').first()
            if not super_role:
                super_role = Role(name='Administrator', description='Super Admin — full system access')
                db.add(super_role)
                db.commit()
                db.refresh(super_role)
            super_role.permissions = db.query(Permission).all()
            db.add(super_role)
            db.commit()

            # ── Admin — manage users/attendance/settings, sync devices, no device add/edit ──
            admin_role = db.query(Role).filter(Role.name == 'Admin').first()
            if not admin_role:
                admin_role = Role(name='Admin', description='Admin — manage users, attendance, settings and sync devices')
                db.add(admin_role)
                db.commit()
                db.refresh(admin_role)
            admin_role.permissions = _get_perms([
                'users.create', 'users.read', 'users.update', 'users.delete',
                'roles.read',
                'devices.sync',
                'attendance.read', 'reports.view',
                'settings.manage', 'shifts.manage',
                'employees.manage',
            ])
            db.add(admin_role)
            db.commit()

            # ── Reporting User — sync logs + generate reports only ─────────
            report_role = db.query(Role).filter(Role.name == 'Reporting User').first()
            if not report_role:
                report_role = Role(name='Reporting User', description='Reporting User — sync logs and generate reports only')
                db.add(report_role)
                db.commit()
                db.refresh(report_role)
            report_role.permissions = _get_perms([
                'devices.sync', 'attendance.read', 'reports.view',
            ])
            db.add(report_role)
            db.commit()

            # ── admin user (Super Admin) ───────────────────────────────────
            admin_user = db.query(User).filter(User.username == 'admin').first()
            if not admin_user:
                admin_user = User(username='admin', email=None, password_hash=get_password_hash('admin123'), is_active=True)
                db.add(admin_user)
                db.commit()
                db.refresh(admin_user)
                logger.info('Seeded admin user (username=admin, password=admin123)')
            if super_role not in admin_user.roles:
                admin_user.roles = [super_role]
                db.add(admin_user)
                db.commit()

            # ── hayat (Admin role) ─────────────────────────────────────────
            hayat = db.query(User).filter(User.username == 'hayat').first()
            if not hayat:
                hayat = User(username='hayat', email=None, password_hash=get_password_hash('Temp1234'), is_active=True)
                hayat.roles = [admin_role]
                db.add(hayat)
                db.commit()
                logger.info('Seeded hayat user (Admin role)')

            # ── salma (Reporting User role) ────────────────────────────────
            salma = db.query(User).filter(User.username == 'salma').first()
            if not salma:
                salma = User(username='salma', email=None, password_hash=get_password_hash('Temp1234'), is_active=True)
                salma.roles = [report_role]
                db.add(salma)
                db.commit()
                logger.info('Seeded salma user (Reporting User role)')

    except Exception as e:
        logger.error(f'Error seeding default RBAC data: {e}')

    # Ensure all devices from the JSON store exist in PostgreSQL
    # (historical devices were only saved to the JSON file, but PG triggers need them)
    try:
        from app.services.device_store import device_store
        from app.database.schema import Device as DBDevice
        with get_db_session() as db:
            all_devices = device_store.get_all()
            migrated = 0
            for dev in all_devices:
                exists = db.query(DBDevice).filter(DBDevice.id == dev.id).first()
                if not exists:
                    db.add(DBDevice(
                        id=dev.id,
                        name=dev.name,
                        ip=dev.ip,
                        port=int(dev.port),
                        tag=getattr(dev, "tag", None),
                        serial_number=getattr(dev, "serial_number", None),
                        date_format=getattr(dev, "date_format", "YYYY-MM-DD"),
                        is_active=True,
                    ))
                    migrated += 1
            if migrated:
                db.commit()
                logger.info(f"Migrated {migrated} device(s) from JSON store into PostgreSQL")
    except Exception as e:
        logger.error(f"Error syncing devices to PostgreSQL: {e}")

    # All data sync is manual — triggered from the device menu in the web UI.
    logger.info("Ready — all sync is manual from the device menu.")

    # Start background scheduler for automated email reports
    try:
        from app.services.scheduler import start as start_scheduler, stop as stop_scheduler
        start_scheduler()
        logger.info("Report scheduler started")
    except Exception as e:
        logger.error(f"Failed to start scheduler: {e}")

    # Start device heartbeat (lightweight TCP probe to verify reachability)
    try:
        from app.services.device_heartbeat import start as start_heartbeat
        start_heartbeat()
        logger.info("Device heartbeat started")
    except Exception as e:
        logger.error(f"Failed to start device heartbeat: {e}")

    yield

    # Shutdown
    try:
        from app.services.scheduler import stop as stop_scheduler
        stop_scheduler()
    except Exception:
        pass
    try:
        from app.services.device_heartbeat import stop as stop_heartbeat
        stop_heartbeat()
    except Exception:
        pass
    logger.info("Shutting down...")


# Create FastAPI app
app = FastAPI(
    title=settings.API_TITLE,
    version=settings.API_VERSION,
    description="API for managing ZKTeco biometric devices - attendance, users, and device control",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan
)

# Configure CORS - list all frontend dev origins explicitly so responses
# Configure CORS based on configured allowed origins. When credentials are
# required (cookies / auth), Access-Control-Allow-Origin must be a specific
# origin (not '*'). We read a comma-separated list from settings.ALLOWED_ORIGINS
# and fall back to a reasonable localhost list for development.
raw_allowed = getattr(settings, 'ALLOWED_ORIGINS', None) or ''
if raw_allowed:
    allowed_list = [o.strip() for o in raw_allowed.split(',') if o.strip()]
else:
    allowed_list = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
    ]

# If a wildcard is explicitly present, allow_origins=['*'] but then we must
# set allow_credentials=False (browsers reject credentials with wildcard).
if '*' in allowed_list:
    cors_allow_origins = ["*"]
    cors_allow_credentials = False
else:
    cors_allow_origins = allowed_list
    cors_allow_credentials = True

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_allow_origins,
    allow_credentials=cors_allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Admin audit log — records every non-GET admin action
from app.services.audit import AdminAuditMiddleware  # noqa: E402
app.add_middleware(AdminAuditMiddleware)


# Ensure CORS headers are present even on unexpected exceptions/errors by
# adding a lightweight middleware that reflects the request Origin when it
# matches allowed origins. This is defensive for development so browser
# doesn't block error responses that would otherwise lack CORS headers.
@app.middleware("http")
async def ensure_cors_headers(request, call_next):
    try:
        response = await call_next(request)
    except Exception as exc:
        # Build a generic 500 response if an unhandled exception occurs
        from fastapi.responses import JSONResponse
        response = JSONResponse(status_code=500, content={"detail": str(exc)})

    # If origin present, and allowed_list is specified, reflect it when appropriate.
    # For developer convenience, accept any http://localhost(:port) or http://127.0.0.1(:port) origin.
    origin = request.headers.get('origin')
    if origin:
        if '*' in cors_allow_origins:
            response.headers.setdefault('Access-Control-Allow-Origin', '*')
        else:
            origin_ok = False
            # allow localhosts regardless of port
            if origin.startswith('http://localhost') or origin.startswith('http://127.0.0.1'):
                origin_ok = True
            elif origin in cors_allow_origins:
                origin_ok = True

            if origin_ok:
                response.headers.setdefault('Access-Control-Allow-Origin', origin)
                if cors_allow_credentials:
                    response.headers.setdefault('Access-Control-Allow-Credentials', 'true')

    return response

# Include routers
app.include_router(devices_router, prefix="/api", tags=["Devices Management"])
app.include_router(users_router, prefix="/api/users", tags=["Users"])
app.include_router(auth_module.router, prefix="/api", tags=["Auth"])
app.include_router(attendance_router, prefix="/api/attendance", tags=["Attendance"])
app.include_router(organization_router, prefix="/api", tags=["Organization"])
app.include_router(shifts_router, tags=["Shift Management"])
app.include_router(employee_shifts_router, tags=["Employee Shifts"])
app.include_router(holidays_router, tags=["Holiday Calendar"])
app.include_router(settings_router, prefix="/api", tags=["Settings"])
app.include_router(reports_router, prefix="/api/reports", tags=["Reports"])
app.include_router(maintenance_router, prefix="/api", tags=["Maintenance"])
app.include_router(employee_schedules_router, prefix="/api", tags=["Employee Schedules"])
app.include_router(email_settings_router, prefix="/api", tags=["Email Settings"])
app.include_router(report_schedules_router, prefix="/api", tags=["Report Schedules"])
app.include_router(audit_router, prefix="/api", tags=["Audit"])
app.include_router(anomalies_router, prefix="/api", tags=["Anomalies"])
app.include_router(corrections_router, prefix="/api", tags=["Corrections"])
app.include_router(payroll_export_router, prefix="/api", tags=["Payroll Export"])
app.include_router(employee_portal_router, prefix="/api", tags=["Employee Portal"])


@app.get("/")
async def root():
    """Root endpoint - API information"""
    return {
        "message": "ZKTeco Device Management API",
        "version": settings.API_VERSION,
        "device_ip": settings.DEVICE_IP,
        "device_port": settings.DEVICE_PORT,
        "docs": "/docs",
        "redoc": "/redoc"
    }


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "version": settings.API_VERSION
    }


@app.get("/favicon.ico")
async def favicon():
    """Return empty favicon to prevent browser warnings"""
    return Response(content=b"", media_type="image/x-icon")


@app.get('/api/public/ping')
async def public_ping():
    """Unauthenticated ping used for CORS/browser tests."""
    return {"ok": True}


def _disable_quickedit():
    """Disable Windows console QuickEdit mode.

    When QuickEdit is enabled (the default on Windows), clicking inside the
    console selects text and **freezes the entire process** until Enter or
    Escape is pressed. This causes the backend to appear 'stuck' randomly.
    Disabling it prevents accidental freezes.
    """
    try:
        import ctypes
        kernel32 = ctypes.windll.kernel32  # type: ignore[attr-defined]
        # STD_INPUT_HANDLE = -10
        handle = kernel32.GetStdHandle(-10)
        # Get current console mode
        mode = ctypes.c_uint32()
        kernel32.GetConsoleMode(handle, ctypes.byref(mode))
        # ENABLE_QUICK_EDIT_MODE = 0x0040, ENABLE_EXTENDED_FLAGS = 0x0080
        # Clear QuickEdit, set ExtendedFlags so the change takes effect
        new_mode = (mode.value & ~0x0040) | 0x0080
        kernel32.SetConsoleMode(handle, new_mode)
        logger.info("Windows QuickEdit mode disabled (prevents console freeze on click)")
    except Exception:
        pass  # Non-Windows or no console attached — silently ignore


if __name__ == "__main__":
    _disable_quickedit()
    import uvicorn
    uvicorn.run(
        "main:app",
        host=settings.API_HOST,
        port=settings.API_PORT,
        reload=False  # Disabled to prevent crash on file changes
    )
