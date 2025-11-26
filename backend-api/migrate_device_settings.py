"""
Migration script to add device-specific settings columns to existing devices.
"""
import psycopg2

DB_CONFIG = {
    'host': 'localhost',
    'port': 5432,
    'database': 'rtzkconnect_db',
    'user': 'postgres',
    'password': 'Pa$$word02'
}

def migrate():
    conn = None
    cur = None
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cur = conn.cursor()
        
        print("=" * 60)
        print("Adding device-specific settings columns")
        print("=" * 60)
        
        # Add require_sync_confirmation column
        try:
            cur.execute("""
                ALTER TABLE devices 
                ADD COLUMN IF NOT EXISTS require_sync_confirmation BOOLEAN NOT NULL DEFAULT TRUE
            """)
            print("✓ Added require_sync_confirmation column")
        except Exception as e:
            print(f"Column require_sync_confirmation may already exist: {e}")
        
        # Add auto_sync_enabled column
        try:
            cur.execute("""
                ALTER TABLE devices 
                ADD COLUMN IF NOT EXISTS auto_sync_enabled BOOLEAN NOT NULL DEFAULT FALSE
            """)
            print("✓ Added auto_sync_enabled column")
        except Exception as e:
            print(f"Column auto_sync_enabled may already exist: {e}")
        
        conn.commit()
        
        # Show current devices
        cur.execute("SELECT id, name, require_sync_confirmation, auto_sync_enabled FROM devices")
        devices = cur.fetchall()
        
        print("\nCurrent device settings:")
        for device_id, name, req_confirm, auto_sync in devices:
            print(f"  {name}: require_confirmation={req_confirm}, auto_sync={auto_sync}")
        
        print("\n" + "=" * 60)
        print("✅ Migration completed successfully!")
        print("=" * 60)
        
    except Exception as e:
        if conn:
            conn.rollback()
        print(f"\n❌ Migration failed: {e}")
        return 1
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()

if __name__ == '__main__':
    migrate()
