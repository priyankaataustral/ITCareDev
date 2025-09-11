#!/usr/bin/env python3
"""
Quick test to verify KB system works with existing database
Run this after deployment to test the KB integration
"""

import sys
import os
sys.path.append(os.path.dirname(__file__))

from app import create_app
from models import KBArticle, Department, db
import logging

logging.basicConfig(level=logging.INFO)
log = logging.getLogger(__name__)

def test_existing_kb_tables():
    """Test that we can work with existing KB tables"""
    app = create_app()
    
    with app.app_context():
        log.info("=== Testing Existing KB Tables ===")
        
        try:
            # Test 1: Count existing KB articles
            total_articles = KBArticle.query.count()
            log.info(f"✅ Found {total_articles} existing KB articles")
            
            # Test 2: Check available source types
            sources = db.session.query(KBArticle.source).distinct().all()
            source_values = [s[0] for s in sources if s[0]]
            log.info(f"✅ Available source types: {source_values}")
            
            # Test 3: Try to create a test protocol article
            from kb_loader import KBProtocolLoader
            loader = KBProtocolLoader()
            
            # Create a simple test protocol
            test_protocol = {
                'title': 'Test Protocol Document',
                'department_name': 'General Support',
                'problem_summary': 'Test protocol for KB system verification',
                'solution_content': '1. Test step 1\n2. Test step 2\n3. Test step 3',
                'category': 'Test',
                'file_path': 'test_protocol.txt'
            }
            
            article = loader.create_kb_article(test_protocol)
            if article:
                log.info(f"✅ Successfully created test KB article (ID: {article.id})")
                # Clean up test article
                db.session.delete(article)
                db.session.commit()
                log.info("✅ Cleaned up test article")
            else:
                log.warning("⚠️ Could not create test article")
            
            # Test 4: Check departments
            departments = Department.query.all()
            log.info(f"✅ Found {len(departments)} departments:")
            for dept in departments:
                count = KBArticle.query.filter_by(category_id=dept.id).count()
                log.info(f"  - {dept.name}: {count} articles")
            
            log.info("✅ All KB table tests passed!")
            return True
            
        except Exception as e:
            log.error(f"❌ KB test failed: {e}")
            return False

if __name__ == "__main__":
    success = test_existing_kb_tables()
    if success:
        print("\n🎉 KB System ready for demo!")
        print("\n📋 Next steps:")
        print("1. Optionally add 'protocol' to source enum in MySQL Workbench")
        print("2. Use KB Dashboard → Articles tab → 'Load Protocols' button")
        print("3. Test chat with AI referencing KB articles")
    else:
        print("\n❌ KB System needs attention before demo")
        sys.exit(1)
