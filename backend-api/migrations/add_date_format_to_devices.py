"""
Migration: Add date_format column to devices table
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
        # Check if column already exists (SQLite specific)
        result = conn.execute(text("PRAGMA table_info(devices)"))
        columns = [row[1] for row in result.fetchall()]
        
        if 'date_format' not in columns:
            # Add date_format column with default value
            conn.execute(text("""
                ALTER TABLE devices 
                ADD COLUMN date_format VARCHAR DEFAULT 'YYYY-MM-DD'
            """))
            conn.commit()
            print("✓ Added date_format column to devices table")
            
            # Update existing devices with default format
            conn.execute(text("""
                UPDATE devices 
                SET date_format = 'YYYY-MM-DD' 
                WHERE date_format IS NULL
            """))
            conn.commit()
            print("✓ Set default date format for existing devices")
        else:
            print("✓ date_format column already exists")

if __name__ == "__main__":
    migrate()
