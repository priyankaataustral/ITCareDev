#!/usr/bin/env python3
"""
Quick test script to debug mentions functionality
"""

import sys
import os
sys.path.append(os.path.dirname(__file__))

from app import create_app
from models import Agent, Message, db
from utils import extract_mentions
from db_helpers import insert_message_with_mentions
import logging

logging.basicConfig(level=logging.INFO)
log = logging.getLogger(__name__)

def test_mentions_flow():
    """Test the complete mentions flow"""
    app = create_app()
    
    with app.app_context():
        log.info("=== Testing Mentions Flow ===")
        
        try:
            # Test 1: Check if agents exist
            agents = Agent.query.all()
            log.info(f"✅ Found {len(agents)} agents in database:")
            for agent in agents[:10]:  # Show first 10
                log.info(f"  - ID: {agent.id}, Name: '{agent.name}', Email: {agent.email}")
            
            # Test 2: Test mention extraction
            test_messages = [
                "@John help me with this issue",
                "@AgentB can you assist @Priyanka?",
                "Hey @admin, I need support",
                "No mentions in this message"
            ]
            
            for msg in test_messages:
                mentions = extract_mentions(msg)
                log.info(f"Message: '{msg}' → Mentions: {mentions}")
            
            # Test 3: Test database lookup for common names
            test_names = ["John", "AgentB", "Priyanka", "admin", "Agent"]
            for name in test_names:
                agent = Agent.query.filter_by(name=name).first()
                if agent:
                    log.info(f"✅ Found agent '{name}' with ID: {agent.id}")
                else:
                    log.info(f"❌ No agent found with name: '{name}'")
                    
                # Also check case-insensitive
                agent_ci = Agent.query.filter(Agent.name.ilike(name)).first()
                if agent_ci:
                    log.info(f"✅ Found agent (case-insensitive) '{name}' → '{agent_ci.name}' with ID: {agent_ci.id}")
            
            # Test 4: Check recent messages and mentions
            recent_messages = Message.query.order_by(Message.timestamp.desc()).limit(5).all()
            log.info(f"\n📨 Recent messages:")
            for msg in recent_messages:
                mentions = extract_mentions(msg.content)
                log.info(f"  - ID: {msg.id}, Ticket: {msg.ticket_id}, Content: '{msg.content[:50]}...', Mentions: {mentions}")
            
            # Test 5: Check mentions table
            from sqlalchemy import text
            mentions_count = db.session.execute(text("SELECT COUNT(*) FROM mentions")).scalar()
            log.info(f"\n📋 Total mentions in database: {mentions_count}")
            
            if mentions_count > 0:
                recent_mentions = db.session.execute(text("""
                    SELECT m.id, m.message_id, m.mentioned_agent_id, a.name, msg.content
                    FROM mentions m
                    JOIN agents a ON m.mentioned_agent_id = a.id
                    JOIN messages msg ON m.message_id = msg.id
                    ORDER BY m.id DESC
                    LIMIT 5
                """)).fetchall()
                
                log.info("Recent mentions:")
                for mention in recent_mentions:
                    log.info(f"  - Mention ID: {mention[0]}, Agent: {mention[3]}, Message: '{mention[4][:50]}...'")
            
            log.info("\n✅ Mentions test complete!")
            return True
            
        except Exception as e:
            log.error(f"❌ Mentions test failed: {e}")
            import traceback
            traceback.print_exc()
            return False

if __name__ == "__main__":
    success = test_mentions_flow()
    if success:
        print("\n🎉 Mentions system analysis complete!")
        print("\n📋 Next steps:")
        print("1. Check if agent names match exactly (case-sensitive)")
        print("2. Test sending a message with @mention in the chat")
        print("3. Verify mentions appear in the mentions panel")
    else:
        print("\n❌ Mentions system needs debugging")
        sys.exit(1)
