from sqlalchemy import or_
from flask import Blueprint, request, jsonify, abort, current_app, url_for, redirect
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired
import hashlib
from sqlalchemy import func  
import difflib    
from sqlalchemy.dialects.sqlite import JSON as SQLiteJSON
from sqlalchemy import Enum, Float, UniqueConstraint, ForeignKey, Integer, String, Boolean, DateTime, Text
import enum
import jwt
import re
from flask import make_response
import os
import csv
import json
import faiss
import numpy as np
import pandas as pd
from datetime import datetime, timedelta, timezone
from flask import Flask, request, jsonify, abort
from flask_cors import CORS
from dotenv import load_dotenv
from openai import OpenAI
from sqlalchemy.dialects.sqlite import JSON as SQLiteJSON
from extensions import db
from category_map import LABELS, TEAM_MAP
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import time, ssl, threading
from email.message import EmailMessage
from sqlalchemy import event
from sqlalchemy.engine import Engine
from functools import wraps
import sqlalchemy as sa
from flask_migrate import Migrate
from flask import redirect, request  # request used below for the redirect

DEMO_MODE = os.getenv("DEMO_MODE", "true").lower() == "true"  # turn off later
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")

app = Flask(__name__)
# CORS(app, origins=["http://localhost:3000"], supports_credentials=True)

app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    # set True in prod behind HTTPS:
    SESSION_COOKIE_SECURE=False,
)

load_dotenv()

SECRET_KEY = os.getenv("JWT_SECRET", "supersecretkey")
app.secret_key = os.getenv("FLASK_SECRET_KEY", "change-me-dev-secret")


OPENAI_KEY = os.getenv("OPENAI_API_KEY")
if not OPENAI_KEY:
    raise RuntimeError("Missing OPENAI_API_KEY in .env")

basedir = os.path.abspath(os.path.dirname(__file__))
# ─── Flask & DB setup ─────────────────────────────────────────────────────────
# Always use the root tickets.db, never the instance folder
db_path = os.path.join(os.path.dirname(__file__), '..', 'tickets.db')
db_path = os.path.abspath(db_path)

app.config['SQLALCHEMY_DATABASE_URI'] = f"sqlite:///{db_path}"
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db.init_app(app)

# --- Auth / Licensing wiring ---
from routes_auth import bp as auth_bp, init_auth
from routes_license import bp as license_bp
from license_gate import license_gate


import models_license
migrate = Migrate(app, db)

# ─── SMTP / Email config ──────────────────────────────────────────────────────
SMTP_SERVER = "smtp.gmail.com"
SMTP_PORT   = 465
SMTP_USER   = os.getenv("SMTP_USER", "testmailaiassistant@gmail.com")
SMTP_PASS   = os.getenv("SMTP_PASS", "ydop igne ijhw azws")  # consider env in prod
FROM_NAME   = "AI Support Assistant"  # optional display name
CONFIRM_SALT = "solution-confirm-v1"
CONFIRM_REDIRECT_URL_SUCCESS = f"{FRONTEND_URL}/confirm"
CONFIRM_REDIRECT_URL_REJECT  = f"{FRONTEND_URL}/not-fixed"
CONFIRM_REDIRECT_URL         = f"{FRONTEND_URL}/thank-you"


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
            db.session.execute(text("INSERT OR IGNORE INTO mentions (message_id, mentioned_agent_id) VALUES (:msg_id, :agent_id)"), {"msg_id": message_id, "agent_id": mentioned_agent_id})
    db.session.commit()
    print(f"Message inserted (id={message_id}), mentions stored: {mentions}")

# Utility: Extract @mentions from message text
def extract_mentions(text):
    """
    Finds all @mentions in the text and returns a list of names (without the '@').
    Example: "Hey @AgentB, can you assist @Priyanka?" -> ["AgentB", "Priyanka"]
    """
    if not isinstance(text, str):
        return []
    return re.findall(r'@([\w]+)', text)

# ─── Assistant Style (Global Constant) ───────────────────────────────────────
ASSISTANT_STYLE = (
    "You are an IT support co‑pilot. Be concise, friendly, and actionable.\n"
    "Always do the following:\n"
    "- If info is missing, ask up to 2 specific clarifying questions.\n"
    "- Prefer concrete steps with commands and where to click.\n"
    "- Use plain language. Avoid boilerplate like 'As an AI model...'\n"
    "- End with a short next step ('Try this and tell me what you see').\n"
)

# ─── Intent Expansion Helper ────────────────────────────────────────────────
def build_prompt_from_intent(intent, ticket_text, ticket_id=None):
    """
    Expands a suggested prompt (intent) into a rich, context-aware instruction for the assistant.
    """
    ctx = f"""
Ticket Context:
- ID: {ticket_id or 'N/A'}
- Description: {ticket_text or 'N/A'}
"""
    intent_lc = (intent or '').strip().lower()
    if intent_lc == 'can you suggest a fix for this issue?':
        return f"{ASSISTANT_STYLE}\n{ctx}\n\nGoal: Suggest the *most likely* fix first.\nOutput format:\n1) Likely Cause (1–2 lines)\n2) Fix (step-by-step, numbered, with exact commands/paths)\n3) Verify (how the user confirms it worked)\n4) If Not Fixed (1–2 next options)\n"
    elif intent_lc == 'draft a professional email to the user with the solution.':
        return f"{ASSISTANT_STYLE}\n{ctx}\n\nGoal: Write a short, professional email to the end user explaining the fix. \nConstraints: 120–180 words, simple language, bullet points for steps, friendly closing."
    elif intent_lc == 'is this a common problem?':
        return f"{ASSISTANT_STYLE}\n{ctx}\n\nGoal: Briefly explain how common this issue is and typical root causes.\nOutput: 3 bullets (Prevalence, Usual Causes, What Usually Fixes It)."
    elif intent_lc == 'has this happened before?':
        return f"{ASSISTANT_STYLE}\n{ctx}\n\nGoal: Assume we’re checking prior tickets. Summarize likely similar cases and their successful fixes (3 bullets), then suggest the best next step."
    elif intent_lc == 'should i escalate this?':
        return f"{ASSISTANT_STYLE}\n{ctx}\n\nGoal: Decide escalate vs continue. \nIf escalate: give a one‑line reason and list the 3 items L2 needs (logs, screenshots, timestamps).\nIf not: give the next 1–2 concrete steps to try first."
    elif intent_lc == 'suggest an alternative approach.':
        return f"{ASSISTANT_STYLE}\n{ctx}\n\nGoal: Suggest a different troubleshooting or resolution approach than previously discussed. Explain why it might work."
    elif intent_lc.startswith('ask me 3 clarifying questions'):
        # Special handling for clarifying questions prompt
        return f"{ASSISTANT_STYLE}\n{ctx}\n\nGoal: Ask exactly 3 concise, specific clarifying questions that would help resolve the issue fastest.\nOutput format: Return only a JSON array of 3 questions, e.g. [\"What operating system is the user running?\", \"Has the user tried restarting their computer?\", \"Is the issue affecting other users?\"]\nDo not provide answers, steps, or explanations."
    else:
        # Fallback: still wrap context + style
        return f"{ASSISTANT_STYLE}\n{ctx}\n\nUser request: {intent}\nProvide a concise, step-by-step answer."
    

# ENUM types for clarity
class SolutionGeneratedBy(enum.Enum):
    ai = "ai"
    human = "human"
    mixed = "mixed"

class SolutionConfirmedVia(enum.Enum):
    email = "email"
    web = "web"

class SolutionStatus(enum.Enum):
    draft = "draft"
    sent_for_confirm = "sent_for_confirm"
    confirmed_by_user = "confirmed_by_user"
    rejected = "rejected"
    published = "published"

class KBArticleSource(enum.Enum):
    ai = "ai"
    human = "human"
    mixed = "mixed"

class KBArticleVisibility(enum.Enum):
    internal = "internal"
    external = "external"

class KBArticleStatus(enum.Enum):
    draft = "draft"
    published = "published"
    archived = "archived"
    deprecated = "deprecated"

class KBFeedbackType(enum.Enum):
    helpful = "helpful"
    not_helpful = "not_helpful"
    issue = "issue"

# Solution table
class Solution(db.Model):
    __tablename__ = 'solutions'
    id = db.Column(db.Integer, primary_key=True)
    ticket_id = db.Column(db.String, index=True)
    proposed_by = db.Column(db.String)  # agent or AI name/id
    generated_by = db.Column(Enum(SolutionGeneratedBy), default=SolutionGeneratedBy.ai)
    ai_contribution_pct = db.Column(Float)
    ai_confidence = db.Column(Float)
    text = db.Column(db.Text)
    normalized_text = db.Column(db.Text)
    fingerprint_sha256 = db.Column(db.String, unique=True, index=True)
    sent_for_confirmation_at = db.Column(db.DateTime)
    confirmed_by_user = db.Column(db.Boolean, default=False)
    confirmed_at = db.Column(db.DateTime)
    confirmed_ip = db.Column(db.String)
    confirmed_via = db.Column(Enum(SolutionConfirmedVia))
    dedup_score = db.Column(Float)
    published_article_id = db.Column(db.Integer, db.ForeignKey('kb_articles.id'))
    status = db.Column(Enum(SolutionStatus), index=True, default=SolutionStatus.draft)
    created_at = db.Column(db.DateTime)
    updated_at = db.Column(db.DateTime)

class ResolutionAttempt(db.Model):
    __tablename__ = 'resolution_attempts'
    id = db.Column(db.Integer, primary_key=True)
    ticket_id = db.Column(db.String, db.ForeignKey('tickets.id'), index=True, nullable=False)
    solution_id = db.Column(db.Integer, db.ForeignKey('solutions.id'), index=True, nullable=False)
    attempt_no = db.Column(db.Integer, nullable=False)
    sent_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    outcome = db.Column(db.String(16), default='pending', index=True)  # pending|confirmed|rejected
    rejected_reason = db.Column(db.String(64))
    rejected_detail_json = db.Column(db.Text)   # JSON string
    closed_at = db.Column(db.DateTime)
    agent_id = db.Column(db.Integer, db.ForeignKey('agents.id'), nullable=True)  # The agent who sent the solution

    # (relationships are optional in SQLite but handy)
    # ticket = db.relationship("Ticket", backref="resolution_attempts")
    # solution = db.relationship("Solution", backref="resolution_attempts")


# KBArticle table
class KBArticle(db.Model):
    __tablename__ = 'kb_articles'
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String)
    problem_summary = db.Column(db.Text)
    content_md = db.Column(db.Text)
    environment_json = db.Column(SQLiteJSON)
    category_id = db.Column(db.Integer)
    origin_ticket_id = db.Column(db.String)
    origin_solution_id = db.Column(db.Integer, db.ForeignKey('solutions.id'))
    source = db.Column(Enum(KBArticleSource), default=KBArticleSource.ai)
    ai_contribution_pct = db.Column(Float)
    visibility = db.Column(Enum(KBArticleVisibility), default=KBArticleVisibility.internal)
    embedding_model = db.Column(db.String)
    embedding_hash = db.Column(db.String)
    faiss_id = db.Column(db.Integer)
    canonical_fingerprint = db.Column(db.String, unique=True, index=True)
    status = db.Column(Enum(KBArticleStatus), default=KBArticleStatus.draft)
    created_at = db.Column(db.DateTime)
    updated_at = db.Column(db.DateTime)
    approved_by = db.Column(db.String)  # Agent who promoted the article

# KBArticleVersion table
class KBArticleVersion(db.Model):
    __tablename__ = 'kb_article_versions'
    id = db.Column(db.Integer, primary_key=True)
    article_id = db.Column(db.Integer, db.ForeignKey('kb_articles.id'))
    version = db.Column(db.Integer)
    content_md = db.Column(db.Text)
    changelog = db.Column(db.Text)
    editor_agent_id = db.Column(db.Integer)
    created_at = db.Column(db.DateTime)

# KBFeedback table
class KBFeedback(db.Model):
    __tablename__ = 'kb_feedback'
    id = db.Column(db.Integer, primary_key=True)
    kb_article_id = db.Column(db.Integer, db.ForeignKey('kb_articles.id'))
    user_id = db.Column(db.Integer, nullable=True)
    user_email = db.Column(db.String)
    feedback_type = db.Column(Enum(KBFeedbackType))
    rating = db.Column(db.Integer)
    comment = db.Column(db.Text)
    context_json = db.Column(SQLiteJSON)
    resolved_by = db.Column(db.Integer, nullable=True)
    resolved_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime)
    __table_args__ = (
        UniqueConstraint('kb_article_id', 'user_id', name='ux_kb_feedback_user'),
    )

# KBIndex table
class KBIndex(db.Model):
    __tablename__ = 'kb_index'
    id = db.Column(db.Integer, primary_key=True)
    article_id = db.Column(db.Integer, db.ForeignKey('kb_articles.id'))
    faiss_id = db.Column(db.Integer)
    embedding_model = db.Column(db.String)
    embedding_hash = db.Column(db.String)
    created_at = db.Column(db.DateTime)
    is_active = db.Column(db.Boolean, default=True)

# KBAudit table
class KBAudit(db.Model):
    __tablename__ = 'kb_audit'
    id = db.Column(db.Integer, primary_key=True)
    entity_type = db.Column(db.String)
    entity_id = db.Column(db.Integer)
    event = db.Column(db.String)
    actor_id = db.Column(db.Integer)
    meta_json = db.Column(SQLiteJSON)
    created_at = db.Column(db.DateTime)
    
# ─── Models ───────────────────────────────────────────────────────────────────

class Department(db.Model):
    __tablename__ = 'departments'
    id   = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String, unique=True, nullable=False)

# Extend Agent with role + department
class Agent(db.Model):
    __tablename__ = 'agents'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String, nullable=False, unique=True)
    email = db.Column(db.String, nullable=False, unique=True)
    password = db.Column(db.String, nullable=False)
    role = db.Column(db.String, default='L1')  # L1, L2, L3, MANAGER
    department_id = db.Column(db.Integer, db.ForeignKey('departments.id'), nullable=True)

class Mention(db.Model):
    __tablename__ = 'mentions'
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    message_id = db.Column(db.Integer, db.ForeignKey('messages.id', ondelete='CASCADE'), nullable=False)
    mentioned_agent_id = db.Column(db.Integer, db.ForeignKey('agents.id', ondelete='CASCADE'), nullable=False)
    __table_args__ = (db.UniqueConstraint('message_id', 'mentioned_agent_id'),)

# Extend Ticket with routing/metadata
class Ticket(db.Model):
    __tablename__ = 'tickets'
    id = db.Column(db.String, primary_key=True)
    status = db.Column(db.String, nullable=False, default='open')
    owner = db.Column(db.String, nullable=True)  # agent name
    # NEW metadata (nullable to be migration-safe)
    subject = db.Column(db.String)
    requester_name = db.Column(db.String)  # NEW: user name for personalized emails
    category = db.Column(db.String)
    department_id = db.Column(db.Integer, db.ForeignKey('departments.id'))
    priority = db.Column(db.String)          # Low/Med/High/Critical
    impact_level = db.Column(db.String)
    urgency_level = db.Column(db.String)
    requester_email = db.Column(db.String)
    created_at = db.Column(db.String)        # store as ISO string for SQLite simplicity
    updated_at = db.Column(db.String)
    level = db.Column(db.Integer, default=1)
    resolved_by = db.Column(db.Integer, db.ForeignKey('agents.id'), nullable=True)
    assigned_to = db.Column(db.Integer, db.ForeignKey('agents.id'), nullable=True)

class Message(db.Model):
    __tablename__ = 'messages'
    id        = db.Column(db.Integer, primary_key=True)
    ticket_id = db.Column(db.String,  nullable=False)
    sender    = db.Column(db.String,  nullable=False)  # 'user', 'assistant', or 'system'
    content   = db.Column(db.Text,    nullable=False)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)  # keep existing
    type      = db.Column(db.String, default='assistant')
    meta      = db.Column(SQLiteJSON, nullable=True)
    # NEW QoL
    created_at = db.Column(db.String)  # optional mirror as text for timeline
    sender_agent_id = db.Column(db.Integer, db.ForeignKey('agents.id'))

class StepSequence(db.Model):
    __tablename__ = 'step_sequences'
    ticket_id     = db.Column(db.String, primary_key=True)
    steps         = db.Column(SQLiteJSON, nullable=False)
    current_index = db.Column(db.Integer, default=0)

