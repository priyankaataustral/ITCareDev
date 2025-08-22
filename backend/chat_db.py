# chat_db.py
# SQLite chat history storage for each ticket
import sqlite3
from datetime import datetime

DB_PATH = 'chat_history.sqlite3'

def init_db():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            thread_id TEXT NOT NULL,
            sender TEXT NOT NULL,
            content TEXT NOT NULL,
            timestamp TEXT NOT NULL
        )
    ''')
    conn.commit()
    conn.close()

def save_message(thread_id, sender, content, timestamp=None):
    if not timestamp:
        timestamp = datetime.utcnow().isoformat()
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('''
        INSERT INTO messages (thread_id, sender, content, timestamp)
        VALUES (?, ?, ?, ?)
    ''', (thread_id, sender, content, timestamp))
    conn.commit()
    conn.close()

def get_messages(thread_id):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('''
        SELECT sender, content, timestamp FROM messages
        WHERE thread_id = ?
        ORDER BY id ASC
    ''', (thread_id,))
    rows = c.fetchall()
    conn.close()
    return [
        {'sender': sender, 'content': content, 'timestamp': timestamp}
        for sender, content, timestamp in rows
    ]

# Call this once at app startup
if __name__ == '__main__':
    init_db()
