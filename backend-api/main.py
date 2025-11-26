from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
import logging
from contextlib import asynccontextmanager
from app.core import settings
from app.api import device_router, users_router, attendance_router
from app.api.devices import router as devices_router
from app.api.organization import router as organization_router
from app.api.shifts import router as shifts_router
from app.api.employee_shifts import router as employee_shifts_router
from app.api.holidays import router as holidays_router
from app.api.statistics import router as statistics_router
from app.api.settings import router as settings_router
from app.database import init_db
from app.database.connection import get_db_session
from app.database.schema import AppSettings
from app.services.sync_service import sync_service

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
            settings_row = AppSettings(sync_enabled=True, sync_interval_sec=300)
            db.add(settings_row)
            db.commit()
            db.refresh(settings_row)
            logger.info("Created default AppSettings (sync enabled, interval 300s)")

    # Start background sync only if enabled
    try:
        with get_db_session() as db:
            settings_row = db.query(AppSettings).first()
            if settings_row and settings_row.sync_enabled:
                # apply interval from settings
                sync_service.sync_interval = max(60, int(settings_row.sync_interval_sec or 300))
                logger.info("Starting background sync service...")
                await sync_service.start()
                logger.info(f"Background sync service started - will sync every {sync_service.sync_interval} seconds")
            else:
                logger.info("Background sync service is disabled by settings; not starting.")
    except Exception as e:
        logger.error(f"Failed to start sync service based on settings: {e}")
    
    yield
    
    # Shutdown
    logger.info("Stopping background sync service...")
    await sync_service.stop()
    logger.info("Background sync service stopped")


# Create FastAPI app
app = FastAPI(
    title=settings.API_TITLE,
    version=settings.API_VERSION,
    description="API for managing ZKTeco biometric devices - attendance, users, and device control",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "*"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Include routers
app.include_router(devices_router, prefix="/api", tags=["Devices Management"])
app.include_router(device_router, prefix="/api/device", tags=["Device"])
app.include_router(users_router, prefix="/api/users", tags=["Users"])
app.include_router(attendance_router, prefix="/api/attendance", tags=["Attendance"])
app.include_router(organization_router, prefix="/api", tags=["Organization"])
app.include_router(shifts_router, tags=["Shift Management"])
app.include_router(employee_shifts_router, tags=["Employee Shifts"])  # Already has /api/employees prefix
app.include_router(holidays_router, tags=["Holiday Calendar"])
app.include_router(statistics_router, tags=["Statistics"])
app.include_router(settings_router, prefix="/api", tags=["Settings"]) 


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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=settings.API_HOST,
        port=settings.API_PORT,
        reload=False  # Disabled to prevent crash on file changes
    )