# NEW: assignment history
class TicketAssignment(db.Model):
    __tablename__ = 'ticket_assignments'
    id = db.Column(db.Integer, primary_key=True)
    ticket_id = db.Column(db.String, db.ForeignKey('tickets.id', ondelete='CASCADE'), nullable=False)
    agent_id  = db.Column(db.Integer, db.ForeignKey('agents.id', ondelete='SET NULL'))
    assigned_at   = db.Column(db.String)
    unassigned_at = db.Column(db.String)

# NEW: lifecycle events
class TicketEvent(db.Model):
    __tablename__ = 'ticket_events'
    id = db.Column(db.Integer, primary_key=True)
    ticket_id = db.Column(db.String, db.ForeignKey('tickets.id', ondelete='CASCADE'), nullable=False)
    event_type = db.Column(db.String, nullable=False)   # OPENED, ESCALATED, DE-ESCALATED, CLOSED, EMAIL_SENT, FEEDBACK, NOTE...
    actor_agent_id = db.Column(db.Integer, db.ForeignKey('agents.id'))
    details = db.Column(db.Text)                        # JSON string
    created_at = db.Column(db.String, default=lambda: datetime.now(timezone.utc).isoformat())

    __table_args__ = (
        db.Index('ix_ticket_events_ticket_created', 'ticket_id', 'created_at'),
    )
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

# NEW: CC & watchers
class TicketCC(db.Model):
    __tablename__ = 'ticket_cc'
    id = db.Column(db.Integer, primary_key=True)
    ticket_id = db.Column(db.String, db.ForeignKey('tickets.id', ondelete='CASCADE'), nullable=False)
    email = db.Column(db.String, nullable=False)
    __table_args__ = (db.UniqueConstraint('ticket_id', 'email', name='ux_ticket_cc'),)

class TicketWatcher(db.Model):
    __tablename__ = 'ticket_watchers'
    id = db.Column(db.Integer, primary_key=True)
    ticket_id = db.Column(db.String, db.ForeignKey('tickets.id', ondelete='CASCADE'), nullable=False)
    agent_id = db.Column(db.Integer, db.ForeignKey('agents.id'))
    __table_args__ = (db.UniqueConstraint('ticket_id', 'agent_id', name='ux_ticket_watchers'),)

# NEW: outbound email queue
class EmailQueue(db.Model):
    __tablename__ = 'email_queue'
    id = db.Column(db.Integer, primary_key=True)
    ticket_id = db.Column(db.String, db.ForeignKey('tickets.id', ondelete='SET NULL'))
    to_email = db.Column(db.String, nullable=False)
    cc = db.Column(db.Text)       # JSON array string
    subject = db.Column(db.String, nullable=False)
    body = db.Column(db.Text, nullable=False)
    status = db.Column(db.String, default='PENDING')  # PENDING, SENT, FAILED
    error = db.Column(db.Text)
    created_at = db.Column(db.String)
    sent_at = db.Column(db.String)

# NEW: feedback
class TicketFeedback(db.Model):
    __tablename__ = 'ticket_feedback'
    id = db.Column(db.Integer, primary_key=True)
    ticket_id = db.Column(db.String, db.ForeignKey('tickets.id', ondelete='CASCADE'), nullable=False)
    rating = db.Column(db.Integer)  # 1–5
    comment = db.Column(db.Text)
    submitted_at = db.Column(db.String)

# NEW: KB drafts
class KBDraft(db.Model):
    __tablename__ = 'kb_drafts'
    id = db.Column(db.Integer, primary_key=True)
    ticket_id = db.Column(db.String, db.ForeignKey('tickets.id', ondelete='CASCADE'), nullable=False)
    title = db.Column(db.String)
    body  = db.Column(db.Text)   # markdown
    status = db.Column(db.String, default='DRAFT')
    created_at = db.Column(db.String)
    updated_at = db.Column(db.String)

# ─── SQLite Migration Helpers (idempotent) ────────────────────────────────────
from sqlalchemy import text as _sql_text

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
with app.app_context():
    db.create_all()          # creates new tables from models (no column alters)
    run_sqlite_migrations()  # adds any missing columns to existing tables

    # Optional: seed a few departments once
    if not Department.query.first():
        db.session.add_all([Department(name=n) for n in ['ERP','CRM','SRM','Network','Security']])
        db.session.commit()

# --- OIDC / SSO ---
init_auth(app)                 # sets up Authlib client & session settings

# --- Blueprints ---
app.register_blueprint(auth_bp)     # /auth/login, /auth/callback, /auth/me, /auth/logout
app.register_blueprint(license_bp)  # /license/check


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

def get_next_attempt_no(ticket_id: str) -> int:
    last = db.session.query(func.max(ResolutionAttempt.attempt_no)).filter_by(ticket_id=ticket_id).scalar()
    return (last or 0) + 1

def has_pending_attempt(ticket_id: str) -> bool:
    return db.session.query(ResolutionAttempt.id).filter_by(ticket_id=ticket_id, outcome='pending').first() is not None

def is_materially_different(new_text: str, prev_text: str, threshold: float = 0.90) -> bool:
    a = (new_text or "").strip().lower()
    b = (prev_text or "").strip().lower()
    if not a or not b:
        return True
    return difflib.SequenceMatcher(a=a, b=b).ratio() < threshold

def next_action_for(ticket: Ticket, attempt_no: int, reason_code: str | None) -> dict:
    p = (ticket.priority or "").upper()
    lvl = ticket.level or 1

    # Fast-path escalations based on reason
    if reason_code in ("no_permissions", "needs_admin_access"):
        return {"action": "escalate", "to_level": max(lvl, 2)}

    # Priority-aware guard rails
    if p in ("P1", "CRITICAL", "HIGH") and attempt_no >= 1:
        return {"action": "escalate", "to_level": max(lvl, 2)}

    if attempt_no == 1:
        return {"action": "collect_diagnostics", "pack": "basic"}
    if attempt_no == 2:
        return {"action": "new_solution"}
    if attempt_no == 3:
        return {"action": "escalate", "to_level": max(lvl, 2)}
    return {"action": "live_assist"}  # final safety cap


def _inject_system_message(ticket_id: str, text: str):
    # Your UI already treats content starting with [SYSTEM] as system
    insert_message_with_mentions(ticket_id, "assistant", f"[SYSTEM] {text}")

def _start_step_sequence_basic(ticket_id: str):
    steps = [
        "Please share a screenshot or exact error message you see.",
        "Confirm your OS + app version (e.g. Windows 11 23H2, Outlook 2405).",
        "Run the quick check: restart the affected app and try again. Tell us the result."
    ]
    save_steps(ticket_id, steps)
    _inject_system_message(ticket_id, "Started diagnostics (Pack A).")


def _serializer(secret_key: str, salt: str = "solution-confirm-v1"):
    return URLSafeTimedSerializer(secret_key, salt=salt)

def _utcnow():
    return datetime.now(timezone.utc)

def _normalize(text: str) -> str:
    return " ".join((text or "").split())

def _fingerprint(text: str) -> str:
    return hashlib.sha256(_normalize(text).encode("utf-8")).hexdigest()

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


def audit(event: str, entity_type: str, entity_id: int, actor_id=None, meta: dict | None=None):
    rec = KBAudit(
        event=event,
        entity_type=entity_type,
        entity_id=entity_id,
        actor_id=actor_id,
        meta_json=json.dumps(meta or {})
    )
    db.session.add(rec)

client     = OpenAI(api_key=OPENAI_KEY)
CHAT_MODEL = "gpt-3.5-turbo"
EMB_MODEL  = "text-embedding-ada-002"

# # Load FAISS index & metadata
# index  = faiss.read_index("faiss_index.bin")
# with open("faiss_meta.json", "r", encoding="utf8") as f:
#     metadatas = json.load(f)

# ─── GPT-Based Categorization Helper ──────────────────────────────────────────
def categorize_with_gpt(text: str) -> tuple[str, str]:
    """
    Uses GPT to pick one label from LABELS for the given ticket text,
    then looks up the corresponding team.
    """
    # Build a prompt listing choices
    label_list = ", ".join(f'"{l}"' for l in LABELS)
    prompt = f"""
You are an expert ticket triage assistant.
Pick the single best category for this issue from the list: [{label_list}].
Respond with exactly one of those labels, and nothing else.

Issue description:
\"\"\"{text}\"\"\"
"""

    try:
        resp = client.chat.completions.create(
            model=CHAT_MODEL,
            messages=[
                {"role": "system", "content": "You are a helpful ticket classifier."},
                {"role": "user",   "content": prompt}
            ],
            temperature=0.0,
            max_tokens=10
        )
        label = resp.choices[0].message.content.strip()
        # Clean up any stray punctuation
        label = re.sub(r'[^a-zA-Z0-9_]', '', label)
        team  = TEAM_MAP.get(label, TEAM_MAP.get("other", "General-Support"))
        return label, team
    except Exception as e:
        # On error (rate limit, etc), return fallback values
        return "General-Support", TEAM_MAP.get("General-Support", "General-Support")

# ─── CSV loader ────────────────────────────────────────────────────────────────
DATA_PATH = os.path.join(os.path.dirname(__file__), "data", "cleaned_tickets.csv")
def load_df():
    return pd.read_csv(DATA_PATH, dtype=str)

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

def ensure_owner_or_manager(ticket, user):
    if user.get("role") == "MANAGER":
        return
    if ticket.owner and ticket.owner != user.get("name"):
        abort(403, description="Only owner or manager can do this")


# NOTE: The following lines must only be used inside a request context, not at module level.
# Remove or move these lines into the relevant Flask route or function that is called during a request.
# Example usage (inside a route):
#   user = getattr(request, "agent_ctx", {})
#   ensure_owner_or_manager(ticket, user)


def save_steps(ticket_id, steps):
    seq = StepSequence(ticket_id=ticket_id, steps=steps, current_index=0)
    db.session.merge(seq)
    db.session.commit()

def get_steps(ticket_id):
    return db.session.get(StepSequence, ticket_id)

def extract_json(text: str) -> dict:
    """
    Finds and returns the first JSON object in `text`. Raises ValueError if none found.
    """
    # Strip out triple-backticks or fences
    cleaned = re.sub(r"```(?:json)?\s*", "", text).strip()

    # Locate the first `{` and its matching `}`
    start = cleaned.find("{")
    if start == -1:
        raise ValueError("No JSON object found in response")
    depth = 0
    for i, ch in enumerate(cleaned[start:], start):
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                end = i + 1
                break
    else:
        raise ValueError("Could not find matching '}' for JSON")

    json_str = cleaned[start:end]
    return json.loads(json_str)

# ─── CSV → DB hydration & timeline helpers ─────────────────────────────────────
def _csv_row_for_ticket(ticket_id: str):
    df = load_df()
    row = df[df["id"] == ticket_id]
    return None if row.empty else row.iloc[0].to_dict()

def _derive_subject_from_text(text: str) -> str:
    if not text:
        return ""
    text = str(text).strip().replace("\n", " ")
    return text[:120]

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
        created_at=datetime.utcnow().isoformat()
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


# --- Department categorization with GPT ---
def categorize_department_with_gpt(text: str) -> str | None:
    """
    Uses GPT to pick the best department for the given ticket text.
    Returns the department name (e.g., 'ERP', 'CRM', etc.) or None.
    """
    department_list = [d.name for d in Department.query.all()]
    if not department_list:
        department_list = ['ERP', 'CRM', 'SRM', 'Network', 'Security']
    prompt = f"""
You are an expert IT support triage assistant.
Pick the single best department for this issue from the list: [{', '.join(department_list)}].
Respond with exactly one of those department names, and nothing else.

Issue description:
{text}
"""
    resp = client.chat.completions.create(
        model=CHAT_MODEL,
        messages=[
            {"role": "system", "content": "You are a helpful ticket classifier."},
            {"role": "user",   "content": prompt}
        ],
        temperature=0.0,
        max_tokens=10
    )
    dep = resp.choices[0].message.content.strip()
    dep = re.sub(r'[^a-zA-Z0-9 ]', '', dep)
    # Return department name if valid
    if dep in department_list:
        return dep
    return None

def enqueue_status_email(ticket_id: str, label: str, extra: str = ""):
    t = db.session.get(Ticket, ticket_id)
    cc_rows = TicketCC.query.filter_by(ticket_id=ticket_id).all()
    cc_list = [r.email for r in cc_rows]
    to_email = t.requester_email if t else None
    if not to_email:
        row = _csv_row_for_ticket(ticket_id)
        to_email = (row.get("email") or "").strip().lower() if row else None
    if not to_email:
        app.logger.warning(f"[email_queue] no recipient for {ticket_id}")
        return

    subject = f"[Ticket {ticket_id}] {label} — {(t.subject or '').strip()}"
    body = f"Hello,\n\nUpdate on your ticket {ticket_id}: {label}.\n\n{extra}\n\nThanks,\nSupport Team"

    # Prevent duplicate emails: only queue if not already pending for this ticket/subject/body
    existing = EmailQueue.query.filter_by(ticket_id=ticket_id, to_email=to_email, subject=subject, body=body, status='PENDING').first()
    if existing:
        return

    q = EmailQueue(
        ticket_id=ticket_id,
        to_email=to_email,
        cc=json.dumps(cc_list),
        subject=subject,
        body=body,
        status='PENDING',
        created_at=datetime.utcnow().isoformat()
    )
    db.session.add(q)
    db.session.commit()

def send_via_gmail(to_email: str, subject: str, body: str, cc_list: list[str] | None = None):
    """Send a plain‑text email via the unified Gmail account."""
    cc_list = cc_list or []
    em = EmailMessage()
    em["From"] = f"{FROM_NAME} <{SMTP_USER}>"
    em["To"] = to_email
    if cc_list:
        em["Cc"] = ", ".join(cc_list)
    em["Subject"] = subject
    em.set_content(body)

    context = ssl.create_default_context()
    with smtplib.SMTP_SSL(SMTP_SERVER, SMTP_PORT, context=context) as smtp:
        smtp.login(SMTP_USER, SMTP_PASS)
        smtp.send_message(em)

def _can_view(role: str, lvl: int) -> bool:
    if role == "L2": return (lvl or 1) >= 2
    if role == "L3": return (lvl or 1) == 3
    return True  # L1 & MANAGER see all

