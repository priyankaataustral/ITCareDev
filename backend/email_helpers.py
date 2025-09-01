import hashlib
import json
import ssl
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.message import EmailMessage
from datetime import datetime, timezone
from flask import app
from itsdangerous import URLSafeTimedSerializer
from extensions import db
from models import Ticket, TicketCC, EmailQueue
from config import SMTP_SERVER, SMTP_PORT, SMTP_USER, SMTP_PASS, FROM_NAME, SECRET_KEY # Import from new config


def enqueue_status_email(ticket_id: str, label: str, extra: str = ""):
    t = db.session.get(Ticket, ticket_id)
    cc_rows = TicketCC.query.filter_by(ticket_id=ticket_id).all()
    cc_list = [r.email for r in cc_rows]
    to_email = t.requester_email if t else None
    if not to_email:
        from db_helpers import _csv_row_for_ticket as _csv_row_for_ticket_func
        row = _csv_row_for_ticket_func(ticket_id)
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
    created_at=datetime.utcnow()
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


def _serializer(secret_key: str, salt: str = "solution-confirm-v1"):
    return URLSafeTimedSerializer(secret_key, salt=salt)

def _utcnow():
    return datetime.now(timezone.utc)

def _normalize(text: str) -> str:
    return " ".join((text or "").split())

def _fingerprint(text: str) -> str:
    return hashlib.sha256(_normalize(text).encode("utf-8")).hexdigest()