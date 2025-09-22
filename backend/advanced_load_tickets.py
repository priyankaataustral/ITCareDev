#!/usr/bin/env python3
"""
Enhanced Ticket Loader for JIRA/ITSM Integration
This script automatically detects and loads new tickets from CSV files in the data folder.
It checks for duplicates and only adds new records to the database.
Now includes AI automation triggering for new tickets.
"""

import pandas as pd
import sqlite3
import os
import glob
import logging
import sys
from datetime import datetime
from pathlib import Path
from sqlalchemy import create_engine, text
from typing import List, Dict, Set

# Add the backend directory to Python path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('ticket_loader.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

class TicketLoader:
    def __init__(self):
        self.DATABASE_URL = os.environ.get("DATABASE_URL")
        if not self.DATABASE_URL:
            raise ValueError("DATABASE_URL environment variable is required")
        
        self.engine = create_engine(self.DATABASE_URL)
        self.data_folder = "data"
        self.table_name = "tickets"  # Using proper tickets table
        
        # Default values for required fields
        self.default_values = {
            'status': 'open',
            'category': 'General',
            'priority': 'medium',
            'impact_level': 'low',
            'urgency_level': 'low',
            'level': 1,
            'archived': False
        }
        
        # Column mapping from CSV to database
        self.column_mapping = {
            'id': 'id',
            'ticket_id': 'id',
            'text': 'subject',  # Map text to subject if no subject column
            'subject': 'subject',
            'description': 'subject',
            'requester_name': 'requester_name',
            'requester': 'requester_name',
            'owner': 'owner',
            'assignee': 'owner',
            'status': 'status',
            'category': 'category',
            'department': 'department_name',  # We'll handle department mapping
            'department_id': 'department_id',
            'priority': 'priority',
            'impact_level': 'impact_level',
            'urgency_level': 'urgency_level',
            'requester_email': 'requester_email',
            'email': 'requester_email',
            'created_at': 'created_at',
            'created': 'created_at',
            'updated_at': 'updated_at',
            'updated': 'updated_at',
            'level': 'level',
            'resolved_by': 'resolved_by',
            'assigned_to': 'assigned_to'
        }

    def get_csv_files(self) -> List[str]:
        """Get all CSV files in the data folder."""
        csv_pattern = os.path.join(self.data_folder, "*.csv")
        csv_files = glob.glob(csv_pattern)
        logger.info(f"Found {len(csv_files)} CSV files: {csv_files}")
        return csv_files

    def get_existing_ticket_ids(self) -> Set[str]:
        """Get all existing ticket IDs from the database."""
        try:
            with self.engine.connect() as conn:
                result = conn.execute(text(f"SELECT id FROM {self.table_name}"))
                existing_ids = {str(row[0]) for row in result}
                logger.info(f"Found {len(existing_ids)} existing tickets in database")
                return existing_ids
        except Exception as e:
            logger.warning(f"Could not fetch existing IDs: {e}. Assuming empty database.")
            return set()

    def get_department_id(self, department_name: str) -> int:
        """Get or create department ID for a department name."""
        if not department_name:
            return 1  # Default department
            
        try:
            with self.engine.connect() as conn:
                # Try to find existing department
                result = conn.execute(
                    text("SELECT id FROM departments WHERE name = :name"),
                    {"name": department_name}
                )
                row = result.fetchone()
                
                if row:
                    return row[0]
                
                # Create new department if it doesn't exist
                result = conn.execute(
                    text("INSERT INTO departments (name) VALUES (:name)"),
                    {"name": department_name}
                )
                conn.commit()
                
                # Get the new ID
                result = conn.execute(
                    text("SELECT id FROM departments WHERE name = :name"),
                    {"name": department_name}
                )
                row = result.fetchone()
                if row:
                    logger.info(f"Created new department: {department_name} (ID: {row[0]})")
                    return row[0]
                    
        except Exception as e:
            logger.error(f"Error handling department '{department_name}': {e}")
            
        return 1  # Fallback to default department

    def normalize_dataframe(self, df: pd.DataFrame, filename: str) -> pd.DataFrame:
        """Normalize DataFrame columns and add missing required fields."""
        logger.info(f"Normalizing DataFrame from {filename}")
        logger.info(f"Original columns: {list(df.columns)}")
        
        # Create a new DataFrame with mapped columns
        normalized_df = pd.DataFrame()
        
        # Map columns from CSV to database schema
        for csv_col, db_col in self.column_mapping.items():
            if csv_col in df.columns:
                normalized_df[db_col] = df[csv_col]
        
        # Handle department mapping
        if 'department_name' in normalized_df.columns and 'department_id' not in normalized_df.columns:
            normalized_df['department_id'] = normalized_df['department_name'].apply(
                lambda x: self.get_department_id(str(x)) if pd.notna(x) else 1
            )
        
        # Add missing required fields with defaults
        for field, default_value in self.default_values.items():
            if field not in normalized_df.columns:
                normalized_df[field] = default_value
        
        # Ensure required fields are present
        required_fields = ['id', 'subject', 'requester_name']
        for field in required_fields:
            if field not in normalized_df.columns:
                if field == 'id':
                    # Generate IDs if missing
                    normalized_df['id'] = range(
                        len(self.get_existing_ticket_ids()) + 1,
                        len(self.get_existing_ticket_ids()) + len(normalized_df) + 1
                    )
                elif field == 'subject':
                    normalized_df['subject'] = f"Imported from {filename}"
                elif field == 'requester_name':
                    normalized_df['requester_name'] = "Unknown"
        
        # Handle requester_email default
        if 'requester_email' not in normalized_df.columns:
            normalized_df['requester_email'] = normalized_df['requester_name'].apply(
                lambda x: f"{x.lower().replace(' ', '.')}@company.com" if pd.notna(x) else "unknown@company.com"
            )
        
        # Clean up datetime fields
        for date_col in ['created_at', 'updated_at']:
            if date_col in normalized_df.columns:
                normalized_df[date_col] = pd.to_datetime(
                    normalized_df[date_col], errors='coerce'
                ).dt.strftime('%Y-%m-%d %H:%M:%S')
            else:
                normalized_df[date_col] = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        
        # Ensure IDs are strings
        normalized_df['id'] = normalized_df['id'].astype(str)
        
        logger.info(f"Normalized columns: {list(normalized_df.columns)}")
        return normalized_df

    def load_csv_file(self, csv_file: str) -> int:
        """Load a single CSV file and return the number of new records added."""
        logger.info(f"Processing file: {csv_file}")
        
        try:
            # Read CSV with different encodings
            for encoding in ['utf-8', 'latin1', 'cp1252']:
                try:
                    df = pd.read_csv(csv_file, encoding=encoding)
                    logger.info(f"Successfully read {csv_file} with {encoding} encoding")
                    break
                except UnicodeDecodeError:
                    continue
            else:
                raise ValueError(f"Could not read {csv_file} with any supported encoding")
            
            if df.empty:
                logger.warning(f"File {csv_file} is empty")
                return 0
            
            logger.info(f"Read {len(df)} rows from {csv_file}")
            
            # Normalize the DataFrame
            normalized_df = self.normalize_dataframe(df, os.path.basename(csv_file))
            
            # Get existing ticket IDs
            existing_ids = self.get_existing_ticket_ids()
            
            # Filter out existing tickets
            new_tickets = normalized_df[~normalized_df['id'].isin(existing_ids)]
            
            if new_tickets.empty:
                logger.info(f"No new tickets found in {csv_file}")
                return 0
            
            logger.info(f"Found {len(new_tickets)} new tickets to add")
            
            # Insert new tickets
            new_tickets.to_sql(
                name=self.table_name,
                con=self.engine,
                if_exists="append",
                index=False,
                method='multi'
            )
            
            logger.info(f"✅ Successfully added {len(new_tickets)} new tickets from {csv_file}")
            
            # Trigger AI automation for new tickets
            if len(new_tickets) > 0:
                self._trigger_ai_automation(new_tickets)
            
            return len(new_tickets)
            
        except Exception as e:
            logger.error(f"Error processing {csv_file}: {e}")
            return 0

    def _trigger_ai_automation(self, new_tickets_df: pd.DataFrame):
        """Trigger AI automation for newly loaded tickets"""
        logger.info(f"🤖 Triggering AI automation for {len(new_tickets_df)} new tickets")
        
        try:
            # Import Flask app context and models
            from app import create_app
            from models import Ticket
            
            app = create_app()
            
            with app.app_context():
                # Import AI automation service within app context
                from services.ai_automation_service import ai_automation
                
                automation_count = 0
                for _, row in new_tickets_df.iterrows():
                    try:
                        ticket = Ticket.query.get(str(row['id']))
                        if ticket:
                            logger.info(f"Processing ticket {ticket.id} for AI automation")
                            
                            # Trigger auto-triage
                            triage_action = ai_automation.auto_triage_ticket(ticket)
                            if triage_action:
                                logger.info(f"Created auto-triage action for ticket {ticket.id}")
                                automation_count += 1
                            
                            # Trigger auto-solution (with slight delay to avoid rate limits)
                            import time
                            time.sleep(0.5)  # Small delay between API calls
                            
                            solution_action = ai_automation.auto_generate_solution(ticket)
                            if solution_action:
                                logger.info(f"Created auto-solution action for ticket {ticket.id}")
                                automation_count += 1
                                
                    except Exception as ticket_error:
                        logger.error(f"Error processing ticket {row['id']} for AI automation: {ticket_error}")
                        continue
                
                logger.info(f"✅ AI automation triggered successfully! Created {automation_count} AI actions")
                
        except ImportError as e:
            logger.warning(f"AI automation service not available: {e}")
            logger.info("Tickets loaded successfully, but AI automation is disabled")
        except Exception as e:
            logger.error(f"Error triggering AI automation: {e}")
            logger.info("Tickets loaded successfully, but AI automation failed")

    def load_all_tickets(self) -> Dict[str, int]:
        """Load all CSV files and return summary of results."""
        logger.info("Starting ticket loading process...")
        
        csv_files = self.get_csv_files()
        if not csv_files:
            logger.warning("No CSV files found in data folder")
            return {}
        
        results = {}
        total_added = 0
        
        for csv_file in csv_files:
            filename = os.path.basename(csv_file)
            added_count = self.load_csv_file(csv_file)
            results[filename] = added_count
            total_added += added_count
        
        logger.info(f"✅ Ticket loading complete! Total new tickets added: {total_added}")
        return results

    def fix_datetime_fields(self):
        """Fix datetime field formatting in the database."""
        logger.info("Fixing datetime field formatting...")
        
        try:
            with self.engine.connect() as conn:
                # Fix created_at
                conn.execute(text(f"""
                    UPDATE {self.table_name}
                    SET created_at = 
                        substr(created_at, 1, 10) || 'T' || substr(created_at, 12) || '.000000+00:00'
                    WHERE created_at IS NOT NULL 
                      AND instr(created_at, 'T') = 0
                      AND length(created_at) = 19;
                """))
                
                # Fix updated_at
                conn.execute(text(f"""
                    UPDATE {self.table_name}
                    SET updated_at = 
                        substr(updated_at, 1, 10) || 'T' || substr(updated_at, 12) || '.000000+00:00'
                    WHERE updated_at IS NOT NULL 
                      AND instr(updated_at, 'T') = 0
                      AND length(created_at) = 19;
                """))
                
                conn.commit()
                logger.info("✅ Datetime fields fixed")
                
        except Exception as e:
            logger.error(f"Error fixing datetime fields: {e}")


