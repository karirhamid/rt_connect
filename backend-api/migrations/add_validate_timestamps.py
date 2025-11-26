"""
Migration: Add validate_timestamps column to app_settings table
Date: 2025-11-26
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import create_engine, text

# Use absolute path for database
db_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "zkteco.db")
DATABASE_URL = f"sqlite:///{db_path}"

def migrate():
    engine = create_engine(DATABASE_URL)
    
    with engine.connect() as conn:
        # Check if app_settings table exists
        result = conn.execute(text("SELECT name FROM sqlite_master WHERE type='table' AND name='app_settings'"))
        if not result.fetchone():
            print("⚠ app_settings table doesn't exist yet - will be created on next server start")
            return
        
        # Check if column already exists (SQLite specific)
        result = conn.execute(text("PRAGMA table_info(app_settings)"))
        columns = [row[1] for row in result.fetchall()]
        
        if 'validate_timestamps' not in columns:
            # Add validate_timestamps column with default value
            conn.execute(text("""
                ALTER TABLE app_settings 
                ADD COLUMN validate_timestamps BOOLEAN DEFAULT 1
            """))
            conn.commit()
            print("✓ Added validate_timestamps column to app_settings table")
            
            # Update existing row with default value
            conn.execute(text("""
                UPDATE app_settings 
                SET validate_timestamps = 1 
                WHERE validate_timestamps IS NULL
            """))
            conn.commit()
            print("✓ Set default validate_timestamps for existing settings")
        else:
            print("✓ validate_timestamps column already exists")

if __name__ == "__main__":
    migrate()
