"""
Full system wipe: deletes ALL data including devices.
Does NOT touch physical ZKTeco device data.
Clears: attendance, sync_logs, shift_exceptions, employee_shifts, employees, devices
Also clears: JSON device store files
"""
import psycopg2
import json
import os

DB_CONFIG = {
    'host': 'localhost',
    'port': 5432,
    'database': 'rtzkconnect_db',
    'user': 'postgres',
    'password': 'Pa$$word02'
}

# FK-safe deletion order (children first)
TABLES = [
    'shift_exceptions',
    'employee_shifts',
    'attendance',
    'sync_logs',
    'employees',
    'devices',
]

JSON_STORES = [
    'backend-api/devices.json',
    'devices.json',
]

def wipe():
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor()

    print("=" * 60)
    print("FULL SYSTEM WIPE (all data + devices)")
    print("=" * 60)

    # Show counts before deletion
    print("\nCurrent data:")
    for t in TABLES:
        try:
            cur.execute(f"SELECT COUNT(*) FROM {t}")
            count = cur.fetchone()[0]
            print(f"  {t}: {count}")
        except Exception:
            conn.rollback()
            print(f"  {t}: (table not found)")

    # Delete all rows
    print("\nDeleting...")
    for t in TABLES:
        try:
            cur.execute(f"DELETE FROM {t}")
            print(f"  Deleted {cur.rowcount} from {t}")
        except Exception as e:
            conn.rollback()
            print(f"  Skip {t}: {e}")

    # Reset employee ID sequence
    try:
        cur.execute("SELECT setval(pg_get_serial_sequence('employees', 'id'), 1, false)")
        print("  Reset employees.id sequence to 1")
    except Exception:
        conn.rollback()
        print("  (no serial sequence to reset)")

    conn.commit()

    # Clear JSON device stores
    print("\nClearing JSON device stores...")
    script_dir = os.path.dirname(os.path.abspath(__file__))
    for rel_path in JSON_STORES:
        full_path = os.path.join(script_dir, rel_path)
        if os.path.exists(full_path):
            try:
                with open(full_path, 'r') as f:
                    data = json.load(f)
                count = len(data) if isinstance(data, list) else 0
                with open(full_path, 'w') as f:
                    json.dump([], f, indent=2)
                print(f"  Cleared {count} devices from {rel_path}")
            except Exception as e:
                print(f"  Error clearing {rel_path}: {e}")
        else:
            print(f"  {rel_path}: not found (OK)")

    cur.close()
    conn.close()

    print("\n" + "=" * 60)
    print("SYSTEM IS COMPLETELY CLEAN")
    print("=" * 60)
    print("\nRestart the backend, then use Device Discovery to re-add devices.")

if __name__ == '__main__':
    wipe()
