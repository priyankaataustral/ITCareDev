# SQLite ticket storage and status management
import sqlite3
import csv
import os

DB_PATH = 'chat_history.sqlite3'

TICKET_FIELDS = [
    'id', 'email', 'text', 'level', 'urgency_level', 'impact_level', 'category_id', 'status'
]

def init_ticket_db():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS tickets (
            id TEXT PRIMARY KEY,
            email TEXT,
            text TEXT,
            level TEXT,
            urgency_level TEXT,
            impact_level TEXT,
            category_id TEXT,
            status TEXT DEFAULT 'open'
        )
    ''')
    conn.commit()
    conn.close()

def import_tickets_from_csv(csv_path):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    with open(csv_path, newline='', encoding='utf-8') as csvfile:
        reader = csv.DictReader(csvfile)
        for row in reader:
            c.execute('''
                INSERT OR IGNORE INTO tickets (id, text, level, urgency_level, impact_level, category_id, status)
                VALUES (?, ?, ?, ?, ?, ?, 'open')
            ''', (
                row['id'], row['email'], row['text'], row['level'], row['urgency_level'], row['impact_level'], row['category_id']
            ))
    conn.commit()
    conn.close()

def get_ticket(ticket_id):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('SELECT * FROM tickets WHERE id = ?', (ticket_id,))
    row = c.fetchone()
    conn.close()
    if row:
        return dict(zip(TICKET_FIELDS, row))
    return None

def update_ticket_status(ticket_id, new_status):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('UPDATE tickets SET status = ? WHERE id = ?', (new_status, ticket_id))
    conn.commit()
    conn.close()

if __name__ == '__main__':
    init_ticket_db()
    import_tickets_from_csv(os.path.join(os.path.dirname(__file__), 'data', 'cleaned_tickets.csv'))
