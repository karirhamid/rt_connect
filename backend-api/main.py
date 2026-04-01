from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
import logging
from contextlib import asynccontextmanager
from app.core import settings
from app.api import device_router, users_router, attendance_router
from app.api import auth as auth_module
from app.api.devices import router as devices_router
from app.api.organization import router as organization_router
from app.api.shifts import router as shifts_router
from app.api.employee_shifts import router as employee_shifts_router
from app.api.holidays import router as holidays_router
from app.api.statistics import router as statistics_router
from app.api.settings import router as settings_router
from app.api.reports import router as reports_router
from app.api.maintenance import router as maintenance_router
from app.api import device_users_router
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

    # Ensure default app settings exist
    with get_db_session() as db:
        settings_row = db.query(AppSettings).first()
        if not settings_row:
            settings_row = AppSettings(require_sync_confirmation=True, validate_timestamps=True)
            db.add(settings_row)
            db.commit()
            db.refresh(settings_row)
            logger.info("Created default AppSettings")

    # Seed default permissions, roles, and admin user
    try:
        from app.database.schema import Permission, Role, User
        from app.core.security import get_password_hash
        with get_db_session() as db:
            # Define a minimal canonical permission set
            default_perms = [
                'users.create', 'users.read', 'users.update', 'users.delete',
                'roles.read', 'roles.manage',
                'devices.manage', 'attendance.read', 'shifts.manage'
            ]
            # Create permissions if missing
            for code in default_perms:
                if not db.query(Permission).filter(Permission.code == code).first():
                    db.add(Permission(code=code, description=f'Permission for {code}'))
            db.commit()

            # Ensure Administrator role exists with all permissions
            admin_role = db.query(Role).filter(Role.name == 'Administrator').first()
            if not admin_role:
                admin_role = Role(name='Administrator', description='Full access')
                db.add(admin_role)
                db.commit()
                db.refresh(admin_role)
            # Assign all permissions to admin role
            perms = db.query(Permission).all()
            admin_role.permissions = perms
            db.add(admin_role)
            db.commit()

            # Create admin user if not exists (per user choice: admin/admin123)
            admin_user = db.query(User).filter(User.username == 'admin').first()
            if not admin_user:
                admin_user = User(username='admin', email=None, password_hash=get_password_hash('admin123'), is_active=True)
                admin_user.roles = [admin_role]
                db.add(admin_user)
                db.commit()
                db.refresh(admin_user)
                logger.info('Seeded admin user (username=admin, password=admin123)')
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
    
    yield
    
    # Shutdown
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
app.include_router(device_router, prefix="/api/device", tags=["Device"])
app.include_router(users_router, prefix="/api/users", tags=["Users"])
app.include_router(auth_module.router, prefix="/api", tags=["Auth"])
app.include_router(attendance_router, prefix="/api/attendance", tags=["Attendance"])
app.include_router(organization_router, prefix="/api", tags=["Organization"])
app.include_router(shifts_router, tags=["Shift Management"])
app.include_router(employee_shifts_router, tags=["Employee Shifts"])  # Already has /api/employees prefix
app.include_router(holidays_router, tags=["Holiday Calendar"])
app.include_router(statistics_router, tags=["Statistics"])
app.include_router(settings_router, prefix="/api", tags=["Settings"])
app.include_router(reports_router, prefix="/api/reports", tags=["Reports"])
app.include_router(maintenance_router, prefix="/api", tags=["Maintenance"])
app.include_router(device_users_router, prefix="/api/device/users", tags=["Device Users"])


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
