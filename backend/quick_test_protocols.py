#!/usr/bin/env python3
"""Quick test of protocol loading with detailed output"""

import os
import sys
import logging

# Add current directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Set up detailed logging
logging.basicConfig(level=logging.DEBUG, format='%(levelname)s: %(message)s')

def test_protocol_loading():
    try:
        from kb_loader import get_kb_loader
        print("🔍 Testing Protocol Loading")
        print("=" * 40)
        
        loader = get_kb_loader()
        print(f"✅ KB Loader initialized")
        print(f"   Protocols dir: {loader.protocols_dir}")
        
        # Check if directory exists
        if not os.path.exists(loader.protocols_dir):
            print(f"❌ Directory not found: {loader.protocols_dir}")
            return
            
        # List files
        files = os.listdir(loader.protocols_dir)
        txt_files = [f for f in files if f.endswith('.txt')]
        print(f"📁 Found {len(txt_files)} files: {txt_files}")
        
        # Test loading
        print("\n🚀 Starting protocol loading...")
        results = loader.load_all_protocols()
        
        print(f"\n📊 Results:")
        print(f"   Loaded: {results['loaded']}")
        print(f"   Skipped: {results['skipped']}")
        print(f"   Errors: {results['errors']}")
        
        if results['loaded'] > 0:
            print("✅ Protocol loading SUCCESS!")
        else:
            print("❌ Protocol loading FAILED!")
            
    except Exception as e:
        print(f"❌ Test failed: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_protocol_loading()