def require_role(*allowed):
    def deco(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            token = (request.headers.get("Authorization","").replace("Bearer ","")
                     or request.cookies.get("token"))
            if not token: return jsonify(error="unauthorized"), 401
            try:
                user = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
            except Exception:
                return jsonify(error="invalid token"), 401
            if allowed and user.get("role") not in allowed:
                return jsonify(error="forbidden"), 403
            request.agent_ctx = user
            return fn(*args, **kwargs)
        return wrapper
    return deco


def route_department_from_category(category: str) -> int | None:
    """Map a noisy category like 'CRM_Ticket' or 'NetworkIssue' to a Department id."""
    if not category:
        return None

    s = str(category).lower()
    # normalize: turn 'CRM_Ticket' / 'NetworkIssue' => 'crm ticket', 'network issue'
    tokens = re.findall(r"[a-z]+", s)
    norm = " ".join(tokens)

    # keywords/synonyms per department (tune as needed)
    buckets = [
        (("crm", "salesforce", "customer"), "CRM"),
        (("erp", "sap", "netsuite", "oracleerp", "financials"), "ERP"),
        (("srm", "supplier", "procure", "vendor"), "SRM"),
        (("network", "vpn", "dns", "dhcp", "wifi", "lan", "wan"), "Network"),
        (("security", "mfa", "2fa", "okta", "auth", "phish", "antivirus", "edr"), "Security"),
    ]

    target_name = None
    for keys, dep_name in buckets:
        if any(k in norm for k in keys):
            target_name = dep_name
            break

    if not target_name:
        return None

    d = Department.query.filter_by(name=target_name).first()
    return d.id if d else None


@event.listens_for(Engine, "connect")
def _set_sqlite_pragma(dbapi_conn, conn_record):
    try:
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA foreign_keys=ON;")
        cur.close()
    except Exception:
        pass

# ─── Login Endpoint ──────────────────────────────────────────────────────────
@app.route('/login', methods=['POST'])
def login():
    data = request.json or {}
    email = (data.get('email') or '').strip().lower()
    password = (data.get('password') or '').strip()
    if not email or not password:
        return jsonify(error="Email and password required"), 400
    agent = Agent.query.filter_by(email=email).first()
    if not agent or not getattr(agent, 'password', None):
        return jsonify(error="Invalid credentials"), 401
    # For demo, store plain text password. In production, use hashing.
    if agent.password != password:
        return jsonify(error="Invalid credentials"), 401
    # Build JWT payload
    payload = {
        "id": agent.id,
        "name": agent.name,
        "email": agent.email,
        "role": getattr(agent, "role", "L1"),
        # Add role if you have one, e.g. "role": agent.role
    }
    token = jwt.encode(payload, SECRET_KEY, algorithm="HS256")
    resp = make_response(jsonify({"token": token, "agent": payload}))
    resp.set_cookie("token", token, httponly=True, samesite='Lax', secure=False)
    return resp

# ─── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/embed")
@license_gate(required_feature="kb")   # requires features: {"kb": "on"}
def embed_widget():
    return {"ok": True, "msg": "licensed & kb feature enabled"}


@app.route("/threads", methods=["GET"])
@require_role("L1","L2","L3","MANAGER")
# @license_gate()
def list_threads():

    df = load_df()
    df["status"]       = "open"
    df["lastActivity"] = datetime.utcnow().isoformat()
    try:
        limit  = int(request.args.get("limit", 20))
        offset = int(request.args.get("offset", 0))
    except ValueError:
        return jsonify(error="limit and offset must be integers"), 400

    # Get user role from JWT
    user = getattr(request, "agent_ctx", None)
    role = user.get("role") if user else None

    # Build all threads (with DB info)
    rows = df.to_dict(orient="records")
    ids = [r["id"] for r in rows]
    db_tickets = {t.id: t for t in Ticket.query.filter(Ticket.id.in_(ids)).all()}
    dept_map = {d.id: d.name for d in Department.query.all()}
    threads_all = []
    for row in rows:
        cat, team = categorize_with_gpt(row.get("text", ""))
        t = db_tickets.get(row["id"])
        department_id = getattr(t, "department_id", None) if t else None
        updated_at    = getattr(t, "updated_at", None) if t else None
        status        = getattr(t, "status", "open") if t else "open"
        level         = getattr(t, "level", 1) if t else 1
        department    = {"id": department_id, "name": dept_map.get(department_id)} if department_id else None
        threads_all.append({
            **row,
            "predicted_category": cat,
            "assigned_team": team,
            "status": status,
            "updated_at": updated_at,
            "department_id": department_id,
            "department": department,
            "level": level
        })

    # Role-based filtering
    if role == "L2":
        threads_filtered = [t for t in threads_all if (t.get("level") or 1) >= 2]
    elif role == "L3":
        threads_filtered = [t for t in threads_all if (t.get("level") or 1) == 3]
    else:  # L1 and MANAGER see all
        threads_filtered = threads_all

    total = len(threads_filtered)
    threads = threads_filtered[offset:offset+limit]

    return jsonify(
        total   = total,
        limit   = limit,
        offset  = offset,
        threads = threads
    ), 200

# @app.route("/threads/<thread_id>", methods=["GET"])
# def get_thread(thread_id):
#     ensure_ticket_record_from_csv(thread_id)
#     df  = load_df()
#     # Debug: print all available IDs and the requested ID
#     print(f"[DEBUG] Requested thread_id: {thread_id}")
#     print(f"[DEBUG] Available IDs: {list(df['id'])}")
#     row = df[df["id"] == thread_id]
#     if row.empty:
#         print(f"[DEBUG] No match for thread_id: {thread_id}")
#         abort(404, f"Ticket {thread_id} not found")
#     ticket = row.iloc[0].to_dict()
#     # Ensure 'email' is present and normalized
#     ticket['email'] = ticket.get('email', '').strip().lower()
#     # Summarize the ticket text before returning
#     ticket_text = ticket.get("text") or ticket.get("subject") or ""
#     summary = None
#     if ticket_text:
#         try:
#             resp = client.chat.completions.create(
#                 model=CHAT_MODEL,
#                 messages=[
#                     {"role": "system", "content": "Summarize the following support ticket in 1-2 sentences."},
#                     {"role": "user", "content": ticket_text}
#                 ],
#                 max_tokens=60,
#                 temperature=0.5
#             )
#             summary = resp.choices[0].message.content.strip()
#         except Exception as e:
#             print(f"[ERROR] Could not summarize ticket: {e}")
#             summary = ticket_text
#     else:
#         summary = ""
#     ticket["summary"] = summary
  
#     raw_messages = get_messages(thread_id)
#     messages = [m for m in raw_messages if m.get("id") != "ticket-text"]


#     ticket_time = ticket.get("created_at") or datetime.datetime.utcnow().isoformat()
#     summary_msg = {
#           "id": "ticket-summary",
#           "sender": "bot",
#           "content": summary,
#           "timestamp": ticket_time
#         }
#         # Final message list: summary followed by the persisted chat history
#     ticket["messages"] = [summary_msg] + messages

#     return jsonify(ticket), 200

@app.route("/threads/<thread_id>", methods=["GET"])
@require_role("L1","L2","L3","MANAGER")
# @license_gate()
def get_thread(thread_id):
    t = db.session.get(Ticket, thread_id)

    # If not in DB, only hydrate if it exists in CSV
    if not t:
        df = load_df()
        if df[df["id"] == thread_id].empty:
            abort(404, f"Ticket {thread_id} not found")
        ensure_ticket_record_from_csv(thread_id)
        t = db.session.get(Ticket, thread_id)
    
    user = getattr(request, "agent_ctx", {}) or {}
    if not _can_view(user.get("role"), t.level or 1):
        return jsonify(error="forbidden"), 403

    # Optionally still read CSV for raw text/legacy fields
    df = load_df()
    row = df[df["id"] == thread_id]
    csv = row.iloc[0].to_dict() if not row.empty else {}

    # Update last activity timestamp to now
    from datetime import datetime, timezone
    t.updated_at = datetime.now(timezone.utc).isoformat()
    db.session.commit()
    ticket = {
        "id": thread_id,
        "status": t.status,
        "owner": t.owner,
        "subject": t.subject or _derive_subject_from_text(csv.get("text", "")),
        "email": (t.requester_email or csv.get("email", "")).strip().lower(),
        "priority": t.priority,
        "impact_level": t.impact_level,
        "urgency_level": t.urgency_level,
        "category": t.category,
        "created_at": t.created_at,
        "updated_at": t.updated_at,
        "level": t.level,
        "text": csv.get("text", ""),  # keep original ticket text for UI
    }

    # Summarize using the ticket text
    ticket_text = ticket["text"] or ticket["subject"] or ""
    summary = ""
    if ticket_text:
        try:
            resp = client.chat.completions.create(
                model=CHAT_MODEL,
                messages=[
                    {"role": "system", "content": "Summarize the following support ticket in 1-2 sentences."},
                    {"role": "user", "content": ticket_text}
                ],
                max_tokens=60, temperature=0.5
            )
            summary = resp.choices[0].message.content.strip()
        except Exception as e:
            summary = ticket_text
    ticket["summary"] = summary

    raw_messages = get_messages(thread_id)
    summary_msg = {
        "id": "ticket-summary", "sender": "bot",
        "content": summary, "timestamp": ticket.get("created_at") or datetime.utcnow().isoformat()
    }
    ticket["messages"] = [summary_msg] + [m for m in raw_messages if m.get("id") != "ticket-text"]

    # Append attempts info
    attempts = (ResolutionAttempt.query
                .filter_by(ticket_id=thread_id)
                .order_by(ResolutionAttempt.attempt_no.asc()).all())
    ticket["attempts"] = [{
        "id": a.id, "no": a.attempt_no, "outcome": a.outcome,
        "sent_at": a.sent_at.isoformat() if a.sent_at else None
    } for a in attempts]

    return jsonify(ticket), 200




@app.route("/threads/<thread_id>/chat", methods=["POST"])
@require_role("L1","L2","L3","MANAGER")
def post_chat(thread_id):
    # 0) Load ticket without silently creating it
    t = db.session.get(Ticket, thread_id)
    if not t:
        df = load_df()
        if df[df["id"] == thread_id].empty:
            return jsonify(error="not found"), 404
        ensure_ticket_record_from_csv(thread_id)
        t = db.session.get(Ticket, thread_id)

    # 1) Role-based visibility
    user = getattr(request, "agent_ctx", {}) or {}
    if not _can_view(user.get("role"), t.level or 1):
        return jsonify(error="forbidden"), 403

    # 2) Validate input
    req = request.json or {}
    text = (req.get("message") or "").strip()
    if not text:
        return jsonify(error="message required"), 400

    # Pull these up-front (used by suggested/fallback)
    source  = (req.get("source") or "").strip().lower()
    history = req.get("history") or []

    # 3) Context for prompts (fallback to DB subject)
    df = load_df()
    row = df[df["id"] == thread_id]
    subject = row.iloc[0]["text"] if not row.empty else (t.subject or "")

    # 4) Persist user message + bump last-activity
    TRIGGER_PHRASES = [
        "help me fix this", "give me a solution", "fix this", "give me the top fix with exact steps."
    ]
    user_msg_inserted = False
    if not (source != "user" and text.strip().lower() in TRIGGER_PHRASES):
        insert_message_with_mentions(thread_id, "user", text)
        user_msg_inserted = True
        from datetime import datetime, timezone
        t.updated_at = datetime.now(timezone.utc).isoformat()
        db.session.commit()

    # Greeting detection
    import string
    GREETINGS = [
        "hi","hello","hey","how are you","good morning","good afternoon",
        "good evening","greetings","yo","sup","howdy"
    ]
    text_norm = text.lower().translate(str.maketrans('', '', string.punctuation)).strip()
    if any(text_norm == greet for greet in GREETINGS):
        reply = "👋 Hello! How can I assist you with your support ticket today?"
        insert_message_with_mentions(thread_id, "assistant", reply)
        return jsonify(ticketId=thread_id, reply=reply), 200

    # Mention detection
    mentions = extract_mentions(text)
    if mentions:
        names = ", ".join(mentions)
        reply = f"🛎 Notified {names}! They’ll jump in shortly."
        insert_message_with_mentions(thread_id, "assistant", reply)
        return jsonify(ticketId=thread_id, reply=reply), 200

    app.logger.info(f"[CHAT] Incoming message for Ticket {thread_id}: {text}")
    msg_lower = text.lower()

    # ---------- A) SUGGESTED PROMPTS (must come BEFORE other branches) ----------
    if source == "suggested":
        ticket_text = subject or ""
        user_instruction = build_prompt_from_intent(text, ticket_text, thread_id)
        messages = [{"role": "system", "content": ASSISTANT_STYLE}]
        for h in history[-6:]:
            role = "assistant" if (h.get("role") == "assistant") else "user"
            content = str(h.get("content") or "")
            messages.append({"role": role, "content": content})
        messages.append({"role": "user", "content": user_instruction})

        try:
            resp = client.chat.completions.create(
                model=CHAT_MODEL, messages=messages, temperature=0.25, max_tokens=600
            )
            raw = resp.choices[0].message.content.strip() if resp.choices and resp.choices[0].message.content else ""
        except Exception as e:
            app.logger.error(f"GPT error: {e!r}")
            raw = '{"reply":"(fallback) Could not get response: %s","type":"chat"}' % e

        try:
            parsed = extract_json(raw)
        except Exception:
            parsed = {"reply": raw, "type": "chat"}

        reply_text   = (parsed.get("reply") or "").strip()
        reply_type   = (parsed.get("type") or "chat").strip()
        next_actions = parsed.get("next_actions") if isinstance(parsed.get("next_actions"), list) else []

        # PATCH: If the prompt is 'help me fix this' or similar, always return a solution type
        if reply_type == "solution" or text.strip().lower() in ["help me fix this", "give me a solution", "fix this", "give me the top fix with exact steps."]:
            solution_text = reply_type == "solution" and reply_text or (reply_text or parsed.get("text") or "(No solution generated)")
            sol = create_solution(thread_id, solution_text, proposed_by=(getattr(request, "agent_ctx", {}) or {}).get("name"))
            insert_message_with_mentions(thread_id, "assistant", {
                "type": "solution", "text": solution_text, "askToSend": True, "next_actions": next_actions
            })
            return jsonify(ticketId=thread_id, type="solution", text=solution_text, askToSend=True, next_actions=next_actions, solution_id=sol.id), 200

        # Special formatting for clarifying questions array
        if text.strip().lower().startswith("ask me 3 clarifying questions"):
            # Try to parse as JSON array, fallback to string
            import json
            try:
                questions = json.loads(reply_text)
                if isinstance(questions, list):
                    reply_text = "\n".join(f"{i+1}. {q}" for i, q in enumerate(questions))
            except Exception:
                pass

        # Only insert user message if not already inserted above (prevents double-insert)
        if not user_msg_inserted and source == "user":
            insert_message_with_mentions(thread_id, "user", text)
        insert_message_with_mentions(thread_id, "assistant", reply_text)
        return jsonify(ticketId=thread_id, reply=reply_text, next_actions=next_actions), 200

    # ---------- B) STEP-BY-STEP (on request only) ----------
    if "step-by-step" in msg_lower or "step by step" in msg_lower:
        step_prompt = (
            "Please break your solution into 3 concise, numbered steps "
            "and return valid JSON with a top-level \"steps\" array.\n\n"
            f"Ticket #{thread_id} issue: {subject}\nUser question: {text}"
        )
        try:
            resp = client.chat.completions.create(
                model=CHAT_MODEL,
                messages=[{"role": "system", "content": "You are a helpful IT support assistant."},
                          {"role": "user", "content": step_prompt}],
                temperature=0.2
            )
            raw = resp.choices[0].message.content if resp.choices and resp.choices[0].message.content else None
        except Exception as e:
            app.logger.error(f"OpenAI step-gen error: {e!r}")
            fallback = f"(fallback) Could not reach OpenAI: {e}"
            insert_message_with_mentions(thread_id, "assistant", fallback)
            return jsonify(ticketId=thread_id, reply=fallback), 200

        try:
            parsed_json = extract_json(raw) if raw else None
            steps = parsed_json["steps"] if parsed_json and "steps" in parsed_json else None
        except Exception as e:
            app.logger.error(f"JSON parse error: {e!r} — raw: {raw!r}")
            fallback = f"(fallback) Could not parse steps: {e}"
            insert_message_with_mentions(thread_id, "assistant", fallback)
            return jsonify(ticketId=thread_id, reply=fallback), 200

        if not steps or not isinstance(steps, list):
            fallback = "(fallback) No steps generated."
            insert_message_with_mentions(thread_id, "assistant", fallback)
            return jsonify(ticketId=thread_id, reply=fallback), 200

        save_steps(thread_id, steps)
        first = steps[0]
        insert_message_with_mentions(thread_id, "assistant", first)
        return jsonify(ticketId=thread_id, reply=first, step=1, total=len(steps)), 200

    # ---------- C) DEFAULT: concise solution when user asks to fix ----------
    TRIGGER_PHRASES = [
        "help me fix this", "give me a solution", "fix this", "give me the top fix with exact steps."
    ]
    # Only trigger if the message is actually from the user (not a system/automation)
    if not (source != "user" and text.strip().lower() in TRIGGER_PHRASES):
        if any(k in msg_lower for k in ["help", "solve", "fix", "issue"]):
            try:
                concise_prompt = (
                    "You are a senior IT support engineer. Your job is to propose a concrete solution or troubleshooting "
                    "suggestion, even if assumptions are needed. DO NOT ask for more details — offer a likely next step.\n\n"
                    f"Ticket #{thread_id} issue: {subject}\nUser said: {text}"
                )
                resp = client.chat.completions.create(
                    model=CHAT_MODEL,
                    messages=[{"role": "system", "content": "You are a helpful IT support assistant."},
                              {"role": "user", "content": concise_prompt}],
                    temperature=0.3,
                    max_tokens=300
                )
                solution = resp.choices[0].message.content.strip()
                app.logger.info(f"[CHAT] Solution generated for Ticket {thread_id}: {solution}")
            except Exception as e:
                app.logger.error(f"Concise GPT error: {e!r}")
                solution = f"(fallback) GPT error: {e}"

            solution = solution or "(fallback) Sorry, I couldn’t generate a solution."
            insert_message_with_mentions(thread_id, "assistant", {"type": "solution", "text": solution, "askToSend": True})
            return jsonify(ticketId=thread_id, type="solution", text=solution, askToSend=True), 200

    # ---------- D) Fallback: structured chat (non-suggested) ----------
    ticket_text = subject or ""
    user_instruction = f"""{ASSISTANT_STYLE}
Ticket Context:
- ID: {thread_id}
- Description: {ticket_text or '(none)'}
User request: {text}

Return JSON only with keys: reply (string), type ("chat"|"solution"), next_actions (array of strings, optional).
"""
    messages = [{"role": "system", "content": ASSISTANT_STYLE}]
    for h in history[-6:]:
        role = "assistant" if (h.get("role") == "assistant") else "user"
        content = str(h.get("content") or "")
        messages.append({"role": role, "content": content})
    messages.append({"role": "user", "content": user_instruction})

    try:
        resp = client.chat.completions.create(
            model=CHAT_MODEL, messages=messages, temperature=0.25, max_tokens=600
        )
        raw = resp.choices[0].message.content.strip() if resp.choices and resp.choices[0].message.content else ""
    except Exception as e:
        app.logger.error(f"GPT error: {e!r}")
        raw = '{"reply":"(fallback) Could not get response: %s","type":"chat"}' % e

    try:
        parsed = extract_json(raw)
    except Exception:
        parsed = {"reply": raw, "type": "chat"}

    reply_text   = (parsed.get("reply") or "").strip()
    reply_type   = (parsed.get("type") or "chat").strip()
    next_actions = parsed.get("next_actions") if isinstance(parsed.get("next_actions"), list) else []

    if reply_type == "solution":
        insert_message_with_mentions(thread_id, "assistant", {
            "type": "solution", "text": reply_text, "askToSend": True, "next_actions": next_actions
        })
        return jsonify(ticketId=thread_id, type="solution", text=reply_text, askToSend=True, next_actions=next_actions), 200

    insert_message_with_mentions(thread_id, "assistant", reply_text)
    return jsonify(ticketId=thread_id, reply=reply_text, next_actions=next_actions), 200


# New endpoint to handle user's response to 'Did this solve your issue?'
@app.route("/threads/<thread_id>/solution", methods=["POST"])
@require_role("L1","L2","L3","MANAGER")
def solution_response(thread_id):
    # Don't auto-create: load or 404
    t = db.session.get(Ticket, thread_id)
    if not t:
        return jsonify(error="Ticket not found"), 404

    # Enforce visibility by role (same rule as list/get/chat)
    user = getattr(request, "agent_ctx", {}) or {}
    if not _can_view(user.get("role"), t.level or 1):
        return jsonify(error="forbidden"), 403

    data = request.json or {}
    solved = bool(data.get("solved", False))

    now = datetime.now(timezone.utc).isoformat()


    if solved:
        insert_message_with_mentions(thread_id, "assistant", "🎉 Glad we could help! Closing the ticket.")
        t.status = "closed"
        t.updated_at = now
        db.session.commit()
        log_event(thread_id, "RESOLVED", {"note": "User confirmed solved"})
        # Emails are handled by /close; this endpoint just updates state.
        return jsonify(status=t.status, message="Ticket closed"), 200

    # Not solved → escalate (1→2, else →3) and log
    old = t.level or 1
    to_level = 2 if old == 1 else 3
    t.level = to_level
    t.status = "escalated"
    t.updated_at = now
    db.session.commit()

    log_event(
        thread_id,
        "ESCALATED",
        {"reason": "User said not solved", "from_level": old, "to_level": to_level}
    )
    insert_message_with_mentions(thread_id, "assistant", f"🚀 Ticket escalated to L{to_level} support.")
    insert_message_with_mentions(thread_id, "assistant", f"[SYSTEM] Ticket has been escalated to L{to_level} support.")
    # Status emails are sent only by /escalate; keep that single-source-of-truth.
    return jsonify(status=t.status, level=to_level, message="Ticket escalated"), 200



@app.route("/threads/<thread_id>/escalate", methods=["POST"])
@require_role("L1","L2","L3","MANAGER")
def escalate_ticket(thread_id):
    ensure_ticket_record_from_csv(thread_id)

    ticket = db.session.get(Ticket, thread_id)
    if not ticket:
        return jsonify(error="Ticket not found"), 404
    old = ticket.level or 1
    to_level = 2 if old == 1 else 3
    ticket.level = to_level
    ticket.status = 'escalated'
    ticket.updated_at = datetime.now(timezone.utc).isoformat()
    add_event(ticket.id, 'ESCALATED', actor_agent_id=None, from_level=old, to_level=to_level)
    db.session.commit()
    insert_message_with_mentions(thread_id, "assistant", f"🚀 Ticket escalated to L{to_level} support.")
    insert_message_with_mentions(thread_id, "assistant", f"[SYSTEM] Ticket has been escalated to L{to_level} support.")
    enqueue_status_email(thread_id, "escalated", f"We’ve escalated this to L{to_level}.")
    return jsonify(status="escalated", level=to_level, message={"sender":"assistant","content":f"🚀 Ticket escalated to L{to_level} support.","timestamp":datetime.now(timezone.utc).isoformat()}), 200

# @app.route("/threads/<thread_id>/close", methods=["POST"])
# def close_ticket(thread_id):
#     insert_message_with_mentions(thread_id, "assistant", "✅ Ticket has been closed.")
#     # Add a system message for closure
#     insert_message_with_mentions(thread_id, "assistant", "[SYSTEM] Ticket has been closed.")
#     # Set ticket status to closed
#     ticket = db.session.get(Ticket, thread_id)
#     if ticket:
#         ticket.status = 'closed'
#         db.session.commit()
#         # Enqueue resolved email notification
#         requester_email = getattr(ticket, 'requester_email', None)
#         solution_link = f"https://support.example.com/tickets/{thread_id}/solution.pdf"
#         if requester_email:
#             # Render subject/body
#             subject, html_body = render_email('resolved', ticket, {'solution_link': solution_link, 'user_email': requester_email})
#             queue_email(thread_id, 'resolved', requester_email, subject, html_body)
#     return jsonify(status="closed", message={"sender":"assistant","content":"✅ Ticket has been closed.","timestamp":datetime.datetime.utcnow().isoformat()}), 200
@app.route("/threads/<thread_id>/close", methods=["POST"])
@require_role("L2","L3","MANAGER")
def close_ticket(thread_id):
    ensure_ticket_record_from_csv(thread_id)

    ticket = db.session.get(Ticket, thread_id)
    if not ticket:
        return jsonify(error="Ticket not found"), 404
    now = datetime.now(timezone.utc).isoformat()
    ticket.status = 'closed'
    ticket.updated_at = now
    add_event(ticket.id, 'CLOSED', actor_agent_id=None)
    db.session.commit()
    insert_message_with_mentions(thread_id, "assistant", "✅ Ticket has been closed.")
    insert_message_with_mentions(thread_id, "assistant", "[SYSTEM] Ticket has been closed.")
    enqueue_status_email(thread_id, "closed", "Your ticket was closed.")
    return jsonify(status="closed", message={"sender":"assistant","content":"✅ Ticket has been closed.","timestamp":now}), 200

@app.route("/threads/<thread_id>/timeline", methods=["GET"])
@require_role("L1","L2","L3","MANAGER")
def thread_timeline(thread_id):
    # Load ticket or 404 (do not auto-create on timeline reads)
    t = db.session.get(Ticket, thread_id)
    if not t:
        return jsonify(error="Ticket not found"), 404

    # Enforce the same visibility rules used elsewhere
    user = getattr(request, "agent_ctx", {}) or {}
    if not _can_view(user.get("role"), t.level or 1):
        return jsonify(error="forbidden"), 403

    events = (TicketEvent.query
              .filter_by(ticket_id=thread_id)
              .order_by(TicketEvent.created_at.asc())
              .all())

    return jsonify([
        {
            "id": e.id,
            "type": e.event_type,
            "created_at": e.created_at,
            "actor_agent_id": e.actor_agent_id,
            "details": json.loads(e.details or "{}"),
        }
        for e in events
    ]), 200



@app.route("/summarize", methods=["POST"])
def summarize():
    data = request.json or {}
    text = (data.get("text") or "").strip()
    if not text:
        return jsonify(summary=""), 400
    resp = client.chat.completions.create(
        model=CHAT_MODEL,
        messages=[
            {"role":"system","content":"Summarize the following support ticket in 1-2 sentences."},
            {"role":"user","content": text}
        ],
        max_tokens=60,
        temperature=0.5
    )
    return jsonify(summary=resp.choices[0].message.content.strip()), 200


# Endpoint: Get all messages mentioning a specific agent
@app.route("/mentions/<agent_name>", methods=["GET"])
def get_mentions(agent_name):
    # Get all messages from the DB
    msgs = Message.query.order_by(Message.timestamp).all()
    result = []
    for m in msgs:
        # Extract mentions from message content
        mentions = extract_mentions(m.content)
        if agent_name in mentions:
            msg_type = 'agent' if m.sender == 'user' else 'bot'
            # If content is a system status update, mark as 'system'
            if isinstance(m.content, str) and m.content.startswith('[SYSTEM]'):
                msg_type = 'system'
            content = m.content.replace('[SYSTEM]', '').strip() if msg_type == 'system' else m.content
            result.append({
                "id": f"msg_{m.id}",
                "sender": m.sender,
                "content": content,
                "timestamp": m.timestamp.isoformat(),
                "type": msg_type,
                "mentions": mentions
            })
    return jsonify(messages=result), 200

@app.route("/me", methods=["GET"])
@require_role()
@license_gate()
def get_current_agent():
    return jsonify(getattr(request, "agent_ctx", {})), 200
    
# ─── Ticket Claim Endpoint ───────────────────────────────────────────────────
@app.route("/threads/<thread_id>/claim", methods=["POST"])
@require_role("L1","L2","L3","MANAGER")
def claim_ticket(thread_id):
    data = request.json or {}
    agent_name = data.get("agent_name")
    if not agent_name:
        return jsonify(error="agent_name required"), 400

    ensure_ticket_record_from_csv(thread_id)

    # Find agent id by name (or switch to using agent_id in the request)
    agent = Agent.query.filter_by(name=agent_name).first()
    if not agent:
        return jsonify(error=f"agent '{agent_name}' not found"), 404

    # 1) ensure ticket exists
    ticket = db.session.get(Ticket, thread_id)
    if not ticket:
        ticket = Ticket(id=thread_id, status="open")
        db.session.add(ticket)

    # 2) close any open assignment for this ticket
    db.session.execute(_sql_text("""
        UPDATE ticket_assignments SET unassigned_at = :now
        WHERE ticket_id = :tid AND (unassigned_at IS NULL OR unassigned_at = '')
    """), {"tid": thread_id, "now": datetime.utcnow().isoformat()})

    # 3) create new assignment
    db.session.add(TicketAssignment(
        ticket_id=thread_id,
        agent_id=agent.id,
        assigned_at=datetime.utcnow().isoformat()
    ))

    # 4) set owner field (legacy UI)
    ticket.owner = agent_name
    ticket.updated_at = datetime.utcnow().isoformat()
    db.session.commit()

    # 5) log event + system message
    log_event(thread_id, "ASSIGNED", {"agent_id": agent.id, "agent_name": agent_name})
    save_message(
        ticket_id=thread_id,
        sender="system",
        content=f"🔔 Ticket #{thread_id} assigned to {agent_name}",
        type="system",
        meta={"event": "assigned", "agent": agent_name, "timestamp": datetime.utcnow().isoformat()}
    )
    return jsonify(status="assigned", ticket_id=thread_id, owner=agent_name), 200


# Inbox: Get all tickets where an agent was @mentioned
@app.route('/inbox/mentions/<int:agent_id>', methods=['GET'])
@require_role()
def get_tickets_where_agent_mentioned(agent_id):
    import sqlite3
    DB_PATH = app.config['SQLALCHEMY_DATABASE_URI'].replace('sqlite:///', '')
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    query = """
        SELECT DISTINCT t.id AS ticket_id, t.status
        FROM mentions m
        JOIN messages msg ON m.message_id = msg.id
        JOIN tickets t ON msg.ticket_id = t.id
        WHERE m.mentioned_agent_id = ?
    """
    cursor.execute(query, (agent_id,))
    rows = cursor.fetchall()
    conn.close()

    # Load ticket subjects from CSV
    df = load_df()
    subject_map = dict(zip(df['id'], df['text']))

    results = []
    for row in rows:
        ticket_id, status = row[0], row[1]
        subject = subject_map.get(ticket_id, "")
        results.append({"ticket_id": ticket_id, "status": status, "subject": subject})
    return jsonify(results)

# For solution confirmation, we will send an email with a signed token that the user can click to confirm their solution.
@app.route("/solutions/<int:solution_id>/send_confirmation_email", methods=["POST"])
@require_role("L1", "L2", "L3", "MANAGER")
def send_confirmation_email(solution_id):
    s = db.session.get(Solution, solution_id)
    if not s:
        return jsonify(error="Solution not found"), 404
    # Set proposed_by to the current agent if not already set
    agent = getattr(request, 'agent_ctx', {})
    if not s.proposed_by:
        s.proposed_by = agent.get('name') or agent.get('email') or agent.get('sub') or 'unknown'
        db.session.commit()

    # Find recipient via ticket
    t = db.session.get(Ticket, s.ticket_id)
    to_email = (t.requester_email or "").strip().lower() if t else ""
    if not to_email:
        row = _csv_row_for_ticket(s.ticket_id)
        to_email = (row.get("email") or "").strip().lower() if row else ""
    if not to_email:
        return jsonify(error="No recipient email for this solution/ticket"), 400

    # BLOCK resends while previous attempt is pending
    if has_pending_attempt(s.ticket_id):
        return jsonify(error="A previous solution is still pending user confirmation for this ticket."), 409

    # Create attempt
    attempt_no = get_next_attempt_no(s.ticket_id)
    # Store the agent ID who is sending the solution
    agent_id = agent.get('id') if agent else None
    print(f"[DEBUG] Creating ResolutionAttempt: agent_id={agent_id}, agent_ctx={agent}")
    att = ResolutionAttempt(ticket_id=s.ticket_id, solution_id=s.id, attempt_no=attempt_no, agent_id=agent_id)
    db.session.add(att); db.session.commit()

    # Token includes attempt_id
    serializer = _serializer(SECRET_KEY)
    token = serializer.dumps({"solution_id": s.id, "ticket_id": s.ticket_id, "attempt_id": att.id})

    confirm_url = f"{FRONTEND_URL}/confirm?token={token}&a=confirm"
    reject_url  = f"{FRONTEND_URL}/confirm?token={token}&a=not_confirm"

    subject = f"Please review the solution for Ticket {s.ticket_id}"
    body = (
        f"Hello,\n\n"
        f"Please confirm if the proposed solution resolved your issue:\n\n"
        f"Confirm: {confirm_url}\n"
        f"Not fixed: {reject_url}\n\n"
        f"Thanks,\nSupport Team"
    )

    send_via_gmail(to_email, subject, body)

    s.status = SolutionStatus.sent_for_confirm
    s.sent_for_confirmation_at = _utcnow()
    db.session.commit()

    return jsonify(ok=True)




# ─── Draft Email Endpoint ─────────────────────────────────────────────────────
@app.route('/threads/<thread_id>/draft-email', methods=['POST'])
def draft_email(thread_id):
    data = request.json or {}
    solution = data.get('solution', '').strip()
    if not solution:
        return jsonify(error="Missing solution text"), 400
    prompt = f"Draft a professional email to a user to explain this solution:\n\n{solution}"
    try:
        resp = client.chat.completions.create(
            model=CHAT_MODEL,
            messages=[
                {"role": "system", "content": "You are a helpful IT support assistant."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.3,
            max_tokens=300
        )
        email_text = resp.choices[0].message.content.strip()
    except Exception as e:
        return jsonify(error=f"Failed to draft email: {e}"), 500
    return jsonify(email=email_text)

# ─── Send Email Endpoint ──────────────────────────────────────────────────────
# @app.route('/threads/<thread_id>/send-email', methods=['POST'])
# def send_email(thread_id):
#     data = request.json or {}
#     email_body = data.get('email', '').strip()
#     # Get the ticket's email address from the CSV/DB
#     df = load_df()
#     row = df[df["id"] == thread_id]
#     recipient_email = None
#     if not row.empty:
#         recipient_email = row.iloc[0].get('email', '').strip().lower()
#     if not email_body:
#         return jsonify(error="Missing email body"), 400
#     if not recipient_email:
#         return jsonify(error="No recipient email found for this ticket"), 400
#     # Send email using Gmail SMTP
#     import ssl
#     from email.message import EmailMessage
#     smtp_server = "smtp.gmail.com"
#     smtp_port = 465
#     smtp_user = "testmailaiassistant@gmail.com"
#     smtp_pass = "ydop igne ijhw azws"
#     subject = f"Support Ticket #{thread_id} Update"
#     em = EmailMessage()
#     em["From"] = smtp_user
#     em["To"] = recipient_email
#     em["Subject"] = subject
#     em.set_content(email_body)
#     context = ssl.create_default_context()
#     try:
#         with smtplib.SMTP_SSL(smtp_server, smtp_port, context=context) as smtp:
#             smtp.login(smtp_user, smtp_pass)
#             smtp.sendmail(smtp_user, recipient_email, em.as_string())
#         print(f"Email sent to {recipient_email} for ticket {thread_id}.")
#         return jsonify(status="sent", recipient=recipient_email)
#     except Exception as e:
#         print(f"Failed to send email: {e}")
#         return jsonify(error=f"Failed to send email: {e}"), 500

@app.route('/threads/<thread_id>/send-email', methods=['POST'])
@require_role("L1","L2","L3","MANAGER")  
def send_email(thread_id):
    data = request.json or {}
    email_body = (data.get('email') or '').strip()
    solution_id = data.get('solution_id')  # ← FIX 1: accept optional solution id

    # Parse CC from either a string ("a@x.com, b@y.com") or a list
    cc_raw = data.get('cc') or []
    if isinstance(cc_raw, str):
        parts = re.split(r'[,\s;]+', cc_raw)
    elif isinstance(cc_raw, list):
        parts = cc_raw
    else:
        parts = []

    # Light email validation + normalize + dedupe
    def is_email(s: str) -> bool:
        return bool(re.match(r'^[^@\s]+@[^@\s]+\.[^@\s]+$', s))

    cc = sorted({p.strip().lower() for p in parts if p and is_email(p)})

    if not email_body:
        return jsonify(error="Missing email body"), 400

    # Ensure ticket + resolve primary recipient
    ensure_ticket_record_from_csv(thread_id)
    t = db.session.get(Ticket, thread_id)
    recipient_email = (t.requester_email or '').strip().lower() if t else ''
    if not recipient_email:
        df = load_df()
        row = df[df["id"] == thread_id]
        recipient_email = row.iloc[0].get('email', '').strip().lower() if not row.empty else None
    if not recipient_email:
        return jsonify(error="No recipient email found for this ticket"), 400

    # Persist new CCs so future status emails include them
    if cc:
        existing = {r.email.lower() for r in TicketCC.query.filter_by(ticket_id=thread_id).all()}
        new_addrs = [addr for addr in cc if addr not in existing]
        if new_addrs:
            for addr in new_addrs:
                db.session.add(TicketCC(ticket_id=thread_id, email=addr))
            try:
                db.session.commit()
            except Exception:
                db.session.rollback()

    subject = f"Support Ticket #{thread_id} Update"

    # Resolve solution (optional)
    s = None
    if solution_id:
        try:
            s = db.session.get(Solution, int(solution_id))
        except Exception:
            s = None
    if s is None:
        s = (Solution.query
                .filter_by(ticket_id=thread_id)
                .order_by(Solution.created_at.desc())
                .first())

    if s:
        # Prevent overlapping attempts
        if has_pending_attempt(thread_id):
            return jsonify(error="A previous solution is still pending user confirmation."), 409

        # If last rejected exists, require material change
        last_rejected = (Solution.query
                            .filter_by(ticket_id=thread_id, status=SolutionStatus.rejected)
                            .order_by(Solution.id.desc()).first())
        if last_rejected and not is_materially_different(s.text, last_rejected.text):
            return jsonify(error="New solution is too similar to the last rejected fix. Please revise or escalate."), 422

        # Create a new attempt for this send
        att_no = get_next_attempt_no(thread_id)
        att = ResolutionAttempt(ticket_id=thread_id, solution_id=s.id, attempt_no=att_no)
        db.session.add(att); db.session.commit()

        serializer = _serializer(SECRET_KEY)
        token = serializer.dumps({"solution_id": s.id, "ticket_id": thread_id, "attempt_id": att.id})

        confirm_url = f"{FRONTEND_URL}/confirm?token={token}&a=confirm"
        reject_url  = f"{FRONTEND_URL}/confirm?token={token}&a=not_confirm"
        email_body += (
            "\n\n---\n"
            "Please let us know if this solved your issue:\n"
            f"Confirm: {confirm_url}\n"
            f"Not fixed: {reject_url}\n"
        )
        if s.status != SolutionStatus.sent_for_confirm:
            s.status = SolutionStatus.sent_for_confirm
            s.sent_for_confirmation_at = _utcnow()
            db.session.commit()

    try:
        send_via_gmail(recipient_email, subject, email_body, cc_list=cc)
        log_event(thread_id, 'EMAIL_SENT', {
            "subject": subject, "manual": True, "to": recipient_email, "cc": cc
        })
        return jsonify(status="sent", recipient=recipient_email, cc=cc)
    except Exception as e:
        app.logger.exception("Manual send failed")
        return jsonify(error=f"Failed to send email: {e}"), 500


@app.after_request
def after_request(response):
    allowed_origins = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://192.168.0.17:3000",  # Add any other dev IPs here
    ]
    origin = request.headers.get("Origin")
    if origin in allowed_origins:
        response.headers['Access-Control-Allow-Origin'] = origin
    else:
        response.headers['Access-Control-Allow-Origin'] = 'http://localhost:3000'  # fallback or remove for stricter security
    response.headers['Access-Control-Allow-Credentials'] = 'true'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type,Authorization'
    response.headers['Access-Control-Allow-Methods'] = 'GET,POST,PUT,DELETE,PATCH,OPTIONS'
    return response

# Global OPTIONS handler for all routes
@app.route('/<path:path>', methods=['OPTIONS'])
def options_handler(path):
    response = make_response('', 200)
    response.headers['Access-Control-Allow-Origin'] = 'http://localhost:3000'
    response.headers['Access-Control-Allow-Credentials'] = 'true'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type,Authorization'
    response.headers['Access-Control-Allow-Methods'] = 'GET,POST,PUT,DELETE,PATCH,OPTIONS'
    return response
def threads_step_options(thread_id):
    return ('', 200)

# POST endpoint to mark current step as completed and move to next step
@app.route('/threads/<thread_id>/step', methods=['POST'])
@require_role("L1","L2","L3","MANAGER")
def step_next(thread_id):
    """
    Marks the current step as completed and moves to the next step.
    Replies with the next step, or a completion message if done.
    """
    seq = get_steps(thread_id)
    if not seq or not seq.steps:
        return jsonify(error="No step sequence found for this ticket."), 404
    steps = seq.steps
    idx = seq.current_index if seq.current_index is not None else 0
    # Mark current step as completed (could log or store if needed)
    completed_step = steps[idx] if idx < len(steps) else None
    # Move to next step
    next_idx = idx + 1
    if next_idx < len(steps):
        seq.current_index = next_idx
        db.session.commit()
        next_step = steps[next_idx]
        insert_message_with_mentions(thread_id, "assistant", next_step)
        return jsonify(ticketId=thread_id, step=next_idx+1, total=len(steps), reply=next_step), 200
    else:
        # All steps completed
        insert_message_with_mentions(thread_id, "assistant", "✅ All steps completed! If you need further help, let me know.")
        return jsonify(ticketId=thread_id, completed=True, reply="✅ All steps completed! If you need further help, let me know."), 200

# ─── Suggested Prompts Endpoint ──────────────────────────────────────────────
# server.py
@app.route('/threads/<thread_id>/suggested-prompts', methods=['GET'])
# @require_role("L1","L2","L3","MANAGER")
def suggested_prompts(thread_id):
    prompts = [
        # 1) Ask GPT for the most likely fix with exact steps
        {"kind": "automate", "label": "Give me the top fix with exact steps",
         "intent": "can you suggest a fix for this issue?"},

        # 2) Draft a short email explaining the fix
        {"kind": "automate", "label": "Draft a short email to the user",
         "intent": "draft a professional email to the user with the solution."},

        # 3) Ask exactly 3 clarifying questions
        {"kind": "automate", "label": "Ask me 3 clarifying questions",
         "intent": "ask me 3 clarifying questions that would narrow this down fastest"},

        # 4) Decide whether to escalate
        {"kind": "automate", "label": "Should I escalate this?",
         "intent": "should i escalate this?"},
    ]
    return jsonify(prompts=prompts), 200

# @app.route('/threads/<thread_id>/suggested-prompts', methods=['GET'])
# @require_role("L1","L2","L3","MANAGER")
# def suggested_prompts(thread_id):
#     df = load_df()
#     row = df[df["id"] == thread_id]
#     ticket_text = (row.iloc[0]["text"] if not row.empty else "").strip()

#     # Intents your build_prompt_from_intent() already supports
#     INTENT_PALETTE = [
#         "Can you suggest a fix for this issue?",
#         "Ask me 3 clarifying questions that would narrow this down fastest",
#         "Has this happened before?",
#         "Is this a common problem?",
#         "Draft a professional email to the user with the solution.",
#         "Should I escalate this?",
#         "Suggest an alternative approach."
#     ]

#     # sensible default selection/order
#     selected = INTENT_PALETTE[:5]

#     # Use GPT only to choose the best 4–6 items from the fixed list (no end-user wording)
#     if ticket_text:
#         try:
#             choose_prompt = f"""
# You are helping an L1/L2 support agent decide what to ask an internal assistant bot.
# From this fixed list of intents:

# {json.dumps(INTENT_PALETTE, ensure_ascii=False)}

# Pick the 4–6 most useful for the ticket below (order matters). Return a JSON array
# of strings taken **verbatim** from the list. No explanations.

# Ticket:
# \"\"\"{ticket_text}\"\"\""""
#             resp = client.chat.completions.create(
#                 model=CHAT_MODEL,
#                 messages=[
#                     {"role":"system","content":"You are precise. Return JSON only."},
#                     {"role":"user","content": choose_prompt}
#                 ],
#                 temperature=0.0,
#                 max_tokens=64
#             )
#             content = (resp.choices[0].message.content or "").strip()
#             content = re.sub(r"^```(?:json)?|```$", "", content).strip()  # strip fences if present
#             arr = json.loads(content)
#             selected = [s for s in arr if s in INTENT_PALETTE][:6] or selected
#         except Exception as e:
#             app.logger.warning(f"/suggested-prompts selection failed: {e}")

#     # Return objects your UI can click to call /chat with source:'suggested'
#     prompts = [{"kind": "automate", "intent": s} for s in selected]
#     return jsonify(prompts=prompts), 200

# @app.route('/threads/<thread_id>/suggested-prompts', methods=['GET'])
# def suggested_prompts(thread_id):
#     """
#     Returns two buckets:
#       - ask_user: concrete questions tailored to the ticket to send to the end user
#       - automate: standardized intents that /chat (source='suggested') expands via build_prompt_from_intent
#     """
#     # 1) Get ticket text (use subject fallback if you prefer)
#     df = load_df()
#     row = df[df["id"] == thread_id]
#     ticket_text = (row.iloc[0]["text"] if not row.empty else "").strip()

#     # Optional: prefer DB subject if present
#     t = db.session.get(Ticket, thread_id)
#     subject = (t.subject or "").strip() if t else ""
#     context_text = ticket_text or subject

#     if not context_text:
#         return jsonify(prompts=[]), 200

#     # 2) Ask GPT for end-user questions + choose relevant assistant intents
#     try:
#         whitelist_intents = [
#             "Can you suggest a fix for this issue?",
#             "Ask me 3 clarifying questions that would narrow this down fastest",
#             "Draft a professional email to the user with the solution.",
#             "Is this a common problem?",
#             "Has this happened before?",
#             "Should I escalate this?",
#             "Suggest an alternative approach."
#         ]

#         prompt = (
#             "You are an IT support co-pilot. Based on the ticket below, do two things:\n"
#             "A) Generate 3–5 short, concrete questions we can send to the end user to gather missing info.\n"
#             "   Keep them specific to this ticket, one sentence each, no fluff.\n"
#             "B) Select the 3–5 most relevant items from this whitelist of assistant actions "
#             "   (return exact strings):\n"
#             f"{json.dumps(whitelist_intents)}\n\n"
#             "Return JSON ONLY with this shape:\n"
#             "{\n"
#             '  "ask_user": ["...", "..."],\n'
#             '  "automate": ["whitelisted intent string", "..."]\n'
#             "}\n\n"
#             f"TICKET:\n{context_text}"
#         )

#         resp = client.chat.completions.create(
#             model=CHAT_MODEL,
#             messages=[
#                 {"role": "system", "content": "You return strictly formatted JSON and write concise, actionable content."},
#                 {"role": "user", "content": prompt}
#             ],
#             temperature=0.2,
#             max_tokens=300
#         )

#         raw = (resp.choices[0].message.content or "").strip()
#         raw = re.sub(r"^```(?:json)?|```$", "", raw, flags=re.MULTILINE).strip()
#         try:
#             data = json.loads(raw)
#         except Exception:
#             # Fallback minimal shape
#             data = {"ask_user": [], "automate": []}

#         ask_user = [q for q in (data.get("ask_user") or []) if isinstance(q, str) and q.strip()]
#         automate = [i for i in (data.get("automate") or []) if i in whitelist_intents]

#         # Ensure we always return something useful
#         if not ask_user:
#             ask_user = [
#                 "Could you share the exact error message or a screenshot?",
#                 "Which app and version are affected (e.g., Outlook 2405 on Windows 11)?",
#                 "When did this start and does it affect others?",
#                 "What steps have you already tried?"
#             ][:4]

#         if not automate:
#             automate = [
#                 "Can you suggest a fix for this issue?",
#                 "Ask me 3 clarifying questions that would narrow this down fastest",
#                 "Draft a professional email to the user with the solution.",
#                 "Suggest an alternative approach."
#             ]

#     except Exception as e:
#         app.logger.error(f"[suggested-prompts] GPT error: {e}")
#         ask_user = [
#             "Could you share the exact error message or a screenshot?",
#             "Which app and version are affected?",
#             "When did this start and does it affect others?"
#         ]
#         automate = [
#             "Can you suggest a fix for this issue?",
#             "Ask me 3 clarifying questions that would narrow this down fastest",
#             "Draft a professional email to the user with the solution."
#         ]

#     # 3) Shape results for the UI:
#     #    - ask_user items have a 'text' payload
#     #    - automate items carry an 'intent' that your /chat route understands
#     prompts = []
#     prompts += [{"kind": "ask_user", "text": q} for q in ask_user]
#     prompts += [{"kind": "automate", "intent": i} for i in automate]

#     return jsonify(prompts=prompts), 200


# @app.route('/threads/<thread_id>/suggested-prompts', methods=['GET'])
# # @require_role("L1","L2","L3","MANAGER")
# def suggested_prompts(thread_id):
#     df = load_df()
#     row = df[df["id"] == thread_id]
#     ticket_text = row.iloc[0]["text"] if not row.empty else ""

#     if not ticket_text.strip():
#         return jsonify(prompts=[]), 200

#     prompt = (
#         "You are an expert IT support assistant. "
#         "Given the ticket text below, generate 3–5 short, actionable prompt suggestions an agent could click next. "
#         "Return ONLY a JSON array of strings.\n\n"
#         f'Ticket:\n"""\n{ticket_text}\n"""'
#     )

#     try:
#         resp = client.chat.completions.create(
#             model=CHAT_MODEL,
#             messages=[
#                 {"role": "system", "content": "You are a helpful IT support assistant."},
#                 {"role": "user", "content": prompt}
#             ],
#             temperature=0.2,
#             max_tokens=200,
#         )
#         content = (resp.choices[0].message.content or "").strip()
#         # strip optional code fences
#         content = re.sub(r"^```(?:json)?|```$", "", content).strip()

#         try:
#             suggestions = json.loads(content)
#         except Exception:
#             # fall back to parsing bullet lines if the model didn’t return JSON
#             suggestions = [re.sub(r"^[-•]\s*", "", line).strip()
#                            for line in content.splitlines() if line.strip()]

#         suggestions = [s for s in suggestions if isinstance(s, str) and s.strip()][:5]
#     except Exception:
#         suggestions = [
#             "Suggest one likely fix with 3–5 numbered steps.",
#             "Draft a short email to the user that explains the fix.",
#             "Ask me 3 clarifying questions to narrow this down.",
#             "Propose an alternative troubleshooting approach.",
#         ]

#     return jsonify(prompts=suggestions), 200

# @app.route('/threads/<thread_id>/suggested-prompts', methods=['GET'])
# def suggested_prompts(thread_id):
#     df = load_df()
#     row = df[df["id"] == thread_id]
#     ticket_text = row.iloc[0]["text"] if not row.empty else ""

#     if not ticket_text.strip():
#         print(f"[WARN] No ticket text found for thread_id: {thread_id}")
#         return jsonify(prompts=[]), 200

#     # GPT prompt with example output format
#     prompt = f"""
# You are an expert IT support assistant. Given the following support ticket, generate 3 to 5 short, relevant prompt suggestions that an agent might want to ask or do next. Each suggestion should be a single sentence or question, actionable, and specific to the ticket context.

# Example format:
# [
#   "Have you checked the user's VPN credentials?",
#   "Did the user recently change their password?",
#   "Can you ask the user to flush DNS using ipconfig /flushdns?",
#   "Try restarting the network adapter and checking connectivity.",
#   "Has this issue occurred on other machines?"
# ]

#     ticket = {
#         "id": t.id,
#         "status": t.status,
#         "owner": t.owner,
#         "subject": t.subject,
#         "category": t.category,
#         "department_id": t.department_id,
#         "priority": t.priority,
#         "impact_level": t.impact_level,
#         "urgency_level": t.urgency_level,
#         "requester_email": t.requester_email,
#         "requester_name": t.requester_name,
#         "created_at": t.created_at,
#         "updated_at": t.updated_at,
#         "level": t.level,
#         "text": csv.get("text", ""),  # keep original ticket text for UI
#     }

#         content = resp.choices[0].message.content.strip()
#         if app.config['ENV'] != 'production':
#             print("🧠 GPT Raw Content:\n", content)

#         # Remove code fences if present
#         content = re.sub(r"```(?:json)?", "", content).strip()

#         # Try parsing as JSON, fallback to bullet/line list
#         try:
#             suggestions = json.loads(content)
#         except:
#             # Fallback: extract from "- " bullets or plain lines
#             suggestions = re.findall(r"- (.+)", content) or [line.strip() for line in content.split('\n') if line.strip()]

#         # Filter valid strings and limit to 5
#         suggestions = [s for s in suggestions if isinstance(s, str) and s.strip()][:5]


#     except Exception as e:
#         print("❌ GPT Error:", e)
#         suggestions = [
#             "Suggest one likely fix and 3–5 numbered steps I can try now.",
#             "Draft a short email to the user with the solution.",
#             "Ask me 3 clarifying questions that would narrow this down fastest",
#             "Suggest an alternative approach."
#         ]

#     return jsonify(prompts=suggestions)


# ─── Related Tickets Endpoint ────────────────────────────────────────────────
@app.route('/threads/<thread_id>/related-tickets', methods=['GET'])
def related_tickets(thread_id):
    df = load_df()
    row = df[df["id"] == thread_id]
    ticket_text = row.iloc[0]["text"] if not row.empty else ""
    # Use embedding similarity to find top 3-5 related tickets
    try:
        # Get embedding for current ticket
        emb_resp = client.embeddings.create(
            model=EMB_MODEL,
            input=[ticket_text]
        )
        query_emb = emb_resp.data[0].embedding
        # Compute similarity to all tickets in the CSV
        all_texts = df["text"].tolist()
        emb_resp_all = client.embeddings.create(
            model=EMB_MODEL,
            input=all_texts
        )
        all_embs = [e.embedding for e in emb_resp_all.data]
        import numpy as np
        query_vec = np.array(query_emb)
        all_vecs = np.array(all_embs)
        # Cosine similarity
        def cosine_sim(a, b):
            return np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b))
        sims = [cosine_sim(query_vec, v) for v in all_vecs]
        # Get top 5 (excluding self)
        idxs = np.argsort(sims)[::-1]
        related = []
        for idx in idxs:
            if df.iloc[idx]["id"] == thread_id:
                continue
            related.append({
                "id": df.iloc[idx]["id"],
                "title": df.iloc[idx].get("subject", ""),
                "text": df.iloc[idx]["text"],
                "summary": df.iloc[idx].get("summary", ""),
                "resolution": df.iloc[idx].get("resolution", ""),
                "similarity": float(sims[idx])
            })
            if len(related) >= 5:
                break
    except Exception as e:
        related = []
    return jsonify(tickets=related)

