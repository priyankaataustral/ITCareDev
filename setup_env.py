#!/usr/bin/env python3
"""
Environment Setup Script
Helps you set up DATABASE_URL and other environment variables
"""

import os

def setup_database_url():
    """Interactive setup for DATABASE_URL"""
    print("🔧 Database Connection Setup")
    print("=" * 40)
    
    # Get current DATABASE_URL if exists
    current_url = os.getenv('DATABASE_URL')
    if current_url:
        print(f"Current DATABASE_URL: {current_url}")
        use_current = input("Use current DATABASE_URL? (Y/n): ").strip().lower()
        if use_current != 'n':
            return current_url
    
    print("\nEnter your MySQL connection details:")
    
    # Get connection details
    host = input("Host (default: localhost): ").strip() or "localhost"
    port = input("Port (default: 3306): ").strip() or "3306"
    username = input("Username: ").strip()
    password = input("Password: ").strip()
    database = input("Database name: ").strip()
    
    # Construct DATABASE_URL
    database_url = f"mysql://{username}:{password}@{host}:{port}/{database}"
    
    print(f"\n📝 Generated DATABASE_URL:")
    print(f"mysql://{username}:{'*' * len(password)}@{host}:{port}/{database}")
    
    # Ask to set it
    set_env = input("\nSet this as environment variable for current session? (Y/n): ").strip().lower()
    if set_env != 'n':
        # For PowerShell
        print(f"\n💡 To set in PowerShell:")
        print(f'$env:DATABASE_URL = "{database_url}"')
        
        # For Command Prompt
        print(f"\n💡 To set in Command Prompt:")
        print(f'set DATABASE_URL={database_url}')
        
        # For .env file
        print(f"\n💡 To add to .env file:")
        print(f'DATABASE_URL={database_url}')
        
        create_env = input("\nCreate .env file with this URL? (Y/n): ").strip().lower()
        if create_env != 'n':
            with open('.env', 'w') as f:
                f.write(f"DATABASE_URL={database_url}\n")
            print("✅ Created .env file")
    
    return database_url

def test_connection():
    """Test database connection"""
    try:
        import mysql.connector
        import urllib.parse
        
        database_url = os.getenv('DATABASE_URL')
        if not database_url:
            print("❌ DATABASE_URL not set")
            return False
        
        # Parse URL
        parsed = urllib.parse.urlparse(database_url)
        config = {
            'host': parsed.hostname,
            'port': parsed.port or 3306,
            'user': parsed.username,
            'password': parsed.password,
            'database': parsed.path[1:] if parsed.path else None
        }
        
        print(f"🔌 Testing connection to {config['host']}:{config['port']}...")
        
        connection = mysql.connector.connect(**config)
        cursor = connection.cursor()
        cursor.execute("SELECT 1")
        cursor.fetchone()
        
        print("✅ Database connection successful!")
        
        # Show some basic info
        cursor.execute("SELECT DATABASE()")
        db_name = cursor.fetchone()[0]
        print(f"📂 Connected to database: {db_name}")
        
        cursor.execute("SHOW TABLES")
        tables = cursor.fetchall()
        print(f"📊 Found {len(tables)} tables")
        
        cursor.close()
        connection.close()
        return True
        
    except ImportError:
        print("❌ mysql-connector-python not installed")
        print("Install with: pip install mysql-connector-python")
        return False
    except Exception as e:
        print(f"❌ Connection failed: {e}")
        return False

if __name__ == "__main__":
    print("🔧 AI Support Application - Environment Setup")
    print("=" * 50)
    
    # Setup DATABASE_URL
    database_url = setup_database_url()
    
    # Test connection
    print("\n" + "=" * 50)
    if database_url:
        # Set for current script execution
        os.environ['DATABASE_URL'] = database_url
        test_connection()
    
    print("\n🚀 Ready to run migration!")
    print("Next steps:")
    print("1. Set DATABASE_URL in your shell if not done")
    print("2. Run: python run_enhanced_migration.py")
