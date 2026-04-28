"""
Migration: Add employee_schedules and daily_shift_records tables.
Run once to create the new tables for per-employee timing and smart shift detection.
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.database.connection import engine, get_db_session
from sqlalchemy import text

def migrate():
    with engine.connect() as conn:
        # --- employee_schedules ---
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS employee_schedules (
                id SERIAL PRIMARY KEY,
                employee_id INTEGER NOT NULL UNIQUE REFERENCES employees(id) ON DELETE CASCADE,
                work_start TIME NOT NULL,
                work_end TIME NOT NULL,
                has_break BOOLEAN DEFAULT FALSE,
                break_start TIME,
                break_end TIME,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            );
        """))

        # --- daily_shift_records ---
        conn.execute(text("""
            DO $$ BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'detectionmethod') THEN
                    CREATE TYPE detectionmethod AS ENUM ('schedule', 'assigned', 'auto', 'none');
                END IF;
            END $$;
        """))

        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS daily_shift_records (
                id SERIAL PRIMARY KEY,
                employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
                date DATE NOT NULL,
                shift_id INTEGER REFERENCES shifts(id) ON DELETE SET NULL,
                detection_method detectionmethod NOT NULL DEFAULT 'none',
                work_start TIME,
                work_end TIME,
                break_start TIME,
                break_end TIME,
                locked BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT NOW(),
                CONSTRAINT uq_employee_day UNIQUE (employee_id, date)
            );
            CREATE INDEX IF NOT EXISTS ix_daily_shift_records_date ON daily_shift_records(date);
        """))

        conn.commit()
        print("Migration complete: employee_schedules + daily_shift_records tables created.")


if __name__ == "__main__":
    migrate()
