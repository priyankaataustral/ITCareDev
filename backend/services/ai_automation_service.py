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
from models import Ticket, AIAutomationSettings, AIAction, Department, KBArticle, Agent, db, Message, Solution, ResolutionAttempt, SolutionStatus, SolutionGeneratedBy
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
                KBArticle.content_md.ilike(f'%{search_text}%')
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
        """Apply the solution action using the exact same flow as manual emails"""
        import json
        import traceback
        
        try:
            # 1. Follow exact same flow as manual send_email function
            logger.info(f"Starting AI solution application for ticket {ticket.id}")
            self._send_ai_solution_with_confirmation_flow(ticket, ai_action.generated_content)
            email_status = "📧 AI solution email sent with confirmation links"
            logger.info(f"Successfully sent AI solution email for ticket {ticket.id}")
        except Exception as e:
            error_details = traceback.format_exc()
            logger.error(f"Failed to send AI solution email for ticket {ticket.id}: {e}")
            logger.error(f"Full error traceback: {error_details}")
            email_status = f"❌ AI solution email failed: {str(e)}"
            # Re-raise the exception so the calling code can handle it properly
            raise
        
        # 2. Add internal message for tracking
        message = Message(
            ticket_id=ticket.id,
            sender='AI Assistant',
            content=f"{email_status}\n\n{ai_action.generated_content}",
            created_at=datetime.now(),
            type='event'
        )
        db.session.add(message)
        
        # 3. Update AI action status
        ai_action.status = 'applied'
        ai_action.applied_at = datetime.now()
        
        # 4. Update ticket status
        if ticket.status == 'open':
            ticket.status = 'pending_user_response'
    
    def _send_ai_solution_with_confirmation_flow(self, ticket: Ticket, solution_content: str):
        """Send AI solution using exact same flow as manual emails with confirm/reject links"""
        logger.info(f"_send_ai_solution_with_confirmation_flow called for ticket {ticket.id}")
        
        try:
            from models import TicketCC
            from email_helpers import send_via_gmail, _utcnow
            from db_helpers import has_pending_attempt, get_next_attempt_no, log_event
            from openai_helpers import is_materially_different
            from itsdangerous import URLSafeTimedSerializer
            from config import SECRET_KEY, FRONTEND_ORIGINS
            logger.info(f"All imports successful for ticket {ticket.id}")
        except Exception as e:
            logger.error(f"Import error in _send_ai_solution_with_confirmation_flow: {e}")
            raise
        
        # Get recipient email and CC list
        logger.info(f"Getting recipient email for ticket {ticket.id}")
        to_email = ticket.requester_email
        if not to_email:
            raise Exception(f"No email found for ticket {ticket.id}")
        logger.info(f"Recipient email found: {to_email}")
        
        cc_rows = TicketCC.query.filter_by(ticket_id=ticket.id).all()
        cc_list = [r.email for r in cc_rows]
        logger.info(f"CC list found: {cc_list}")
        
        # --- STEP 1: Create Solution record (following manual email pattern) ---
        logger.info(f"Creating Solution record for ticket {ticket.id}")
        try:
            s = Solution(
                ticket_id=ticket.id,
                text=solution_content,
                proposed_by="AI Assistant",
                generated_by=SolutionGeneratedBy.ai,  # Mark as AI-generated
                status=SolutionStatus.draft,  # Will update to sent_for_confirm after sending
                created_at=_utcnow(),
                updated_at=_utcnow(),
            )
            logger.info(f"Solution object created successfully")
            db.session.add(s)
            logger.info(f"Solution added to session")
            db.session.flush()  # Get s.id
            logger.info(f"Solution flushed successfully, got ID: {s.id}")
        except Exception as e:
            logger.error(f"Error creating/flushing Solution record: {e}")
            raise
        
        # --- STEP 2: Gate checks (following manual email pattern) ---
        if has_pending_attempt(ticket.id):
            raise Exception("A previous solution is still pending user confirmation.")
        
        last_rejected = (Solution.query
                        .filter_by(ticket_id=ticket.id, status=SolutionStatus.rejected)
                        .order_by(Solution.id.desc())
                        .first())
        if last_rejected and not is_materially_different(solution_content, last_rejected.text or ""):
            raise Exception("New solution is too similar to the last rejected fix.")
        
        # --- STEP 3: Create ResolutionAttempt (following manual email pattern) ---
        att_no = get_next_attempt_no(ticket.id)
        att = ResolutionAttempt(
            ticket_id=ticket.id, 
            solution_id=s.id, 
            attempt_no=att_no,
            sent_at=_utcnow()
        )
        db.session.add(att)
        db.session.flush()  # Get att.id
        
        # --- STEP 4: Generate token and confirmation URLs (following manual email pattern) ---
        ts = URLSafeTimedSerializer(SECRET_KEY, salt="solution-links-v1")
        token_payload = {
            "solution_id": s.id, 
            "ticket_id": ticket.id, 
            "attempt_id": att.id
        }
        authToken = ts.dumps(token_payload)
        
        confirm_url = f"{FRONTEND_ORIGINS}/confirm?token={authToken}&a=confirm"
        reject_url = f"{FRONTEND_ORIGINS}/confirm?token={authToken}&a=not_confirm"
        
        # --- STEP 5: Build email with confirmation links (following manual email pattern) ---
        requester_name = ticket.requester_name or "there"
        subject = f"Support Ticket #{ticket.id} Update"
        
        # Personalize and format email body
        personalized_body = f"""Hello {requester_name},

Thank you for contacting our support team regarding your ticket {ticket.id}.

{solution_content}

Best regards,
AI Support Assistant
Technical Support Team"""
        
        # Append confirmation links (exact same format as manual emails)
        final_body = (
            f"{personalized_body}\n\n"
            f"---\n"
            f"Please let us know if this solved your issue:\n"
            f"Confirm: {confirm_url}\n"
            f"Not fixed: {reject_url}\n"
        )
        
        # --- STEP 6: Send email (following manual email pattern) ---
        send_via_gmail(to_email, subject, final_body, cc_list=cc_list)
        
        # --- STEP 7: Update solution status (following manual email pattern) ---
        s.status = SolutionStatus.sent_for_confirm
        s.sent_for_confirmation_at = _utcnow()
        s.updated_at = _utcnow()
        db.session.commit()
        
        # --- STEP 8: Log event (following manual email pattern) ---
        log_event(ticket.id, 'EMAIL_SENT', {
            "subject": subject, 
            "manual": False,  # Mark as automated
            "to": to_email, 
            "cc": cc_list,
            "solution_id": s.id,
            "attempt_id": att.id
        })
        
        logger.info(f"✅ Sent AI solution email with confirmation flow for ticket {ticket.id} to {to_email}")


# Service instance
ai_automation = AIAutomationService()