# def _send_email_smtp(to_email: str, cc_list: list[str], subject: str, body: str):
#     smtp_server = "smtp.gmail.com"
#     smtp_port = 465
#     smtp_user = "testmailaiassistant@gmail.com"
#     smtp_pass = "ydop igne ijhw azws"  # move to env in real use
#     em = EmailMessage()
#     em["From"] = smtp_user
#     em["To"] = to_email
#     if cc_list:
#         em["Cc"] = ", ".join(cc_list)
#     em["Subject"] = subject
#     em.set_content(body)
#     context = ssl.create_default_context()
#     with smtplib.SMTP_SSL(smtp_server, smtp_port, context=context) as smtp:
#         smtp.login(smtp_user, smtp_pass)
#         smtp.send_message(em)

def _claim_pending_ids(limit=25):
    """
    Atomically claim up to `limit` pending emails by setting status=PENDING -> SENDING.
    Returns the list of claimed ids. Safe even if multiple workers run.
    """
    ids = []
    # Grab a snapshot of candidates
    candidates = (EmailQueue.query
                  .filter_by(status='PENDING')
                  .order_by(EmailQueue.created_at.asc())
                  .limit(limit)
                  .all())
    for row in candidates:
        # Atomic claim: only succeed if it's still PENDING
        res = db.session.execute(_sql_text("""
            UPDATE email_queue
            SET status='SENDING'
            WHERE id=:id AND status='PENDING'
        """), {"id": row.id})
        if res.rowcount:  # we won the claim
            ids.append(row.id)
    db.session.commit()
    return ids

