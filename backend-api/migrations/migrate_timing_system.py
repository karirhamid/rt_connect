"""
Migration: Timing System Redesign
- Add timing_enabled to app_settings
- Rework employee_schedules: add day_of_week, is_day_off columns; change unique constraint
- Create department_schedules table
"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.database.connection import engine
from sqlalchemy import text

def run_migration():
    with engine.connect() as conn:
        # 1. Add timing_enabled to app_settings
        try:
            conn.execute(text("""
                ALTER TABLE app_settings
                ADD COLUMN IF NOT EXISTS timing_enabled BOOLEAN DEFAULT FALSE NOT NULL
            """))
            print("[OK] Added timing_enabled to app_settings")
        except Exception as e:
            print(f"[SKIP] timing_enabled: {e}")

        # 2. Rework employee_schedules
        # Add day_of_week column
        try:
            conn.execute(text("""
                ALTER TABLE employee_schedules
                ADD COLUMN IF NOT EXISTS day_of_week INTEGER
            """))
            print("[OK] Added day_of_week to employee_schedules")
        except Exception as e:
            print(f"[SKIP] day_of_week: {e}")

        # Add is_day_off column
        try:
            conn.execute(text("""
                ALTER TABLE employee_schedules
                ADD COLUMN IF NOT EXISTS is_day_off BOOLEAN DEFAULT FALSE
            """))
            print("[OK] Added is_day_off to employee_schedules")
        except Exception as e:
            print(f"[SKIP] is_day_off: {e}")

        # Make work_start/work_end nullable (day off has no times)
        try:
            conn.execute(text("""
                ALTER TABLE employee_schedules
                ALTER COLUMN work_start DROP NOT NULL
            """))
            conn.execute(text("""
                ALTER TABLE employee_schedules
                ALTER COLUMN work_end DROP NOT NULL
            """))
            print("[OK] Made work_start/work_end nullable")
        except Exception as e:
            print(f"[SKIP] nullable columns: {e}")

        # Expand existing single-row records to day_of_week=0 (Monday) if null
        try:
            conn.execute(text("""
                UPDATE employee_schedules SET day_of_week = 0 WHERE day_of_week IS NULL
            """))
            print("[OK] Set default day_of_week=0 for existing rows")
        except Exception as e:
            print(f"[SKIP] default day_of_week: {e}")

        # Make day_of_week NOT NULL now
        try:
            conn.execute(text("""
                ALTER TABLE employee_schedules
                ALTER COLUMN day_of_week SET NOT NULL
            """))
            print("[OK] Made day_of_week NOT NULL")
        except Exception as e:
            print(f"[SKIP] day_of_week NOT NULL: {e}")

        # Drop old unique constraint on employee_id alone
        try:
            conn.execute(text("""
                ALTER TABLE employee_schedules
                DROP CONSTRAINT IF EXISTS employee_schedules_employee_id_key
            """))
            print("[OK] Dropped old unique constraint on employee_id")
        except Exception as e:
            print(f"[SKIP] drop old unique: {e}")

        # Add new composite unique constraint
        try:
            conn.execute(text("""
                ALTER TABLE employee_schedules
                ADD CONSTRAINT uq_employee_schedule_day UNIQUE (employee_id, day_of_week)
            """))
            print("[OK] Added unique constraint (employee_id, day_of_week)")
        except Exception as e:
            print(f"[SKIP] new unique: {e}")

        # 3. Create department_schedules table
        try:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS department_schedules (
                    id SERIAL PRIMARY KEY,
                    department_id INTEGER NOT NULL REFERENCES departments(id),
                    day_of_week INTEGER NOT NULL,
                    is_day_off BOOLEAN DEFAULT FALSE,
                    work_start TIME,
                    work_end TIME,
                    has_break BOOLEAN DEFAULT FALSE,
                    break_start TIME,
                    break_end TIME,
                    created_at TIMESTAMP DEFAULT NOW(),
                    updated_at TIMESTAMP DEFAULT NOW(),
                    CONSTRAINT uq_department_schedule_day UNIQUE (department_id, day_of_week)
                )
            """))
            print("[OK] Created department_schedules table")
        except Exception as e:
            print(f"[SKIP] department_schedules table: {e}")

        conn.commit()
        print("\n[DONE] Timing system migration complete.")

if __name__ == "__main__":
    run_migration()
