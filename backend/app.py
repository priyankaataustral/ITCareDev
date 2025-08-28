# backend/app.py
import os
from datetime import datetime
from flask import Flask, request, jsonify
from flask_sqlalchemy import SQLAlchemy

app = Flask(__name__)
from flask_cors import CORS
CORS(app, resources={r"/*": {"origins": "*"}})  


# -------------------------
# Database configuration
# -------------------------
DATABASE_URL = os.getenv("DATABASE_URL")  # set in Azure App Settings

if DATABASE_URL:
    # Azure MySQL (Flexible Server) via PyMySQL with TLS
    app.config["SQLALCHEMY_DATABASE_URI"] = DATABASE_URL
    app.config["SQLALCHEMY_ENGINE_OPTIONS"] = {
    "connect_args": {
        "ssl": {"ca": "/etc/ssl/certs/ca-certificates.crt"} 
    }
    }
else:
    # Fallback: SQLite in /home/data (persistent on Azure App Service)
    data_dir = os.path.join("/home", "data")
    os.makedirs(data_dir, exist_ok=True)
    sqlite_path = os.path.join(data_dir, "tickets.db")
    app.config["SQLALCHEMY_DATABASE_URI"] = f"sqlite:///{sqlite_path}"

app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
db = SQLAlchemy(app)

# -------------------------
# Minimal models
# -------------------------
class Ticket(db.Model):
    __tablename__ = "tickets"
    id = db.Column(db.Integer, primary_key=True)
    subject = db.Column(db.String(255), nullable=False)
    status = db.Column(db.String(32), default="open", index=True)
    requester_email = db.Column(db.String(255))
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

class Message(db.Model):
    __tablename__ = "messages"
    id = db.Column(db.Integer, primary_key=True)
    ticket_id = db.Column(db.Integer, db.ForeignKey("tickets.id"), index=True, nullable=False)
    sender = db.Column(db.String(32), nullable=False)  # 'user' | 'agent' | 'assistant'
    content = db.Column(db.Text, nullable=False)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

# -------------------------
# Health + DB sanity routes
# -------------------------
@app.route("/")
def home():
    return "Hello from Azure App Service!"

@app.route("/health")
def health():
    return "OK", 200

@app.route("/dbcheck")
def dbcheck():
    try:
        from sqlalchemy import text as _text
        val = db.session.execute(_text("SELECT 1")).scalar()
        return f"DB OK: {val}", 200
    except Exception as e:
        return f"DB ERROR: {e}", 500

# -------------------------
# Tiny CRUD for tickets
# -------------------------
@app.route("/tickets", methods=["POST"])
def create_ticket():
    """
    JSON body:
    {
      "subject": "Printer not working",
      "requester_email": "alice@example.com"
    }
    """
    data = request.get_json(force=True, silent=True) or {}
    subject = (data.get("subject") or "").strip()
    if not subject:
        return jsonify(error="subject is required"), 400

    t = Ticket(subject=subject, requester_email=data.get("requester_email"))
    db.session.add(t)
    db.session.commit()
    return jsonify(id=t.id, subject=t.subject, status=t.status, requester_email=t.requester_email), 201

@app.route("/tickets/<int:ticket_id>", methods=["GET"])
def get_ticket(ticket_id: int):
    t = Ticket.query.get(ticket_id)
    if not t:
        return jsonify(error="not found"), 404
    return jsonify(
        id=t.id,
        subject=t.subject,
        status=t.status,
        requester_email=t.requester_email,
        created_at=t.created_at.isoformat() + "Z",
    )

# -------------------------
# One-time init (manual)
# -------------------------
def init_db():
    with app.app_context():
        db.create_all()

if os.getenv("INIT_DB") == "1":
    init_db()

# gunicorn entrypoint expects "app"
# (already correct: backend.app:app)
