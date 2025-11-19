import sys
sys.path.insert(0, "backend-api")

from app.database.connection import engine, init_db
from sqlalchemy import inspect

print("=" * 60)
print("PostgreSQL Database Test")
print("=" * 60)

try:
    # Test connection
    print("\n[1] Testing connection to rtzkconnect_db...")
    with engine.connect() as conn:
        print("    [OK] Connected successfully!")
    
    # Create tables
    print("\n[2] Creating tables...")
    init_db()
    print("    [OK] Tables created/updated!")
    
    # List tables
    print("\n[3] Listing tables...")
    inspector = inspect(engine)
    tables = inspector.get_table_names()
    print(f"    [OK] Found {len(tables)} tables:")
    for table in sorted(tables):
        print(f"        - {table}")
    
    print("\n" + "=" * 60)
    print("[SUCCESS] All tests passed!")
    print("=" * 60)
    
except Exception as e:
    print(f"\n[ERROR] Test failed: {e}")
    import traceback
    traceback.print_exc()
