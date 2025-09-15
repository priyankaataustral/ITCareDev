import React, { useState } from 'react';
import MentionsPanel from './MentionsPanel';
import { useMentions } from '../hooks/useMentions';
import GroupedTickets from './GroupedTickets';
import ThreadList from './ThreadList';
import EscalationSummaries from './EscalationSummaries';

export default function Sidebar({
  agentId,
  onSelect,
  selectedId,
  threads,
  departments = [],
  useNewList = false
}) {
  const [view, setView] = useState('all');
  const { mentions = [], loading, refreshMentions } = useMentions(agentId) || {};

  return (
  <div className="sidebar" style={{ width: 350, minWidth: 350, maxWidth: 350 }}>
      <div className="tabs">
        <button
          className={view === 'all' ? 'active' : ''}
          onClick={() => setView('all')}
        >All Tickets</button>
        <button
          className={view === 'mentions' ? 'active' : ''}
          onClick={() => setView('mentions')}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            @Mentions
            {mentions.length > 0 && (
              <span style={{
                background: '#ef4444',
                color: 'white',
                fontSize: 12,
                borderRadius: '999px',
                padding: '2px 7px',
                fontWeight: 'bold',
                marginLeft: 6,
                boxShadow: '0 1px 4px rgba(0,0,0,0.08)'
              }}>{mentions.length}</span>
            )}
          </span>
        </button>
        <button
          className={view === 'escalations' ? 'active' : ''}
          onClick={() => setView('escalations')}
        >📋 Escalations</button>
      </div>
      {view === 'all' ? (
        useNewList
          ? <ThreadList
              onSelect={onSelect}
              threads={threads}
              selectedId={selectedId}
              departments={departments}
            />
          : <GroupedTickets threads={threads} onSelect={onSelect} selectedId={selectedId} />
      ) : view === 'mentions' ? (
        <MentionsPanel agentId={agentId} onSelect={onSelect} selectedId={selectedId} />
      ) : view === 'escalations' ? (
        <EscalationSummaries />
      ) : null}
    </div>
  );
}
