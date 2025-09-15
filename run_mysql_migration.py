#!/usr/bin/env python3
"""
MySQL Migration Script for Escalation Summaries Table
Run this script to create the escalation_summaries table in your MySQL database
"""

import os
import sys
import mysql.connector
from mysql.connector import Error

def get_db_config():
    """
    Get database configuration from environment variables or user input
    You can set these environment variables or modify this function with your DB details
    """
    config = {
        'host': os.getenv('DB_HOST', 'localhost'),
        'port': int(os.getenv('DB_PORT', 3306)),
        'database': os.getenv('DB_NAME', 'aisupport'),  # Change this to your database name
        'user': os.getenv('DB_USER', 'root'),
        'password': os.getenv('DB_PASSWORD', ''),  # Set your password
        'charset': 'utf8mb4',
        'use_unicode': True,
        'autocommit': True
    }
    
    # If password not set in env, prompt for it
    if not config['password']:
        import getpass
        config['password'] = getpass.getpass(f"Enter MySQL password for user '{config['user']}': ")
    
    return config

def run_migration():
    """Execute the migration SQL"""
    
    # Read the migration SQL
    migration_file = 'migration_escalation_summaries_mysql.sql'
    if not os.path.exists(migration_file):
        print(f"❌ Migration file {migration_file} not found!")
        return False
    
    with open(migration_file, 'r', encoding='utf-8') as f:
        migration_sql = f.read()
    
    try:
        # Get database configuration
        config = get_db_config()
        print(f"🔌 Connecting to MySQL at {config['host']}:{config['port']}/{config['database']}...")
        
        # Connect to MySQL
        connection = mysql.connector.connect(**config)
        cursor = connection.cursor()
        
        # Check if table already exists
        cursor.execute("""
            SELECT COUNT(*) 
            FROM information_schema.tables 
            WHERE table_schema = %s AND table_name = 'escalation_summaries'
        """, (config['database'],))
        
        if cursor.fetchone()[0] > 0:
            print("⚠️  Table 'escalation_summaries' already exists!")
            response = input("Do you want to drop and recreate it? (y/N): ").lower()
            if response == 'y':
                print("🗑️  Dropping existing table...")
                cursor.execute("DROP TABLE escalation_summaries")
                print("✅ Table dropped successfully")
            else:
                print("❌ Migration cancelled")
                return False
        
        # Execute migration
        print("🚀 Creating escalation_summaries table...")
        cursor.execute(migration_sql)
        
        # Verify table was created
        cursor.execute("""
            SELECT COUNT(*) 
            FROM information_schema.tables 
            WHERE table_schema = %s AND table_name = 'escalation_summaries'
        """, (config['database'],))
        
        if cursor.fetchone()[0] == 1:
            print("✅ Migration completed successfully!")
            print("📋 escalation_summaries table created with the following structure:")
            
            # Show table structure
            cursor.execute("DESCRIBE escalation_summaries")
            columns = cursor.fetchall()
            for col in columns:
                print(f"   - {col[0]}: {col[1]} {col[2] if col[2] == 'NO' else '(nullable)'}")
            
            return True
        else:
            print("❌ Table creation failed!")
            return False
            
    except Error as e:
        print(f"❌ MySQL Error: {e}")
        return False
    except Exception as e:
        print(f"❌ Error: {e}")
        return False
    finally:
        if 'connection' in locals() and connection.is_connected():
            cursor.close()
            connection.close()
            print("🔌 Database connection closed")

def main():
    print("=" * 60)
    print("🛠️  AI Support Application - Escalation Summaries Migration")
    print("=" * 60)
    
    if run_migration():
        print("\n🎉 Migration completed successfully!")
        print("The escalation feature is now ready to use.")
    else:
        print("\n💥 Migration failed!")
        sys.exit(1)

if __name__ == "__main__":
    main()
