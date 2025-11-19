from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import logging
from contextlib import asynccontextmanager
from app.core import settings
from app.api import device_router, users_router, attendance_router
from app.api.devices import router as devices_router
from app.database import init_db
from app.services.sync_service import sync_service

# Configure logging
logging.basicConfig(
    level=logging.INFO,
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
    
    logger.info("Starting background sync service...")
    await sync_service.start()
    logger.info("Background sync service started")
    
    # Run initial sync
    logger.info("Running initial device sync...")
    await sync_service.sync_all_devices()
    logger.info("Initial sync completed")
    
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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=settings.API_HOST,
        port=settings.API_PORT,
        reload=True
    )
