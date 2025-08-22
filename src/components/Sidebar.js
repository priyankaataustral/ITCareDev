import React, { useState } from 'react';
import { MentionsPanel } from './MentionsPanel';
// import TicketList from './TicketList'; // Uncomment and adjust path as needed

export function Sidebar({ agentId, onSelectTicket, selectedTicket }) {
  const [view, setView] = useState('all');

  return (
    <div className="sidebar">
      <div className="tabs">
        <button
          className={view === 'all' ? 'active' : ''}
          onClick={() => setView('all')}
        >All Tickets</button>
        <button
          className={view === 'mentions' ? 'active' : ''}
          onClick={() => setView('mentions')}
        >@ Mentions</button>
      </div>
      {view === 'all' ? (
        // <TicketList onSelectTicket={onSelectTicket} selectedTicket={selectedTicket} />
        <div>All Tickets List Here</div>
      ) : (
        <MentionsPanel agentId={agentId} onSelectTicket={onSelectTicket} selectedTicket={selectedTicket} />
      )}
    </div>
  );
}
