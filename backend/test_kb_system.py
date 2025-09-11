#!/usr/bin/env python3
"""
Test script for the Knowledge Base system
Demonstrates loading protocols and searching KB articles
"""

import sys
import os
import logging
from datetime import datetime

# Add backend to path
sys.path.append(os.path.dirname(__file__))

from app import create_app
from kb_loader import KBProtocolLoader
from models import KBArticle, Department, db

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
log = logging.getLogger(__name__)

def test_kb_system():
    """Test the complete KB system"""
    app = create_app()
    
    with app.app_context():
        log.info("=== Testing Knowledge Base System ===")
        
        # 1. Load protocol documents
        log.info("\n1. Loading protocol documents...")
        loader = KBProtocolLoader()
        results = loader.load_all_protocols()
        log.info(f"Protocol loading results: {results}")
        
        # 2. Check loaded articles
        log.info("\n2. Checking loaded KB articles...")
        protocol_articles = KBArticle.query.filter_by(source='protocol').all()
        ai_articles = KBArticle.query.filter(KBArticle.source != 'protocol').all()
        
        log.info(f"Protocol articles: {len(protocol_articles)}")
        for article in protocol_articles:
            log.info(f"  - {article.title} (ID: {article.id})")
        
        log.info(f"AI/Dynamic articles: {len(ai_articles)}")
        for article in ai_articles:
            log.info(f"  - {article.title} (ID: {article.id})")
        
        # 3. Test search functionality
        log.info("\n3. Testing KB search...")
        search_queries = [
            "network connectivity issue",
            "password reset",
            "email configuration",
            "login problem"
        ]
        
        for query in search_queries:
            log.info(f"\nSearching for: '{query}'")
            articles = loader.search_relevant_articles(query, limit=3)
            if articles:
                for i, article in enumerate(articles, 1):
                    log.info(f"  {i}. {article.title} (Source: {article.source.value})")
            else:
                log.info("  No relevant articles found")
        
        # 4. Test department mapping
        log.info("\n4. Department mapping...")
        departments = Department.query.all()
        for dept in departments:
            count = KBArticle.query.filter_by(category_id=dept.id).count()
            log.info(f"  - {dept.name}: {count} articles")
        
        log.info("\n=== KB System Test Complete ===")
        return True

if __name__ == "__main__":
    try:
        test_kb_system()
        log.info("✅ All tests passed!")
    except Exception as e:
        log.error(f"❌ Test failed: {e}")
        sys.exit(1)
