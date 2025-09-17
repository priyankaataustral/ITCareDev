import faiss
import numpy as np
from sqlalchemy import text as _sql_text
import json
from datetime import datetime, timezone
from flask import abort
from sqlalchemy import text as _sql_text, func
from extensions import db
from models import Ticket, Message, ResolutionAttempt, TicketEvent, Solution, KBArticle, Department, TicketCC, EmailQueue, StepSequence, TicketHistory, SolutionGeneratedBy, SolutionStatus # Import all models
from email_helpers import _fingerprint, _normalize
from openai_helpers import categorize_department_with_gpt
from utils import extract_mentions
from cli import load_df
from openai_helpers import get_embedding_for_article

# Insert a new message and store @mentions
def insert_message_with_mentions(ticket_id, sender, content):
    from sqlalchemy import text
    # Ensure ticket exists before inserting message
    ticket = db.session.get(Ticket, ticket_id)
    if not ticket:
        # Try to auto-assign department using GPT if possible
        description = content if isinstance(content, str) else json.dumps(content, ensure_ascii=False)
        dep_name = categorize_department_with_gpt(description)
        dep_id = None
        if dep_name:
            dep = Department.query.filter_by(name=dep_name).first()
            if dep:
                dep_id = dep.id
        ticket = Ticket(id=ticket_id, status='open', department_id=dep_id)
        db.session.add(ticket)
        db.session.commit()

    # Convert content to string if it's a dict
    if isinstance(content, dict):
        content = json.dumps(content, ensure_ascii=False)
    # 1. Insert the message into the 'messages' table
    msg = Message(ticket_id=ticket_id, sender=sender, content=content, timestamp=datetime.utcnow())
    db.session.add(msg)
    db.session.commit()
    message_id = msg.id

    # 2. Extract all @mentions from the message content
    mentions = extract_mentions(content)

    # 3. For each extracted mention:
    for mention_name in mentions:
        # a. Look up the agent's ID in the 'agents' table by name
        print(f"DEBUG: Querying agents table for name: {mention_name}")
        agent_row = db.session.execute(text("SELECT id FROM agents WHERE name = :name"), {"name": mention_name}).fetchone()
        if agent_row:
            mentioned_agent_id = agent_row[0]
            # b. Insert a record into the 'mentions' table with message_id and mentioned_agent_id
            db.session.execute(text("INSERT IGNORE INTO mentions (message_id, mentioned_agent_id) VALUES (:msg_id, :agent_id)"), {"msg_id": message_id, "agent_id": mentioned_agent_id})
    db.session.commit()
    print(f"Message inserted (id={message_id}), mentions stored: {mentions}")



def _has_column(table: str, column: str) -> bool:
    row = db.session.execute(_sql_text(f"PRAGMA table_info({table});")).fetchall()
    return any(col[1] == column for col in row)

def _add_column_no_default(table: str, column_ddl: str):
    """
    Add a column WITHOUT any non-constant default.
    Example: _add_column_no_default('tickets', "created_at TEXT")
    """
    colname = column_ddl.split()[0]
    if not _has_column(table, colname):
        db.session.execute(_sql_text(f"ALTER TABLE {table} ADD COLUMN {column_ddl};"))
        db.session.commit()

