import enum
import io
import json
from datetime import datetime, timedelta, timezone
from time import time, sleep
from flask import Blueprint, redirect, request, jsonify, abort, make_response, send_file, current_app
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from sqlalchemy import func
import re
from extensions import db
from db_helpers import get_next_attempt_no, has_pending_attempt, save_steps, insert_message_with_mentions, get_messages, ensure_ticket_record_from_csv, log_event, add_event, _derive_subject_from_text
from email_helpers import _serializer, _utcnow, send_via_gmail, enqueue_status_email
from openai_helpers import _inject_system_message, _start_step_sequence_basic, categorize_department_with_gpt, is_materially_different, next_action_for, categorize_with_gpt
from utils import extract_mentions, route_department_from_category
from cli import client, load_df
from utils import _can_view, extract_json
from openai_helpers import build_prompt_from_intent
from config import CONFIRM_REDIRECT_URL, CONFIRM_REDIRECT_URL_REJECT, CONFIRM_REDIRECT_URL_SUCCESS, SECRET_KEY, CHAT_MODEL, ASSISTANT_STYLE, EMB_MODEL
from models import EmailQueue, KBArticle, KBArticleSource, KBArticleStatus, KBAudit, KBFeedback, KBFeedbackType, SolutionConfirmedVia, Ticket, Department, Agent, Message, TicketAssignment, TicketCC, TicketEvent, ResolutionAttempt, Solution, SolutionGeneratedBy, SolutionStatus, TicketFeedback
from utils import require_role
from sqlalchemy import text as _sql_text
from config import FRONTEND_URL

urls = Blueprint('urls', __name__)

@urls.route('/login', methods=['POST'])
def login():
	data = request.json or {}
	email = (data.get('email') or '').strip().lower()
	password = (data.get('password') or '').strip()
	if not email or not password:
		return jsonify(error="Email and password required"), 400
	agent = Agent.query.filter_by(email=email).first()
	if not agent or not getattr(agent, 'password', None):
		return jsonify(error="Invalid credentials"), 401
	if agent.password != password:
		return jsonify(error="Invalid credentials"), 401
	payload = {
		"id": agent.id,
		"name": agent.name,
		"email": agent.email,
		"role": getattr(agent, "role", "L1"),
	}
	import jwt
	authToken = jwt.encode(payload, SECRET_KEY, algorithm="HS256")
	resp = make_response(jsonify({"token": authToken, "agent": payload}))
	resp.set_cookie("token", authToken, httponly=True, samesite='Lax', secure=False)
	return resp

