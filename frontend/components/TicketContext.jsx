import React, { useState } from 'react';
import ChatHistory from './ChatHistory';
import QuickActions from './QuickActions';
import MessageInput from './MessageInput';
import TicketHistoryPanel from './TicketHistoryPanel';

export default function TicketContext({ ticket, knowledgeContext, onSend }) {
  const [draftText, setDraftText] = useState('');
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  const handleSend = () => {
    onSend(ticket.ticketId, draftText);
    setDraftText('');
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
        </div>
        
        {/* History Toggle Button */}
        <div className="ticket-actions">
          <button 
            onClick={() => setIsHistoryOpen(!isHistoryOpen)}
            className={`history-toggle-btn ${isHistoryOpen ? 'active' : ''}`}
          >
            📜 History {isHistoryOpen ? '▼' : '▶'}
          </button>
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