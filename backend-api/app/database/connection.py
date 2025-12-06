from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from contextlib import contextmanager
from app.database.schema import Base
from typing import Generator
from urllib.parse import quote_plus
import os

# PostgreSQL connection parameters
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASSWORD = os.getenv("DB_PASSWORD", "hk2025@AnzadbPss.")
DB_NAME = os.getenv("DB_NAME", "rtzkconnect_db")

# URL-encode the password to handle special characters
DATABASE_URL = f"postgresql://{DB_USER}:{quote_plus(DB_PASSWORD)}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

# Create engine with connection pooling for PostgreSQL
engine = create_engine(
    DATABASE_URL,
    pool_size=10,
    max_overflow=20,
    echo=False
)

# Create session factory
# Set expire_on_commit=False so ORM instances keep their loaded attribute
# values after the session commits. This prevents DetachedInstanceError when
# code returns model instances from short-lived sessions and accesses simple
# attributes (like `username`) later in the request handling.
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine, expire_on_commit=False)


def init_db():
    """Initialize database - create all tables"""
    Base.metadata.create_all(bind=engine)


def get_db() -> Generator[Session, None, None]:
    """Get database session for dependency injection"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@contextmanager
def get_db_session():
    """Get database session as context manager for background tasks"""
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
