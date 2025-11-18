from .device import router as device_router
from .users import router as users_router
from .attendance import router as attendance_router

__all__ = ["device_router", "users_router", "attendance_router"]
