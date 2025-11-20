"""
Migration script to add device_ids to employees table and last_attendance_sync to devices table
"""
from sqlalchemy import text
from app.database import engine

def migrate():
    """Apply database migrations"""
    with engine.connect() as conn:
        print("Starting database migration...")
        
        try:
            # Add device_ids column to employees table
            print("Adding device_ids column to employees table...")
            conn.execute(text("""
                ALTER TABLE employees 
                ADD COLUMN IF NOT EXISTS device_ids TEXT;
            """))
            conn.commit()
            print("✓ device_ids column added")
            
            # Add last_attendance_sync column to devices table
            print("Adding last_attendance_sync column to devices table...")
            conn.execute(text("""
                ALTER TABLE devices 
                ADD COLUMN IF NOT EXISTS last_attendance_sync TIMESTAMP;
            """))
            conn.commit()
            print("✓ last_attendance_sync column added")
            
            print("✓ Migration completed successfully!")
            
        except Exception as e:
            print(f"✗ Migration failed: {e}")
            conn.rollback()
            raise

if __name__ == "__main__":
    migrate()
