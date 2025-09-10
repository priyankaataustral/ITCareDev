import os, ssl
import threading
import re
import logging
from flask import Flask, request
from flask_cors import CORS
from dotenv import load_dotenv
from openai import OpenAI
from extensions import db, migrate
from cli import register_cli_commands
from config import FRONTEND_URL, SQLALCHEMY_DATABASE_URI, DATABASE_URL


def create_app():
    """
    Creates and configures a Flask application instance.
    This is the application factory.
    """
    app = Flask(__name__)
    
    # Configure logging
    logging.basicConfig(level=logging.INFO)

    # Load environment variables
    load_dotenv()

    # Get environment variables
    OPENAI_KEY = os.environ.get("OPENAI_KEY")
    DATABASE_URL = os.environ.get("DATABASE_URL")

    # --- Application Configuration ---
    app.config['SQLALCHEMY_DATABASE_URI'] = SQLALCHEMY_DATABASE_URI
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

        # ============== NEW: SSL for Azure MySQL ==============
    # Expect a combined root bundle at ./certs/azure-mysql-roots.pem
    # (contains DigiCert Global Root CA, DigiCert Global Root G2, Microsoft RSA Root 2017)
    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    ca_bundle = os.path.join(project_root, "certs", "azure-mysql-roots.pem")

    # Pass SSL parameters via SQLAlchemy -> PyMySQL
    # (This avoids putting long/escaped Windows paths in the URI.)
    app.config["SQLALCHEMY_ENGINE_OPTIONS"] = {
        "connect_args": {
            "ssl": {
                "ca": ca_bundle
            }
        }
    }
    
    # Initialize extensions
    db.init_app(app)
    migrate.init_app(app, db)
    
    DEFAULT_ALLOWED_ORIGINS = {
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://192.168.0.17:3000",
    }

    # Comma-separated list of extra origins from env (portal)
    # e.g.: https://proud-tree-0c99b8f00.1.azurestaticapps.net,https://delightful-tree-0a2bac000.1.azurestaticapps.net
    env_origins = os.getenv("FRONTEND_ORIGINS", "")
    extra = {o.strip() for o in env_origins.split(",") if o.strip()}

    # Optional: allow any Azure SWA environment for this app (preview URLs, etc.)
    swa_regex = re.compile(r"^https://[a-z0-9-]+\.1\.azurestaticapps\.net$")

    allowed_origins = DEFAULT_ALLOWED_ORIGINS | extra

    CORS(
        app,
        resources={
            r"/*": {
                "origins": list(allowed_origins) + [swa_regex]
            }
        },
        supports_credentials=True,  # keep True if you use cookies/Authorization
        methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "Authorization", "X-Requested-With"],
        expose_headers=["Content-Disposition"],
    )

    @app.after_request
    def _vary_origin(resp):
        origin = request.headers.get("Origin")
        if origin and (origin in allowed_origins or swa_regex.match(origin)):
            # help proxies/CDNs cache per-origin
            resp.headers.setdefault("Vary", "Origin")
        return resp

    # Initialize OpenAI client (can be done here or in a separate module)
    app.config['OPENAI_CLIENT'] = OpenAI(api_key=OPENAI_KEY)


    # Register blueprints and CLI commands
    from urls import urls as urls_blueprint
    app.register_blueprint(urls_blueprint)
    register_cli_commands(app)

        # Health check endpoint
    @app.route("/health", methods=["GET"])
    def health():
        return {"status": "ok"}, 200

    # # --- Start email worker thread ---
    # from urls import email_worker_loop
    # start_worker = os.environ.get("RUN_EMAIL_WORKER", "1") == "1"
    # if start_worker:
    #     # We start the worker after the app context is available
    #     threading.Thread(target=lambda: email_worker_loop(app), daemon=True).start()

    return app
