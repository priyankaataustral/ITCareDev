#!/usr/bin/env python3

import os
import sys

# Add the backend directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from kb_loader import KBProtocolLoader
import logging

# Set up logging
logging.basicConfig(level=logging.DEBUG)
log = logging.getLogger(__name__)

def debug_protocol_loading():
    """Debug protocol loading step by step"""
    
    print("=== Protocol Loading Debug ===")
    
    # Initialize loader
    try:
        loader = KBProtocolLoader()
        print(f"✅ Loader initialized")
        print(f"   Protocols dir: {loader.protocols_dir}")
    except Exception as e:
        print(f"❌ Failed to initialize loader: {e}")
        return
    
    # Check directory exists
    if not os.path.exists(loader.protocols_dir):
        print(f"❌ Protocols directory not found: {loader.protocols_dir}")
        return
    else:
        print(f"✅ Protocols directory exists")
    
    # List files
    try:
        files = os.listdir(loader.protocols_dir)
        protocol_files = [f for f in files if f.endswith('.txt')]
        print(f"✅ Found {len(protocol_files)} protocol files: {protocol_files}")
    except Exception as e:
        print(f"❌ Failed to list files: {e}")
        return
    
    # Test parsing each file
    for filename in protocol_files:
        file_path = os.path.join(loader.protocols_dir, filename)
        print(f"\n--- Testing {filename} ---")
        
        try:
            protocol_data = loader.parse_protocol_file(file_path)
            if protocol_data:
                print(f"✅ Parsed successfully")
                print(f"   Title: {protocol_data.get('title', 'N/A')}")
                print(f"   Category: {protocol_data.get('category', 'N/A')}")
                print(f"   Problem length: {len(protocol_data.get('problem_summary', ''))}")
                print(f"   Solution length: {len(protocol_data.get('solution_content', ''))}")
            else:
                print(f"❌ Parsing failed (returned None)")
        except Exception as e:
            print(f"❌ Parsing error: {e}")
    
    # Test creating one KB article
    if protocol_files:
        print(f"\n--- Testing KB Article Creation ---")
        first_file = os.path.join(loader.protocols_dir, protocol_files[0])
        try:
            protocol_data = loader.parse_protocol_file(first_file)
            if protocol_data:
                print("Testing KB article creation...")
                # Don't actually create, just test the logic
                from models import KBArticleSource
                try:
                    source_value = KBArticleSource.protocol
                    print("✅ KBArticleSource.protocol enum available")
                except (AttributeError, ValueError) as e:
                    print(f"❌ KBArticleSource.protocol enum not available: {e}")
                    print("Will fallback to 'human' source")
        except Exception as e:
            print(f"❌ Error testing KB creation: {e}")

if __name__ == "__main__":
    debug_protocol_loading()
