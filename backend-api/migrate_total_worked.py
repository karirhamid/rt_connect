from sqlalchemy import text
from app.database.connection import get_db_session

with get_db_session() as db:
    db.execute(text("ALTER TABLE app_settings ADD COLUMN pdf_show_total_worked BOOLEAN NOT NULL DEFAULT TRUE"))
    db.commit()
    print("Migration done: pdf_show_total_worked added")
