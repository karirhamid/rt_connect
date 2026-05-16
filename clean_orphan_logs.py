"""
Clean orphan attendance logs from ZKTeco devices.

For each device:
  1. Read all registered users (get_users)
  2. Read all attendance logs (get_attendance)
  3. Identify orphan logs (user_id not in registered users)
  4. Ensure ALL valid records are saved to PostgreSQL DB
  5. Clear device attendance log (removes ALL logs from hardware)
     -> Users, fingerprints, and device settings are NOT touched.

The DB keeps the full history; the device starts fresh.
"""
import sys, os

# Ensure backend-api is importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "backend-api"))

from datetime import datetime, timezone
from zk import ZK
import psycopg2

# ── Device list — read from backend-api/devices.json ────────────────
import json as _json
import os as _os
try:
    _here = _os.path.dirname(_os.path.abspath(__file__))
    with open(_os.path.join(_here, 'backend-api', 'devices.json'), 'r', encoding='utf-8') as _f:
        DEVICES = _json.load(_f)
except Exception:
    DEVICES = []  # devices.json not present yet — script will be a no-op

# DB credentials — override via env vars to avoid hardcoding
DB_NAME = _os.environ.get('DB_NAME', 'rtzkconnect_db')
DB_USER = _os.environ.get('DB_USER', 'postgres')
DB_PASS = _os.environ.get('DB_PASSWORD', '')


def connect_device(ip, port):
    zk = ZK(ip, port=port, timeout=30, force_udp=False, ommit_ping=True)
    conn = zk.connect()
    return zk, conn


def analyse_device(dev):
    """Return (users_dict, all_logs, orphan_logs, valid_logs)."""
    print(f"\n{'='*60}")
    print(f"  {dev['name']}  ({dev['ip']})")
    print(f"{'='*60}")

    zk, conn = connect_device(dev["ip"], dev["port"])
    try:
        conn.disable_device()

        users = conn.get_users() or []
        user_ids = {str(u.user_id) for u in users}
        print(f"  Registered users : {len(users)}")

        # Bump timeout for large attendance reads
        zk._ZK__sock.settimeout(300)
        attendance = conn.get_attendance() or []
        print(f"  Total log records: {len(attendance)}")

        orphans = [r for r in attendance if str(r.user_id) not in user_ids]
        valid = [r for r in attendance if str(r.user_id) in user_ids]

        orphan_ids = {str(r.user_id) for r in orphans}
        print(f"  Valid records    : {len(valid)}")
        print(f"  Orphan records   : {len(orphans)}  (user_ids: {sorted(orphan_ids) if orphan_ids else 'none'})")

        conn.enable_device()
        return user_ids, attendance, orphans, valid
    finally:
        try:
            conn.enable_device()
        except Exception:
            pass
        conn.disconnect()


def ensure_db_records(dev, valid_records):
    """Make sure all valid attendance records exist in the database."""
    conn = psycopg2.connect(dbname=DB_NAME, user=DB_USER, password=DB_PASS)
    cur = conn.cursor()
    device_id = dev["id"]

    inserted = 0
    skipped = 0
    for r in valid_records:
        ts = r.timestamp
        uid = int(r.uid) if hasattr(r, "uid") else 0
        user_id_str = str(r.user_id)
        status = int(r.status) if r.status is not None else 0
        punch = int(r.punch) if r.punch is not None else 0

        # Check if this exact record already exists
        cur.execute(
            """SELECT 1 FROM attendance
               WHERE device_id = %s AND user_id_str = %s AND timestamp = %s
               LIMIT 1""",
            (device_id, user_id_str, ts),
        )
        if cur.fetchone():
            skipped += 1
            continue

        # Look up employee_id
        cur.execute(
            """SELECT id FROM employees
               WHERE user_id = %s AND source_device_id = %s
               LIMIT 1""",
            (user_id_str, device_id),
        )
        row = cur.fetchone()
        employee_id = row[0] if row else None

        cur.execute(
            """INSERT INTO attendance
               (device_id, employee_id, uid, user_id_str, timestamp, status, punch, synced_at)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s)""",
            (device_id, employee_id, uid, user_id_str, ts, status, punch,
             datetime.now(timezone.utc)),
        )
        inserted += 1

    conn.commit()
    cur.close()
    conn.close()
    print(f"  DB sync: {inserted} new records saved, {skipped} already existed")
    return inserted


def clear_device_logs(dev):
    """Clear attendance log on device (users/fingerprints/settings untouched)."""
    zk, conn = connect_device(dev["ip"], dev["port"])
    try:
        conn.clear_attendance()
        print(f"  >> Device attendance log CLEARED")
    finally:
        try:
            conn.enable_device()
        except Exception:
            pass
        conn.disconnect()


def main():
    print("=" * 60)
    print("  ORPHAN ATTENDANCE LOG CLEANUP")
    print("  This will NOT touch users, fingerprints, or settings.")
    print("  Only the attendance log buffer on each device is cleared.")
    print("=" * 60)

    # Phase 1: Analyse both devices
    results = {}
    for dev in DEVICES:
        try:
            user_ids, all_logs, orphans, valid = analyse_device(dev)
            results[dev["id"]] = {
                "dev": dev,
                "user_ids": user_ids,
                "all_logs": all_logs,
                "orphans": orphans,
                "valid": valid,
            }
        except Exception as e:
            print(f"  ERROR connecting to {dev['name']}: {e}")
            results[dev["id"]] = None

    # Summary
    total_orphans = sum(
        len(r["orphans"]) for r in results.values() if r is not None
    )
    total_valid = sum(
        len(r["valid"]) for r in results.values() if r is not None
    )

    print(f"\n{'='*60}")
    print(f"  SUMMARY")
    print(f"  Total valid records across devices : {total_valid}")
    print(f"  Total orphan records across devices: {total_orphans}")
    print(f"{'='*60}")

    if total_orphans == 0:
        print("\n  No orphan logs found. Nothing to clean.")
        return

    # Phase 2: Ask for confirmation
    print("\n  PLAN:")
    print("  1. Save all valid records to database (if not already there)")
    print("  2. Clear attendance logs on both devices")
    print("     (users, fingerprints, device settings are PRESERVED)")
    answer = input("\n  Proceed? (yes/no): ").strip().lower()
    if answer != "yes":
        print("  Aborted.")
        return

    # Phase 3: Save valid records to DB, then clear device logs
    for dev_id, data in results.items():
        if data is None:
            continue
        dev = data["dev"]
        print(f"\n  Processing {dev['name']}...")

        # Save valid records to DB
        ensure_db_records(dev, data["valid"])

        # Clear device log
        clear_device_logs(dev)

    print(f"\n{'='*60}")
    print("  DONE. Devices are clean. All valid records are in the database.")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
