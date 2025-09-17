import React, { useState } from 'react';
import ChatHistory from './ChatHistory';
import QuickActions from './QuickActions';
import MessageInput from './MessageInput';
import TicketHistoryPanel from './TicketHistoryPanel';
import DepartmentOverridePanel from './DepartmentOverridePanel';

export default function TicketContext({ ticket, knowledgeContext, onSend }) {
  const [draftText, setDraftText] = useState('');
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isOverrideOpen, setIsOverrideOpen] = useState(false);
  const [overrideLoading, setOverrideLoading] = useState(false);

  // Get current user info from localStorage/sessionStorage
  const currentUser = JSON.parse(localStorage.getItem('user') || sessionStorage.getItem('user') || '{}');
  const userRole = currentUser.role?.toUpperCase();
  const userDept = currentUser.department_id;

  // Check if user can override department
  const canOverrideDepartment = () => {
    // Only Helpdesk agents and Managers can change departments
    return userDept === 7 || userRole === 'MANAGER';
  };

  const handleSend = () => {
    onSend(ticket.ticketId, draftText);
    setDraftText('');
  };

  const handleDepartmentOverride = async (departmentData) => {
    setOverrideLoading(true);
    try {
      const token = localStorage.getItem('token') || sessionStorage.getItem('token');
      const response = await fetch(`/threads/${ticket.ticketId}/department`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(departmentData)
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || `HTTP ${response.status}`);
      }

      // Success - show notification and close panel
      alert(`✅ Department changed successfully to ${result.department}`);
      setIsOverrideOpen(false);
      
      // Optionally refresh the ticket data or trigger a parent component update
      if (window.location.reload) {
        window.location.reload(); // Simple refresh - you might want a more elegant solution
      }

    } catch (error) {
      console.error('Department override failed:', error);
      alert(`❌ Error: ${error.message}`);
    } finally {
      setOverrideLoading(false);
    }
  };

  return (
    <div>
      <header className="ticket-header">
        <h2>#{ticket.ticketId} – {ticket.subject}</h2>
        <div className="ticket-meta">
          <span>Level: {ticket.level}</span>
          <span>Status: {ticket.status}</span>
          <span>Priority: {ticket.priority}</span>
          <span>Agent: {ticket.assignedAgent || 'Unassigned'}</span>
          <span>Department: {ticket.department || 'Unassigned'}</span>
        </div>
        
        {/* Action Buttons */}
        <div className="ticket-actions">
          <button 
            onClick={() => setIsHistoryOpen(!isHistoryOpen)}
            className={`history-toggle-btn ${isHistoryOpen ? 'active' : ''}`}
          >
            📜 History {isHistoryOpen ? '▼' : '▶'}
          </button>

          {/* Department Override Button - Only show if user has permission */}
          {canOverrideDepartment() && (
            <button 
              onClick={() => setIsOverrideOpen(!isOverrideOpen)}
              className={`override-toggle-btn ${isOverrideOpen ? 'active' : ''}`}
              disabled={overrideLoading}
            >
              🏢 Override Dept {isOverrideOpen ? '▼' : '▶'}
            </button>
          )}
        </div>
      </header>

      {/* Collapsible History Panel */}
      {isHistoryOpen && (
        <TicketHistoryPanel 
          ticketId={ticket.ticketId} 
          isOpen={isHistoryOpen}
          onClose={() => setIsHistoryOpen(false)}
        />
      )}

      {/* Department Override Panel */}
      {isOverrideOpen && canOverrideDepartment() && (
        <DepartmentOverridePanel
          ticketId={ticket.ticketId}
          currentDepartment={ticket.department}
          currentDepartmentId={ticket.departmentId}
          userRole={userRole}
          userDept={userDept}
          isOpen={isOverrideOpen}
          onClose={() => setIsOverrideOpen(false)}
          onSubmit={handleDepartmentOverride}
          loading={overrideLoading}
        />
      )}

      <ChatHistory messages={ticket.messages} />

      {knowledgeContext && knowledgeContext.length > 0 && (
        <div className="knowledge-context">
          <h3>Related Tickets</h3>
          <ul>
            {knowledgeContext.map((txt, i) => (
              <li key={i}>{txt}</li>
            ))}
          </ul>
        </div>
      )}

      <QuickActions ticketId={ticket.ticketId} />

      <MessageInput
        value={draftText}
        onChange={(v) => setDraftText(v)}
        onSend={handleSend}
      />
    </div>
  );
}