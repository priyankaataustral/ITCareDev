#!/usr/bin/env python3
"""Test email and protocol loading issues"""

import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

def test_email_config():
    """Test if email configuration works"""
    print("=== Testing Email Configuration ===")
    try:
        from config import SMTP_SERVER, SMTP_PORT, SMTP_USER, SMTP_PASS
        print(f"SMTP Server: {SMTP_SERVER}:{SMTP_PORT}")
        print(f"SMTP User: {SMTP_USER}")
        print(f"SMTP Pass: {'*' * len(SMTP_PASS)} (length: {len(SMTP_PASS)})")
        
        # Test basic email import
        from email_helpers import send_via_gmail
        print("✅ Email helpers imported successfully")
        
        # Don't actually send, just test the function exists
        print("✅ send_via_gmail function available")
        
    except Exception as e:
        print(f"❌ Email config error: {e}")
        return False
    return True

def test_protocol_loading():
    """Test protocol loading step by step"""
    print("\n=== Testing Protocol Loading ===")
    try:
        # Test directory
        protocols_dir = os.path.join(os.path.dirname(__file__), 'kb_protocols')
        print(f"Protocols directory: {protocols_dir}")
        print(f"Directory exists: {os.path.exists(protocols_dir)}")
        
        if os.path.exists(protocols_dir):
            files = os.listdir(protocols_dir)
            txt_files = [f for f in files if f.endswith('.txt')]
            print(f"Found {len(txt_files)} protocol files: {txt_files}")
            
            # Test one file parsing
            if txt_files:
                test_file = os.path.join(protocols_dir, txt_files[0])
                print(f"\nTesting file: {txt_files[0]}")
                
                with open(test_file, 'r', encoding='utf-8') as f:
                    content = f.read().strip()
                print(f"File content length: {len(content)}")
                print(f"First 100 chars: {repr(content[:100])}")
                
                # Test the actual parser
                from kb_loader import KBProtocolLoader
                loader = KBProtocolLoader()
                result = loader.parse_protocol_file(test_file)
                
                if result:
                    print(f"✅ Parse successful: {result.get('title', 'No title')}")
                    print(f"   Problem length: {len(result.get('problem_summary', ''))}")
                    print(f"   Solution length: {len(result.get('solution_content', ''))}")
                else:
                    print("❌ Parse returned None")
                    
                # Test KB article creation
                if result:
                    print("\nTesting KB article creation...")
                    article = loader.create_kb_article(result)
                    if article:
                        print(f"✅ KB article created: {article.title}")
                    else:
                        print("❌ KB article creation returned None")
        
    except Exception as e:
        print(f"❌ Protocol loading error: {e}")
        import traceback
        traceback.print_exc()
        return False
    return True

def test_demo_mode():
    """Test if we should disable email in demo mode"""
    print("\n=== Testing Demo Mode ===")
    try:
        from config import DEMO_MODE
        print(f"Demo mode: {DEMO_MODE}")
        if DEMO_MODE:
            print("✅ Demo mode enabled - emails should be mocked")
        else:
            print("⚠️ Production mode - real emails will be sent")
    except Exception as e:
        print(f"❌ Demo mode check failed: {e}")

if __name__ == "__main__":
    print("🔍 Testing Both Issues")
    print("=" * 50)
    
    email_ok = test_email_config()
    protocol_ok = test_protocol_loading()
    test_demo_mode()
    
    print("\n" + "=" * 50)
    print("📊 Test Results:")
    print(f"Email Config: {'✅ OK' if email_ok else '❌ FAILED'}")
    print(f"Protocol Loading: {'✅ OK' if protocol_ok else '❌ FAILED'}")
