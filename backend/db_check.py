# scripts/db_check.py
from app import create_app
from extensions import db
from sqlalchemy import text

app = create_app()

print("Starting app context…")
with app.app_context():
    print("Connecting to DB…")
    with db.engine.connect() as conn:
        result = conn.exec_driver_sql("SELECT 1").scalar()
        print("✅ Connected! SELECT 1 ->", result)
