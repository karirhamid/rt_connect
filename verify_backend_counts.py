import psycopg2
import sys

DB = {
    'host': 'localhost',
    'port': 5432,
    'database': 'rtzkconnect_db',
    'user': 'postgres',
    'password': 'Pa$$word02'
}

TABLES = [
    ('employees','Employees'),
    ('attendance','Attendance'),
    ('sync_logs','Sync Logs'),
]

def main():
    try:
        conn = psycopg2.connect(**DB)
        cur = conn.cursor()
        print("================ Backend Data Counts ================")
        for table,label in TABLES:
            cur.execute(f'SELECT COUNT(*) FROM {table}')
            count = cur.fetchone()[0]
            print(f"{label:<15}: {count}")
        # Device timestamps check
        cur.execute('SELECT COUNT(*) FROM devices')
        devices = cur.fetchone()[0]
        cur.execute('SELECT COUNT(*) FROM devices WHERE last_sync IS NOT NULL OR last_attendance_sync IS NOT NULL')
        with_sync = cur.fetchone()[0]
        print(f"Devices total    : {devices}")
        print(f"Devices with sync: {with_sync}")
        print("======================================================")
        cur.close(); conn.close()
    except Exception as e:
        print("ERROR:", e)
        sys.exit(1)

if __name__ == '__main__':
    main()
