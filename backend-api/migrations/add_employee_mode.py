"""Add employee_mode column to app_settings table."""
import sys
sys.path.insert(0, "backend-api")

from app.database.connection import get_db_session
from sqlalchemy import text

with get_db_session() as db:
    try:
        db.execute(text(
            "ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS "
            "employee_mode VARCHAR(20) NOT NULL DEFAULT 'shared'"
        ))
        db.commit()
        print("Column employee_mode added successfully")
    except Exception as e:
        print("Column may already exist:", e)
