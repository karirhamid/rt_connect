"""
Check date range of attendance records on Device 202
"""
import psycopg2
from datetime import datetime, timedelta
import os

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASSWORD = os.getenv("DB_PASSWORD", "hk2025@AnzadbPss.")
DB_NAME = os.getenv("DB_NAME", "rtzkconnect_db")

# Connect to device 202
from zk import ZK

device_ip = "10.185.1.202"
device_port = 4370

print("="*80)
print(f"CHECKING ATTENDANCE DATE RANGE ON DEVICE 202")
print("="*80)

try:
    print(f"\n🔌 Connecting to {device_ip}:{device_port}...")
    zk = ZK(device_ip, port=device_port, timeout=5, password=0)
    conn = zk.connect()
    print("✓ Connected")
    
    print(f"\n📊 Fetching attendance records...")
    attendance = conn.get_attendance()
    
    if not attendance:
        print("❌ No attendance records found")
        conn.disconnect()
        exit()
    
    # Convert to list and sort by timestamp
    records = list(attendance)
    records.sort(key=lambda x: x.timestamp)
    
    print(f"\n📈 ANALYSIS:")
    print(f"   Total records on device: {len(records)}")
    print(f"   Oldest record: {records[0].timestamp}")
    print(f"   Newest record: {records[-1].timestamp}")
    
    # Calculate date range
    oldest = records[0].timestamp
    newest = records[-1].timestamp
    date_range = newest - oldest
    
    print(f"   Date range: {date_range.days} days")
    
    # Check how many are from last 30 days
    now = datetime.now()
    thirty_days_ago = now - timedelta(days=30)
    
    last_30_days = [r for r in records if r.timestamp >= thirty_days_ago]
    print(f"\n📅 Records from LAST 30 DAYS:")
    print(f"   Count: {len(last_30_days)} records")
    print(f"   Percentage: {len(last_30_days)/len(records)*100:.1f}%")
    
    # Break down by time periods
    now = datetime.now()
    periods = [
        ("Last 7 days", 7),
        ("Last 14 days", 14),
        ("Last 30 days", 30),
        ("Last 60 days", 60),
        ("Last 90 days", 90),
        ("Older than 90 days", 999999)
    ]
    
    print(f"\n📊 BREAKDOWN BY TIME PERIOD:")
    for label, days in periods:
        cutoff = now - timedelta(days=days)
        count = sum(1 for r in records if r.timestamp >= cutoff)
        print(f"   {label:20s}: {count:4d} records")
    
    # Show sample of oldest records
    print(f"\n📜 SAMPLE OF OLDEST 10 RECORDS:")
    for i, rec in enumerate(records[:10]):
        days_old = (now - rec.timestamp).days
        print(f"   [{i+1}] {rec.timestamp} (user_id={rec.user_id}) - {days_old} days old")
    
    # Show sample of newest records
    print(f"\n📜 SAMPLE OF NEWEST 10 RECORDS:")
    for i, rec in enumerate(records[-10:]):
        days_old = (now - rec.timestamp).days
        print(f"   [{len(records)-9+i}] {rec.timestamp} (user_id={rec.user_id}) - {days_old} days old")
    
    conn.disconnect()
    print("\n✓ Disconnected")
    
except Exception as e:
    print(f"\n❌ Error: {e}")

print("\n" + "="*80)
