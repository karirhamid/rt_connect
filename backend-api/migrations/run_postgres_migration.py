"""
Run PostgreSQL migration to add missing columns
"""
import psycopg2
import os

# Database connection parameters
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASSWORD = os.getenv("DB_PASSWORD", "hk2025@AnzadbPss.")
DB_NAME = os.getenv("DB_NAME", "rtzkconnect_db")


def run_migration():
    """Add missing columns to PostgreSQL database"""
    try:
        print(f"Connecting to PostgreSQL database: {DB_NAME}...")
        conn = psycopg2.connect(
            host=DB_HOST,
            port=DB_PORT,
            user=DB_USER,
            password=DB_PASSWORD,
            database=DB_NAME
        )
        cursor = conn.cursor()
        
        print("\n1. Adding date_format column to devices table...")
        cursor.execute("""
            ALTER TABLE devices 
            ADD COLUMN IF NOT EXISTS date_format VARCHAR DEFAULT 'YYYY-MM-DD';
        """)
        print("   ✓ date_format column added")
        
        print("\n2. Adding validate_timestamps column to app_settings table...")
        cursor.execute("""
            ALTER TABLE app_settings 
            ADD COLUMN IF NOT EXISTS validate_timestamps BOOLEAN DEFAULT TRUE;
        """)
        print("   ✓ validate_timestamps column added")
        
        conn.commit()
        
        print("\n3. Verifying columns...")
        cursor.execute("""
            SELECT column_name, data_type, column_default 
            FROM information_schema.columns 
            WHERE table_name = 'devices' AND column_name = 'date_format'
            UNION ALL
            SELECT column_name, data_type, column_default 
            FROM information_schema.columns 
            WHERE table_name = 'app_settings' AND column_name = 'validate_timestamps';
        """)
        
        results = cursor.fetchall()
        for row in results:
            print(f"   - {row[0]}: {row[1]} (default: {row[2]})")
        
        print("\n✅ Migration completed successfully!")
        
        cursor.close()
        conn.close()
        
    except Exception as e:
        print(f"\n❌ Migration failed: {e}")
        raise


if __name__ == "__main__":
    run_migration()
