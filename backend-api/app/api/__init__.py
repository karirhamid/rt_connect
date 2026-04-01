from .device import router as device_router
from .users import router as users_router
from .attendance import router as attendance_router
from .device_users import router as device_users_router

__all__ = ["device_router", "users_router", "attendance_router", "device_users_router"]
