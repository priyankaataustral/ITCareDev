#!/usr/bin/env python3
"""
AI Automation Service for Support Tickets
Handles auto-triage and auto-solution generation
"""

import json
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Tuple, Optional
from openai import OpenAI

from models import (
    Ticket, AIAutomationSettings, AIAction, Department, 
    KBArticle, Agent, db
)
from openai_helpers import categorize_department_with_gpt, client, CHAT_MODEL
from config import OPENAI_KEY

logger = logging.getLogger(__name__)

class AIAutomationService:
    def __init__(self):
        self.client = OpenAI(api_key=OPENAI_KEY)
        
    def get_settings(self) -> AIAutomationSettings:
        """Get current AI automation settings"""
        settings = AIAutomationSettings.query.first()
        if not settings:
            # Create default settings
            settings = AIAutomationSettings()
            db.session.add(settings)
            db.session.commit()
        return settings
    
    def should_exclude_ticket(self, ticket: Ticket, settings: AIAutomationSettings) -> Tuple[bool, str]:
        """Check if ticket should be excluded from AI automation"""
        reasons = []
        
        if settings.exclude_high_priority and ticket.priority.lower() == 'high':
            reasons.append("High priority ticket")
            
        if settings.exclude_l3_tickets and ticket.level >= 3:
            reasons.append("L3+ support level")
            
        if settings.exclude_escalated and ticket.status.lower() == 'escalated':
            reasons.append("Escalated ticket")
            
        # Check if ticket has recent human interaction
        recent_messages = ticket.messages.filter(
            Message.created_at > datetime.now() - timedelta(hours=2),
            Message.sender != 'system'
        ).count()
        
        if recent_messages > 0:
            reasons.append("Recent human interaction")
            
        excluded = len(reasons) > 0
        return excluded, "; ".join(reasons)
    
    def auto_triage_ticket(self, ticket: Ticket) -> Optional[AIAction]:
        """Automatically assign ticket to correct department"""
        settings = self.get_settings()
        
        if not settings.auto_triage_enabled:
            return None
            
        # Check exclusions
        excluded, reason = self.should_exclude_ticket(ticket, settings)
        if excluded:
            logger.info(f"Ticket {ticket.id} excluded from auto-triage: {reason}")
            return None
        
        try:
            # Get AI department prediction with confidence
            department_info = self._predict_department_with_confidence(ticket)
            
            if department_info['confidence'] < settings.triage_confidence_threshold:
                logger.info(f"Ticket {ticket.id} confidence {department_info['confidence']:.2f} below threshold {settings.triage_confidence_threshold}")
                return None
            
            # Check if department actually needs to change
            current_dept_id = ticket.department_id
            suggested_dept_id = department_info['department_id']
            
            if current_dept_id == suggested_dept_id:
                logger.info(f"Ticket {ticket.id} already in correct department")
                return None
            
            # Create AI action record
            ai_action = AIAction(
                ticket_id=ticket.id,
                action_type='auto_triage',
                confidence_score=department_info['confidence'],
                reasoning=department_info['reasoning'],
                old_value=str(current_dept_id),
                new_value=str(suggested_dept_id),
                risk_level='low'
            )
            
            db.session.add(ai_action)
            
            # Apply the change if auto-apply is enabled
            if not settings.require_manager_approval:
                self._apply_triage_action(ai_action, ticket, suggested_dept_id)
            
            db.session.commit()
            logger.info(f"Created auto-triage action for ticket {ticket.id}")
            return ai_action
            
        except Exception as e:
            logger.error(f"Error in auto-triage for ticket {ticket.id}: {e}")
            return None
    
    def auto_generate_solution(self, ticket: Ticket) -> Optional[AIAction]:
        """Generate automated solution email for ticket"""
        settings = self.get_settings()
        
        if not settings.auto_solution_enabled:
            return None
            
        # Check exclusions
        excluded, reason = self.should_exclude_ticket(ticket, settings)
        if excluded:
            logger.info(f"Ticket {ticket.id} excluded from auto-solution: {reason}")
            return None
            
        # Check daily limits
        today_actions = AIAction.query.filter(
            AIAction.action_type == 'auto_solution',
            AIAction.created_at >= datetime.now().date(),
            AIAction.status.in_(['applied', 'pending'])
        ).count()
        
        if today_actions >= settings.max_daily_auto_solutions:
            logger.info(f"Daily auto-solution limit reached: {today_actions}")
            return None
        
        # Check cooldown
        recent_solution = AIAction.query.filter(
            AIAction.ticket_id == ticket.id,
            AIAction.action_type == 'auto_solution',
            AIAction.created_at > datetime.now() - timedelta(hours=settings.solution_cooldown_hours)
        ).first()
        
        if recent_solution:
            logger.info(f"Ticket {ticket.id} in cooldown period")
            return None
            
        try:
            # Generate solution with confidence scoring
            solution_info = self._generate_solution_with_confidence(ticket)
            
            if solution_info['confidence'] < settings.solution_confidence_threshold:
                logger.info(f"Ticket {ticket.id} solution confidence {solution_info['confidence']:.2f} below threshold")
                return None
            
            # Create AI action record
            ai_action = AIAction(
                ticket_id=ticket.id,
                action_type='auto_solution',
                confidence_score=solution_info['confidence'],
                reasoning=solution_info['reasoning'],
                generated_content=solution_info['solution_email'],
                kb_references=solution_info['kb_refs'],
                risk_level=solution_info['risk_level']
            )
            
            db.session.add(ai_action)
            
            # Apply if auto-apply enabled and low risk
            if not settings.require_manager_approval and solution_info['risk_level'] == 'low':
                self._apply_solution_action(ai_action, ticket)
            
            db.session.commit()
            logger.info(f"Created auto-solution action for ticket {ticket.id}")
            return ai_action
            
        except Exception as e:
            logger.error(f"Error in auto-solution for ticket {ticket.id}: {e}")
            return None
    
    def _predict_department_with_confidence(self, ticket: Ticket) -> Dict:
        """Predict department with confidence scoring"""
        departments = Department.query.all()
        dept_names = [d.name for d in departments]
        
        prompt = f"""
You are an expert ticket triage system. Analyze this support ticket and predict the most appropriate department.

Available Departments: {', '.join(dept_names)}

Ticket Details:
- Subject: {ticket.subject}
- Category: {ticket.category}
- Priority: {ticket.priority}
- Description: {getattr(ticket, 'description', 'N/A')}

Respond in JSON format:
{{
    "department": "department_name",
    "confidence": 0.85,
    "reasoning": "Brief explanation of why this department is appropriate"
}}
"""
        
        response = self.client.chat.completions.create(
            model=CHAT_MODEL,
            messages=[
                {"role": "system", "content": "You are a ticket triage expert. Always respond with valid JSON."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.1,
            max_tokens=200
        )
        
        result = json.loads(response.choices[0].message.content)
        
        # Find department ID
        dept = Department.query.filter_by(name=result['department']).first()
        if not dept:
            # Fallback to first department
            dept = departments[0] if departments else None
            
        return {
            'department_id': dept.id if dept else 1,
            'confidence': result['confidence'],
            'reasoning': result['reasoning']
        }
    
    def _generate_solution_with_confidence(self, ticket: Ticket) -> Dict:
        """Generate solution email with confidence scoring"""
        # Get relevant KB articles
        kb_articles = self._get_relevant_kb_articles(ticket)
        kb_context = "\n".join([f"- {art.title}: {art.content[:200]}..." for art in kb_articles[:3]])
        
        prompt = f"""
You are an expert technical support agent. Generate a professional solution email for this ticket.

Ticket Details:
- Subject: {ticket.subject}
- Category: {ticket.category}
- Priority: {ticket.priority}
- Requester: {ticket.requester_name}

Relevant Knowledge Base Articles:
{kb_context}

Generate a response in JSON format:
{{
    "solution_email": "Professional email content with solution steps",
    "confidence": 0.85,
    "reasoning": "Why you're confident in this solution",
    "risk_level": "low|medium|high",
    "kb_articles_used": ["article_id1", "article_id2"]
}}

Guidelines:
- Keep email under 200 words
- Use bullet points for steps
- Be professional and friendly
- Only suggest solutions you're confident about
- Mark as high risk if unsure or potentially dangerous
"""
        
        response = self.client.chat.completions.create(
            model=CHAT_MODEL,
            messages=[
                {"role": "system", "content": "You are a professional technical support expert."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.1,
            max_tokens=500
        )
        
        result = json.loads(response.choices[0].message.content)
        result['kb_refs'] = [{'id': art.id, 'title': art.title} for art in kb_articles[:3]]
        
        return result
    
    def _get_relevant_kb_articles(self, ticket: Ticket) -> List[KBArticle]:
        """Get relevant KB articles for ticket"""
        # Simple keyword matching - could be enhanced with embeddings
        search_text = f"{ticket.subject} {ticket.category}".lower()
        
        articles = KBArticle.query.filter(
            KBArticle.status == 'published',
            db.or_(
                KBArticle.title.ilike(f'%{search_text}%'),
                KBArticle.content.ilike(f'%{search_text}%')
            )
        ).limit(5).all()
        
        return articles
    
    def _apply_triage_action(self, ai_action: AIAction, ticket: Ticket, new_dept_id: int):
        """Apply the triage action to the ticket"""
        ticket.department_id = new_dept_id
        ai_action.status = 'applied'
        ai_action.applied_at = datetime.now()
        
        # Log the change in ticket history
        from models import TicketHistory
        history = TicketHistory(
            ticket_id=ticket.id,
            event_type='ai_department_change',
            old_value=ai_action.old_value,
            new_value=ai_action.new_value,
            note=f"AI auto-triage (confidence: {ai_action.confidence_score:.2f})"
        )
        db.session.add(history)
    
    def _apply_solution_action(self, ai_action: AIAction, ticket: Ticket):
        """Apply the solution action (send email, update ticket)"""
        # Here you would integrate with your email system
        # For now, just mark as applied and add to messages
        
        from models import Message
        message = Message(
            ticket_id=ticket.id,
            sender='AI Assistant',
            content=ai_action.generated_content,
            created_at=datetime.now()
        )
        db.session.add(message)
        
        ai_action.status = 'applied'
        ai_action.applied_at = datetime.now()
        
        # Optionally update ticket status
        if ticket.status == 'open':
            ticket.status = 'pending_user_response'


# Service instance
ai_automation = AIAutomationService()