import React, { useState, useEffect, useRef } from 'react';
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
  useNewList = false,
  ticketFilter = 'open',
  onFilterChange
}) {
  const [view, setView] = useState('all');
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef(null);
  const { mentions = [], loading, refreshMentions } = useMentions(agentId) || {};

  const filterOptions = [
    { value: 'open', label: '🟢 Open Tickets', icon: '🟢' },
    { value: 'closed', label: '✅ Closed Tickets', icon: '✅' },
    { value: 'archived', label: '📦 Archived Tickets', icon: '📦' }
  ];

  const currentFilter = filterOptions.find(opt => opt.value === ticketFilter) || filterOptions[0];

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    }

    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showDropdown]);

  return (
    <div className="sidebar" style={{ width: 350, minWidth: 350, maxWidth: 350 }}>
      {/* Ticket Filter Dropdown */}
      {view === 'all' && (
        <div className="p-4 border-b border-gray-200">
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setShowDropdown(!showDropdown)}
              className="w-full flex items-center justify-between px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <div className="flex items-center gap-2">
                <span>{currentFilter.icon}</span>
                <span className="font-medium text-gray-900">{currentFilter.label}</span>
                <span className="text-sm text-gray-500">({threads.length})</span>
              </div>
              <svg className={`w-5 h-5 text-gray-400 transform transition-transform ${showDropdown ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            
            {showDropdown && (
              <div className="absolute z-10 mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg">
                {filterOptions.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => {
                      onFilterChange(option.value);
                      setShowDropdown(false);
                    }}
                    className={`w-full px-3 py-2 text-left hover:bg-gray-50 flex items-center gap-2 ${
                      ticketFilter === option.value ? 'bg-blue-50 text-blue-600' : 'text-gray-900'
                    } first:rounded-t-md last:rounded-b-md`}
                  >
                    <span>{option.icon}</span>
                    <span>{option.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="tabs">
        <button
          className={view === 'all' ? 'active' : ''}
          onClick={() => setView('all')}
        >📋 Tickets</button>
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
