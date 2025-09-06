import pandas as pd
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