# backend/models.py
import enum
import numpy as np
from datetime import datetime, timezone
from sqlalchemy.dialects.mysql import JSON as MySQLJSON
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
    protocol = "protocol"  # Static company protocol documents

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
    password = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(10), default='L1')  # L1, L2, L3, MANAGER
    department_id = db.Column(db.Integer, db.ForeignKey('departments.id'), nullable=True)

class EscalationSummary(db.Model):
    __tablename__ = 'escalation_summaries'
    id = db.Column(db.Integer, primary_key=True)
    ticket_id = db.Column(db.String(45), db.ForeignKey('tickets.id'), nullable=False)
    escalated_to_department_id = db.Column(db.Integer, db.ForeignKey('departments.id'), nullable=True)
    escalated_to_agent_id = db.Column(db.Integer, db.ForeignKey('agents.id'), nullable=True)
    escalated_by_agent_id = db.Column(db.Integer, db.ForeignKey('agents.id'), nullable=True)
    reason = db.Column(db.Text, nullable=False)
    summary_note = db.Column(db.Text, nullable=True)
    from_level = db.Column(db.Integer, nullable=False)
    to_level = db.Column(db.Integer, nullable=False)
    created_at = db.Column(db.DateTime(timezone=True), server_default=func.now())
    read_by_agent_id = db.Column(db.Integer, db.ForeignKey('agents.id'), nullable=True)
    read_at = db.Column(db.DateTime(timezone=True), nullable=True)

# Solution table
class Solution(db.Model):
    __tablename__ = 'solutions'
    id = db.Column(db.Integer, primary_key=True)
    ticket_id = db.Column(db.String(64))
    proposed_by = db.Column(db.String(64))
    generated_by = db.Column(db.String(5))
    text = db.Column(db.Text)
    sent_for_confirmation_at = db.Column(db.DateTime)
    status = db.Column(db.String(17))
    created_at = db.Column(db.DateTime)
    updated_at = db.Column(db.DateTime)
    # Removed unused AI fields: ai_contribution_pct, ai_confidence, normalized_text,
    # fingerprint_sha256, confirmed_by_user, confirmed_at, confirmed_ip, 
    # confirmed_via, dedup_score, published_article_id

class KBArticle(db.Model):
    __tablename__ = 'kb_articles'
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(1000))
    problem_summary = db.Column(db.Text)
    content_md = db.Column(db.Text)
    category_id = db.Column(db.Integer)
    source = db.Column(Enum(KBArticleSource), default=KBArticleSource.ai)
    visibility = db.Column(Enum(KBArticleVisibility), default=KBArticleVisibility.internal)
    canonical_fingerprint = db.Column(db.String(64), unique=True, index=True)
    # Removed unused fields: environment_json, origin_ticket_id, origin_solution_id,
    # ai_contribution_pct, embedding_model, embedding_hash, faiss_id
    status = db.Column(Enum(KBArticleStatus), default=KBArticleStatus.draft)
    created_at = db.Column(db.DateTime(timezone=True), server_default=func.now())
    updated_at = db.Column(db.DateTime(timezone=True), onupdate=func.now())
    approved_by = db.Column(db.String(45))  # Agent who promoted the article

# KBArticleVersion model removed - unused versioning feature

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


# KB Index and Audit models removed - unused features
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
    archived = db.Column(db.Boolean, nullable=False, default=False)


class Message(db.Model):
    __tablename__ = 'messages'
    id        = db.Column(db.Integer, primary_key=True)
    ticket_id = db.Column(db.String(45),  nullable=False)
    sender    = db.Column(db.String(100),  nullable=False)
    content   = db.Column(db.Text, nullable=False)
    timestamp = db.Column(db.DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    type      = db.Column(db.String(100), default='assistant')
    meta      = db.Column(JSON, nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), server_default=func.now())
    sender_agent_id = db.Column(db.Integer, db.ForeignKey('agents.id'))

class ResolutionAttempt(db.Model):
    __tablename__ = 'resolution_attempts'
    id = db.Column(db.Integer, primary_key=True)
    ticket_id = db.Column(db.String(45), db.ForeignKey('tickets.id'), index=True, nullable=False)
    solution_id = db.Column(db.Integer, db.ForeignKey('solutions.id'), index=True, nullable=False)
    attempt_no = db.Column(db.Integer, nullable=False)
    sent_at = db.Column(db.DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    outcome = db.Column(db.String(16), default='pending', index=True)  # pending|confirmed|rejected
    rejected_reason = db.Column(db.String(64))
    rejected_detail_json = db.Column(db.Text)   # JSON string
    closed_at = db.Column(db.DateTime(timezone=True))
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
    steps         = db.Column(JSON, nullable=False)
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



# TicketWatcher model removed - unused feature

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
    attempt_id = db.Column(db.Integer, db.ForeignKey('resolution_attempts.id'), nullable=True)
    user_email = db.Column(db.String(255), nullable=True)
    feedback_type = db.Column(db.String(20), nullable=True)  # 'CONFIRM'/'REJECT'
    reason = db.Column(db.String(255), nullable=True)  # rejection reason
    rating = db.Column(db.Integer)
    comment = db.Column(db.Text)
    submitted_at = db.Column(db.DateTime(timezone=True), server_default=func.now())
    resolved_by = db.Column(db.Integer, db.ForeignKey('agents.id'), nullable=True)
    resolved_at = db.Column(db.DateTime(timezone=True), nullable=True)


# KBDraft model removed - unused drafting feature
    