def run_sqlite_migrations():
    db.session.execute(_sql_text("PRAGMA foreign_keys = ON;"))

    # agents
    _add_column_no_default('agents', 'role TEXT')
    _add_column_no_default('agents', 'department_id INTEGER')

    # tickets (add w/o defaults, then backfill)
    _add_column_no_default('tickets', 'subject TEXT')
    _add_column_no_default('tickets', 'category TEXT')
    _add_column_no_default('tickets', 'department_id INTEGER')
    _add_column_no_default('tickets', 'priority TEXT')
    _add_column_no_default('tickets', 'impact_level TEXT')
    _add_column_no_default('tickets', 'urgency_level TEXT')
    _add_column_no_default('tickets', 'requester_email TEXT')
    _add_column_no_default('tickets', 'created_at TEXT')
    _add_column_no_default('tickets', 'updated_at TEXT')
    _add_column_no_default('tickets', 'level INTEGER')
    _add_column_no_default('tickets', 'resolved_by INTEGER')
    _add_column_no_default('tickets', 'assigned_to INTEGER')

    # messages QoL
    _add_column_no_default('messages', 'created_at TEXT')
    _add_column_no_default('messages', 'sender_agent_id INTEGER')

    # create the new tables in case they don't exist (db.create_all handles this too)
    db.session.execute(_sql_text("""
        CREATE TABLE IF NOT EXISTS departments(
            id INTEGER PRIMARY KEY,
            name TEXT UNIQUE NOT NULL
        );
    """))

    db.session.execute(_sql_text("""
        CREATE TABLE IF NOT EXISTS ticket_assignments(
            id INTEGER PRIMARY KEY,
            ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
            agent_id INTEGER REFERENCES agents(id) ON DELETE SET NULL,
            assigned_at TEXT,
            unassigned_at TEXT
        );
    """))

    db.session.execute(_sql_text("""
        CREATE TABLE IF NOT EXISTS ticket_events(
            id INTEGER PRIMARY KEY,
            ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
            event_type TEXT NOT NULL,
            actor_agent_id INTEGER REFERENCES agents(id),
            details TEXT,
            created_at TEXT
        );
    """))

    db.session.execute(_sql_text("""
        CREATE TABLE IF NOT EXISTS ticket_cc(
            id INTEGER PRIMARY KEY,
            ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
            email TEXT NOT NULL,
            UNIQUE(ticket_id, email)
        );
    """))

    db.session.execute(_sql_text("""
        CREATE TABLE IF NOT EXISTS ticket_watchers(
            id INTEGER PRIMARY KEY,
            ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
            agent_id INTEGER REFERENCES agents(id),
            UNIQUE(ticket_id, agent_id)
        );
    """))

    db.session.execute(_sql_text("""
        CREATE TABLE IF NOT EXISTS email_queue(
            id INTEGER PRIMARY KEY,
            ticket_id TEXT REFERENCES tickets(id) ON DELETE SET NULL,
            to_email TEXT NOT NULL,
            cc TEXT,
            subject TEXT NOT NULL,
            body TEXT NOT NULL,
            status TEXT DEFAULT 'PENDING',
            error TEXT,
            created_at TEXT,
            sent_at TEXT
        );
    """))

    db.session.execute(_sql_text("""
        CREATE TABLE IF NOT EXISTS ticket_feedback(
            id INTEGER PRIMARY KEY,
            ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
            rating INTEGER,
            comment TEXT,
            submitted_at TEXT
        );
    """))

    db.session.execute(_sql_text("""
        CREATE TABLE IF NOT EXISTS kb_drafts(
            id INTEGER PRIMARY KEY,
            ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
            title TEXT,
            body TEXT,
            status TEXT DEFAULT 'DRAFT',
            created_at TEXT,
            updated_at TEXT
        );
    """))

    # helpful indexes
    db.session.execute(_sql_text("CREATE INDEX IF NOT EXISTS ix_tickets_dept ON tickets(department_id);"))
    db.session.execute(_sql_text("CREATE INDEX IF NOT EXISTS ix_tickets_priority ON tickets(priority);"))
    db.session.execute(_sql_text("CREATE INDEX IF NOT EXISTS ix_messages_ticket_time ON messages(ticket_id, timestamp);"))
    db.session.execute(_sql_text("CREATE INDEX IF NOT EXISTS ix_eq_status ON email_queue(status, created_at);"))
    db.session.commit()

    # -------- Backfill phase (safe and idempotent) --------
    # tickets.created_at: set to existing updated_at, else now
    db.session.execute(_sql_text("""
        UPDATE tickets
        SET created_at = COALESCE(created_at, updated_at, datetime('now'))
        WHERE created_at IS NULL;
    """))
    # tickets.updated_at: set to created_at if null
    db.session.execute(_sql_text("""
        UPDATE tickets
        SET updated_at = COALESCE(updated_at, created_at, datetime('now'))
        WHERE updated_at IS NULL;
    """))

    # messages.created_at mirror (optional)
    db.session.execute(_sql_text("""
        UPDATE messages
        SET created_at = COALESCE(created_at, strftime('%Y-%m-%dT%H:%M:%fZ', timestamp))
        WHERE created_at IS NULL;
    """))

    db.session.execute(_sql_text("""
        CREATE TABLE IF NOT EXISTS resolution_attempts(
            id INTEGER PRIMARY KEY,
            ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
            solution_id INTEGER NOT NULL REFERENCES solutions(id) ON DELETE CASCADE,
            attempt_no INTEGER NOT NULL,
            sent_at TEXT,
            outcome TEXT DEFAULT 'pending',
            rejected_reason TEXT,
            rejected_detail_json TEXT,
            closed_at TEXT,
            agent_id INTEGER REFERENCES agents(id)
        );
    """))
    # Add agent_id column if missing
    _add_column_no_default('resolution_attempts', 'agent_id INTEGER')
    db.session.execute(_sql_text("CREATE INDEX IF NOT EXISTS ix_ra_ticket_attempt ON resolution_attempts(ticket_id, attempt_no);"))
    db.session.execute(_sql_text("CREATE INDEX IF NOT EXISTS ix_ra_outcome ON resolution_attempts(outcome);"))


    db.session.commit()

