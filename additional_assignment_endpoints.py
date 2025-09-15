
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