def email_worker_loop(poll_seconds: int = 5):
    with app.app_context():
        while True:
            claimed = _claim_pending_ids(limit=25)
            if not claimed:
                time.sleep(poll_seconds)
                continue

            rows = EmailQueue.query.filter(EmailQueue.id.in_(claimed)).all()
            for item in rows:
                try:
                    cc_list = json.loads(item.cc or "[]")
                    send_via_gmail(item.to_email, item.subject, item.body, cc_list=cc_list)
                    item.status = 'SENT'
                    item.sent_at = datetime.utcnow().isoformat()
                    item.error = None
                    db.session.commit()
                    log_event(item.ticket_id, 'EMAIL_SENT', {
                        "subject": item.subject, "manual": False,
                        "to": item.to_email, "cc": cc_list
                    })
                except Exception as e:
                    item.status = 'FAILED'
                    item.error = str(e)
                    db.session.commit()
            # small breather between batches
            time.sleep(1)


# def email_worker_loop(poll_seconds: int = 5):
#     with app.app_context():
#         while True:
#             batch = EmailQueue.query.filter_by(status='PENDING')\
#                                     .order_by(EmailQueue.created_at.asc())\
#                                     .limit(25).all()
#             if not batch:
#                 time.sleep(poll_seconds)
#                 continue

