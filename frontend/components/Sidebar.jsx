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
  onFilterChange,
  onDepartmentFilterChange,
  departmentFilter = 'all'
}) {
  const [view, setView] = useState('all');
  const [showDropdown, setShowDropdown] = useState(false);
  const [showDeptDropdown, setShowDeptDropdown] = useState(false);
  const [escalationCount, setEscalationCount] = useState(0);
  const dropdownRef = useRef(null);
  const deptDropdownRef = useRef(null);
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

  // Close dropdowns when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
      if (deptDropdownRef.current && !deptDropdownRef.current.contains(event.target)) {
        setShowDeptDropdown(false);
      }
    }

    if (showDropdown || showDeptDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showDropdown, showDeptDropdown]);

  return (
    <div className="sidebar" style={{ width: 350, minWidth: 350, maxWidth: 350 }}>
      {/* Compact Filter Section */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <i className="bi bi-funnel text-gray-500"></i>
            Filters
            {/* Active filter indicator */}
            {(ticketFilter !== 'open' || departmentFilter !== 'all') && (
              <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
            )}
          </h4>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">{threads?.length || 0} tickets</span>
            {/* Clear filters button */}
            {(ticketFilter !== 'open' || departmentFilter !== 'all') && (
              <button
                onClick={() => {
                  onFilterChange('open');
                  onDepartmentFilterChange('all');
                }}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                title="Clear all filters"
              >
                Clear
              </button>
            )}
          </div>
        </div>
        
        <div className="space-y-3">
          {/* Status Filter */}
          <div className="relative" ref={dropdownRef}>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Status</label>
            <button
              onClick={() => setShowDropdown(!showDropdown)}
              className={`w-full flex items-center justify-between px-3 py-2 bg-white border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors ${
                ticketFilter !== 'open' 
                  ? 'border-blue-300 bg-blue-50 hover:border-blue-400' 
                  : 'border-gray-200 hover:border-blue-300 focus:border-blue-500'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-base">{currentFilter.icon}</span>
                <span className="font-medium text-gray-900">{currentFilter.label}</span>
              </div>
              <i className={`bi bi-chevron-down text-gray-400 transition-transform duration-200 ${
                showDropdown ? 'rotate-180' : ''
              }`}></i>
            </button>
            
            {showDropdown && (
              <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                {filterOptions.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => {
                      onFilterChange(option.value);
                      setShowDropdown(false);
                    }}
                    className={`w-full px-3 py-2 text-left hover:bg-gray-50 flex items-center gap-2 transition-colors text-sm ${
                      ticketFilter === option.value ? 'bg-blue-50 text-blue-700 border-r-2 border-blue-500' : 'text-gray-900'
                    }`}
                  >
                    <span className="text-base">{option.icon}</span>
                    <span className="font-medium">{option.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Department Filter */}
          <div className="relative" ref={deptDropdownRef}>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Department</label>
            <button
              onClick={() => setShowDeptDropdown(!showDeptDropdown)}
              className={`w-full flex items-center justify-between px-3 py-2 bg-white border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 transition-colors ${
                departmentFilter !== 'all' 
                  ? 'border-purple-300 bg-purple-50 hover:border-purple-400' 
                  : 'border-gray-200 hover:border-purple-300 focus:border-purple-500'
              }`}
            >
              <div className="flex items-center gap-2">
                <i className="bi bi-building text-gray-500"></i>
                <span className="font-medium text-gray-900">
                  {departmentFilter === 'all' ? 'All Departments' : 
                   departments.find(d => d.id == departmentFilter)?.name || 'Unknown'}
                </span>
              </div>
              <i className={`bi bi-chevron-down text-gray-400 transition-transform duration-200 ${
                showDeptDropdown ? 'rotate-180' : ''
              }`}></i>
            </button>
            
            {showDeptDropdown && (
              <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                <button
                  onClick={() => {
                    onDepartmentFilterChange('all');
                    setShowDeptDropdown(false);
                  }}
                  className={`w-full px-3 py-2 text-left hover:bg-gray-50 flex items-center gap-2 transition-colors text-sm ${
                    departmentFilter === 'all' ? 'bg-purple-50 text-purple-700 border-r-2 border-purple-500' : 'text-gray-900'
                  }`}
                >
                  <i className="bi bi-building text-gray-500"></i>
                  <span className="font-medium">All Departments</span>
                </button>
                {departments.map((dept) => (
                  <button
                    key={dept.id}
                    onClick={() => {
                      onDepartmentFilterChange(dept.id);
                      setShowDeptDropdown(false);
                    }}
                    className={`w-full px-3 py-2 text-left hover:bg-gray-50 flex items-center gap-2 transition-colors text-sm ${
                      departmentFilter == dept.id ? 'bg-purple-50 text-purple-700 border-r-2 border-purple-500' : 'text-gray-900'
                    }`}
                  >
                    <i className="bi bi-building text-gray-500"></i>
                    <span className="font-medium">{dept.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
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
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            📋 Escalations
            {escalationCount > 0 && (
              <span style={{
                background: '#ef4444',
                color: 'white',
                fontSize: 12,
                borderRadius: '999px',
                padding: '2px 7px',
                minWidth: 18,
                textAlign: 'center'
              }}>
                {escalationCount}
              </span>
            )}
          </span>
        </button>
      </div>

      {/* Content */}
      <div className="tab-content">
        {view === 'all' && (
          useNewList ? (
            <GroupedTickets
              onSelect={onSelect}
              selectedId={selectedId}
              threads={threads}
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
          <EscalationSummaries 
            agentId={agentId} 
            onUnreadCountChange={setEscalationCount}
          />
        )}
      </div>
    </div>
  );
}