# ... (move all other @app.route endpoints here, replacing @app.route with @urls.route and updating any app-specific references as needed)
@urls.route("/threads", methods=["GET"])
@require_role("L1","L2","L3","MANAGER")
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
        # Check if ticket has been escalated (has at least one ESCALATED event)
        escalated = False
        if t:
            escalated = TicketEvent.query.filter_by(ticket_id=t.id, event_type="ESCALATED").count() > 0
        threads_all.append({
            **row,
            "predicted_category": cat,
            "assigned_team": team,
            "status": status,
            "updated_at": updated_at.isoformat() if updated_at else None,
            "department_id": department_id,
            "department": department,
            "level": level,
            "escalated": escalated
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


@urls.route("/threads/<thread_id>/download-summary", methods=["OPTIONS"])
def download_summary_options(thread_id):
    response = current_app.make_response("")
    response.headers['Access-Control-Allow-Origin'] = request.headers.get("Origin", "http://localhost:3000")
    response.headers['Access-Control-Allow-Credentials'] = 'true'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type,Authorization'
    response.headers['Access-Control-Allow-Methods'] = 'GET,POST,PUT,DELETE,PATCH,OPTIONS'
    return response

@urls.route("/threads/<thread_id>/download-summary", methods=["GET"])
def download_ticket_summary(thread_id):
    import logging
    logging.warning(f"[DOWNLOAD] Origin: {request.headers.get('Origin')}")
    logging.warning(f"[DOWNLOAD] Request headers: {dict(request.headers)}")
    t = db.session.get(Ticket, thread_id)
    if not t:
        return jsonify(error="Ticket not found"), 404
    # Find the agent who escalated (from timeline events)
    events = (TicketEvent.query
              .filter_by(ticket_id=thread_id)
              .order_by(TicketEvent.created_at.asc())
              .all())
    escalated_event = next((e for e in events if e.event_type == "ESCALATED"), None)
    agent_name = None
    escalation_time = None
    if escalated_event:
        escalation_time = escalated_event.created_at
        if escalated_event.actor_agent_id:
            agent = db.session.get(Agent, escalated_event.actor_agent_id)
            agent_name = agent.name if agent else None
    # Get all messages after escalation
    messages = Message.query.filter_by(ticket_id=thread_id).order_by(Message.timestamp.asc()).all()
    if escalation_time:
        messages = [m for m in messages if str(m.timestamp) >= str(escalation_time)]
    chat_text = "\n".join(m.content for m in messages)
    # Summarize with OpenAI
    summary = ""
    if chat_text:
        try:
            resp = client.chat.completions.create(
                model=CHAT_MODEL,
                messages=[
                    {"role": "system", "content": "Summarize the following support ticket chat after escalation in 1-2 sentences."},
                    {"role": "user", "content": chat_text}
                ],
                max_tokens=80, temperature=0.5
            )
            summary = resp.choices[0].message.content.strip()
        except Exception as e:
            summary = chat_text[:200] + "..." if chat_text else "No chat after escalation."
    else:
        summary = "No chat messages after escalation."
    summary_text = f"Ticket ID: {t.id}\nStatus: {t.status}\nLevel: {t.level}\nSubject: {t.subject}\n\nSummary: {summary}\n\nEscalated by: {agent_name or 'Unknown'}\n"
    # Create downloadable file
    file_stream = io.BytesIO()
    file_stream.write(summary_text.encode('utf-8'))
    file_stream.seek(0)
    response = send_file(file_stream, as_attachment=True, download_name=f"ticket_{t.id}_summary.txt", mimetype="text/plain")
    allowed_origins = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://192.168.0.17:3000",  
        "https://delightful-tree-0a2bac000.1.azurestaticapps.net",
    ]
    origin = request.headers.get("Origin")
    if origin in allowed_origins:
        response.headers['Access-Control-Allow-Origin'] = origin
    else:
        response.headers['Access-Control-Allow-Origin'] = 'http://localhost:3000'  # fallback or remove for stricter security
    response.headers['Access-Control-Allow-Credentials'] = 'true'
    response.headers['Vary'] = 'Origin'
    return response


@urls.route("/threads/<thread_id>", methods=["GET"])
@require_role("L1","L2","L3","MANAGER")
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
    t.updated_at = datetime.now(timezone.utc)
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




@urls.route("/threads/<thread_id>/chat", methods=["POST"])
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
        t.updated_at = datetime.now(timezone.utc)
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

    current_app.logger.info(f"[CHAT] Incoming message for Ticket {thread_id}: {text}")
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
            current_app.logger.error(f"GPT error: {e!r}")
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
            from db_helpers import create_solution
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
            current_app.logger.error(f"OpenAI step-gen error: {e!r}")
            fallback = f"(fallback) Could not reach OpenAI: {e}"
            insert_message_with_mentions(thread_id, "assistant", fallback)
            return jsonify(ticketId=thread_id, reply=fallback), 200

        try:
            parsed_json = extract_json(raw) if raw else None
            steps = parsed_json["steps"] if parsed_json and "steps" in parsed_json else None
        except Exception as e:
            current_app.logger.error(f"JSON parse error: {e!r} — raw: {raw!r}")
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
                current_app.logger.info(f"[CHAT] Solution generated for Ticket {thread_id}: {solution}")
            except Exception as e:
                current_app.logger.error(f"Concise GPT error: {e!r}")
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
        current_app.logger.error(f"GPT error: {e!r}")
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
@urls.route("/threads/<thread_id>/solution", methods=["POST"])
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



@urls.route("/threads/<thread_id>/escalate", methods=["POST"])
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
    ticket.updated_at = datetime.now(timezone.utc)
    add_event(ticket.id, 'ESCALATED', actor_agent_id=None, from_level=old, to_level=to_level)
    db.session.commit()
    insert_message_with_mentions(thread_id, "assistant", f"🚀 Ticket escalated to L{to_level} support.")
    insert_message_with_mentions(thread_id, "assistant", f"[SYSTEM] Ticket has been escalated to L{to_level} support.")
    enqueue_status_email(thread_id, "escalated", f"We’ve escalated this to L{to_level}.")
    return jsonify(status="escalated", level=to_level, message={"sender":"assistant","content":f"🚀 Ticket escalated to L{to_level} support.","timestamp":datetime.now(timezone.utc).isoformat()}), 200

@urls.route("/threads/<thread_id>/close", methods=["POST"])
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

@urls.route("/threads/<thread_id>/timeline", methods=["GET"])
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



@urls.route("/summarize", methods=["POST"])
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
@urls.route("/mentions/<agent_name>", methods=["GET"])
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

@urls.route("/me", methods=["GET"])
@require_role()
def get_current_agent():
    return jsonify(getattr(request, "agent_ctx", {})), 200
    
# ─── Ticket Claim Endpoint ───────────────────────────────────────────────────
@urls.route("/threads/<thread_id>/claim", methods=["POST"])
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
    ticket.updated_at = datetime.utcnow()
    db.session.commit()

    # 5) log event + system message
    log_event(thread_id, "ASSIGNED", {"agent_id": agent.id, "agent_name": agent_name})
    from db_helpers import save_message
    save_message(
        ticket_id=thread_id,
        sender="system",
        content=f"🔔 Ticket #{thread_id} assigned to {agent_name}",
        type="system",
        meta={"event": "assigned", "agent": agent_name, "timestamp": datetime.utcnow().isoformat()}
    )
    return jsonify(status="assigned", ticket_id=thread_id, owner=agent_name), 200


# Inbox: Get all tickets where an agent was @mentioned
@urls.route('/inbox/mentions/<int:agent_id>', methods=['GET'])
def get_tickets_where_agent_mentioned(agent_id):
    import sqlite3
    # Use SQLAlchemy ORM for cross-database compatibility
    from models import Ticket, Message, TicketEvent
    # Assuming you have a Mentions model, otherwise adjust accordingly
    # If not, you may need to join Message and Ticket by agent mentions in message content
    # Example: Find tickets where agent_id is mentioned in any message
    mentioned_ticket_ids = (
        db.session.query(Message.ticket_id)
        .filter(Message.content.like(f"%@{agent_id}%"))
        .distinct()
        .all()
    )
    ticket_ids = [tid for (tid,) in mentioned_ticket_ids]
    tickets = Ticket.query.filter(Ticket.id.in_(ticket_ids)).all()
    # Load ticket subjects from CSV
    df = load_df()
    subject_map = dict(zip(df['id'], df['text']))
    results = []
    for t in tickets:
        subject = subject_map.get(t.id, "")
        results.append({"ticket_id": t.id, "status": t.status, "subject": subject})
    response = jsonify(results)
    response.headers['Access-Control-Allow-Origin'] = FRONTEND_URL
    response.headers['Access-Control-Allow-Credentials'] = 'true'
    response.headers['Vary'] = 'Origin'
    return response

# For solution confirmation, we will send an email with a signed token that the user can click to confirm their solution.
@urls.route("/solutions/<int:solution_id>/send_confirmation_email", methods=["POST"])
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
        from db_helpers import _csv_row_for_ticket
        row = _csv_row_for_ticket(s.ticket_id)
        to_email = (row.get("email") or "").strip().lower() if row else ""
    if not to_email:
        return jsonify(error="No recipient email for this solution/ticket"), 400

    # BLOCK resends while previous attempt is pending
    from db_helpers import has_pending_attempt
    if has_pending_attempt(s.ticket_id):
        return jsonify(error="A previous solution is still pending user confirmation for this ticket."), 409

    # Create attempt
    from db_helpers import get_next_attempt_no
    attempt_no = get_next_attempt_no(s.ticket_id)
    # Store the agent ID who is sending the solution
    agent_id = agent.get('id') if agent else None
    print(f"[DEBUG] Creating ResolutionAttempt: agent_id={agent_id}, agent_ctx={agent}")
    att = ResolutionAttempt(ticket_id=s.ticket_id, solution_id=s.id, attempt_no=attempt_no, agent_id=agent_id)
    db.session.add(att); db.session.commit()

    # Token includes attempt_id
    ts = URLSafeTimedSerializer(SECRET_KEY, salt="solution-links-v1")
    authToken = ts.dumps({"solution_id": s.id, "ticket_id": s.ticket_id, "attempt_id": att.id})

    confirm_url = f"{FRONTEND_URL}/confirm?token={authToken}&a=confirm"
    reject_url  = f"{FRONTEND_URL}/confirm?token={authToken}&a=not_confirm"

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
@urls.route('/threads/<thread_id>/draft-email', methods=['POST'])
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


# @urls.route('/threads/<thread_id>/send-email', methods=['POST'])
# @require_role("L1","L2","L3","MANAGER")  
# def send_email(thread_id):
#     data = request.json or {}
#     email_body = (data.get('email') or '').strip()
#     solution_id = data.get('solution_id')  # ← FIX 1: accept optional solution id

#     # Parse CC from either a string ("a@x.com, b@y.com") or a list
#     cc_raw = data.get('cc') or []
#     if isinstance(cc_raw, str):
#         parts = re.split(r'[,\s;]+', cc_raw)
#     elif isinstance(cc_raw, list):
#         parts = cc_raw
#     else:
#         parts = []

#     # Light email validation + normalize + dedupe
#     def is_email(s: str) -> bool:
#         return bool(re.match(r'^[^@\s]+@[^@\s]+\.[^@\s]+$', s))

#     cc = sorted({p.strip().lower() for p in parts if p and is_email(p)})

#     if not email_body:
#         return jsonify(error="Missing email body"), 400

#     # Ensure ticket + resolve primary recipient
#     ensure_ticket_record_from_csv(thread_id)
#     t = db.session.get(Ticket, thread_id)
#     recipient_email = (t.requester_email or '').strip().lower() if t else ''
#     if not recipient_email:
#         df = load_df()
#         row = df[df["id"] == thread_id]
#         recipient_email = row.iloc[0].get('email', '').strip().lower() if not row.empty else None
#     if not recipient_email:
#         return jsonify(error="No recipient email found for this ticket"), 400

#     # Persist new CCs so future status emails include them
#     if cc:
#         existing = {r.email.lower() for r in TicketCC.query.filter_by(ticket_id=thread_id).all()}
#         new_addrs = [addr for addr in cc if addr not in existing]
#         if new_addrs:
#             for addr in new_addrs:
#                 db.session.add(TicketCC(ticket_id=thread_id, email=addr))
#             try:
#                 db.session.commit()
#             except Exception:
#                 db.session.rollback()

#     subject = f"Support Ticket #{thread_id} Update"

#     # Resolve solution (optional)
#     # Resolve solution (optional) – create one if missing so we always have s.id
#     s = None
#     if solution_id:
#         try:
#             s = db.session.get(Solution, int(solution_id))
#         except Exception:
#             s = None

#     if s is None:
#         s = (
#             Solution.query.filter_by(ticket_id=thread_id)
#             .order_by(Solution.created_at.desc())
#             .first()
#         )

#     if s is None:
#         # No solution exists yet — create a minimal one so ResolutionAttempt can FK it
#         try:
#             creator_id = None
#             if hasattr(request, "agent_ctx") and isinstance(request.agent_ctx, dict):
#                 creator_id = request.agent_ctx.get("id")
#             s = Solution(
#                 ticket_id=thread_id,          # ensure this type matches your schema (str/int)
#                 text=email_body,              # store the body we’re about to send
#                 created_by=creator_id,        # optional if your model allows NULL
#                 status=SolutionStatus.draft,  # or initial status that fits your workflow
#             )
#             db.session.add(s)
#             db.session.flush()  # get s.id without committing yet
#         except Exception as e:
#             db.session.rollback()
#             return jsonify(error=f"failed to create solution: {e}"), 500


#     if s:
#         # Prevent overlapping attempts
#         from db_helpers import has_pending_attempt
#         if has_pending_attempt(thread_id):
#             return jsonify(error="A previous solution is still pending user confirmation."), 409

#         # If last rejected exists, require material change
#         last_rejected = (Solution.query
#                             .filter_by(ticket_id=thread_id, status=SolutionStatus.rejected)
#                             .order_by(Solution.id.desc()).first())
#         if last_rejected and not is_materially_different(s.text, last_rejected.text):
#             return jsonify(error="New solution is too similar to the last rejected fix. Please revise or escalate."), 422

#     # Create a new attempt for this send
#     from db_helpers import get_next_attempt_no
#     att_no = get_next_attempt_no(thread_id)
#     att = ResolutionAttempt(ticket_id=thread_id, solution_id=s.id, attempt_no=att_no)
#     db.session.add(att); db.session.commit()

#     serializer = _serializer(SECRET_KEY)
#     authToken = serializer.dumps({"solution_id": s.id, "ticket_id": thread_id, "attempt_id": att.id})

#     confirm_url = f"{FRONTEND_URL}/confirm?token={authToken}&a=confirm"
#     reject_url  = f"{FRONTEND_URL}/confirm?token={authToken}&a=not_confirm"
#     email_body += (
#         "\n\n---\n"
#         "Please let us know if this solved your issue:\n"
#         f"Confirm: {confirm_url}\n"
#         f"Not fixed: {reject_url}\n"
#     )
#     if s.status != SolutionStatus.sent_for_confirm:
#         s.status = SolutionStatus.sent_for_confirm
#         s.sent_for_confirmation_at = _utcnow()
#         db.session.commit()

#     try:
#         send_via_gmail(recipient_email, subject, email_body, cc_list=cc)
#         log_event(thread_id, 'EMAIL_SENT', {
#             "subject": subject, "manual": True, "to": recipient_email, "cc": cc
#         })
#         return jsonify(status="sent", recipient=recipient_email, cc=cc)
#     except Exception as e:
#         current_app.logger.exception("Manual send failed")
#         return jsonify(error=f"Failed to send email: {e}"), 500

# ... keep your decorators
@urls.route('/threads/<thread_id>/send-email', methods=['POST'])
@require_role("L1","L2","L3","MANAGER")
def send_email(thread_id):

    data = request.json or {}
    email_body = (data.get('email') or '').strip()
    solution_id = data.get('solution_id')  # optional

    # --- CC parsing/validation ---
    cc_raw = data.get('cc') or []
    if isinstance(cc_raw, str):
        parts = re.split(r'[,\s;]+', cc_raw)
    elif isinstance(cc_raw, list):
        parts = cc_raw
    else:
        parts = []

    def is_email(s: str) -> bool:
        return bool(re.match(r'^[^@\s]+@[^@\s]+\.[^@\s]+$', s))

    cc = sorted({p.strip().lower() for p in parts if p and is_email(p)})

    if not email_body:
        return jsonify(error="Missing email body"), 400

    # --- Ensure ticket + recipient ---
    ensure_ticket_record_from_csv(thread_id)
    t = db.session.get(Ticket, thread_id)
    recipient_email = (t.requester_email or '').strip().lower() if t else ''
    if not recipient_email:
        df = load_df()
        row = df[df["id"] == thread_id]
        recipient_email = row.iloc[0].get('email', '').strip().lower() if not row.empty else None
    if not recipient_email:
        return jsonify(error="No recipient email found for this ticket"), 400

    # --- Persist CC so future mails include them ---
    if cc:
        existing = {r.email.lower() for r in TicketCC.query.filter_by(ticket_id=thread_id).all()}
        for addr in cc:
            if addr not in existing:
                db.session.add(TicketCC(ticket_id=thread_id, email=addr))
        try:
            db.session.commit()
        except Exception:
            db.session.rollback()

    subject = f"Support Ticket #{thread_id} Update"

    # --- Resolve or create a Solution record ---
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

    # If still none, create a minimal Solution that matches your schema
    if s is None:
        try:
            s = Solution(
                ticket_id=thread_id,
                text=email_body,                         # store what we’re sending
                proposed_by=(getattr(request, "agent_ctx", {}) or {}).get("name") or None,  # optional
                generated_by="HUMAN",                    # <=5 chars fits your schema
                status="proposed",                       # optional; will set to sent_for_confirm below
                created_at=_utcnow(),
                updated_at=_utcnow(),
            )
            db.session.add(s)
            db.session.flush()  # get s.id
        except Exception as e:
            db.session.rollback()
            return jsonify(error=f"failed to create solution: {e}"), 500

    # --- Gate checks only if we have a real solution to compare against ---
    if s is not None:
        if has_pending_attempt(thread_id):
            return jsonify(error="A previous solution is still pending user confirmation."), 409

        last_rejected = (Solution.query
                         .filter_by(ticket_id=thread_id, status=SolutionStatus.rejected)
                         .order_by(Solution.id.desc())
                         .first())
        if last_rejected and not is_materially_different(s.text or "", last_rejected.text or ""):
            return jsonify(error="New solution is too similar to the last rejected fix. Please revise or escalate."), 422

    # --- Create an attempt tied to this solution ---
    try:
        att_no = get_next_attempt_no(thread_id)
        att = ResolutionAttempt(ticket_id=thread_id, solution_id=s.id, attempt_no=att_no)
        db.session.add(att)
        db.session.flush()
    except Exception as e:
        db.session.rollback()
        return jsonify(error=f"failed to create attempt: {e}"), 500

    # --- Build signed links & append to body ---
    serializer = _serializer(SECRET_KEY)
    authToken = serializer.dumps({"solution_id": s.id, "ticket_id": thread_id, "attempt_id": att.id})

    confirm_url = f"{FRONTEND_URL}/confirm?token={authToken}&a=confirm"
    reject_url  = f"{FRONTEND_URL}/confirm?token={authToken}&a=not_confirm"

    final_body = (
        f"{email_body}\n\n"
        f"---\n"
        f"Please let us know if this solved your issue:\n"
        f"Confirm: {confirm_url}\n"
        f"Not fixed: {reject_url}\n"
    )

    # Mark solution as sent-for-confirm (use enum.value if SolutionStatus is an Enum)
    try:
        s.status = SolutionStatus.sent_for_confirm
        s.sent_for_confirmation_at = _utcnow()
        s.updated_at = _utcnow()
        db.session.commit()
    except Exception:
        db.session.rollback()
        current_app.logger.exception("Failed to mark solution sent_for_confirm")
        # not fatal for sending—continue

    # --- Send mail ---
    try:
        send_via_gmail(recipient_email, subject, final_body, cc_list=cc)
        log_event(thread_id, 'EMAIL_SENT', {
            "subject": subject, "manual": True, "to": recipient_email, "cc": cc
        })
        return jsonify(status="sent", recipient=recipient_email, cc=cc)
    except Exception as e:
        current_app.logger.exception("Manual send failed")
        return jsonify(error=f"Failed to send email: {e}"), 500



# @urls.after_request
# def after_request(response):
#     allowed_origins = [
#         "http://localhost:3000",
#         "http://127.0.0.1:3000",
#         "http://192.168.0.17:3000",
#         "https://delightful-tree-0a2bac000.1.azurestaticapps.net",
      
#     ]
#     origin = request.headers.get("Origin")
#     if origin in allowed_origins:
#         response.headers['Access-Control-Allow-Origin'] = origin
#     else:
#         response.headers['Access-Control-Allow-Origin'] = 'http://localhost:3000'  # fallback or remove for stricter security
#     response.headers['Access-Control-Allow-Credentials'] = 'true'
#     response.headers['Access-Control-Allow-Headers'] = 'Content-Type,Authorization'
#     response.headers['Access-Control-Allow-Methods'] = 'GET,POST,PUT,DELETE,PATCH,OPTIONS'
#     return response

# # Global OPTIONS handler for all routes
# @urls.route('/<path:path>', methods=['OPTIONS'])
# def options_handler(path):
#     response = make_response('', 200)
#     response.headers['Access-Control-Allow-Origin'] = 'http://localhost:3000'
#     response.headers['Access-Control-Allow-Credentials'] = 'true'
#     response.headers['Access-Control-Allow-Headers'] = 'Content-Type,Authorization'
#     response.headers['Access-Control-Allow-Methods'] = 'GET,POST,PUT,DELETE,PATCH,OPTIONS'
#     return response
def threads_step_options(thread_id):
    return ('', 200)

# POST endpoint to mark current step as completed and move to next step
@urls.route('/threads/<thread_id>/step', methods=['POST'])
@require_role("L1","L2","L3","MANAGER")
def step_next(thread_id):
    """
    Marks the current step as completed and moves to the next step.
    Replies with the next step, or a completion message if done.
    """
    from db_helpers import get_steps
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
@urls.route('/threads/<thread_id>/suggested-prompts', methods=['GET'])
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



# ─── Related Tickets Endpoint ────────────────────────────────────────────────
@urls.route('/threads/<thread_id>/related-tickets', methods=['GET'])
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

def email_worker_loop(app, poll_seconds: int = 5):
    with app.app_context():
        while True:
            claimed = _claim_pending_ids(limit=25)
            if not claimed:
                sleep(poll_seconds)
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
            sleep(1)



@urls.get("/emails/preview")
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


@urls.route("/emails/pending", methods=["GET"])
@require_role("MANAGER")
def emails_pending():
    rows = EmailQueue.query.filter_by(status='PENDING').order_by(EmailQueue.created_at.asc()).all()
    return jsonify([{
        "id": r.id, "ticket_id": r.ticket_id, "to": r.to_email, "subject": r.subject, "created_at": r.created_at
    } for r in rows])

@urls.route("/emails/failed", methods=["GET"])
@require_role("MANAGER")
def emails_failed():
    rows = EmailQueue.query.filter_by(status='FAILED').order_by(EmailQueue.created_at.asc()).all()
    return jsonify([{
        "id": r.id, "ticket_id": r.ticket_id, "to": r.to_email, "subject": r.subject, "error": r.error
    } for r in rows])

@urls.route("/emails/retry/<int:qid>", methods=["POST"])
@require_role("MANAGER")
def emails_retry(qid):
    row = EmailQueue.query.get(qid)
    if not row: return jsonify(error="not found"), 404
    row.status = 'PENDING'
    row.error = None
    db.session.commit()
    return jsonify(ok=True)


@urls.route("/threads/<thread_id>/department", methods=["PATCH"])
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
    t.updated_at = datetime.utcnow()
    db.session.commit()

    actor = getattr(getattr(request, "agent_ctx", {}), "get", lambda _:"")( "email")
    log_event(thread_id, "ROUTE_OVERRIDE", {
        "old_department_id": old,
        "new_department_id": d.id,
        "reason": data.get("reason") or "",
        "by": actor
    })
    return jsonify(ok=True, department_id=d.id, department=d.name, updated_at=t.updated_at), 200


@urls.route("/threads/<thread_id>/route", methods=["POST"])
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
    t.updated_at = datetime.utcnow()
    db.session.commit()
    log_event(thread_id, "ROUTED", {"department_id": dep_id, "mode": "auto"})
    return jsonify(routed=True, department_id=dep_id)

# add near your other routes
@urls.get("/departments")
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
@urls.route('/tickets/auto-assign-departments', methods=['POST'])
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
        current_app.logger.info(f"[AUTO-ASSIGN] Ticket {t.id}: GPT returned department: '{dep_name}' for desc: '{desc}'")
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
                current_app.logger.info(f"[AUTO-ASSIGN] Ticket {t.id}: FAISS fallback picked department: '{dept_names[best_idx]}' (score={sims[best_idx]:.3f})")
            except Exception as e:
                current_app.logger.warning(f"[AUTO-ASSIGN] Ticket {t.id}: FAISS fallback failed: {e}")
        if dep:
            t.department_id = dep.id
            count += 1
        else:
            # Assign to default department if no match
            t.department_id = default_dep.id
            count += 1
            current_app.logger.warning(f"[AUTO-ASSIGN] Ticket {t.id}: Could not match department, assigned to General Support.")
    db.session.commit()
    # Log any tickets still unassigned (should be none)
    still_unassigned = [t.id for t in Ticket.query.filter((Ticket.department_id == None) | (Ticket.department_id == '')).all()]
    if still_unassigned:
        print(f"[WARN] Tickets still unassigned after fallback: {still_unassigned}")
    return jsonify({'updated': count, 'still_unassigned': still_unassigned}), 200

#testing purpose
@urls.route('/tickets/unassigned', methods=['GET'])
@require_role("L2","L3","MANAGER")
def count_unassigned_tickets():
    count = Ticket.query.filter((Ticket.department_id == None) | (Ticket.department_id == '')).count()
    return jsonify({'unassigned_count': count})

@urls.route("/threads/<thread_id>/deescalate", methods=["POST"])
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


@urls.route("/solutions/confirm", methods=["GET", "OPTIONS"])
def confirm_solution_via_link():
    import logging
    authToken  = request.args.get("token", "")
    action = (request.args.get("a") or "confirm").lower()
    wants_json = "application/json" in (request.headers.get("Accept") or "").lower()

    logging.warning(f"[CONFIRM] Incoming token: {authToken}")
    logging.warning(f"[CONFIRM] Action: {action}")

    from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired
    # SECRET_KEY is already imported at the top of this file from config.py

    ts = URLSafeTimedSerializer(SECRET_KEY, salt="solution-links-v1")
    try:
        payload = ts.loads(authToken, max_age=7*24*3600)
        logging.warning(f"[CONFIRM] Token payload: {payload}")
    except SignatureExpired:
        logging.error("[CONFIRM] Token expired")
        return (jsonify(ok=False, reason="expired"), 400) if wants_json else redirect(CONFIRM_REDIRECT_URL)
    except BadSignature:
        logging.error("[CONFIRM] Bad token signature")
        return (jsonify(ok=False, reason="bad_signature"), 400) if wants_json else redirect(CONFIRM_REDIRECT_URL)
    except Exception as e:
        logging.error(f"[CONFIRM] Token parse error: {e}")
        return (jsonify(ok=False, reason=f"token_error:{e}"), 400) if wants_json else redirect(CONFIRM_REDIRECT_URL)

    sid = payload.get("solution_id")
    ticket_id = payload.get("ticket_id")
    attempt_id = payload.get("attempt_id")
    logging.warning(f"[CONFIRM] solution_id={sid}, ticket_id={ticket_id}, attempt_id={attempt_id}")
    s   = db.session.get(Solution, sid)
    t   = db.session.get(Ticket, ticket_id) if ticket_id else None
    att = db.session.get(ResolutionAttempt, attempt_id) if attempt_id else None
    logging.warning(f"[CONFIRM] Solution: {s}")
    logging.warning(f"[CONFIRM] Ticket: {t}")
    logging.warning(f"[CONFIRM] Attempt: {att}")
    if not s and action == "confirm":
        # Create a new Solution record if confirming and none exists
        ticket_id = payload.get("ticket_id")
        attempt_id = payload.get("attempt_id")
        # You may want to add more fields from the payload or context
        s = Solution(
            id=sid,
            ticket_id=ticket_id,
            status=SolutionStatus.confirmed_by_user,
            confirmed_by_user=True,
            confirmed_at=_utcnow(),
            confirmed_via=SolutionConfirmedVia.web,
            confirmed_ip=request.headers.get("X-Forwarded-For", request.remote_addr),
            created_at=_utcnow(),
            updated_at=_utcnow(),
        )
        db.session.add(s)
        db.session.commit()
    elif not s:
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
        from db_helpers import get_next_attempt_no
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
            t.updated_at = datetime.utcnow()
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
@urls.route("/solutions/<solution_id>/promote", methods=["POST"])
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
@urls.route("/kb/<kb_article_id>/feedback", methods=["POST"])
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
@urls.route("/audit", methods=["POST"])
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
@urls.route('/solutions', methods=['GET'])
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
@urls.route('/kb/articles', methods=['GET'])
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

@urls.route("/threads/<thread_id>/feedback", methods=["POST", "OPTIONS"])
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
            t.updated_at = datetime.utcnow()

    db.session.commit()
    return jsonify(ok=True), 200



@urls.get("/kb/feedback")
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


@urls.route('/kb/analytics', methods=['GET'])
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


@urls.get("/kb/analytics/agents")
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


# # Confirmation Redirect
# @urls.route("/confirm", methods=["GET"])
# def confirm_redirect():
#     # Extract token from query string
#     from urllib.parse import parse_qs
#     qs = request.query_string.decode()
#     params = parse_qs(qs)
#     authToken = params.get('token', [None])[0]
#     if authToken:
#         try:
#             payload = _serializer(SECRET_KEY).loads(authToken, max_age=7*24*3600)
#             att = db.session.get(ResolutionAttempt, payload.get("attempt_id"))
#             t = db.session.get(Ticket, payload.get("ticket_id"))
#             if att and t and att.agent_id:
#                 t.resolved_by = att.agent_id
#                 db.session.commit()
#         except Exception as e:
#             pass  # Ignore errors, just redirect
#     target = CONFIRM_REDIRECT_URL_SUCCESS + (f"?{qs}" if qs else "")
#     return redirect(target, code=302)

@urls.post("/solutions/not_fixed_feedback")
def not_fixed_feedback():
    authToken = (request.args.get("token") or "").strip()
    try:
        payload = _serializer(SECRET_KEY).loads(authToken, max_age=7*24*3600)
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



