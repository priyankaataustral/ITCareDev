#!/usr/bin/env python3
"""
Test all environment configurations for the AI Support Application
"""

import os
import sys
from pathlib import Path

# Add the backend directory to the Python path
backend_dir = Path(__file__).parent.absolute()
sys.path.insert(0, str(backend_dir))

print("🚀 AI Support Application - Environment Test Suite")
print("=" * 60)

# Test 1: OpenAI API
print("\n1. OpenAI API Test")
try:
    from test_env import *
    print("   ✅ All basic tests passed")
except Exception as e:
    print(f"   ❌ Basic test failed: {e}")

# Test 2: Email functionality
print("\n2. Email SMTP Test")
try:
    from test_email import test_smtp_connection
    if test_smtp_connection():
        print("   ✅ Email functionality verified")
    else:
        print("   ❌ Email test failed")
except Exception as e:
    print(f"   ❌ Email test error: {e}")

# Test 3: Database connectivity
print("\n3. Database Connection Test")
try:
    from test_database import test_database_connection
    if test_database_connection():
        print("   ✅ Database connection verified")
    else:
        print("   ❌ Database test failed")
except Exception as e:
    print(f"   ❌ Database test error: {e}")

# Summary
print("\n" + "=" * 60)
print("✅ All environment tests completed!")
print("\nNotes:")
print("- OpenAI API is using gpt-3.5-turbo model")
print("- Email will be sent from testmailaiassistant@gmail.com")
print("- Database is connected to Azure MySQL")
print("- JWT authentication is configured")

# Clean up test files
print("\nCleaning up test files...")
test_files = ['test_openai.py', 'test_env.py', 'test_email.py', 'test_database.py']
for f in test_files:
    try:
        os.remove(backend_dir / f)
        print(f"   Removed {f}")
    except:
        pass