#             for item in batch:
#                 try:
#                     cc_list = json.loads(item.cc or "[]")
#                     send_via_gmail(item.to_email, item.subject, item.body, cc_list=cc_list)
#                     item.status = 'SENT'
#                     item.sent_at = datetime.datetime.utcnow().isoformat()
#                     item.error = None
#                     db.session.commit()
#                     # optional: timeline event for queued sends
#                     log_event(item.ticket_id, 'EMAIL_SENT', {
#                         "subject": item.subject, "manual": False, "to": item.to_email, "cc": cc_list
#                     })
#                 except Exception as e:
#                     item.status = 'FAILED'
#                     item.error = str(e)
#                     db.session.commit()
#             time.sleep(1)

@app.get("/emails/preview")
def emails_preview():
    tid  = request.args.get("ticket_id")
    kind = request.args.get("kind", "Escalated")
    t = db.session.get(Ticket, tid)
    if not t:
        return jsonify(error="ticket not found"), 404

    subj = f"[Ticket {t.id}] {kind} — {(t.subject or '').strip()}"
    body = (
        f"Hello,\n\n"
        f"Update on your ticket {t.id}: {kind}.\n\n"
        f"Regards,\nSupport Team"
    )
    return jsonify(subject=subj, body=body), 200


@app.route("/emails/pending", methods=["GET"])
@require_role("MANAGER")
def emails_pending():
    rows = EmailQueue.query.filter_by(status='PENDING').order_by(EmailQueue.created_at.asc()).all()
    return jsonify([{
        "id": r.id, "ticket_id": r.ticket_id, "to": r.to_email, "subject": r.subject, "created_at": r.created_at
    } for r in rows])

@app.route("/emails/failed", methods=["GET"])
@require_role("MANAGER")
def emails_failed():
    rows = EmailQueue.query.filter_by(status='FAILED').order_by(EmailQueue.created_at.asc()).all()
    return jsonify([{
        "id": r.id, "ticket_id": r.ticket_id, "to": r.to_email, "subject": r.subject, "error": r.error
    } for r in rows])

@app.route("/emails/retry/<int:qid>", methods=["POST"])
@require_role("MANAGER")
def emails_retry(qid):
    row = EmailQueue.query.get(qid)
    if not row: return jsonify(error="not found"), 404
    row.status = 'PENDING'
    row.error = None
    db.session.commit()
    return jsonify(ok=True)

# @app.route("/threads/<thread_id>/route", methods=["POST"])
# @require_role("L1","L2","L3","MANAGER")
# def auto_route(thread_id):
#     ensure_ticket_record_from_csv(thread_id)
#     t = db.session.get(Ticket, thread_id)
#     dep_id = t.department_id or route_department_from_category(t.category)
#     if not dep_id: 
#         return jsonify(routed=False, reason="no mapping"), 200
#     t.department_id = dep_id
#     t.updated_at = datetime.datetime.utcnow().isoformat()
#     db.session.commit()
#     log_event(thread_id, "ROUTED", {"department_id": dep_id, "mode":"auto"})
#     return jsonify(routed=True, department_id=dep_id)

@app.route("/threads/<thread_id>/department", methods=["PATCH"])
@require_role("L2","L3","MANAGER")
def override_department(thread_id):
    data = request.json or {}
    # Accept department_id (number) or department (name or id)
    dep = data.get("department_id", data.get("department"))
    if dep is None or dep == "":
        return jsonify(error="department or department_id required"), 400

    # normalize: allow "3" as id, or "Network" as name
    d = None
    try:
        d = Department.query.get(int(dep))
    except Exception:
        pass
    if not d:
        d = Department.query.filter_by(name=str(dep)).first()

    if not d:
        return jsonify(error="unknown department"), 404

    t = db.session.get(Ticket, thread_id) or abort(404)
    old = t.department_id
    t.department_id = d.id
    t.updated_at = datetime.utcnow().isoformat()
    db.session.commit()

    actor = getattr(getattr(request, "agent_ctx", {}), "get", lambda _:"")( "email")
    log_event(thread_id, "ROUTE_OVERRIDE", {
        "old_department_id": old,
        "new_department_id": d.id,
        "reason": data.get("reason") or "",
        "by": actor
    })
    return jsonify(ok=True, department_id=d.id, department=d.name, updated_at=t.updated_at), 200


@app.route("/threads/<thread_id>/route", methods=["POST"])
@require_role("L1","L2","L3","MANAGER")
def auto_route(thread_id):
    ensure_ticket_record_from_csv(thread_id)
    t = db.session.get(Ticket, thread_id)

    dep_id = t.department_id or route_department_from_category(t.category)
    if not dep_id and t.category:
        # last resort: try again with the raw category string (no change needed if same)
        dep_id = route_department_from_category(str(t.category))

    if not dep_id:
        return jsonify(routed=False, reason="no mapping"), 200

    t.department_id = dep_id
    t.updated_at = datetime.utcnow().isoformat()
    db.session.commit()
    log_event(thread_id, "ROUTED", {"department_id": dep_id, "mode": "auto"})
    return jsonify(routed=True, department_id=dep_id)

# add near your other routes
@app.get("/departments")
def list_departments():
    # Ensure 'General Support' is always present
    default_dep = Department.query.filter_by(name='General Support').first()
    if not default_dep:
        default_dep = Department(name='General Support')
        db.session.add(default_dep)
        db.session.commit()
    rows = Department.query.order_by(Department.id.asc()).all()
    return jsonify(departments=[{"id": d.id, "name": d.name} for d in rows]), 200

# --- Endpoint to backfill department_id for existing tickets ---
@app.route('/tickets/auto-assign-departments', methods=['POST'])
@require_role("MANAGER")
def auto_assign_departments():
    count = 0
    # Find 'General Support' department, case-insensitive, strip whitespace
    default_dep = Department.query.filter(Department.name.ilike('%general support%')).first()
    if not default_dep:
        default_dep = Department(name='General Support')
        db.session.add(default_dep)
        db.session.commit()
    unassigned_ids = []
    for t in Ticket.query.filter((Ticket.department_id == None) | (Ticket.department_id == '')).all():
        # Use subject, category, or first message as description
        desc = t.subject or t.category or ''
        # Optionally, fetch first message content for more context
        msg = Message.query.filter_by(ticket_id=t.id).order_by(Message.timestamp.asc()).first()
        if msg and msg.content:
            desc = f"{desc}\n{msg.content}" if desc else msg.content
        dep_name = categorize_department_with_gpt(desc)
        app.logger.info(f"[AUTO-ASSIGN] Ticket {t.id}: GPT returned department: '{dep_name}' for desc: '{desc}'")
        # Normalize department names for robust matching
        dep = None
        if dep_name:
            dep_name_norm = dep_name.strip().lower()
            for d in Department.query.all():
                if d.name.strip().lower() == dep_name_norm:
                    dep = d
                    break
        # If no match, try FAISS (semantic search)
        if not dep and 'faiss' in globals():
            try:
                # Use FAISS to find the closest department by embedding
                emb_resp = client.embeddings.create(model=EMB_MODEL, input=[desc])
                query_emb = emb_resp.data[0].embedding
                # Build department embeddings
                dept_names = [d.name for d in Department.query.all()]
                dept_emb_resp = client.embeddings.create(model=EMB_MODEL, input=dept_names)
                dept_embs = [e.embedding for e in dept_emb_resp.data]
                import numpy as np
                sims = [np.dot(query_emb, v) / (np.linalg.norm(query_emb) * np.linalg.norm(v)) for v in dept_embs]
                best_idx = int(np.argmax(sims))
                dep = Department.query.filter_by(name=dept_names[best_idx]).first()
                app.logger.info(f"[AUTO-ASSIGN] Ticket {t.id}: FAISS fallback picked department: '{dept_names[best_idx]}' (score={sims[best_idx]:.3f})")
            except Exception as e:
                app.logger.warning(f"[AUTO-ASSIGN] Ticket {t.id}: FAISS fallback failed: {e}")
        if dep:
            t.department_id = dep.id
            count += 1
        else:
            # Assign to default department if no match
            t.department_id = default_dep.id
            count += 1
            app.logger.warning(f"[AUTO-ASSIGN] Ticket {t.id}: Could not match department, assigned to General Support.")
    db.session.commit()
    # Log any tickets still unassigned (should be none)
    still_unassigned = [t.id for t in Ticket.query.filter((Ticket.department_id == None) | (Ticket.department_id == '')).all()]
    if still_unassigned:
        print(f"[WARN] Tickets still unassigned after fallback: {still_unassigned}")
    return jsonify({'updated': count, 'still_unassigned': still_unassigned}), 200

#testing purpose
@app.route('/tickets/unassigned', methods=['GET'])
@require_role("L2","L3","MANAGER")
def count_unassigned_tickets():
    count = Ticket.query.filter((Ticket.department_id == None) | (Ticket.department_id == '')).count()
    return jsonify({'unassigned_count': count})

@app.route("/threads/<thread_id>/deescalate", methods=["POST"])
@require_role("L2","L3","MANAGER")
def deescalate_ticket(thread_id):
    ensure_ticket_record_from_csv(thread_id)
    t = db.session.get(Ticket, thread_id)
    if not t:
        return jsonify(error="Ticket not found"), 404
    body = request.json or {}
    note = (body.get("note") or "").strip()
    old = t.level or 1
    if old <= 1:
        return jsonify(error="Already at L1"), 400

    to_level = old - 1
    now = datetime.now(timezone.utc).isoformat()
    t.level = to_level
    t.status = "de-escalated"
    t.updated_at = now
    actor = getattr(request, "agent_ctx", None)
    actor_id = actor.get("id") if isinstance(actor, dict) else None
    add_event(t.id, "DE-ESCALATED",
            actor_agent_id=actor_id,
            from_level=old, to_level=to_level, note=note)
    db.session.commit()

    insert_message_with_mentions(thread_id, "assistant",
        f"[SYSTEM] De-escalated to L{to_level}." + (f" Note: {note}" if note else ""))
    enqueue_status_email(thread_id, "Updated", f"Ticket moved to L{to_level}.")
    return jsonify(status=t.status, level=to_level), 200

