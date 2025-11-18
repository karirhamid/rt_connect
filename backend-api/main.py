from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import logging
from app.core import settings
from app.api import device_router, users_router, attendance_router

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(
    title=settings.API_TITLE,
    version=settings.API_VERSION,
    description="API for managing ZKTeco biometric devices - attendance, users, and device control",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust this in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
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
