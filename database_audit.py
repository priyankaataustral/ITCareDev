#!/usr/bin/env python3
"""
Database Audit Script
Quick check of database table usage and missing data
"""

import os
import sys

def check_database_url():
    """Check if DATABASE_URL is available"""
    database_url = os.getenv('DATABASE_URL')
    if not database_url:
        print("❌ DATABASE_URL environment variable not set")
        print("💡 Set it with: $env:DATABASE_URL = \"mysql://user:pass@host:port/database\"")
        return False
    
    # Mask password for display
    masked_url = database_url
    if ':' in database_url and '@' in database_url:
        parts = database_url.split('@')
        if ':' in parts[0]:
            user_pass = parts[0].split('://')[-1]
            if ':' in user_pass:
                user, password = user_pass.split(':', 1)
                masked_url = database_url.replace(password, '*' * len(password))
    
    print(f"✅ DATABASE_URL: {masked_url}")
    return True

def audit_database():
    """Perform database audit"""
    try:
        from sqlalchemy import create_engine, text
        import urllib.parse
        
        database_url = os.getenv('DATABASE_URL')
        engine = create_engine(database_url)
        
        print("\n📊 DATABASE TABLE AUDIT")
        print("=" * 60)
        
        with engine.connect() as conn:
            # Core tables check
            core_tables = [
                'tickets', 'agents', 'departments', 'messages', 
                'ticket_events', 'resolution_attempts', 'solutions'
            ]
            
            print("🟢 CORE TABLES:")
            for table in core_tables:
                try:
                    result = conn.execute(text(f"SELECT COUNT(*) FROM {table}"))
                    count = result.fetchone()[0]
                    print(f"  {table:20} {count:>8} rows")
                except Exception as e:
                    print(f"  {table:20} ❌ ERROR: {e}")
            
            # Feature tables check
            feature_tables = [
                'ticket_feedback', 'escalation_summaries', 'email_queue',
                'ticket_assignments', 'ticket_watchers'
            ]
            
            print("\n🟡 FEATURE TABLES:")
            for table in feature_tables:
                try:
                    result = conn.execute(text(f"SELECT COUNT(*) FROM {table}"))
                    count = result.fetchone()[0]
                    status = "🟢 ACTIVE" if count > 0 else "🔴 EMPTY"
                    print(f"  {status} {table:20} {count:>8} rows")
                except Exception as e:
                    print(f"  ❌ {table:20} TABLE MISSING")
            
            # KB tables check
            kb_tables = [
                'kb_articles', 'kb_feedback', 'kb_audit', 'kb_index', 
                'kb_drafts', 'kb_article_versions'
            ]
            
            print("\n🔵 KB SYSTEM TABLES:")
            for table in kb_tables:
                try:
                    result = conn.execute(text(f"SELECT COUNT(*) FROM {table}"))
                    count = result.fetchone()[0]
                    status = "🟢 ACTIVE" if count > 0 else "🔴 EMPTY"
                    print(f"  {status} {table:20} {count:>8} rows")
                except Exception as e:
                    print(f"  ❌ {table:20} TABLE MISSING")
            
            print("\n🔍 FIELD USAGE ANALYSIS:")
            print("=" * 60)
            
            # Check resolved_by usage
            try:
                result = conn.execute(text("""
                    SELECT 
                        COUNT(*) as total_closed,
                        SUM(CASE WHEN resolved_by IS NOT NULL THEN 1 ELSE 0 END) as has_resolved_by
                    FROM tickets 
                    WHERE status IN ('closed', 'resolved')
                """))
                row = result.fetchone()
                total_closed = row[0]
                has_resolved_by = row[1]
                
                print(f"📋 Tickets resolved_by tracking:")
                print(f"   Total closed/resolved tickets: {total_closed}")
                print(f"   With resolved_by filled: {has_resolved_by}")
                print(f"   Missing resolved_by: {total_closed - has_resolved_by}")
                
                if has_resolved_by > 0:
                    print("   ✅ resolved_by field is working!")
                else:
                    print("   ❌ resolved_by field needs fixing")
                    
            except Exception as e:
                print(f"❌ resolved_by check failed: {e}")
            
            # Check assignment tracking
            try:
                result = conn.execute(text("""
                    SELECT 
                        COUNT(*) as total_tickets,
                        SUM(CASE WHEN assigned_to IS NOT NULL THEN 1 ELSE 0 END) as has_assigned_to,
                        SUM(CASE WHEN owner IS NOT NULL THEN 1 ELSE 0 END) as has_owner
                    FROM tickets
                """))
                row = result.fetchone()
                total_tickets = row[0]
                has_assigned_to = row[1]
                has_owner = row[2]
                
                print(f"\n👤 Assignment tracking:")
                print(f"   Total tickets: {total_tickets}")
                print(f"   With assigned_to: {has_assigned_to}")
                print(f"   With owner: {has_owner}")
                
            except Exception as e:
                print(f"❌ Assignment check failed: {e}")
            
            # Check actor tracking in events
            try:
                result = conn.execute(text("""
                    SELECT 
                        COUNT(*) as total_events,
                        SUM(CASE WHEN actor_agent_id IS NOT NULL THEN 1 ELSE 0 END) as has_actor
                    FROM ticket_events
                """))
                row = result.fetchone()
                total_events = row[0]
                has_actor = row[1]
                
                print(f"\n📝 Event actor tracking:")
                print(f"   Total events: {total_events}")
                print(f"   With actor_agent_id: {has_actor}")
                
            except Exception as e:
                print(f"❌ Event actor check failed: {e}")
                
        print("\n🎯 RECOMMENDATIONS:")
        print("=" * 60)
        
        if total_closed > 0 and has_resolved_by == 0:
            print("❗ CRITICAL: Run the database migration to fix resolved_by tracking")
        
        try:
            with engine.connect() as conn:
                result = conn.execute(text("SELECT COUNT(*) FROM escalation_summaries"))
                escalation_count = result.fetchone()[0]
                print(f"✅ Escalation summaries table exists with {escalation_count} records")
        except:
            print("❗ CRITICAL: escalation_summaries table missing - run migration")
        
        try:
            with engine.connect() as conn:
                result = conn.execute(text("SELECT COUNT(*) FROM ticket_feedback"))
                feedback_count = result.fetchone()[0]
                if feedback_count == 0:
                    print("⚠️  ticket_feedback is empty - test confirm page functionality")
                else:
                    print(f"✅ ticket_feedback has {feedback_count} records")
        except:
            print("❗ ticket_feedback table has issues")
            
        print("\n📋 NEXT STEPS:")
        print("1. Run complete_database_migration.sql in MySQL Workbench")
        print("2. Test ticket resolution to verify resolved_by is populated")
        print("3. Test escalation feature to verify escalation_summaries")
        print("4. Test confirm page to verify ticket_feedback")
        
    except ImportError:
        print("❌ SQLAlchemy not installed. Install with: pip install sqlalchemy mysql-connector-python")
    except Exception as e:
        print(f"❌ Database connection failed: {e}")
        print("💡 Check your DATABASE_URL and ensure MySQL is running")

def main():
    print("🔍 DATABASE AUDIT TOOL")
    print("=" * 60)
    
    if not check_database_url():
        return
    
    try:
        audit_database()
    except KeyboardInterrupt:
        print("\n\n👋 Audit cancelled by user")
    except Exception as e:
        print(f"\n❌ Audit failed: {e}")

if __name__ == "__main__":
    main()
