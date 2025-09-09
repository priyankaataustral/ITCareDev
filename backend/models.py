# backend/models.py
import enum
import numpy as np
from datetime import datetime, timezone
from sqlalchemy.dialects.sqlite import JSON as SQLiteJSON
from sqlalchemy import Enum, Float, UniqueConstraint, ForeignKey, Integer, String, Boolean, DateTime, Text, JSON
from sqlalchemy import Enum as SAEnum
from extensions import db
from sqlalchemy.sql import func

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

class Department(db.Model):
    __tablename__ = 'departments'
    id   = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), unique=True, nullable=False)

class Agent(db.Model):
    __tablename__ = 'agents'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False, unique=True)
    email = db.Column(db.String(100), nullable=False, unique=True)
    password = db.Column(db.String(100), nullable=False)
    role = db.Column(db.String(10), default='L1')  # L1, L2, L3, MANAGER
    department_id = db.Column(db.Integer, db.ForeignKey('departments.id'), nullable=True)

# Solution table
class Solution(db.Model):
    __tablename__ = 'solutions'
    id = db.Column(db.Integer, primary_key=True)
    ticket_id = db.Column(db.String(64))
    proposed_by = db.Column(db.String(64))
    generated_by = db.Column(db.String(5))
    ai_contribution_pct = db.Column(db.Float)
    ai_confidence = db.Column(db.Float)
    text = db.Column(db.Text)
    normalized_text = db.Column(db.Text)
    fingerprint_sha256 = db.Column(db.String(64))
    sent_for_confirmation_at = db.Column(db.DateTime)
    confirmed_by_user = db.Column(db.Boolean)
    confirmed_at = db.Column(db.DateTime)
    confirmed_ip = db.Column(db.String(64))
    confirmed_via = db.Column(db.String(5))
    dedup_score = db.Column(db.Float)
    published_article_id = db.Column(db.Integer, db.ForeignKey('kb_articles.id'))
    status = db.Column(db.String(17))
    created_at = db.Column(db.DateTime)
    updated_at = db.Column(db.DateTime)

class KBArticle(db.Model):
    __tablename__ = 'kb_articles'
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(1000))
    problem_summary = db.Column(db.Text)
    content_md = db.Column(db.Text)
    environment_json = db.Column(JSON)
    category_id = db.Column(db.Integer)
    origin_ticket_id = db.Column(db.String(45))
    origin_solution_id = db.Column(db.Integer, db.ForeignKey('solutions.id'))
    source = db.Column(Enum(KBArticleSource), default=KBArticleSource.ai)
    ai_contribution_pct = db.Column(Float)
    visibility = db.Column(Enum(KBArticleVisibility), default=KBArticleVisibility.internal)
    embedding_model = db.Column(db.String(100))
    embedding_hash = db.Column(db.String(64))
    faiss_id = db.Column(db.Integer)
    canonical_fingerprint = db.Column(db.String(64), unique=True, index=True)
    status = db.Column(Enum(KBArticleStatus), default=KBArticleStatus.draft)
    created_at = db.Column(db.DateTime(timezone=True), server_default=func.now())
    updated_at = db.Column(db.DateTime(timezone=True), onupdate=func.now())
    approved_by = db.Column(db.String(45))  # Agent who promoted the article

class KBArticleVersion(db.Model):
    __tablename__ = 'kb_article_versions'
    id = db.Column(db.Integer, primary_key=True)
    article_id = db.Column(db.Integer, db.ForeignKey('kb_articles.id'))
    version = db.Column(db.Integer)
    content_md = db.Column(db.Text)
    changelog = db.Column(db.Text)
    editor_agent_id = db.Column(db.Integer)
    created_at = db.Column(db.DateTime(timezone=True), server_default=func.now())

