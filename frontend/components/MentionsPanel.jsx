


import React, { useState } from 'react';
import { useMentions } from '../hooks/useMentions';

// Semantic color map for status
const statusColorMap = {
  open: 'bg-green-100 text-green-800',
  pending: 'bg-yellow-100 text-yellow-800',
  escalated: 'bg-red-100 text-red-800',
  closed: 'bg-gray-200 text-gray-700',
};

// Minutes threshold for "new" highlight
const NEW_MINUTES = 10;

function isNewMention(timestamp) {
  if (!timestamp) return false;
  const now = Date.now();
  const mentionTime = new Date(timestamp).getTime();
  return (now - mentionTime) < NEW_MINUTES * 60 * 1000;
}

export default function MentionsPanel({ agentId, onSelect, selectedId }) {
  const { mentions, loading, error } = useMentions(agentId);
  const [filter, setFilter] = useState('');

  // Ensure mentions is always an array
  const safeMentions = Array.isArray(mentions) ? mentions : [];
  // Filter mentions by ticket ID or subject
  const filteredMentions = safeMentions.filter(m =>
    m.subject?.toLowerCase().includes(filter.toLowerCase()) ||
    m.ticket_id?.toLowerCase().includes(filter.toLowerCase())
  );

  // Skeleton loader
  const skeletons = Array.from({ length: 4 });

  return (
    <div style={{ width: 350, minWidth: 350, maxWidth: 350, borderRight: '1px solid #eee', padding: 16 }}>
      <div style={{ fontWeight: 'bold', fontSize: 18, marginBottom: 8 }}>
        @Mentions
        <span style={{
          background: '#4f46e5',
          color: 'white',
          fontSize: 12,
          borderRadius: '999px',
          padding: '2px 8px',
          marginLeft: 8
        }}>
          {filteredMentions.length}
        </span>
      </div>
      <input
        type="search"
        placeholder="Search mentions…"
        className="w-full p-2 mb-2 border rounded"
        value={filter}
        onChange={e => setFilter(e.target.value)}
      />
      {loading ? (
        <ul className="ticket-list" style={{ listStyle: 'none', padding: 0 }}>
          {skeletons.map((_, i) => (
            <li key={i} className="p-3 mb-2 bg-gray-100 rounded animate-pulse" style={{ height: 48 }}></li>
          ))}
        </ul>
      ) : error ? (
        <div>Error loading mentions.</div>
      ) : filteredMentions.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-8">
          <i className="bi bi-emoji-smile text-4xl text-indigo-400 mb-2"></i>
          <div className="font-semibold mb-1">You have no pending mentions.</div>
          <div className="text-sm text-gray-500">Sit back and relax—or check All Tickets.</div>
        </div>
      ) : (
        <ul className="ticket-list" style={{ listStyle: 'none', padding: 0 }}>
          {filteredMentions.map(m => (
            <li
              key={m.ticket_id}
              className={`p-3 mb-2 bg-white rounded shadow hover:shadow-md cursor-pointer flex justify-between items-center ${selectedId === m.ticket_id ? 'active' : ''} ${isNewMention(m.timestamp) ? 'bg-indigo-50' : ''}`}
              onClick={() => onSelect(m.ticket_id)}
              title={m.subject}
              style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              <div className="flex items-center" style={{ flex: 1, minWidth: 0 }}>
                <i className="bi bi-bell-fill text-indigo-500 mr-2" style={{ fontSize: 18 }}></i>
                <span
                  style={{
                    fontWeight: 'bold',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    display: 'inline-block',
                    maxWidth: 120
                  }}
                  title={m.subject}
                >
                  {m.subject}
                </span>
              </div>
              <span className={`px-2 py-1 rounded-full text-xs ml-2 ${statusColorMap[m.status] || 'bg-gray-200 text-gray-700'}`}>{m.status}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
