import pandas as pd
import sqlite3
from sqlalchemy import create_engine

# 1. Get the database URL from your environment variable
import os
DATABASE_URL = os.environ.get("DATABASE_URL")

# 2. Point to your CSV (in the same folder)
df = pd.read_csv("data/cleaned_tickets.csv", encoding="latin1")

# 3. Create a database engine using the DATABASE_URL
engine = create_engine(DATABASE_URL)

# 4. Append to the 'ticket' table
df.to_sql(
    name="test",
    con=engine,
    if_exists="append",  # or "replace" if you want to wipe & reload entirely
    index=False
)

print(f"✅ Loaded {len(df)} rows into 'test' table")


def fix_datetime_fields(db_path):
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    # Fix created_at
    cur.execute("""
        UPDATE test
        SET created_at = 
            substr(created_at, 1, 10) || 'T' || substr(created_at, 12) || '.000000+00:00'
        WHERE created_at IS NOT NULL 
          AND instr(created_at, 'T') = 0
          AND length(created_at) = 19;
    """)
    # Fix updated_at
    cur.execute("""
        UPDATE test
        SET updated_at = 
            substr(updated_at, 1, 10) || 'T' || substr(updated_at, 12) || '.000000+00:00'
        WHERE updated_at IS NOT NULL 
          AND instr(updated_at, 'T') = 0
          AND length(updated_at) = 19;
    """)
    conn.commit()
    conn.close()
    print("✅ Datetime fields fixed.")

# Call this after loading tickets
# Update the path to your SQLite DB file if needed
# fix_datetime_fields('backend/your_database_file.sqlite')