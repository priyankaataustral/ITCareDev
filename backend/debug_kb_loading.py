#!/usr/bin/env python3
"""Debug KB protocol loading step by step"""

import os
import sys
import re
from datetime import datetime

# Add backend to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

def test_file_parsing():
    """Test parsing of protocol files"""
    protocols_dir = os.path.join(os.path.dirname(__file__), 'kb_protocols')
    
    if not os.path.exists(protocols_dir):
        print(f"❌ Directory not found: {protocols_dir}")
        return
    
    files = [f for f in os.listdir(protocols_dir) if f.endswith('.txt')]
    print(f"Found {len(files)} files: {files}")
    
    for filename in files:
        file_path = os.path.join(protocols_dir, filename)
        print(f"\n=== Testing {filename} ===")
        
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read().strip()
            
            print(f"File length: {len(content)} characters")
            print(f"First 200 chars: {repr(content[:200])}")
            
            # Test regex patterns
            title_match = re.search(r'^TITLE:\s*(.+)$', content, re.MULTILINE)
            category_match = re.search(r'^CATEGORY:\s*(.+)$', content, re.MULTILINE)
            department_match = re.search(r'^DEPARTMENT:\s*(.+)$', content, re.MULTILINE)
            problem_match = re.search(r'^PROBLEM:\s*(.+?)(?=^[A-Z][A-Z_ ]*:|$)', content, re.MULTILINE | re.DOTALL)
            solution_match = re.search(r'^SOLUTION STEPS:\s*(.+?)(?=^[A-Z][A-Z_ ]*:|$)', content, re.MULTILINE | re.DOTALL)
            
            print(f"Title: {'✅' if title_match else '❌'} - {title_match.group(1) if title_match else 'NOT FOUND'}")
            print(f"Category: {'✅' if category_match else '❌'} - {category_match.group(1) if category_match else 'NOT FOUND'}")
            print(f"Department: {'✅' if department_match else '❌'} - {department_match.group(1) if department_match else 'NOT FOUND'}")
            print(f"Problem: {'✅' if problem_match else '❌'} - {len(problem_match.group(1)) if problem_match else 0} chars")
            print(f"Solution: {'✅' if solution_match else '❌'} - {len(solution_match.group(1)) if solution_match else 0} chars")
            
            if problem_match:
                print(f"Problem text: {repr(problem_match.group(1)[:100])}")
            if solution_match:
                print(f"Solution text: {repr(solution_match.group(1)[:100])}")
                
        except Exception as e:
            print(f"❌ Error reading {filename}: {e}")

def test_enum_availability():
    """Test if KBArticleSource.protocol enum is available"""
    print(f"\n=== Testing Enum Availability ===")
    try:
        from models import KBArticleSource
        print("✅ KBArticleSource imported successfully")
        
        # Check available enum values
        print("Available enum values:")
        for enum_val in KBArticleSource:
            print(f"  - {enum_val.name}: {enum_val.value}")
        
        # Test protocol enum specifically
        try:
            protocol_source = KBArticleSource.protocol
            print(f"✅ KBArticleSource.protocol available: {protocol_source}")
        except (AttributeError, ValueError) as e:
            print(f"❌ KBArticleSource.protocol not available: {e}")
            print("Will use fallback to 'human' source")
            
    except Exception as e:
        print(f"❌ Error importing models: {e}")

def test_kb_loader():
    """Test KB loader initialization"""
    print(f"\n=== Testing KB Loader ===")
    try:
        from kb_loader import KBProtocolLoader
        loader = KBProtocolLoader()
        print(f"✅ KBProtocolLoader initialized")
        print(f"   Protocols dir: {loader.protocols_dir}")
        print(f"   Dir exists: {os.path.exists(loader.protocols_dir)}")
        
        # Test parsing one file
        protocols_dir = loader.protocols_dir
        files = [f for f in os.listdir(protocols_dir) if f.endswith('.txt')]
        if files:
            test_file = os.path.join(protocols_dir, files[0])
            print(f"   Testing parse on: {files[0]}")
            result = loader.parse_protocol_file(test_file)
            if result:
                print(f"   ✅ Parse successful: {result.get('title', 'No title')}")
            else:
                print(f"   ❌ Parse failed")
        
    except Exception as e:
        print(f"❌ Error testing KB loader: {e}")

if __name__ == "__main__":
    print("=== KB Protocol Loading Debug ===")
    test_file_parsing()
    test_enum_availability()
    test_kb_loader()
