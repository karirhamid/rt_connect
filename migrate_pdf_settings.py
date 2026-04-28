import sys
sys.path.insert(0, 'backend-api')
from app.database.connection import engine
from sqlalchemy import text

with engine.connect() as conn:
    conn.execute(text("ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS pdf_style VARCHAR(20) NOT NULL DEFAULT 'style1'"))
    conn.execute(text("ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS pdf_show_overtime BOOLEAN NOT NULL DEFAULT TRUE"))
    conn.commit()
    print("Migration done: pdf_style, pdf_show_overtime added")
