import React, { useState, useEffect } from 'react';

export default function TicketHistoryPanel({ ticketId, isOpen, onClose }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [ticket, setTicket] = useState(null);

  // Fetch ticket history when panel opens
  useEffect(() => {
    if (isOpen && ticketId) {
      fetchTicketHistory();
    }
  }, [isOpen, ticketId]);

  const fetchTicketHistory = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const token = localStorage.getItem('token') || sessionStorage.getItem('token');
      const response = await fetch(`/tickets/${ticketId}/history`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch history: ${response.status}`);
      }

      const data = await response.json();
      setHistory(data.history || []);
      setTicket(data.ticket || null);
    } catch (err) {
      console.error('Error fetching ticket history:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return 'Unknown time';
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  const getEventIcon = (eventType) => {
    const icons = {
      'assign': '👤',
      'status_change': '📋',
      'level_change': '🚀',
      'dept_change': '🏢',
      'role_change': '🔄',
      'note': '📝',
      'archive_change': '📦'
    };
    return icons[eventType] || '📌';
  };

  const getEventColor = (eventType) => {
    const colors = {
      'assign': 'bg-blue-50 border-blue-200',
      'status_change': 'bg-green-50 border-green-200',
      'level_change': 'bg-orange-50 border-orange-200',
      'dept_change': 'bg-purple-50 border-purple-200',
      'role_change': 'bg-yellow-50 border-yellow-200',
      'note': 'bg-gray-50 border-gray-200',
      'archive_change': 'bg-red-50 border-red-200'
    };
    return colors[eventType] || 'bg-gray-50 border-gray-200';
  };

  if (!isOpen) return null;

  return (
    <div className="ticket-history-panel">
      <div className="history-header">
        <h3>📜 Ticket History</h3>
        <button onClick={onClose} className="close-btn">✕</button>
      </div>

      {loading && (
        <div className="history-loading">
          <div className="spinner"></div>
          <span>Loading history...</span>
        </div>
      )}

      {error && (
        <div className="history-error">
          <span>⚠️ Error: {error}</span>
          <button onClick={fetchTicketHistory} className="retry-btn">Retry</button>
        </div>
      )}

      {!loading && !error && (
        <div className="history-content">
          {history.length === 0 ? (
            <div className="no-history">
              <span>No history entries found for this ticket.</span>
            </div>
          ) : (
            <div className="history-timeline">
              {history.map((entry, index) => (
                <div key={entry.id || index} className={`history-entry ${getEventColor(entry.event_type)}`}>
                  <div className="entry-icon">
                    {getEventIcon(entry.event_type)}
                  </div>
                  
                  <div className="entry-content">
                    <div className="entry-summary">
                      <strong>{entry.summary}</strong>
                    </div>
                    
                    <div className="entry-meta">
                      <span className="timestamp">{formatTimestamp(entry.timestamp)}</span>
                      {entry.actor && entry.actor.name && (
                        <span className="actor">
                          by {entry.actor.name}
                          {entry.actor.role && <span className="role">({entry.actor.role})</span>}
                        </span>
                      )}
                    </div>

                    {entry.note && (
                      <div className="entry-note">
                        <em>"{entry.note}"</em>
                      </div>
                    )}

                    {/* Show detailed changes for complex events */}
                    {(entry.event_type === 'assign' && entry.details.from_agent && entry.details.to_agent) && (
                      <div className="entry-details">
                        <span className="detail-item">
                          From: {entry.details.from_agent.name} ({entry.details.from_agent.role})
                        </span>
                        <span className="detail-item">
                          To: {entry.details.to_agent.name} ({entry.details.to_agent.role})
                        </span>
                      </div>
                    )}

                    {(entry.event_type === 'dept_change' && entry.details.department) && (
                      <div className="entry-details">
                        <span className="detail-item">
                          Department: {entry.details.department.name}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}