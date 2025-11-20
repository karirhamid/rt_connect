"""
Migration script to update employee schema:
- Remove device_ids column
- Add source_device_id column (tracks which device the employee was synced from)
"""
from sqlalchemy import text
from app.database import engine

def migrate():
    """Apply database migrations"""
    with engine.connect() as conn:
        print("Starting database migration...")
        
        try:
            # Drop device_ids column if it exists
            print("Removing device_ids column from employees table...")
            conn.execute(text("""
                ALTER TABLE employees 
                DROP COLUMN IF EXISTS device_ids;
            """))
            conn.commit()
            print("✓ device_ids column removed")
            
            # Add source_device_id column if it doesn't exist
            print("Adding source_device_id column to employees table...")
            conn.execute(text("""
                ALTER TABLE employees 
                ADD COLUMN IF NOT EXISTS source_device_id VARCHAR;
            """))
            conn.commit()
            print("✓ source_device_id column added")
            
            print("✓ Migration completed successfully!")
            
        except Exception as e:
            print(f"✗ Migration failed: {e}")
            conn.rollback()
            raise

if __name__ == "__main__":
    migrate()

