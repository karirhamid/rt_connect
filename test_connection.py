import psycopg2
from urllib.parse import quote_plus

# Test direct connection first
DB_HOST = "localhost"
DB_PORT = "5432"
DB_USER = "postgres"
DB_PASSWORD = "hk2025@AnzadbPss."
DB_NAME = "rtzkconnect_db"

print("=" * 60)
print("Testing PostgreSQL Connection")
print("=" * 60)

# Test 1: Direct psycopg2 connection
print("\n[Test 1] Direct psycopg2 connection to rtzkconnect_db...")
try:
    conn = psycopg2.connect(
        host=DB_HOST,
        port=DB_PORT,
        user=DB_USER,
        password=DB_PASSWORD,
        database=DB_NAME
    )
    print("    [OK] Direct connection successful!")
    conn.close()
except Exception as e:
    print(f"    [ERROR] Direct connection failed: {e}")

# Test 2: Connection string
print("\n[Test 2] Testing URL-encoded connection string...")
encoded_password = quote_plus(DB_PASSWORD)
connection_string = f"postgresql://{DB_USER}:{encoded_password}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
print(f"    Connection string: postgresql://{DB_USER}:***@{DB_HOST}:{DB_PORT}/{DB_NAME}")

try:
    from sqlalchemy import create_engine
    test_engine = create_engine(connection_string, echo=False)
    with test_engine.connect() as conn:
        print("    [OK] SQLAlchemy connection successful!")
except Exception as e:
    print(f"    [ERROR] SQLAlchemy connection failed: {e}")

print("\n" + "=" * 60)
print("[DONE] Connection tests completed")
print("=" * 60)
