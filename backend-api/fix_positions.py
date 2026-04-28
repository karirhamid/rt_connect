"""Fix: create default position row and check schema"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from app.database.connection import get_db_session
from sqlalchemy import text

with get_db_session() as db:
    # Check columns
    cols = db.execute(text(
        "SELECT column_name, is_nullable FROM information_schema.columns "
        "WHERE table_name='positions' ORDER BY ordinal_position"
    )).fetchall()
    print("Positions columns:", cols)

    # Insert with department_id = 1 (Administratif)
    db.execute(text(
        "INSERT INTO positions (id, department_id, name) "
        "VALUES (1, 1, 'Employee') ON CONFLICT (id) DO NOTHING"
    ))
    db.commit()
    rows = db.execute(text("SELECT * FROM positions")).fetchall()
    print("Positions:", rows)
