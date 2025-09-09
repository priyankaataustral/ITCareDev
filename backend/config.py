import os
from dotenv import load_dotenv

# Load environment variables immediately after imports.
load_dotenv()

# Get environment variables and fallbacks.
DEMO_MODE = os.getenv("DEMO_MODE", "true").lower() == "true"
FRONTEND_URL = os.getenv("FRONTEND_URL")
if not FRONTEND_URL:
    print("Warning: FRONTEND_URL environment variable is not set. Defaulting to localhost.")
    FRONTEND_URL = "http://localhost:3000"


# Fallback to local SQLite for development
DATABASE_URL = os.getenv("DATABASE_URL")
if DATABASE_URL:
    SQLALCHEMY_DATABASE_URI = DATABASE_URL
    print(f"Using production database from environment variable: {DATABASE_URL}")
else:
    db_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'tickets.db')
    SQLALCHEMY_DATABASE_URI = f"sqlite:///{os.path.abspath(db_path)}"
    print("Using local development SQLite database.")

SQLALCHEMY_TRACK_MODIFICATIONS = False

SECRET_KEY = os.getenv("JWT_SECRET", "supersecretkey")

OPENAI_KEY = os.getenv("OPENAI_API_KEY")
if not OPENAI_KEY:
    raise RuntimeError("Missing OPENAI_API_KEY in .env")

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

# ─── OpenAI & FAISS setup ──────────────────────────────────────────────────────
CHAT_MODEL = "gpt-3.5-turbo"
EMB_MODEL  = "text-embedding-ada-002"

# ─── CSV loader ────────────────────────────────────────────────────────────────
DATA_PATH = os.path.join(os.path.dirname(__file__), "data", "cleaned_tickets.csv")

# ─── Assistant Style (Global Constant) ───────────────────────────────────────
ASSISTANT_STYLE = (
    "You are an IT support co-pilot. Be concise, friendly, and actionable.\n"
    "Always do the following:\n"
    "- If info is missing, ask up to 2 specific clarifying questions.\n"
    "- Prefer concrete steps with commands and where to click.\n"
    "- Use plain language. Avoid boilerplate like 'As an AI model...'\n"
    "- End with a short next step ('Try this and tell me what you see').\n"
)


