import logging
import os
import click
import pandas as pd
import numpy as np
from datetime import datetime, timezone
from sqlalchemy import or_
from models import Ticket, Department, Message
from extensions import db
from config import DATA_PATH
from openai_helpers import categorize_department_with_gpt
from openai import OpenAI

# Initialize OpenAI client here for CLI commands
client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

# Utility function to load data
def load_df():
    """
    Loads data from the specified CSV file into a pandas DataFrame.
    """
    return pd.read_csv(DATA_PATH, dtype=str, encoding="latin1")

def register_cli_commands(app):
    """
    Registers custom command-line interface commands with the Flask app.
    """
    @app.cli.command("hydrate")
    @click.option('--force-rehydrate', is_flag=True, help='If specified, drops existing tables and re-hydrates from CSV.')
    def hydrate(force_rehydrate):
        """
        Hydrates tickets and departments from the CSV file into the database.
        """
        with app.app_context():
            if force_rehydrate:
                click.confirm('This will drop all tables and re-hydrate the database. Are you sure?', abort=True)
                db.drop_all()
                db.create_all()
                logging.info("Database tables dropped and recreated.")
            else:
                db.create_all()

            df = load_df()
            hydrated_count = 0
            for row in df.to_dict(orient="records"):
                ticket_id = row.get("id")
                if not ticket_id:
                    continue
                
                t = db.session.get(Ticket, ticket_id)
                if not t:
                    t = Ticket(
                        id=ticket_id,
                        status=row.get("status", "open"),
                        subject=row.get("text", ""),
                        category=row.get("category", ""),
                        priority=row.get("level", ""),
                        impact_level=row.get("impact_level", ""),
                        urgency_level=row.get("urgency_level", ""),
                        requester_email=row.get("email", ""),
                        created_at=row.get("created_at", datetime.now(timezone.utc)),
                        updated_at=row.get("updated_at", datetime.now(timezone.utc))
                    )
                    db.session.add(t)
                    hydrated_count += 1
            
            if hydrated_count > 0:
                db.session.commit()
                logging.info(f"[HYDRATE] {hydrated_count} tickets loaded from CSV into DB.")
            else:
                logging.info("[HYDRATE] All tickets already exist in the database.")
    
    @app.cli.command("auto-assign")
    def auto_assign():
        """
        Automatically assigns departments to all unassigned tickets.
        """
        with app.app_context():
            unassigned_tickets = Ticket.query.filter(or_(Ticket.department_id == None, Ticket.department_id == '')).all()
            if not unassigned_tickets:
                logging.info("[AUTO-ASSIGN] No unassigned tickets found.")
                return

            logging.info(f"[AUTO-ASSIGN] {len(unassigned_tickets)} unassigned tickets found. Running auto-assignment...")
            
            default_dep = Department.query.filter(Department.name.ilike('%general support%')).first()
            if not default_dep:
                default_dep = Department(name='General Support')
                db.session.add(default_dep)
                db.session.commit()
                logging.info("Created 'General Support' department as fallback.")
            
            count = 0
            for t in unassigned_tickets:
                desc = t.subject or t.category or ''
                try:
                    msg = Message.query.filter_by(ticket_id=t.id).order_by(Message.timestamp.asc()).first()
                    if msg and msg.content:
                        desc = f"{desc}\n{msg.content}" if desc else msg.content
                except Exception as e:
                    logging.warning(f"Could not find message for ticket {t.id}: {e}")

                dep_name = categorize_department_with_gpt(desc)
                dep = Department.query.filter(Department.name.ilike(dep_name)).first()
                
                if dep:
                    t.department_id = dep.id
                    count += 1
                    logging.info(f"[AUTO-ASSIGN] Ticket {t.id}: Assigned to '{dep.name}'.")
                else:
                    t.department_id = default_dep.id
                    count += 1
                    logging.warning(f"[AUTO-ASSIGN] Ticket {t.id}: Could not match department, assigned to 'General Support'.")
            
            db.session.commit()
            logging.info(f"[AUTO-ASSIGN] Auto-assignment complete. {count} tickets updated.")