def main():
    """Main function to run the ticket loader."""
    try:
        loader = TicketLoader()
        
        # Load all tickets
        results = loader.load_all_tickets()
        
        # Fix datetime formatting
        loader.fix_datetime_fields()
        
        # Print summary
        print("\n" + "="*70)
        print("🎫 TICKET LOADING & AI AUTOMATION SUMMARY")
        print("="*70)
        
        if results:
            total_tickets = sum(results.values())
            for filename, count in results.items():
                status = "✅ NEW TICKETS ADDED" if count > 0 else "ℹ️  NO NEW TICKETS"
                print(f"📁 {filename}: {count} tickets | {status}")
            
            print("-" * 70)
            print(f"🎯 TOTAL NEW TICKETS: {total_tickets}")
            
            if total_tickets > 0:
                print("🤖 AI AUTOMATION: Triggered for all new tickets")
                print("📊 Check the Admin Panel for pending AI actions")
            else:
                print("🔄 NO AI AUTOMATION: No new tickets to process")
                
        else:
            print("📁 No CSV files found or no new tickets to add")
        
        print("="*70)
        print("🚀 Process completed successfully!")
        print("📖 Check 'ticket_loader.log' for detailed logs")
        
    except Exception as e:
        logger.error(f"Fatal error in main: {e}")
        print(f"❌ Error: {e}")
        raise


if __name__ == "__main__":
    main()