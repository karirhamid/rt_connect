import psycopg2

try:
    print("Testing PostgreSQL connection...")
    conn = psycopg2.connect(
        host="localhost",
        port="5432",
        user="postgres",
        password="hk2025@AnzadbPss.",
        database="postgres"
    )
    print("✓ Connected successfully!")
    
    cursor = conn.cursor()
    cursor.execute("SELECT version();")
    version = cursor.fetchone()
    print(f"PostgreSQL version: {version[0]}")
    
    cursor.close()
    conn.close()
    print("✓ Connection test completed")
    
except Exception as e:
    print(f"✗ Connection failed: {e}")