# # A route to confirm if a solution was accepted by the user.
# @app.route("/solutions/<solution_id>/confirm", methods=["POST"])
# @require_role("L1", "L2", "L3", "MANAGER")
# def confirm_solution(solution_id):
#     solution = db.session.get(Solution, solution_id)
#     if not solution:
#         return jsonify(error="Solution not found"), 404

#     # Get user confirmation details from the request body
#     data = request.json or {}
#     confirmed = data.get("confirmed", False)

#     # Update solution status based on confirmation
#     solution.status = SolutionStatus.confirmed_by_user if confirmed else SolutionStatus.rejected
#     solution.confirmed_at = datetime.datetime.utcnow() if confirmed else None
#     solution.confirmed_by_user = confirmed
#     solution.confirmed_ip = request.remote_addr
#     db.session.commit()

#     return jsonify(status=(solution.status.value if solution.status else None), message="Solution confirmed" if confirmed else "Solution rejected"), 200

@app.get("/solutions/confirm")
def confirm_solution_via_link():
    token  = request.args.get("token", "")
    action = (request.args.get("a") or "confirm").lower()
    wants_json = "application/json" in (request.headers.get("Accept") or "").lower()

    try:
        payload = _serializer(SECRET_KEY).loads(token, max_age=7*24*3600)
    except (BadSignature, SignatureExpired):
        return (jsonify(ok=False, reason="invalid_or_expired"), 400) if wants_json else redirect(CONFIRM_REDIRECT_URL)

    sid = payload.get("solution_id")
    s   = db.session.get(Solution, sid)
    if not s:
        return (jsonify(ok=False, reason="not_found"), 404) if wants_json else redirect(CONFIRM_REDIRECT_URL)

    # attempt is optional for old tokens
    att = None
    if payload.get("attempt_id"):
        att = db.session.get(ResolutionAttempt, payload["attempt_id"])

    is_confirm = (action == "confirm")

    # --- Update solution + attempt outcomes (idempotent-ish) ---
    s.status = SolutionStatus.confirmed_by_user if is_confirm else SolutionStatus.rejected
    s.confirmed_by_user = is_confirm
    s.confirmed_at = _utcnow()
    s.confirmed_via = SolutionConfirmedVia.web
    s.confirmed_ip = request.headers.get("X-Forwarded-For", request.remote_addr)

    if att:
        att.outcome = "confirmed" if is_confirm else "rejected"
        att.closed_at = datetime.utcnow()

    db.session.commit()

    # --- Timeline event: use types the UI already understands ---
    log_event(
        s.ticket_id,
        "CONFIRMED" if is_confirm else "NOT_FIXED",
        {"attempt_id": (att.id if att else None)}
    )

    # --- If NOT fixed: optional policy handling (no emails here) ---
    nxt = None
    if not is_confirm:
        t = db.session.get(Ticket, s.ticket_id) or ensure_ticket_record_from_csv(s.ticket_id)
        att_no = att.attempt_no if att else (get_next_attempt_no(s.ticket_id) - 1)
        nxt = next_action_for(t, att_no, reason_code=None)
        if nxt["action"] == "collect_diagnostics":
            _start_step_sequence_basic(s.ticket_id)
            _inject_system_message(s.ticket_id, "User reported Not fixed. Started diagnostics (Pack A).")
        elif nxt["action"] == "new_solution":
            _inject_system_message(s.ticket_id, "Not fixed. Draft a materially different fix or escalate.")
        elif nxt["action"] == "escalate":
            old = t.level or 1
            t.level = max(old, nxt.get("to_level", old+1))
            t.status = "escalated"
            t.updated_at = datetime.utcnow().isoformat()
            db.session.commit()
            log_event(s.ticket_id, "ESCALATED", {"auto": True, "policy": "after_not_fixed", "from_level": old, "to_level": t.level})
            _inject_system_message(s.ticket_id, f"Auto-escalated to L{t.level} after Not fixed.")
        elif nxt["action"] == "live_assist":
            _inject_system_message(s.ticket_id, "Recommend scheduling a live assist/remote session.")

    # Build payload the SPA needs
    # (Ticket email may be in your Ticket model; if not, keep None)
    ticket = db.session.get(Ticket, s.ticket_id)
    payload = {
        "ok": True,
        "confirmed": is_confirm,
        "ticket_id": s.ticket_id,
        "attempt_id": att.id if att else None,
        "solution_id": s.id,
        "user_email": getattr(ticket, "requester_email", None),
        "next": nxt,
    }

    if wants_json:
        return jsonify(payload), 200

    # For direct browser hits (not SPA fetch), redirect to success/fail landing
    return redirect(CONFIRM_REDIRECT_URL_SUCCESS if is_confirm else CONFIRM_REDIRECT_URL_REJECT)


# A route to promote a solution to a Knowledge Base (KB) article.
@app.route("/solutions/<solution_id>/promote", methods=["POST"])
@require_role("L1", "L2", "L3", "MANAGER")
def promote_solution_to_kb(solution_id):
    solution = db.session.get(Solution, solution_id)
    if not solution:
        return jsonify(error="Solution not found"), 404

    # Create a new KB article from the solution
    # Get agent info from JWT
    agent = getattr(request, 'agent_ctx', {})
    approved_by = agent.get('name') or agent.get('email') or agent.get('sub') or 'unknown'
    kb_article = KBArticle(
        title=f"KB Article for Solution {solution_id}",
        problem_summary=solution.text[:255],  # Truncate to 255 chars for the summary
        content_md=solution.text,
        status=KBArticleStatus.published,
        source=KBArticleSource.ai,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
        approved_by=approved_by
    )
    db.session.add(kb_article)
    db.session.commit()

    # Link the solution to the KB article
    solution.published_article_id = kb_article.id
    db.session.commit()

    # Do NOT email the customer when publishing a KB article
    return jsonify(message="Solution successfully promoted to KB article", article_id=kb_article.id), 200

#A route to handle user feedback for KB articles.
@app.route("/kb/<kb_article_id>/feedback", methods=["POST"])
def submit_kb_feedback(kb_article_id):
    kb_article = db.session.get(KBArticle, kb_article_id)
    if not kb_article:
        return jsonify(error="KB Article not found"), 404

    # Get feedback details from the request body
    data = request.json or {}
    feedback_type = data.get("feedback_type")  # e.g., "helpful", "not_helpful"
    rating = data.get("rating", 0)  # rating 1-5
    comment = data.get("comment", "")
    
    if feedback_type not in ["helpful", "not_helpful"]:
        return jsonify(error="Invalid feedback type"), 400

    feedback = KBFeedback(
        kb_article_id=kb_article_id,
        user_id=data.get("user_id"),  # Optional user_id
        feedback_type=KBFeedbackType[feedback_type.upper()],
        rating=rating,
        comment=comment,
        created_at=datetime.utcnow()
    )
    db.session.add(feedback)
    db.session.commit()

    return jsonify(message="Feedback submitted successfully"), 200

#A route to log events related to solutions and KB articles.
@app.route("/audit", methods=["POST"])
@require_role("L1", "L2", "L3", "MANAGER")
def log_audit_event():
    data = request.json or {}
    entity_type = data.get("entity_type")  # e.g., "solution", "kb_article"
    entity_id = data.get("entity_id")
    event = data.get("event")
    actor_id = data.get("actor_id")  # ID of the user performing the action
    meta = data.get("meta", {})

    if not entity_type or not entity_id or not event:
        return jsonify(error="Missing required fields"), 400

    # Create audit record
    audit_log = KBAudit(
        entity_type=entity_type,
        entity_id=entity_id,
        event=event,
        actor_id=actor_id,
        meta_json=json.dumps(meta),
        created_at=datetime.utcnow()
    )
    db.session.add(audit_log)
    db.session.commit()

    return jsonify(message="Audit event logged successfully"), 200

# GET /solutions for kb articles 
@app.route('/solutions', methods=['GET'])
@require_role("L1", "L2", "L3", "MANAGER")
def get_solutions():
    status = request.args.get('status')
    limit = int(request.args.get('limit', 50))
    q = Solution.query
    if status:
        status_list = [s.strip() for s in status.split(',')]
        q = q.filter(Solution.status.in_(status_list))
    q = q.order_by(Solution.created_at.desc()).limit(limit)
    results = [
        {
            'id': s.id,
            'ticket_id': s.ticket_id,
            'agent': s.proposed_by,
            'status': s.status.value if s.status else None,
            'text': s.text,
            'created_at': s.created_at.isoformat() if s.created_at else None,
            'updated_at': s.updated_at.isoformat() if s.updated_at else None,
        }
        for s in q.all()
    ]
    return jsonify(results)
# GET /kb/articles?status=...&limit=... for kb dashboard 
@app.route('/kb/articles', methods=['GET'])
@require_role("L1", "L2", "L3", "MANAGER")
def get_kb_articles():
    status = request.args.get('status')
    limit = int(request.args.get('limit', 50))
    q = KBArticle.query
    if status:
        status_list = [s.strip() for s in status.split(',')]
        q = q.filter(KBArticle.status.in_(status_list))
    q = q.order_by(KBArticle.created_at.desc()).limit(limit)
    results = [
        {
            'id': a.id,
            'title': a.title,
            'problem_summary': a.problem_summary,
            'status': a.status.value if a.status else None,
            'approved_by': a.approved_by,
        }
        for a in q.all()
    ]
    return jsonify(results)

@app.route("/threads/<thread_id>/feedback", methods=["POST", "OPTIONS"])
def submit_feedback(thread_id):
    # CORS preflight
    if request.method == "OPTIONS":
        return ("", 204)

    data = request.get_json(silent=True) or {}
    type_      = (data.get("type") or "").upper()           # "CONFIRM" | "REJECT"
    rating     = data.get("rating")
    comment    = (data.get("comment") or "").strip() or None
    reason     = (data.get("reason") or "").strip() or None
    attempt_id = data.get("attempt_id")
    user_email = (data.get("user_email") or "").strip() or None

    if type_ not in ("CONFIRM", "REJECT"):
        return jsonify(error="type must be CONFIRM or REJECT"), 400

    # clamp rating for CONFIRM
    if type_ == "CONFIRM" and rating is not None:
        try:
            rating = max(1, min(5, int(rating)))
        except Exception:
            return jsonify(error="rating must be integer 1..5"), 400
    else:
        rating = None

    # Persist end-user feedback on the ticket (use your TicketFeedback table)
    if rating is not None or comment:
        tf = TicketFeedback(
            ticket_id=thread_id,
            rating=rating,
            comment=comment,
            submitted_at=datetime.utcnow().isoformat()
        )
        db.session.add(tf)

    # Timeline event
    ev_type = "CONFIRMED" if type_ == "CONFIRM" else "NOT_FIXED"
    add_event(
        ticket_id=thread_id,
        event_type=ev_type,
        attempt_id=attempt_id,
        rating=rating,
        comment=comment,
        reason=reason
    )

    # System bubble in chat (no emails)
    if type_ == "CONFIRM":
        parts = ["✅ User confirmed the solution"]
        if rating:  parts.append(f"(rating: {rating}/5)")
        if comment: parts.append(f'— "{comment}"')
        sys_text = " ".join(parts) + "."
    else:
        parts = ['🚫 User said "Not fixed"']
        if reason:  parts.append(f"(reason: {reason})")
        if comment: parts.append(f'— "{comment}"')
        sys_text = " ".join(parts) + "."

    insert_message_with_mentions(thread_id, "assistant", f"[SYSTEM] {sys_text}")

    # Optional: re-open on rejection (no email)
    if type_ == "REJECT":
        t = db.session.get(Ticket, thread_id)
        if t:
            t.status = "open"
            t.updated_at = datetime.utcnow().isoformat()

    db.session.commit()
    return jsonify(ok=True), 200



@app.get("/kb/feedback")
@require_role("L1", "L2", "L3", "MANAGER")
def kb_feedback_inbox():
    rows = (KBFeedback.query.order_by(KBFeedback.created_at.desc()).limit(100).all())
    data = []
    for f in rows:
        ctx = f.context_json or {}
        if isinstance(ctx, str):
            try: ctx = json.loads(ctx)
            except: ctx = {}
        data.append({
            "id": f.id,
            "article_title": getattr(f, "kb_article", None).title if hasattr(f, "kb_article") and f.kb_article else None,
            "feedback_type": f.feedback_type.value if isinstance(f.feedback_type, enum.Enum) else f.feedback_type,
            "rating": f.rating,
            "comment": f.comment,
            "user_email": f.user_email,
            "created_at": f.created_at.isoformat() if f.created_at else None,
            "context": ctx,
            "resolved_at": f.resolved_at.isoformat() if f.resolved_at else None,
            "resolved_by": f.resolved_by,
        })
    return jsonify({"feedback": data})



# # GET /kb/analytics for kb dashboard 
# @app.route('/kb/analytics', methods=['GET'])
# @require_role("L1", "L2", "L3", "MANAGER")
# def get_kb_analytics():
#     """
#     Adds:
#       - solutions_awaiting_confirm
#       - draft_kb_articles, published_kb_articles
#       - open_feedback
#       - avg_rating_last_50
#       - total_confirmations
#       - confirm_rate
#       - avg_time_to_confirm_minutes
#       - activity_7d  (per day counts for last 7 days: proposed/confirmed/rejected)

#     Keeps your original num_* keys for compatibility.
#     Optional query: ?days=30   -> used for confirm_rate window (default 30).
#     """
#     days = int(request.args.get('days', 30))
#     since = datetime.utcnow() - timedelta(days=days)
#     last7 = datetime.utcnow().date() - timedelta(days=6)

#     # --- KB articles ---
#     draft_kb = db.session.query(func.count(KBArticle.id)).filter(KBArticle.status == 'draft').scalar() or 0
#     published_kb = db.session.query(func.count(KBArticle.id)).filter(KBArticle.status == 'published').scalar() or 0

#     # --- Feedback ---
#     total_feedback = db.session.query(func.count(KBFeedback.id)).scalar() or 0
#     total_confirms = db.session.query(func.count(KBFeedback.id)).filter(KBFeedback.feedback_type == 'CONFIRM').scalar() or 0
#     total_rejects  = db.session.query(func.count(KBFeedback.id)).filter(KBFeedback.feedback_type.in_(['REJECT','NOT_FIXED'])).scalar() or 0
#     open_feedback  = db.session.query(func.count(KBFeedback.id)).filter(KBFeedback.resolved_at.is_(None)).scalar() or 0

#     # avg rating (last 50 confirms)
#     last50 = (db.session.query(KBFeedback.rating)
#               .filter(KBFeedback.feedback_type == 'CONFIRM', KBFeedback.rating.isnot(None))
#               .order_by(KBFeedback.created_at.desc())
#               .limit(50).all())
#     if last50:
#       avg_rating_last_50 = float(sum(r[0] for r in last50) / len(last50))
#     else:
#       avg_rating_last_50 = 0.0

#     # confirm rate (within window)
#     window_confirms = db.session.query(func.count(KBFeedback.id)).filter(
#         KBFeedback.feedback_type == 'CONFIRM',
#         KBFeedback.created_at >= since
#     ).scalar() or 0
#     window_rejects = db.session.query(func.count(KBFeedback.id)).filter(
#         KBFeedback.feedback_type.in_(['REJECT','NOT_FIXED']),
#         KBFeedback.created_at >= since
#     ).scalar() or 0
#     denom = window_confirms + window_rejects
#     confirm_rate = (window_confirms / denom) if denom else None

#     # solutions awaiting confirm (tweak statuses to your model)
#     awaiting = db.session.query(func.count(Solution.id)).filter(
#         Solution.confirmed_at.is_(None),
#         Solution.status == SolutionStatus.sent_for_confirm
#     ).scalar() or 0

#     # avg time to confirm (pair solution-proposed events with confirm feedback)
#     # We read Ticket events then join in Python to avoid DB JSON gymnastics.
#     proposed_events = TicketEvent.query.filter(
#         TicketEvent.event_type.in_(['SOLUTION_PROPOSED','SOLUTION_SENT'])
#     ).all()
#     proposed_index = {}
#     for ev in proposed_events:
#         det = (ev.details or {}) if hasattr(ev, 'details') else (ev.details_json or {})
#         if isinstance(det, str):
#             try: det = json.loads(det)
#             except: det = {}
#         key = (ev.thread_id, (det or {}).get('attempt_id'))
#         proposed_index[key] = ev.created_at