class KBFeedback(db.Model):
    __tablename__ = 'kb_feedback'
    id = db.Column(db.Integer, primary_key=True)
    kb_article_id = db.Column(db.Integer, db.ForeignKey('kb_articles.id'))
    user_id = db.Column(db.Integer, nullable=True)
    user_email = db.Column(db.String(255), nullable=True)
    feedback_type = db.Column(Enum(KBFeedbackType))
    rating = db.Column(db.Integer)
    comment = db.Column(db.Text)
    context_json = db.Column(JSON)
    resolved_by = db.Column(db.Integer, nullable=True)
    resolved_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), server_default=func.now())
    __table_args__ = (
        UniqueConstraint('kb_article_id', 'user_id', name='ux_kb_feedback_user'),
    )


class KBIndex(db.Model):
    __tablename__ = 'kb_index'
    id = db.Column(db.Integer, primary_key=True)
    article_id = db.Column(db.Integer, db.ForeignKey('kb_articles.id'))
    faiss_id = db.Column(db.Integer)
    embedding_model = db.Column(db.String(100))
    embedding_hash = db.Column(db.String(64))
    created_at = db.Column(db.DateTime(timezone=True), server_default=func.now())
    is_active = db.Column(db.Boolean, default=True)

class KBAudit(db.Model):
    __tablename__ = 'kb_audit'
    id = db.Column(db.Integer, primary_key=True)
    entity_type = db.Column(db.String(100))
    entity_id = db.Column(db.Integer)
    event = db.Column(db.String(100))
    actor_id = db.Column(db.Integer)
    meta_json = db.Column(JSON)
    created_at = db.Column(db.DateTime(timezone=True), server_default=func.now())

class Ticket(db.Model):
    __tablename__ = 'tickets'
    id = db.Column(db.String(45), primary_key=True)
    status = db.Column(db.String(45), nullable=False, default='open')
    owner = db.Column(db.String(100), nullable=True)  # agent name
    subject = db.Column(db.String(100), nullable=False)
    requester_name = db.Column(db.String(100), nullable=False)
    category = db.Column(db.String(100), nullable=False)
    department_id = db.Column(db.Integer, db.ForeignKey('departments.id'))
    priority = db.Column(db.String(100), nullable=False)
    impact_level = db.Column(db.String(100), nullable=False)
    urgency_level = db.Column(db.String(100), nullable=False)
    requester_email = db.Column(db.String(100), nullable=False)
    created_at = db.Column(db.DateTime(timezone=True), server_default=func.now())
    updated_at = db.Column(db.DateTime(timezone=True), onupdate=func.now())
    level = db.Column(db.Integer, default=1)
    resolved_by = db.Column(db.Integer, db.ForeignKey('agents.id'), nullable=True)
    assigned_to = db.Column(db.Integer, db.ForeignKey('agents.id'), nullable=True)


class Message(db.Model):
    __tablename__ = 'messages'
    id        = db.Column(db.Integer, primary_key=True)
    ticket_id = db.Column(db.String(45),  nullable=False)
    sender    = db.Column(db.String(100),  nullable=False)
    content   = db.Column(db.Text(collation='utf8mb4_unicode_ci'), nullable=False)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)
    type      = db.Column(db.String(100), default='assistant')
    meta      = db.Column(SQLiteJSON, nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), server_default=func.now())
    sender_agent_id = db.Column(db.Integer, db.ForeignKey('agents.id'))

class ResolutionAttempt(db.Model):
    __tablename__ = 'resolution_attempts'
    id = db.Column(db.Integer, primary_key=True)
    ticket_id = db.Column(db.String(45), db.ForeignKey('tickets.id'), index=True, nullable=False)
    solution_id = db.Column(db.Integer, db.ForeignKey('solutions.id'), index=True, nullable=False)
    attempt_no = db.Column(db.Integer, nullable=False)
    sent_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    outcome = db.Column(db.String(16), default='pending', index=True)  # pending|confirmed|rejected
    rejected_reason = db.Column(db.String(64))
    rejected_detail_json = db.Column(db.Text)   # JSON string
    closed_at = db.Column(db.DateTime)
    agent_id = db.Column(db.Integer, db.ForeignKey('agents.id'), nullable=True)  # The agent who sent the solution

