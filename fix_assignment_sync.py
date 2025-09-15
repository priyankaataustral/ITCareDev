#!/usr/bin/env python3
"""
Fix Assignment Sync Logic
The ticket claim endpoint creates TicketAssignment but doesn't sync tickets.assigned_to
"""

def fix_assignment_sync():
    """Fix the /threads/<id>/claim endpoint to properly sync assigned_to field"""
    
    with open('backend/urls.py', 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Find the claim endpoint logic
    old_claim_logic = '''    # 4) set owner field (legacy UI)
    ticket.owner = agent_name
    ticket.updated_at = datetime.utcnow()
    db.session.commit()'''
    
    new_claim_logic = '''    # 4) set owner field (legacy UI) AND sync assigned_to
    ticket.owner = agent_name
    ticket.assigned_to = agent.id  # Sync with TicketAssignment
    ticket.updated_at = datetime.utcnow()
    db.session.commit()'''
    
    if old_claim_logic in content:
        content = content.replace(old_claim_logic, new_claim_logic)
        
        with open('backend/urls.py', 'w', encoding='utf-8') as f:
            f.write(content)
        
        return "✅ Fixed assignment sync in ticket claim endpoint"
    else:
        return "⚠️ Claim endpoint pattern not found - may already be fixed"

def create_assignment_endpoints():
    """Create additional assignment management endpoints"""
    
    assignment_endpoints = '''
# Additional Assignment Management Endpoints

@urls.route("/threads/<thread_id>/assign", methods=["POST"])
@require_role("L2", "L3", "MANAGER")
def assign_ticket(thread_id):
    """Assign ticket to specific agent"""
    data = request.json or {}
    agent_id = data.get("agent_id")
    
    if not agent_id:
        return jsonify(error="agent_id required"), 400
    
    # Verify agent exists
    agent = db.session.get(Agent, agent_id)
    if not agent:
        return jsonify(error="Agent not found"), 404
    
    # Get ticket
    ticket = db.session.get(Ticket, thread_id)
    if not ticket:
        return jsonify(error="Ticket not found"), 404
    
    # Close any open assignments
    db.session.execute(text("""
        UPDATE ticket_assignments SET unassigned_at = :now
        WHERE ticket_id = :tid AND (unassigned_at IS NULL OR unassigned_at = '')
    """), {"tid": thread_id, "now": datetime.utcnow().isoformat()})
    
    # Create new assignment
    db.session.add(TicketAssignment(
        ticket_id=thread_id,
        agent_id=agent.id,
        assigned_at=datetime.utcnow().isoformat()
    ))
    
    # Sync tickets table
    ticket.assigned_to = agent.id
    ticket.owner = agent.name
    ticket.updated_at = datetime.utcnow()
    
    db.session.commit()
    
    # Log event
    add_event(thread_id, 'ASSIGNED', actor_agent_id=getattr(request, 'agent_ctx', {}).get('id'))
    
    return jsonify(
        status="assigned", 
        assigned_to={"id": agent.id, "name": agent.name}
    ), 200

@urls.route("/threads/<thread_id>/watchers", methods=["GET", "POST", "DELETE"])
@require_role("L1", "L2", "L3", "MANAGER")
def manage_watchers(thread_id):
    """Manage ticket watchers"""
    
    if request.method == "GET":
        # Get current watchers
        watchers = (db.session.query(TicketWatcher, Agent)
                   .join(Agent, TicketWatcher.agent_id == Agent.id)
                   .filter(TicketWatcher.ticket_id == thread_id)
                   .all())
        
        return jsonify(watchers=[
            {"id": w.id, "agent_id": a.id, "agent_name": a.name}
            for w, a in watchers
        ]), 200
    
    elif request.method == "POST":
        # Add watcher
        data = request.json or {}
        agent_id = data.get("agent_id")
        
        if not agent_id:
            return jsonify(error="agent_id required"), 400
        
        # Check if already watching
        existing = TicketWatcher.query.filter_by(
            ticket_id=thread_id, 
            agent_id=agent_id
        ).first()
        
        if existing:
            return jsonify(message="Already watching"), 200
        
        # Add watcher
        watcher = TicketWatcher(ticket_id=thread_id, agent_id=agent_id)
        db.session.add(watcher)
        db.session.commit()
        
        return jsonify(message="Watcher added"), 201
    
    elif request.method == "DELETE":
        # Remove watcher
        data = request.json or {}
        agent_id = data.get("agent_id")
        
        if not agent_id:
            return jsonify(error="agent_id required"), 400
        
        watcher = TicketWatcher.query.filter_by(
            ticket_id=thread_id, 
            agent_id=agent_id
        ).first()
        
        if watcher:
            db.session.delete(watcher)
            db.session.commit()
            return jsonify(message="Watcher removed"), 200
        else:
            return jsonify(error="Watcher not found"), 404
'''

    with open('additional_assignment_endpoints.py', 'w', encoding='utf-8') as f:
        f.write(assignment_endpoints)
    
    return "✅ Created additional assignment endpoints template"

def main():
    print("🔧 FIXING ASSIGNMENT SYNC LOGIC")
    print("=" * 50)
    
    # Fix the main sync issue
    try:
        result = fix_assignment_sync()
        print(result)
    except Exception as e:
        print(f"❌ Failed to fix assignment sync: {e}")
    
    # Create additional endpoints
    try:
        result = create_assignment_endpoints()
        print(result)
    except Exception as e:
        print(f"❌ Failed to create endpoints: {e}")
    
    print("\\n📋 WHAT'S NOW FIXED:")
    print("=" * 50)
    print("✅ resolved_by: Tracks who resolved tickets")
    print("✅ actor_agent_id: Tracks who performed events")
    print("✅ Enhanced ticket_feedback: Detailed feedback data")
    print("✅ Unified feedback inbox: KB + ticket feedback")
    print("🔧 assigned_to sync: Fixed in ticket claim")
    
    print("\\n🎯 REMAINING MISSING LOGIC:")
    print("=" * 50)
    print("📧 Email queue processing: No background job")
    print("👥 Watcher notifications: No notification system")
    print("🔄 Assignment history: Could add assignment change tracking")
    print("📊 Analytics improvements: Real-time data")
    
    print("\\n💡 NEXT STEPS:")
    print("1. Apply the assignment sync fix")
    print("2. Test ticket assignment works properly")
    print("3. Implement watcher notifications if needed")
    print("4. Add email processing background job")

if __name__ == "__main__":
    main()