# ─── Create / Migrate ─────────────────────────────────────────────────────────

def get_next_attempt_no(ticket_id: str) -> int:
    last = db.session.query(func.max(ResolutionAttempt.attempt_no)).filter_by(ticket_id=ticket_id).scalar()
    return (last or 0) + 1

def has_pending_attempt(ticket_id: str) -> bool:
    return db.session.query(ResolutionAttempt.id).filter_by(ticket_id=ticket_id, outcome='pending').first() is not None


# --- Event helper (single source of truth for ticket events) ---
from datetime import timezone
def add_event(ticket_id, event_type, actor_agent_id=None, **details):
    ev = TicketEvent(
        ticket_id=ticket_id,
        event_type=event_type,
        actor_agent_id=actor_agent_id,
        details=json.dumps(details, ensure_ascii=False),
    )
    db.session.add(ev)

def create_solution(ticket_id: str, text: str, proposed_by: str | None = None):
    now = datetime.utcnow()
    s = Solution(
        ticket_id=ticket_id,
        proposed_by=proposed_by or "ai-assistant",
        generated_by=SolutionGeneratedBy.ai,
        ai_contribution_pct=100.0,
        text=text,
        normalized_text=_normalize(text),
        fingerprint_sha256=_fingerprint(text),
        status=SolutionStatus.draft,
        created_at=now,
        updated_at=now,
    )
    db.session.add(s)
    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        # If duplicate fingerprint for same ticket, return existing
        existing = (Solution.query
                    .filter_by(ticket_id=ticket_id, fingerprint_sha256=_fingerprint(text))
                    .first())
        if existing:
            return existing
        raise
    return s


def log_ticket_history(
    ticket_id,
    event_type,
    actor_agent_id=None,
    old_value=None,
    new_value=None,
    department_id=None,
    from_role=None,
    to_role=None,
    from_agent_id=None,
    to_agent_id=None,
    note=None
):
    history = TicketHistory(
        ticket_id=ticket_id,
        event_type=event_type,
        actor_agent_id=actor_agent_id,
        old_value=old_value,
        new_value=new_value,
        department_id=department_id,
        from_role=from_role,
        to_role=to_role,
        from_agent_id=from_agent_id,
        to_agent_id=to_agent_id,
        note=note
    )
    db.session.add(history)
    db.session.commit()

# def audit(event: str, entity_type: str, entity_id: int, actor_id=None, meta: dict | None=None):
#     rec = KBAudit(
#         event=event,
#         entity_type=entity_type,
#         entity_id=entity_id,
#         actor_id=actor_id,
#         meta_json=json.dumps(meta or {})
#     )
#     db.session.add(rec)

# ─── DB helper functions ──────────────────────────────────────────────────────
def save_message(ticket_id, sender, content, type='assistant', meta=None):
    # Ensure content is always a string for DB
    if isinstance(content, dict):
        content_str = json.dumps(content, ensure_ascii=False)
    else:
        content_str = content
    # Extract mentions
    mentions = extract_mentions(content_str)
    msg = Message(
        ticket_id=ticket_id,
        sender=sender,
        content=content_str,
        type=type,
        meta=meta
    )
    db.session.add(msg)
    # Set ticket status to open if not already
    ticket = db.session.get(Ticket, ticket_id)
    if not ticket:
        ticket = Ticket(id=ticket_id, status='open')
        db.session.add(ticket)
    elif ticket.status == 'closed':
        ticket.status = 'open'
    db.session.commit()
    # Optionally return the message object with mentions
    return {
        "id": f"msg_{msg.id}",
        "text": content_str,
        "type": type,
        "meta": meta,
        "mentions": mentions,
        "timestamp": msg.timestamp.isoformat()
    }

def get_messages(ticket_id):
    msgs = Message.query.filter_by(ticket_id=ticket_id).order_by(Message.timestamp).all()
    # Add 'type' field: 'agent' for user, 'bot' for assistant, 'system' for status
    result = []
    for m in msgs:
        msg_type = 'agent' if m.sender == 'user' else 'bot'
        # If content is a system status update, mark as 'system'
        if isinstance(m.content, str) and m.content.startswith('[SYSTEM]'):
            msg_type = 'system'
        # Extract mentions from message content
        content = m.content.replace('[SYSTEM]', '').strip() if msg_type == 'system' else m.content
        mentions = extract_mentions(content)
        result.append({
            "id": f"msg_{m.id}",
            "sender": m.sender,
            "content": content,
            "timestamp": m.timestamp.isoformat(),
            "type": msg_type,
            "mentions": mentions
        })
    return result

