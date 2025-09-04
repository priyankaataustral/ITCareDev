import pandas as pd
import sqlite3

# 1. Point to your CSV (in the same folder)
df = pd.read_csv("data/cleaned_tickets.csv", encoding="latin1")

# 2. Connect to your database
conn = sqlite3.connect("tickets.db")

# 3. Append to the 'ticket' table
df.to_sql(
    name="test",
    con=conn,
    if_exists="append",  # or "replace" if you want to wipe & reload entirely
    index=False
)

conn.close()
print(f"✅ Loaded {len(df)} rows into 'ticket'")
