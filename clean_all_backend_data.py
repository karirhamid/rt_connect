"""
Script to clean ALL backend data related to device syncing (employees, attendance, sync logs).
Keeps devices and organization master data (companies, departments, positions) intact.
"""
import psycopg2
import argparse

# PostgreSQL connection parameters
DB_CONFIG = {
    'host': 'localhost',
    'port': 5432,
    'database': 'rtzkconnect_db',
    'user': 'postgres',
    'password': 'Pa$$word02'
}

TABLES_TO_TRUNCATE = [
    ('attendance', 'Attendance records'),
    ('sync_logs', 'Sync logs'),
    ('employees', 'Employees'),
]

RESET_DEVICE_FIELDS = [
    ('devices', ['last_sync', 'last_attendance_sync'])
]

def clean_all_backend_data(auto_yes: bool = False):
    conn = None
    cur = None
    try:
        print("=" * 60)
        print("FULL BACKEND CLEANUP (Employees, Attendance, Sync Logs)")
        print("=" * 60)

        conn = psycopg2.connect(**DB_CONFIG)
        cur = conn.cursor()

        # Count before
        counts = {}
        for table, label in TABLES_TO_TRUNCATE:
            cur.execute(f"SELECT COUNT(*) FROM {table}")
            counts[table] = cur.fetchone()[0]

        print("\n📊 Current data:")
        for table, label in TABLES_TO_TRUNCATE:
            print(f"   - {label}: {counts[table]}")

        if sum(counts.values()) == 0:
            print("\n✅ Database already clean.")
            return

        if not auto_yes:
            print("\n⚠️  WARNING: This will delete:")
            for table, label in TABLES_TO_TRUNCATE:
                print(f"   - {counts[table]} {label}")
            print("\n   This action CANNOT be undone!")
            print("   Devices and organization data will be preserved.")

            resp = input("\nType 'YES' to confirm deletion: ")
            if resp != 'YES':
                print("\n❌ Deletion cancelled.")
                return
        else:
            print("\n⚠️  AUTO MODE: Proceeding with deletion without interactive confirmation (--yes).")

        print("\n🗑️  Deleting data...")
        # Delete in FK-safe order
        for table, label in TABLES_TO_TRUNCATE:
            cur.execute(f"DELETE FROM {table}")
            print(f"   ✓ Deleted {cur.rowcount} from {label}")

        # Reset device timestamps
        for table, fields in RESET_DEVICE_FIELDS:
            set_clause = ", ".join([f"{f}=NULL" for f in fields])
            cur.execute(f"UPDATE {table} SET {set_clause}")
            print(f"   ✓ Reset {', '.join(fields)} on devices")

        conn.commit()

        print("\n" + "=" * 60)
        print("✅ BACKEND CLEANED SUCCESSFULLY!")
        print("=" * 60)
        print("\nYou can now use manual sync from the Devices page.")

    except Exception as e:
        if conn:
            conn.rollback()
        print(f"\n❌ Error cleaning database: {e}")
        return 1
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Clean backend data (employees, attendance, sync logs).')
    parser.add_argument('--yes', action='store_true', help='Skip interactive confirmation and delete immediately')
    args = parser.parse_args()
    clean_all_backend_data(auto_yes=args.yes)
