#!/usr/bin/env python3
"""
Safe MySQL Migration Script for Enhanced Feedback System
Handles both escalation_summaries table creation and ticket_feedback enhancements
"""

import os
import sys
import mysql.connector
from mysql.connector import Error
from datetime import datetime
import urllib.parse

def get_db_config():
    """Get database configuration from environment variables"""
    database_url = os.getenv('DATABASE_URL')
    
    if database_url:
        # Parse DATABASE_URL format: mysql://user:password@host:port/database
        parsed = urllib.parse.urlparse(database_url)
        config = {
            'host': parsed.hostname,
            'port': parsed.port or 3306,
            'user': parsed.username,
            'password': parsed.password,
            'database': parsed.path[1:] if parsed.path else None  # Remove leading slash
        }
    else:
        # Fallback to individual environment variables
        config = {
            'host': os.getenv('DB_HOST', 'localhost'),
            'port': int(os.getenv('DB_PORT', 3306)),
            'user': os.getenv('DB_USER', 'root'),
            'password': os.getenv('DB_PASSWORD'),
            'database': os.getenv('DB_NAME', 'tickets')
        }
    
    # Prompt for missing values
    if not config['password']:
        import getpass
        config['password'] = getpass.getpass(f"Enter MySQL password for {config['user']}@{config['host']}: ")
    
    if not config['database']:
        config['database'] = input("Enter database name: ").strip()
    
    return config

def create_backup(connection, database_name):
    """Create a simple backup by dumping table structures and asking user to backup data"""
    print(f"\n🛡️  BACKUP REMINDER")
    print(f"Please ensure you have backed up your '{database_name}' database before proceeding!")
    print(f"You can create a backup using:")
    print(f"mysqldump -u {connection.user} -p {database_name} > backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}.sql")
    
    response = input("\nHave you created a backup? (y/N): ").strip().lower()
    if response != 'y':
        print("❌ Migration cancelled. Please create a backup first.")
        return False
    return True

def check_table_exists(cursor, table_name):
    """Check if a table exists"""
    cursor.execute("""
        SELECT COUNT(*) 
        FROM information_schema.tables 
        WHERE table_schema = DATABASE() 
        AND table_name = %s
    """, (table_name,))
    return cursor.fetchone()[0] > 0

def check_column_exists(cursor, table_name, column_name):
    """Check if a column exists in a table"""
    cursor.execute("""
        SELECT COUNT(*) 
        FROM information_schema.columns 
        WHERE table_schema = DATABASE() 
        AND table_name = %s 
        AND column_name = %s
    """, (table_name, column_name))
    return cursor.fetchone()[0] > 0

def run_migration():
    """Run the enhanced feedback migration"""
    try:
        # Get database configuration
        print("🔧 Getting database configuration...")
        config = get_db_config()
        
        # Connect to MySQL
        print(f"🔌 Connecting to MySQL at {config['host']}:{config['port']}...")
        connection = mysql.connector.connect(**config)
        cursor = connection.cursor()
        
        # Select database
        cursor.execute(f"USE {config['database']}")
        print(f"✅ Connected to database: {config['database']}")
        
        # Create backup reminder
        if not create_backup(connection, config['database']):
            return
        
        print("\n🚀 Starting migration...")
        
        # Read and execute the migration SQL
        with open('create_enhanced_feedback_migration.sql', 'r') as f:
            sql_script = f.read()
        
        # Split SQL into individual statements and execute
        statements = [stmt.strip() for stmt in sql_script.split(';') if stmt.strip()]
        
        for i, statement in enumerate(statements):
            if statement.startswith('--') or not statement:
                continue
                
            try:
                print(f"📝 Executing statement {i+1}/{len(statements)}...")
                cursor.execute(statement)
                
                # If it's a SELECT statement, fetch and display results
                if statement.strip().upper().startswith('SELECT'):
                    results = cursor.fetchall()
                    for result in results:
                        print(f"   {result}")
                elif statement.strip().upper().startswith('DESCRIBE'):
                    results = cursor.fetchall()
                    print("   Table structure:")
                    for row in results:
                        print(f"     {row}")
                        
            except mysql.connector.Error as e:
                if "already exists" in str(e) or "Duplicate" in str(e):
                    print(f"   ⚠️  Already exists (skipping): {e}")
                else:
                    print(f"   ❌ Error: {e}")
                    raise
        
        # Commit changes
        connection.commit()
        print("\n✅ Migration completed successfully!")
        
        # Verify the migration
        print("\n🔍 Verifying migration...")
        
        # Check escalation_summaries table
        if check_table_exists(cursor, 'escalation_summaries'):
            print("✅ escalation_summaries table exists")
        else:
            print("❌ escalation_summaries table missing")
        
        # Check ticket_feedback enhancements
        enhanced_columns = ['attempt_id', 'user_email', 'feedback_type', 'reason', 'resolved_by', 'resolved_at']
        for column in enhanced_columns:
            if check_column_exists(cursor, 'ticket_feedback', column):
                print(f"✅ ticket_feedback.{column} column exists")
            else:
                print(f"❌ ticket_feedback.{column} column missing")
        
        print("\n🎉 Migration verification complete!")
        print("\nYou can now test the enhanced feedback system:")
        print("1. Try the escalation feature in a ticket")
        print("2. Submit feedback via the confirm page")
        print("3. Check the unified feedback in KB Dashboard")
        
    except mysql.connector.Error as e:
        print(f"❌ MySQL Error: {e}")
        if connection:
            connection.rollback()
            print("🔄 Rolled back changes")
        sys.exit(1)
    except FileNotFoundError:
        print("❌ Error: create_enhanced_feedback_migration.sql file not found")
        print("Please ensure the migration SQL file exists in the current directory")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        if connection:
            connection.rollback()
            print("🔄 Rolled back changes")
        sys.exit(1)
    finally:
        if 'connection' in locals() and connection.is_connected():
            cursor.close()
            connection.close()
            print("🔌 Database connection closed")

if __name__ == "__main__":
    print("=" * 60)
    print("🗃️  Enhanced Feedback System Migration")
    print("=" * 60)
    print("This script will:")
    print("1. Create escalation_summaries table")
    print("2. Enhance ticket_feedback table with new columns")
    print("3. Add necessary foreign key constraints")
    print("=" * 60)
    
    run_migration()
