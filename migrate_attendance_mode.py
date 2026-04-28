"""Add attendance_mode column to app_settings table."""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend-api'))

from sqlalchemy import text
from app.database.connection import engine

with engine.connect() as conn:
    try:
        conn.execute(text("ALTER TABLE app_settings ADD COLUMN attendance_mode VARCHAR(20) DEFAULT 'simple' NOT NULL"))
        conn.commit()
        print("Column 'attendance_mode' added successfully")
    except Exception as e:
        if 'already exists' in str(e).lower() or 'duplicate' in str(e).lower():
            print("Column already exists, skipping")
        else:
            raise e