class Mention(db.Model):
    __tablename__ = 'mentions'
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    message_id = db.Column(db.Integer, db.ForeignKey('messages.id', ondelete='CASCADE'), nullable=False)
    mentioned_agent_id = db.Column(db.Integer, db.ForeignKey('agents.id', ondelete='CASCADE'), nullable=False)
    __table_args__ = (db.UniqueConstraint('message_id', 'mentioned_agent_id'),)

class StepSequence(db.Model):
    __tablename__ = 'step_sequences'
    ticket_id     = db.Column(db.String(45), primary_key=True)
    steps         = db.Column(SQLiteJSON, nullable=False)
    current_index = db.Column(db.Integer, default=0)

class TicketAssignment(db.Model):
    __tablename__ = 'ticket_assignments'
    id = db.Column(db.Integer, primary_key=True)
    ticket_id = db.Column(db.String(45), db.ForeignKey('tickets.id', ondelete='CASCADE'), nullable=False)
    agent_id  = db.Column(db.Integer, db.ForeignKey('agents.id', ondelete='SET NULL'))
    assigned_at   = db.Column(db.String(100))
    unassigned_at = db.Column(db.String(100))


class TicketEvent(db.Model):
    __tablename__ = 'ticket_events'
    id = db.Column(db.Integer, primary_key=True)
    ticket_id = db.Column(db.String(45), db.ForeignKey('tickets.id', ondelete='CASCADE'), nullable=False)
    event_type = db.Column(db.String(100), nullable=False)
    actor_agent_id = db.Column(db.Integer, db.ForeignKey('agents.id'))
    details = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    __table_args__ = (
        db.Index('ix_ticket_events_ticket_created', 'ticket_id', 'created_at'),
    )


class TicketCC(db.Model):
    __tablename__ = 'ticket_cc'
    id = db.Column(db.Integer, primary_key=True)
    ticket_id = db.Column(db.String(45), db.ForeignKey('tickets.id', ondelete='CASCADE'), nullable=False)
    email = db.Column(db.String(100), nullable=False)
    __table_args__ = (db.UniqueConstraint('ticket_id', 'email', name='ux_ticket_cc'),)


class TicketWatcher(db.Model):
    __tablename__ = 'ticket_watchers'
    id = db.Column(db.Integer, primary_key=True)
    ticket_id = db.Column(db.String(45), db.ForeignKey('tickets.id', ondelete='CASCADE'), nullable=False)
    agent_id = db.Column(db.Integer, db.ForeignKey('agents.id'))
    __table_args__ = (db.UniqueConstraint('ticket_id', 'agent_id', name='ux_ticket_watchers'),)



class EmailQueue(db.Model):
    __tablename__ = 'email_queue'
    id = db.Column(db.Integer, primary_key=True)
    ticket_id = db.Column(db.String(45), db.ForeignKey('tickets.id', ondelete='SET NULL'))
    to_email = db.Column(db.String(100), nullable=False)
    cc = db.Column(db.Text)
    subject = db.Column(db.String(100), nullable=False)
    body = db.Column(db.Text, nullable=False)
    status = db.Column(db.String(100), default='PENDING')
    error = db.Column(db.Text)
    created_at = db.Column(db.DateTime(timezone=True), server_default=func.now())
    sent_at = db.Column(db.DateTime(timezone=True))

class TicketFeedback(db.Model):
    __tablename__ = 'ticket_feedback'
    id = db.Column(db.Integer, primary_key=True)
    ticket_id = db.Column(db.String(45), db.ForeignKey('tickets.id', ondelete='CASCADE'), nullable=False)
    rating = db.Column(db.Integer)
    comment = db.Column(db.Text)
    submitted_at = db.Column(db.String(100))


class KBDraft(db.Model):
    __tablename__ = 'kb_drafts'
    id = db.Column(db.Integer, primary_key=True)
    ticket_id = db.Column(db.String(45), db.ForeignKey('tickets.id', ondelete='CASCADE'), nullable=False)
    title = db.Column(db.String(100))
    body  = db.Column(db.Text)
    status = db.Column(db.String(100), default='DRAFT')
    created_at = db.Column(db.DateTime(timezone=True), server_default=func.now())
    updated_at = db.Column(db.DateTime(timezone=True), onupdate=func.now())

    