"""Check current app settings"""
import psycopg2
import os

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASSWORD = os.getenv("DB_PASSWORD", "hk2025@AnzadbPss.")
DB_NAME = os.getenv("DB_NAME", "rtzkconnect_db")

try:
    conn = psycopg2.connect(
        host=DB_HOST, port=DB_PORT, user=DB_USER,
        password=DB_PASSWORD, database=DB_NAME
    )
    cursor = conn.cursor()
    
    print("Current app_settings:")
    cursor.execute("SELECT * FROM app_settings;")
    columns = [desc[0] for desc in cursor.description]
    results = cursor.fetchall()
    
    for row in results:
        print("\n" + "="*60)
        for col, val in zip(columns, row):
            print(f"  {col}: {val}")
    
    print("\n" + "="*60)
    print("\nDevice date_format settings:")
    cursor.execute("SELECT id, name, ip, date_format FROM devices ORDER BY name;")
    results = cursor.fetchall()
    
    for row in results:
        print(f"  {row[1]} ({row[2]}): {row[3] or 'NULL'}")
    
    cursor.close()
    conn.close()
    
except Exception as e:
    print(f"Error: {e}")
