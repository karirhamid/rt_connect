"""Add timing_mode column to app_settings"""
from app.database.connection import SessionLocal
from sqlalchemy import text

db = SessionLocal()
try:
    db.execute(text("ALTER TABLE app_settings ADD COLUMN timing_mode VARCHAR(20) NOT NULL DEFAULT 'off'"))
    db.commit()
    print("Column timing_mode added successfully")
except Exception as e:
    if "already exists" in str(e):
        print("Column already exists, skipping")
    else:
        print(f"Error: {e}")
    db.rollback()
finally:
    db.close()
