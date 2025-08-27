import os
from flask import Flask
from flask_sqlalchemy import SQLAlchemy

app = Flask(__name__)

# -------------------------
# Database configuration
# -------------------------
DATABASE_URL = os.getenv("DATABASE_URL")

if DATABASE_URL:
    # Azure MySQL (Flexible Server) via PyMySQL with TLS
    app.config["SQLALCHEMY_DATABASE_URI"] = DATABASE_URL
    app.config["SQLALCHEMY_ENGINE_OPTIONS"] = {"connect_args": {"ssl": {}}}
else:
    # Fallback: SQLite in /home/data (persistent & writable on Azure App Service)
    data_dir = os.path.join("/home", "data")
    os.makedirs(data_dir, exist_ok=True)
    sqlite_path = os.path.join(data_dir, "tickets.db")
    app.config["SQLALCHEMY_DATABASE_URI"] = f"sqlite:///{sqlite_path}"

app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

db = SQLAlchemy(app)

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
# Optional one-time init
# Run once by setting INIT_DB=1 in App Settings, then remove it
# -------------------------
def init_db():
    with app.app_context():
        # NOTE: models will be added later; this will create tables once they exist
        db.create_all()

if os.getenv("INIT_DB") == "1":
    init_db()
