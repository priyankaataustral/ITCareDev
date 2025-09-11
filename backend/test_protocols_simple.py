#!/usr/bin/env python3
"""Simple test for protocol loading"""

import sys
import os
import re

# Add current directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

def test_regex_patterns():
    """Test the regex patterns on actual protocol files"""
    
    protocols_dir = os.path.join(os.path.dirname(__file__), 'kb_protocols')
    
    if not os.path.exists(protocols_dir):
        print(f"❌ Protocols directory not found: {protocols_dir}")
        return
    
    files = [f for f in os.listdir(protocols_dir) if f.endswith('.txt')]
    print(f"Found {len(files)} protocol files: {files}")
    
    for filename in files:
        file_path = os.path.join(protocols_dir, filename)
        print(f"\n=== Testing {filename} ===")
        
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read().strip()
        
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
            print(f"Problem content preview: {problem_match.group(1)[:100]}...")
        if solution_match:
            print(f"Solution content preview: {solution_match.group(1)[:100]}...")

if __name__ == "__main__":
    test_regex_patterns()
