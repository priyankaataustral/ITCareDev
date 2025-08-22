import React from 'react';
import { useMentions } from '../hooks/useMentions';

export function MentionsPanel({ agentId, onSelectTicket, selectedTicket }) {
  const { mentions, loading, error } = useMentions(agentId);

  if (loading) return <div>Loading mentions...</div>;
  if (error) return <div>Error loading mentions.</div>;
  if (!mentions.length) return <div>No mentions found.</div>;

  return (
    <ul className="ticket-list">
      {mentions.map(m => (
        <li
          key={m.ticket_id}
          className={selectedTicket === m.ticket_id ? 'active' : ''}
          onClick={() => onSelectTicket(m.ticket_id)}
        >
          <span className="subject">{m.subject}</span>
          <span className={`status-badge ${m.status}`}>{m.status}</span>
        </li>
      ))}
    </ul>
  );
}
