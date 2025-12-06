from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    # Device Configuration
    DEVICE_IP: str = "10.185.1.201"
    DEVICE_PORT: int = 4370
    DEVICE_TIMEOUT: int = 30
    DEVICE_PASSWORD: int = 0
    
    # API Configuration
    API_HOST: str = "0.0.0.0"
    API_PORT: int = 8000
    API_TITLE: str = "ZKTeco Device Management API"
    API_VERSION: str = "1.0.1"
    
    # Database
    DATABASE_URL: str = "sqlite+aiosqlite:///./zkteco.db"
    
    class Config:
        env_file = "../../.env"
        case_sensitive = True


settings = Settings()
