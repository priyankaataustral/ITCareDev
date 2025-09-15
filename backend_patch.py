#!/usr/bin/env python3
"""
Patch backend/urls.py to add department filtering to agents endpoint and assignment endpoint
"""

def update_backend():
    with open('backend/urls.py', 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Update the agents endpoint to support department filtering
    old_agents = '''def get_agents():
    """Get list of all agents for dropdowns/selection"""
    try:
        agents = Agent.query.all()
        result = [{
            "id": agent.id,
            "name": agent.name,
            "email": agent.email,
            "role": agent.role,
            "department_id": agent.department_id
        } for agent in agents]
        return jsonify({"agents": result})
    except Exception as e:
        return jsonify({"error": str(e)}), 500'''
    
    new_agents = '''def get_agents():
    """Get list of all agents for dropdowns/selection, optionally filtered by department"""
    try:
        department_id = request.args.get("department_id")
        
        query = Agent.query
        if department_id:
            query = query.filter(Agent.department_id == department_id)
        
        agents = query.all()
        result = [{
            "id": agent.id,
            "name": agent.name,
            "email": agent.email,
            "role": agent.role,
            "department_id": agent.department_id
        } for agent in agents]
        return jsonify({"agents": result})
    except Exception as e:
        return jsonify({"error": str(e)}), 500'''
    
    content = content.replace(old_agents, new_agents)
    
    # Add assignment endpoint before escalation-summaries
    assignment_endpoint = '''
@urls.route("/threads/<thread_id>/assign", methods=["POST"])
@require_role("L2", "L3", "MANAGER")
def assign_ticket(thread_id):
    """Assign ticket to specific agent"""
    data = request.json or {}
    agent_id = data.get("agent_id")
    
    # Get ticket
    ticket = db.session.get(Ticket, thread_id)
    if not ticket:
        return jsonify(error="Ticket not found"), 404
    
    if agent_id:
        # Verify agent exists
        agent = db.session.get(Agent, agent_id)
        if not agent:
            return jsonify(error="Agent not found"), 404
        
        # Close any open assignments
        db.session.execute(_sql_text("""
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
        message = f"Assigned to {agent.name}"
    else:
        # Unassign ticket
        db.session.execute(_sql_text("""
            UPDATE ticket_assignments SET unassigned_at = :now
            WHERE ticket_id = :tid AND (unassigned_at IS NULL OR unassigned_at = '')
        """), {"tid": thread_id, "now": datetime.utcnow().isoformat()})
        
        ticket.assigned_to = None
        ticket.owner = None
        message = "Unassigned"
    
    ticket.updated_at = datetime.utcnow()
    
    # Log event
    add_event(thread_id, 'ASSIGNMENT_CHANGED', actor_agent_id=getattr(request, 'agent_ctx', {}).get('id'))
    
    db.session.commit()
    
    return jsonify(
        status="success", 
        message=message,
        assigned_to=ticket.assigned_to
    ), 200

'''
    
    # Insert assignment endpoint before escalation-summaries
    insert_before = '@urls.route("/escalation-summaries", methods=["GET"])'
    content = content.replace(insert_before, assignment_endpoint + insert_before)
    
    with open('backend/urls.py', 'w', encoding='utf-8') as f:
        f.write(content)
    
    return "✅ Updated backend with department filtering and assignment endpoint"

if __name__ == "__main__":
    result = update_backend()
    print(result)
