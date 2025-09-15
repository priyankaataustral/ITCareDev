#!/usr/bin/env python3
"""
Database Backup Script using DATABASE_URL
Creates a backup before performing escalation migration
"""

import os
import sys
import subprocess
from datetime import datetime
from dotenv import load_dotenv
from urllib.parse import urlparse

def parse_database_url(db_url):
    """Parse DATABASE_URL into connection components"""
    parsed = urlparse(db_url)
    
    return {
        'host': parsed.hostname,
        'port': parsed.port or 3306,
        'username': parsed.username,
        'password': parsed.password,
        'database': parsed.path.lstrip('/')
    }

def create_backup():
    """Create database backup using mysqldump"""
    # Load environment variables
    load_dotenv()
    
    db_url = os.getenv('DATABASE_URL')
    if not db_url:
        print("❌ DATABASE_URL not found in environment")
        return False
    
    try:
        # Parse connection details
        db_config = parse_database_url(db_url)
        
        # Create timestamp for backup file
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        backup_file = f"backup_before_escalation_{timestamp}.sql"
        
        print(f"🔌 Creating backup from: {db_config['host']}/{db_config['database']}")
        print(f"📄 Backup file: {backup_file}")
        
        # Build mysqldump command
        cmd = [
            'mysqldump',
            f"--host={db_config['host']}",
            f"--port={db_config['port']}",
            f"--user={db_config['username']}",
            f"--password={db_config['password']}",
            '--single-transaction',  # For InnoDB consistency
            '--routines',            # Include stored procedures
            '--triggers',            # Include triggers
            '--events',              # Include events
            '--add-drop-table',      # Add DROP TABLE statements
            '--create-options',      # Include table creation options
            db_config['database']
        ]
        
        # Execute mysqldump
        print("🚀 Starting backup...")
        with open(backup_file, 'w', encoding='utf-8') as f:
            result = subprocess.run(cmd, stdout=f, stderr=subprocess.PIPE, text=True)
        
        if result.returncode == 0:
            # Check backup file size
            file_size = os.path.getsize(backup_file)
            size_mb = file_size / (1024 * 1024)
            
            print(f"✅ Backup completed successfully!")
            print(f"📊 Backup size: {size_mb:.2f} MB")
            print(f"📁 Backup location: {os.path.abspath(backup_file)}")
            
            # Verify backup contains data
            with open(backup_file, 'r', encoding='utf-8') as f:
                content = f.read(1000)  # Read first 1KB
                if 'CREATE TABLE' in content:
                    print("✅ Backup verification: Contains table structures")
                if 'INSERT INTO' in content:
                    print("✅ Backup verification: Contains data")
                elif file_size > 1024:  # If file is larger than 1KB but no INSERT found in first 1KB
                    print("✅ Backup verification: File size suggests data is present")
            
            return backup_file
        else:
            print(f"❌ Backup failed!")
            print(f"Error: {result.stderr}")
            if os.path.exists(backup_file):
                os.remove(backup_file)
            return False
            
    except Exception as e:
        print(f"❌ Error creating backup: {e}")
        return False

def main():
    print("=" * 60)
    print("🛡️  Database Backup Before Escalation Migration")
    print("=" * 60)
    
    backup_file = create_backup()
    
    if backup_file:
        print(f"\n🎉 Backup created successfully: {backup_file}")
        print("\n📋 Next steps:")
        print("1. Verify backup file exists and has reasonable size")
        print("2. Proceed with escalation migration")
        print("3. Keep this backup until migration is verified successful")
        print(f"\n🔄 To restore from backup if needed:")
        print(f"   mysql -h host -u user -p database_name < {backup_file}")
    else:
        print("\n💥 Backup failed!")
        print("Please resolve the issue before proceeding with migration")
        sys.exit(1)

if __name__ == "__main__":
    main()