#     durations_sec = []
#     confirms = KBFeedback.query.filter(KBFeedback.feedback_type == 'CONFIRM').all()
#     for fb in confirms:
#         ctx = fb.context_json or {}
#         if isinstance(ctx, str):
#             try: ctx = json.loads(ctx)
#             except: ctx = {}
#         key = (ctx.get('thread_id'), ctx.get('attempt_id'))
#         sent_at = proposed_index.get(key)
#         if sent_at and fb.created_at:
#             durations_sec.append((fb.created_at - sent_at).total_seconds())

#     avg_time_to_confirm_minutes = round(sum(durations_sec)/len(durations_sec)/60, 1) if durations_sec else None

#     # 7-day activity buckets
#     # Day keys are ISO dates
#     activity = { (last7 + timedelta(days=i)).isoformat(): {"proposed":0,"confirmed":0,"rejected":0}
#                  for i in range(7) }

#     ev7 = TicketEvent.query.filter(TicketEvent.created_at >= datetime.combine(last7, datetime.min.time())).all()
#     for ev in ev7:
#         d = ev.created_at.date().isoformat()
#         et = (ev.event_type or '').upper()
#         if d in activity:
#             if et in ('SOLUTION_PROPOSED','SOLUTION_SENT'):
#                 activity[d]["proposed"] += 1
#             elif et in ('CONFIRMED','USER_CONFIRMED','SOLUTION_CONFIRMED','CONFIRM_OK'):
#                 activity[d]["confirmed"] += 1
#             elif et in ('NOT_FIXED','NOT_CONFIRMED','CONFIRM_NO','USER_DENIED','SOLUTION_DENIED'):
#                 activity[d]["rejected"] += 1

#     # Keep your legacy keys + add new ones the UI expects
#     return jsonify({
#         # legacy
#         'num_solutions': Solution.query.count(),
#         'num_articles': KBArticle.query.count(),
#         'num_feedback': total_feedback,

#         # new dashboard fields
#         'solutions_awaiting_confirm': awaiting,
#         'draft_kb_articles': draft_kb,
#         'published_kb_articles': published_kb,
#         'open_feedback': open_feedback,
#         'avg_rating_last_50': avg_rating_last_50,
#         'total_confirmations': total_confirms,
#         'confirm_rate': confirm_rate,  # e.g. 0.82 (82%)
#         'avg_time_to_confirm_minutes': avg_time_to_confirm_minutes,
#         'activity_7d': activity,
#     })

@app.route('/kb/analytics', methods=['GET'])
@require_role("L1", "L2", "L3", "MANAGER")
def get_kb_analytics():
    """
    Dashboard KPIs with safe handling for your current models:
      - solutions_awaiting_confirm
      - draft_kb_articles, published_kb_articles
      - open_feedback
      - avg_rating_last_50
      - total_confirmations
      - confirm_rate (windowed)
      - avg_time_to_confirm_minutes
      - activity_7d (proposed/confirmed/rejected)
    """
    days = int(request.args.get('days', 30))

    # Use aware UTC now; TicketEvent.created_at is stored as ISO string
    now = datetime.now(timezone.utc)
    since = now - timedelta(days=days)
    last7_start_date = (now.date() - timedelta(days=6))
    start_iso = datetime.combine(last7_start_date, datetime.min.time()).replace(tzinfo=timezone.utc).isoformat()

    # --- KB articles
    draft_kb = db.session.query(func.count(KBArticle.id))\
        .filter(KBArticle.status == KBArticleStatus.draft).scalar() or 0
    published_kb = db.session.query(func.count(KBArticle.id))\
        .filter(KBArticle.status == KBArticleStatus.published).scalar() or 0

    # --- Feedback (support both your KB-style 'helpful/not_helpful' and ticket 'CONFIRM/REJECT')
    total_feedback = db.session.query(func.count(KBFeedback.id)).scalar() or 0
    total_confirms = db.session.query(func.count(KBFeedback.id))\
        .filter(KBFeedback.feedback_type.in_(('CONFIRM', 'helpful'))).scalar() or 0
    open_feedback = db.session.query(func.count(KBFeedback.id))\
        .filter(KBFeedback.resolved_at.is_(None)).scalar() or 0

    # avg rating (last 50 with rating present)
    last50 = (db.session.query(KBFeedback.rating)
              .filter(KBFeedback.rating.isnot(None))
              .order_by(KBFeedback.created_at.desc())
              .limit(50).all())
    avg_rating_last_50 = float(sum(r[0] for r in last50) / len(last50)) if last50 else 0.0

    # confirm rate (window)
    window_confirms = db.session.query(func.count(KBFeedback.id))\
        .filter(KBFeedback.feedback_type.in_(('CONFIRM', 'helpful')),
                KBFeedback.created_at >= since).scalar() or 0
    window_rejects = db.session.query(func.count(KBFeedback.id))\
        .filter(KBFeedback.feedback_type.in_(('REJECT', 'NOT_FIXED', 'not_helpful')),
                KBFeedback.created_at >= since).scalar() or 0
    denom = window_confirms + window_rejects
    confirm_rate = (window_confirms / denom) if denom else None

    # solutions awaiting confirm (your enum is 'sent_for_confirm')
    awaiting = db.session.query(func.count(Solution.id))\
        .filter(Solution.confirmed_at.is_(None),
                Solution.status == SolutionStatus.sent_for_confirm).scalar() or 0

    # avg time to confirm: try ResolutionAttempt.sent_at from context, else Solution.sent_for_confirmation_at
    durations = []
    confirms = (KBFeedback.query
                .filter(KBFeedback.feedback_type.in_(('CONFIRM', 'helpful')))
                .order_by(KBFeedback.created_at.desc())
                .limit(500)
                .all())
    for fb in confirms:
        ctx = fb.context_json or {}
        if isinstance(ctx, str):
            try:
                ctx = json.loads(ctx)
            except Exception:
                ctx = {}
        sent_at = None

        att_id = ctx.get('attempt_id')
        if att_id:
            att = db.session.get(ResolutionAttempt, att_id)
            if att and getattr(att, 'sent_at', None):
                sent_at = att.sent_at if isinstance(att.sent_at, datetime) else datetime.fromisoformat(str(att.sent_at))

        if not sent_at:
            # fall back to latest solution send time for the same ticket
            thread_id = ctx.get('thread_id')
            if thread_id:
                sol = (Solution.query.filter_by(ticket_id=str(thread_id))
                       .order_by(Solution.sent_for_confirmation_at.desc())
                       .first())
                if sol and sol.sent_for_confirmation_at:
                    sent_at = sol.sent_for_confirmation_at

        if sent_at and fb.created_at:
            fb_dt = fb.created_at if isinstance(fb.created_at, datetime) else datetime.fromisoformat(str(fb.created_at))
            sent_dt = sent_at if isinstance(sent_at, datetime) else datetime.fromisoformat(str(sent_at))
            try:
                durations.append((fb_dt - sent_dt).total_seconds())
            except Exception:
                pass

    avg_time_to_confirm_minutes = round(sum(durations)/len(durations)/60, 1) if durations else None

    # activity_7d: TicketEvent.created_at is TEXT ISO; compare as strings
    activity = { (last7_start_date + timedelta(days=i)).isoformat(): {"proposed":0,"confirmed":0,"rejected":0}
                 for i in range(7) }
    ev7 = (TicketEvent.query
           .filter(TicketEvent.created_at >= start_iso)
           .all())
    for e in ev7:
        d = (e.created_at or now.isoformat())[:10]  # YYYY-MM-DD
        et = (e.event_type or '').upper()
        if d in activity:
            if et in ('SOLUTION_PROPOSED', 'SOLUTION_SENT'):
                activity[d]["proposed"] += 1
            elif et in ('CONFIRMED','USER_CONFIRMED','SOLUTION_CONFIRMED','CONFIRM_OK'):
                activity[d]["confirmed"] += 1
            elif et in ('NOT_FIXED','NOT_CONFIRMED','CONFIRM_NO','USER_DENIED','SOLUTION_DENIED'):
                activity[d]["rejected"] += 1

    return jsonify({
        # keep legacy keys
        'num_solutions': db.session.query(func.count(Solution.id)).scalar() or 0,
        'num_articles' : db.session.query(func.count(KBArticle.id)).scalar() or 0,
        'num_feedback' : total_feedback,

        # new KPIs
        'solutions_awaiting_confirm': awaiting,
        'draft_kb_articles': draft_kb,
        'published_kb_articles': published_kb,
        'open_feedback': open_feedback,
        'avg_rating_last_50': avg_rating_last_50,
        'total_confirmations': total_confirms,
        'confirm_rate': confirm_rate,
        'avg_time_to_confirm_minutes': avg_time_to_confirm_minutes,
        'activity_7d': activity,
    })


@app.get("/kb/analytics/agents")
@require_role("L1", "L2", "L3", "MANAGER")
def analytics_agents():
    """
    Returns per-agent solved + active counts.
    Assumes:
      - threads.assigned_to -> Agent.id
      - threads.resolved_by -> Agent.id
      - threads.status in ('Open','Escalated','In Progress','Closed','Resolved',...)
      - Agent model/table exists (rename to Users if needed)
    """
    # solved: closed/resolved AND resolved_by == agent
    solved_rows = (db.session.query(Agent.id, Agent.name, func.count(Ticket.id))
                   .join(Ticket, Ticket.resolved_by == Agent.id)
                   .filter(Ticket.status.in_(['Closed','Resolved']))
                   .group_by(Agent.id, Agent.name)
                   .all())
    solved_map = {aid: cnt for (aid, _name, cnt) in solved_rows}

    # active: open-ish AND assigned_to == agent
    active_rows = (db.session.query(Agent.id, Agent.name, func.count(Ticket.id))
                   .join(Ticket, Ticket.assigned_to == Agent.id)
                   .filter(Ticket.status.in_(['Open','Escalated','In Progress']))
                   .group_by(Agent.id, Agent.name)
                   .all())
    active_map = {aid: cnt for (aid, _name, cnt) in active_rows}

    # union of agent ids from both queries
    names = {aid: name for (aid, name, _cnt) in solved_rows + active_rows}
    result = []
    for aid, name in names.items():
        result.append({
            "agent_id": aid,
            "agent_name": name,
            "solved": int(solved_map.get(aid, 0)),
            "active": int(active_map.get(aid, 0)),
        })

    # sort: solved desc then active desc
    result.sort(key=lambda x: (-x["solved"], -x["active"]))
    return jsonify({"agents": result})


# Confirmation Redirect
@app.route("/confirm", methods=["GET"])
def confirm_redirect():
    # Extract token from query string
    from urllib.parse import parse_qs
    qs = request.query_string.decode()
    params = parse_qs(qs)
    token = params.get('token', [None])[0]
    if token:
        try:
            payload = _serializer(SECRET_KEY).loads(token, max_age=7*24*3600)
            att = db.session.get(ResolutionAttempt, payload.get("attempt_id"))
            t = db.session.get(Ticket, payload.get("ticket_id"))
            if att and t and att.agent_id:
                t.resolved_by = att.agent_id
                db.session.commit()
        except Exception as e:
            pass  # Ignore errors, just redirect
    target = CONFIRM_REDIRECT_URL_SUCCESS + (f"?{qs}" if qs else "")
    return redirect(target, code=302)

@app.post("/solutions/not_fixed_feedback")
def not_fixed_feedback():
    token = (request.args.get("token") or "").strip()
    try:
        payload = _serializer(SECRET_KEY).loads(token, max_age=7*24*3600)
    except (BadSignature, SignatureExpired):
        return jsonify(ok=False, error="invalid_or_expired"), 400

    att = db.session.get(ResolutionAttempt, payload.get("attempt_id"))
    s   = db.session.get(Solution, payload.get("solution_id"))
    t   = db.session.get(Ticket, payload.get("ticket_id"))
    if not (att and s and t):
        return jsonify(ok=False, error="not_found"), 404

    body = request.json or {}
    att.rejected_reason = body.get("reason") or None
    att.rejected_detail_json = json.dumps(body, ensure_ascii=False)
    db.session.commit()

    log_event(t.id, "FEEDBACK", {"kind":"not_fixed_detail", "attempt_id": att.id, "reason": att.rejected_reason})
    return jsonify(ok=True)




if __name__ == "__main__":
    # Only start worker in the reloader's main process
    start_worker = os.environ.get("RUN_EMAIL_WORKER", "1") == "1"
    if start_worker and os.environ.get("WERKZEUG_RUN_MAIN") == "true" or not app.debug:
            threading.Thread(target=email_worker_loop, daemon=True).start()

    with app.app_context():
            # --- Hydrate all tickets from CSV into DB if not present ---
            df = load_df()
            hydrated = 0
            for row in df.to_dict(orient="records"):
                ticket_id = row.get("id")
                if not ticket_id:
                    continue
                t = db.session.get(Ticket, ticket_id)
                if not t:
                    t = Ticket(
                        id=ticket_id,
                        status=row.get("status", "open"),
                        subject=row.get("text", ""),
                        category=row.get("category", ""),
                        priority=row.get("level", ""),
                        impact_level=row.get("impact_level", ""),
                        urgency_level=row.get("urgency_level", ""),
                        requester_email=row.get("email", ""),
                        created_at=row.get("created_at", datetime.utcnow().isoformat()),
                        updated_at=row.get("updated_at", datetime.utcnow().isoformat())
                    )
                    db.session.add(t)
                    hydrated += 1
            if hydrated > 0:
                db.session.commit()
                print(f"[HYDRATE] {hydrated} tickets loaded from CSV into DB.")

            # --- Auto-assign departments to all unassigned tickets ---
            unassigned_count = Ticket.query.filter((Ticket.department_id == None) | (Ticket.department_id == '')).count()
            if unassigned_count > 0:
                print(f"[AUTO-ASSIGN] {unassigned_count} unassigned tickets found. Running auto-assignment...")
                count = 0
                default_dep = Department.query.filter(Department.name.ilike('%general support%')).first()
                if not default_dep:
                    default_dep = Department(name='General Support')
                    db.session.add(default_dep)
                    db.session.commit()
                for t in Ticket.query.filter((Ticket.department_id == None) | (Ticket.department_id == '')).all():
                    desc = t.subject or t.category or ''
                    msg = Message.query.filter_by(ticket_id=t.id).order_by(Message.timestamp.asc()).first()
                    if msg and msg.content:
                        desc = f"{desc}\n{msg.content}" if desc else msg.content
                    dep_name = categorize_department_with_gpt(desc)
                    app.logger.info(f"[AUTO-ASSIGN] Ticket {t.id}: GPT returned department: '{dep_name}' for desc: '{desc}'")
                    dep = None
                    if dep_name:
                        dep_name_norm = dep_name.strip().lower()
                        for d in Department.query.all():
                            if d.name.strip().lower() == dep_name_norm:
                                dep = d
                                break
                    if not dep and 'faiss' in globals():
                        try:
                            emb_resp = client.embeddings.create(model=EMB_MODEL, input=[desc])
                            query_emb = emb_resp.data[0].embedding
                            dept_names = [d.name for d in Department.query.all()]
                            dept_emb_resp = client.embeddings.create(model=EMB_MODEL, input=dept_names)
                            dept_embs = [e.embedding for e in dept_emb_resp.data]
                            sims = [np.dot(query_emb, v) / (np.linalg.norm(query_emb) * np.linalg.norm(v)) for v in dept_embs]
                            best_idx = int(np.argmax(sims))
                            dep = Department.query.filter_by(name=dept_names[best_idx]).first()
                            app.logger.info(f"[AUTO-ASSIGN] Ticket {t.id}: FAISS fallback picked department: '{dept_names[best_idx]}' (score={sims[best_idx]:.3f})")
                        except Exception as e:
                            app.logger.warning(f"[AUTO-ASSIGN] Ticket {t.id}: FAISS fallback failed: {e}")
                    if dep:
                        t.department_id = dep.id
                        count += 1
                    else:
                        t.department_id = default_dep.id
                        count += 1
                        app.logger.warning(f"[AUTO-ASSIGN] Ticket {t.id}: Could not match department, assigned to General Support.")
                db.session.commit()
                still_unassigned = [t.id for t in Ticket.query.filter((Ticket.department_id == None) | (Ticket.department_id == '')).all()]
                if still_unassigned:
                    print(f"[WARN] Tickets still unassigned after fallback: {still_unassigned}")
                print(f"[AUTO-ASSIGN] Auto-assignment complete. {count} tickets updated.")
                worker = threading.Thread(target=email_worker_loop, name="email-worker", daemon=True)
                worker.start()

    app.run(debug=True)
