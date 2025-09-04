import os
import threading
import logging
from flask import Flask
from flask_cors import CORS
from dotenv import load_dotenv
from openai import OpenAI
from config import OPENAI_KEY
from config import FRONTEND_URL
from extensions import db, migrate
from cli import register_cli_commands
from config import SQLALCHEMY_DATABASE_URI


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
    
    # --- Application Configuration ---
    app.config['SQLALCHEMY_DATABASE_URI'] = SQLALCHEMY_DATABASE_URI
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    
    # Initialize extensions
    db.init_app(app)
    migrate.init_app(app, db)
    
    # Configure CORS
    # CORS(app, resources={r"/*": {"origins": FRONTEND_URL}})
    CORS(app, origins=[FRONTEND_URL], supports_credentials=True)
    print(f"✅ CORS enabled for {FRONTEND_URL}")

    # Initialize OpenAI client (can be done here or in a separate module)
    app.config['OPENAI_CLIENT'] = OpenAI(api_key=OPENAI_KEY)

    # Register blueprints and CLI commands
    from urls import urls as urls_blueprint
    app.register_blueprint(urls_blueprint)
    register_cli_commands(app)

    # --- Start email worker thread ---
    from urls import email_worker_loop
    start_worker = os.environ.get("RUN_EMAIL_WORKER", "1") == "1"
    if start_worker:
        # We start the worker after the app context is available
        threading.Thread(target=lambda: email_worker_loop(app), daemon=True).start()

    return app
