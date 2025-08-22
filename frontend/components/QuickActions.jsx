// frontend/src/components/QuickActions.jsx
import React from 'react';

export default function QuickActions({ ticketId }) {
  const handleNewTicket = () => {
    // open a modal or similar to create a new ticket
    alert('New ticket flow not implemented yet.');
  };
  const handleCheckStatus = () => {
    alert(`Status is currently: (would fetch /tickets/${ticketId})`);
  };

  return (
    <div className="quick-actions">
      <button onClick={handleNewTicket}>New Ticket</button>
      <button onClick={handleCheckStatus}>Check Status</button>
    </div>
  );
}
