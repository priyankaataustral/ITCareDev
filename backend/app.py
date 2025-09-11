import os, ssl  
import re
import logging
from flask import Flask, request
from flask_cors import CORS
from dotenv import load_dotenv
from openai import OpenAI
from extensions import db, migrate
from cli import register_cli_commands
from config import FRONTEND_ORIGINS, SQLALCHEMY_DATABASE_URI, DATABASE_URL


def _comma_list(s: str) -> set[str]:
    """Split a comma-separated string into a clean set of non-empty items."""
    return {x.strip() for x in (s or "").split(",") if x.strip()}



def create_app():
    """
    Flask application factory.
    """
    # Basic logging
    logging.basicConfig(level=logging.INFO)
    log = logging.getLogger("app")

    # Load .env (does nothing in Azure if env vars already set)
    load_dotenv()

    # ---------------------------------------------------------------------
    # App + Config
    # ---------------------------------------------------------------------
    app = Flask(__name__)

    # DB URI: prefer env DATABASE_URL if present, else config fallback
    db_uri = os.getenv("DATABASE_URL") or SQLALCHEMY_DATABASE_URI
    if not db_uri:
        log.warning("No DATABASE_URL/SQLALCHEMY_DATABASE_URI found. Set one in App Settings.")
    app.config["SQLALCHEMY_DATABASE_URI"] = db_uri
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

    # Disable SSL verification for Azure MySQL (Azure handles SSL termination)
    app.config["SQLALCHEMY_ENGINE_OPTIONS"] = {
        "connect_args": {"ssl_disabled": True}
    }
    log.info("SSL verification disabled for Azure MySQL connection")

    # Init DB & migrations
    db.init_app(app)
    migrate.init_app(app, db)

    # ---------------------------------------------------------------------
    # CORS
    # ---------------------------------------------------------------------
    # Base allowlist from config (comma-separated)
    base_allowed = _comma_list(os.getenv("FRONTEND_ORIGINS_CONFIG", FRONTEND_ORIGINS))
    # Extra allowlist from App Settings env FRONTEND_ORIGINS
    extra_allowed = _comma_list(os.getenv("FRONTEND_ORIGINS", ""))

    # Allow any SWA preview hostname for this app (regex)
    swa_regex = re.compile(r"^https://[a-z0-9-]+\.1\.azurestaticapps\.net$")

    allowed_origins = base_allowed | extra_allowed
    if not allowed_origins:
        log.warning("No explicit CORS origins set. Only SWA regex will match.")

    CORS(
        app,
        resources={r"/*": {"origins": list(allowed_origins) + [swa_regex]}},
        supports_credentials=True,  # keep True if you use cookies/Authorization headers
        methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "Authorization", "X-Requested-With"],
        expose_headers=["Content-Disposition"],
    )

    @app.after_request
    def _vary_origin(resp):
        # Help caches handle per-origin responses correctly
        origin = request.headers.get("Origin")
        if origin and (origin in allowed_origins or swa_regex.match(origin)):
            existing = resp.headers.get("Vary")
            resp.headers["Vary"] = "Origin" if not existing else f"{existing}, Origin"
        return resp

    # ---------------------------------------------------------------------
    # OpenAI client (optional)
    # ---------------------------------------------------------------------
    openai_key = os.getenv("OPENAI_KEY", "")
    if openai_key:
        app.config["OPENAI_CLIENT"] = OpenAI(api_key=openai_key)
    else:
        log.info("OPENAI_KEY is not set; skipping OpenAI client initialization.")

    # ---------------------------------------------------------------------
    # Blueprints & CLI
    # ---------------------------------------------------------------------
    from urls import urls as urls_blueprint
    app.register_blueprint(urls_blueprint)
    register_cli_commands(app)

    # ---------------------------------------------------------------------
    # Health Check Endpoint
    # ---------------------------------------------------------------------
    @app.get("/health")
    def health():
        return {"status": "ok"}, 200

    return app