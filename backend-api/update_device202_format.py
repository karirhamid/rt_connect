"""Update Device 202 date format to DD/MM/YYYY"""
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
    
    print("Updating Device 202 (Pointeuse202_RDC) date format to DD/MM/YYYY...")
    
    cursor.execute("""
        UPDATE devices 
        SET date_format = 'DD/MM/YYYY' 
        WHERE ip = '10.185.1.202' OR name LIKE '%202%';
    """)
    
    conn.commit()
    
    print(f"✓ Updated {cursor.rowcount} device(s)")
    
    # Verify the change
    cursor.execute("SELECT id, name, ip, date_format FROM devices ORDER BY name;")
    results = cursor.fetchall()
    
    print("\nCurrent device date formats:")
    for row in results:
        print(f"  {row[1]} ({row[2]}): {row[3]}")
    
    cursor.close()
    conn.close()
    print("\n✅ Update complete!")
    
except Exception as e:
    print(f"❌ Error: {e}")
