"""
Migration: Move sync settings to general settings
Adds require_sync_confirmation to app_settings and removes device-level columns
"""

from app.database.connection import get_db
from contextlib import contextmanager
from sqlalchemy import text

@contextmanager
def get_db_session():
    """Get database session as context manager"""
    db = next(get_db())
    try:
        yield db
    finally:
        db.close()

def migrate():
    with get_db_session() as db:
        print("=" * 80)
        print("MIGRATION: Move sync settings to general")
        print("=" * 80)
        
        # Add require_sync_confirmation to app_settings
        try:
            db.execute(text("""
                ALTER TABLE app_settings 
                ADD COLUMN IF NOT EXISTS require_sync_confirmation BOOLEAN DEFAULT TRUE NOT NULL;
            """))
            db.commit()
            print("✓ Added require_sync_confirmation to app_settings")
        except Exception as e:
            print(f"✗ Error: {e}")
        
        # Set default value
        try:
            db.execute(text("""
                UPDATE app_settings 
                SET require_sync_confirmation = TRUE 
                WHERE require_sync_confirmation IS NULL;
            """))
            db.commit()
            print("✓ Set default value for require_sync_confirmation")
        except Exception as e:
            print(f"✗ Error setting default value: {e}")
        
        # Remove device columns
        try:
            db.execute(text("""
                ALTER TABLE devices 
                DROP COLUMN IF EXISTS require_sync_confirmation,
                DROP COLUMN IF EXISTS auto_sync_enabled;
            """))
            db.commit()
            print("✓ Removed device-level sync settings columns")
        except Exception as e:
            print(f"✗ Error removing device columns: {e}")
        
        # Show current settings
        result = db.execute(text("""
            SELECT id, sync_enabled, sync_interval_sec, require_sync_confirmation 
            FROM app_settings;
        """))
        settings = result.fetchone()
        
        print("\n" + "=" * 80)
        print("Current General Settings:")
        print("=" * 80)
        if settings:
            print(f"  Sync Enabled: {settings[1] if len(settings) > 1 else 'N/A'}")
            print(f"  Sync Interval: {settings[2] if len(settings) > 2 else 'N/A'} seconds")
            print(f"  Require Confirmation: {settings[3] if len(settings) > 3 else 'N/A'}")
        else:
            print("  No settings found (will be created on first app start)")
        print("=" * 80)
        
        print("\n✅ Migration completed successfully!")

if __name__ == "__main__":
    migrate()