def save_steps(ticket_id, steps):
    seq = StepSequence(ticket_id=ticket_id, steps=steps, current_index=0)
    db.session.merge(seq)
    db.session.commit()

def get_steps(ticket_id):
    return db.session.get(StepSequence, ticket_id)


def _csv_row_for_ticket(ticket_id: str):
    df = load_df()
    row = df[df["id"] == ticket_id]
    return None if row.empty else row.iloc[0].to_dict()


def ensure_ticket_record_from_csv(ticket_id: str):
    """
    Ensure a Ticket row exists with requester_email/subject/levels populated.
    Also ensures an OPENED event exists once.
    Safe to call on every request.
    """
    t = db.session.get(Ticket, ticket_id)
    created_now = False
    if not t:
        t = Ticket(id=ticket_id, status='open')
        created_now = True
        db.session.add(t)

    row = _csv_row_for_ticket(ticket_id)
    if row:
        # only set if missing in DB (don’t overwrite later edits)
        if not t.subject:         t.subject = _derive_subject_from_text(row.get("text", ""))
        if not t.requester_email: t.requester_email = (row.get("email") or "").strip().lower()
        if not t.priority:        t.priority = row.get("level") or None
        if not t.urgency_level:   t.urgency_level = row.get("urgency_level") or None
        if not t.impact_level:    t.impact_level = row.get("impact_level") or None
        if not t.category:        t.category = row.get("category_id") or None

    now = datetime.utcnow().isoformat()
    if not t.created_at: t.created_at = now
    t.updated_at = now
    db.session.commit()

    # ensure one OPENED event exists
    exists = db.session.query(TicketEvent.id).filter_by(ticket_id=ticket_id, event_type='OPENED').first()
    if not exists:
        db.session.add(TicketEvent(
            ticket_id=ticket_id,
            event_type='OPENED',
            actor_agent_id=None,
            details=json.dumps({"source": "csv-init"}),
            created_at=t.created_at
        ))
        db.session.commit()

    return t

def log_event(ticket_id: str, event_type: str, details: dict | None = None, actor_agent_id: int | None = None):
    ev = TicketEvent(
        ticket_id=ticket_id,
        event_type=event_type,
        actor_agent_id=actor_agent_id,
        details=json.dumps(details or {}),
    created_at=datetime.utcnow()
    )
    db.session.add(ev)
    db.session.commit()

def get_timeline(ticket_id: str):
    msgs = Message.query.filter_by(ticket_id=ticket_id).order_by(Message.timestamp.asc()).all()
    items = [{
        "kind": "message",
        "actor": m.sender,
        "text": m.content if isinstance(m.content, str) else json.dumps(m.content, ensure_ascii=False),
        "ts": (m.timestamp or datetime.utcnow()).isoformat()
    } for m in msgs]

    events = TicketEvent.query.filter_by(ticket_id=ticket_id).order_by(TicketEvent.created_at.asc()).all()
    for e in events:
        try:
            det = json.loads(e.details) if e.details else {}
        except Exception:
            det = {"raw": e.details}
        summary = e.event_type
        if "reason" in det: summary += f": {det['reason']}"
        if "note" in det:   summary += f": {det['note']}"
        items.append({
            "kind": "event",
            "actor": str(e.actor_agent_id) if e.actor_agent_id else "system",
            "text": summary,
            "ts": e.created_at or datetime.utcnow().isoformat()
        })
    items.sort(key=lambda x: x["ts"])
    return items


def ensure_owner_or_manager(ticket, user):
    if user.get("role") == "MANAGER":
        return
    if ticket.owner and ticket.owner != user.get("name"):
        abort(403, description="Only owner or manager can do this")


# ─── CSV → DB hydration & timeline helpers ─────────────────────────────────────

def _derive_subject_from_text(text: str) -> str:
    if not text:
        return ""
    text = str(text).strip().replace("\n", " ")
    return text[:120]


# ─── OpenAI & FAISS setup ──────────────────────────────────────────────────────
# Create FAISS index for KB articles
def create_faiss_index():
    index = faiss.IndexFlatL2(768)  # Use 768-dimensional vectors (for BERT embeddings)
    
    # Load KB articles and their embeddings from the database
    kb_articles = KBArticle.query.all()
    embeddings = []
    for article in kb_articles:
        embeddings.append(get_embedding_for_article(article))  # Function to get embeddings from OpenAI or other models
    
    # Convert embeddings to a numpy array and add to FAISS index
    embeddings = np.array(embeddings).astype(np.float32)
    index.add(embeddings)

    return index

