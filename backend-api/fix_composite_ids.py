"""
Fix composite_id overflow issue:
1. Delete orphan attendance + employees (from deleted devices)
2. Widen the PG trigger range from 100 to 10000 per IP octet
3. Recalculate all existing composite_ids with the new formula
"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))

from app.database.connection import get_db_session
from sqlalchemy import text

def main():
    with get_db_session() as db:
        # Step 1: Delete orphan attendance records (reference orphan employees)
        att_result = db.execute(text("""
            DELETE FROM attendance
            WHERE employee_id IN (
                SELECT e.id FROM employees e
                LEFT JOIN devices d ON e.source_device_id = d.id
                WHERE e.source_device_id IS NOT NULL AND d.id IS NULL
            )
        """))
        print(f"Step 1: Deleted {att_result.rowcount} orphan attendance record(s)")

        # Step 2: Delete orphan employees (source device no longer exists)
        emp_result = db.execute(text("""
            DELETE FROM employees
            WHERE source_device_id IS NOT NULL
              AND source_device_id NOT IN (SELECT id FROM devices)
        """))
        print(f"Step 2: Deleted {emp_result.rowcount} orphan employee(s)")

        # Step 3: Update the trigger function — widen range from 100 to 10000
        db.execute(text("""
            CREATE OR REPLACE FUNCTION assign_composite_id()
            RETURNS TRIGGER AS $$
            DECLARE
                device_prefix BIGINT;
                last_counter BIGINT;
                new_composite_id BIGINT;
                device_ip TEXT;
                last_octet INTEGER;
            BEGIN
                SELECT ip INTO device_ip
                FROM devices
                WHERE id = NEW.source_device_id;

                IF device_ip IS NULL THEN
                    RAISE EXCEPTION 'Device not found for source_device_id: %', NEW.source_device_id;
                END IF;

                last_octet := CAST(split_part(device_ip, '.', 4) AS INTEGER);
                device_prefix := last_octet * 10000;

                SELECT COALESCE(MAX(composite_id), device_prefix) INTO last_counter
                FROM employees
                WHERE composite_id >= device_prefix
                  AND composite_id < device_prefix + 10000;

                IF last_counter < device_prefix THEN
                    new_composite_id := device_prefix + 1;
                ELSE
                    new_composite_id := last_counter + 1;
                END IF;

                NEW.composite_id := new_composite_id;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
        """))
        print("Step 3: Trigger updated (10000 slots per IP octet)")

        # Step 4: Recalculate composite_ids for existing employees
        db.execute(text("""
            WITH ranked AS (
                SELECT e.id,
                       CAST(split_part(d.ip, '.', 4) AS INTEGER) * 10000 AS prefix,
                       ROW_NUMBER() OVER (
                           PARTITION BY CAST(split_part(d.ip, '.', 4) AS INTEGER)
                           ORDER BY e.id
                       ) AS rn
                FROM employees e
                JOIN devices d ON e.source_device_id = d.id
            )
            UPDATE employees SET composite_id = ranked.prefix + ranked.rn
            FROM ranked
            WHERE employees.id = ranked.id
        """))
        print("Step 4: Recalculated all composite_ids")

        db.commit()
        print("\nAll changes committed.")

        # Verify
        results = db.execute(text("""
            SELECT d.ip, d.name, MIN(e.composite_id), MAX(e.composite_id), COUNT(*)
            FROM employees e
            JOIN devices d ON e.source_device_id = d.id
            GROUP BY d.ip, d.name
            ORDER BY d.ip
        """)).fetchall()
        print("\nVerification — composite_id ranges:")
        for r in results:
            print(f"  {r[1]} ({r[0]}) range=[{r[2]}, {r[3]}] count={r[4]}")

        total = db.execute(text("SELECT COUNT(*) FROM employees")).scalar()
        print(f"\nTotal employees: {total}")

if __name__ == "__main__":
    main()
