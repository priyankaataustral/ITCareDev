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
    { value: 'all', label: 'All Active', icon: '📋' },
    { value: 'open', label: 'Open Tickets', icon: '🟢' },
    { value: 'escalated', label: 'Escalated Tickets', icon: '⬆️' },
    { value: 'closed', label: 'Closed Tickets', icon: '✅' },
    { value: 'resolved', label: 'Resolved Tickets', icon: '🎯' },
    { value: 'archived', label: 'Archived Tickets', icon: '📦' }
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
      {/* Ticket Filter Dropdown - Always Visible */}
      <div className="p-4 border-b border-gray-200">
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            className="w-full flex items-center justify-between px-4 py-3 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl shadow-sm hover:from-blue-100 hover:to-indigo-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
          >
            <div className="flex items-center gap-3">
              <span className="text-lg">{currentFilter.icon}</span>
              <div className="text-left">
                <div className="font-semibold text-gray-900">{currentFilter.label}</div>
                <div className="text-sm text-gray-500">{threads.length} tickets</div>
              </div>
            </div>
            <svg className={`w-5 h-5 text-gray-400 transform transition-transform duration-200 ${showDropdown ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          
          {showDropdown && (
            <div className="absolute z-10 mt-2 w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
              {filterOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => {
                    onFilterChange(option.value);
                    setShowDropdown(false);
                  }}
                  className={`w-full px-4 py-3 text-left hover:bg-blue-50 flex items-center gap-3 transition-colors ${
                    ticketFilter === option.value ? 'bg-blue-50 text-blue-700 border-r-4 border-blue-500' : 'text-gray-900'
                  }`}
                >
                  <span className="text-lg">{option.icon}</span>
                  <span className="font-medium">{option.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

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
                minWidth: 18,
                textAlign: 'center'
              }}>
                {mentions.length}
              </span>
            )}
          </span>
        </button>
        <button
          className={view === 'escalations' ? 'active' : ''}
          onClick={() => setView('escalations')}
        >📋 Escalations</button>
      </div>

      {/* Content */}
      <div className="tab-content">
        {view === 'all' && (
          useNewList ? (
            <GroupedTickets
              onSelect={onSelect}
              selectedId={selectedId}
              tickets={threads}
              departments={departments}
            />
          ) : (
            <ThreadList
              onSelect={onSelect}
              selectedId={selectedId}
              threads={threads}
              departments={departments}
            />
          )
        )}
        {view === 'mentions' && (
          <MentionsPanel 
            agentId={agentId} 
            onSelect={onSelect}
            selectedId={selectedId}
            refreshMentions={refreshMentions}
          />
        )}
        {view === 'escalations' && (
          <EscalationSummaries agentId={agentId} />
        )}
      </div>
    </div>
  );
}
