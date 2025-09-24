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
  departmentFilter = 'all',
  onSearchChange,
  onSortChange,
  sortOrder = 'desc'
}) {
  const [view, setView] = useState('all');
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [escalationCount, setEscalationCount] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const filterPanelRef = useRef(null);
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

  // Close filter panel when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (filterPanelRef.current && !filterPanelRef.current.contains(event.target)) {
        setShowFilterPanel(false);
      }
    }

    if (showFilterPanel) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showFilterPanel]);

  // Handle search input changes
  const handleSearchChange = (value) => {
    setSearchTerm(value);
    if (onSearchChange) {
      onSearchChange(value);
    }
  };

  // Handle sort order changes
  const handleSortChange = () => {
    const newSortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
    if (onSortChange) {
      onSortChange(newSortOrder);
    }
  };

  // Helper functions for filter state
  const hasActiveFilters = () => {
    return ticketFilter !== 'open' || departmentFilter !== 'all' || searchTerm.trim() !== '';
  };

  const getActiveFilterChips = () => {
    const chips = [];
    if (ticketFilter !== 'open') {
      const filterOption = filterOptions.find(opt => opt.value === ticketFilter);
      chips.push({
        type: 'status',
        label: filterOption?.label || ticketFilter,
        icon: filterOption?.icon || '📋',
        value: ticketFilter
      });
    }
    if (departmentFilter !== 'all') {
      const dept = departments.find(d => d.id == departmentFilter);
      chips.push({
        type: 'department',
        label: dept?.name || 'Unknown',
        icon: '🏢',
        value: departmentFilter
      });
    }
    if (searchTerm.trim() !== '') {
      chips.push({
        type: 'search',
        label: `"${searchTerm}"`,
        icon: '🔍',
        value: searchTerm
      });
    }
    return chips;
  };

  const removeFilter = (type, value) => {
    if (type === 'status') {
      onFilterChange('open');
    } else if (type === 'department') {
      onDepartmentFilterChange('all');
    } else if (type === 'search') {
      handleSearchChange('');
    }
  };

  const clearAllFilters = () => {
    onFilterChange('open');
    onDepartmentFilterChange('all');
    handleSearchChange('');
    setShowFilterPanel(false);
  };

  return (
    <div className="sidebar" style={{ width: 350, minWidth: 350, maxWidth: 350 }}>
      {/* Compact Filter Button & Chips */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center gap-3 mb-3">
          {/* Filter Button */}
          <div className="relative" ref={filterPanelRef}>
            <button
              onClick={() => setShowFilterPanel(!showFilterPanel)}
              className={`relative flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-200 ${
                hasActiveFilters() 
                  ? 'bg-blue-100 text-blue-700 border border-blue-300 hover:bg-blue-200' 
                  : 'bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200'
              }`}
              title="Open filters"
            >
              <i className="bi bi-funnel text-sm"></i>
              {/* Active filter badge */}
              {hasActiveFilters() && (
                <span className="absolute -top-1 -right-1 w-3 h-3 bg-blue-500 rounded-full border-2 border-white"></span>
              )}
            </button>
            
            {/* Filter Panel */}
            {showFilterPanel && (
              <div className="absolute top-full left-0 mt-2 w-80 bg-white border border-gray-200 rounded-xl shadow-xl z-30 overflow-hidden max-h-96 overflow-y-auto">
                {/* Panel Header */}
                <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                      <i className="bi bi-funnel text-gray-600"></i>
                      Filters
                    </h3>
                    <button
                      onClick={() => setShowFilterPanel(false)}
                      className="text-gray-400 hover:text-gray-600 p-1"
                    >
                      <i className="bi bi-x-lg text-sm"></i>
                    </button>
                  </div>
                </div>
                
                {/* Panel Content */}
                <div className="p-4 space-y-4">
                  {/* Status Filter Section */}
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-2 block">Status</label>
                    <div className="grid grid-cols-2 gap-2">
                      {filterOptions.map((option) => (
                        <button
                          key={option.value}
                          onClick={() => onFilterChange(option.value)}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                            ticketFilter === option.value
                              ? 'bg-blue-100 text-blue-800 border border-blue-300'
                              : 'bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200'
                          }`}
                        >
                          <span>{option.icon}</span>
                          <span className="font-medium truncate">{option.label.replace(' Tickets', '')}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  {/* Department Filter Section */}
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-2 block">Department</label>
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      <button
                        onClick={() => onDepartmentFilterChange('all')}
                        className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                          departmentFilter === 'all'
                            ? 'bg-purple-100 text-purple-800 border border-purple-300'
                            : 'bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200'
                        }`}
                      >
                        <i className="bi bi-building text-gray-500"></i>
                        <span className="font-medium">All Departments</span>
                      </button>
                      {departments.map((dept) => (
                        <button
                          key={dept.id}
                          onClick={() => onDepartmentFilterChange(dept.id)}
                          className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                            departmentFilter == dept.id
                              ? 'bg-purple-100 text-purple-800 border border-purple-300'
                              : 'bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200'
                          }`}
                        >
                          <i className="bi bi-building text-gray-500"></i>
                          <span className="font-medium">{dept.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                
                {/* Panel Footer */}
                {hasActiveFilters() && (
                  <div className="px-4 py-3 border-t border-gray-100 bg-gray-50">
                    <button
                      onClick={clearAllFilters}
                      className="w-full px-3 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm font-medium"
                    >
                      Clear All Filters
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
          
          {/* Sort Button */}
          <button
            onClick={handleSortChange}
            className="flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-200 bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200"
            title={`Sort by ticket number ${sortOrder === 'asc' ? 'descending' : 'ascending'}`}
          >
            <svg className="w-4 h-4" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24">
              <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 20V7m0 13-4-4m4 4 4-4m4-12v13m0-13 4 4m-4-4-4 4"/>
            </svg>
          </button>
          
          {/* Search Input */}
          <div className="flex-1 relative">
            <input
              type="text"
              placeholder="Search ticket #..."
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
            />
            <i className="bi bi-search absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 text-sm"></i>
            {searchTerm && (
              <button
                onClick={() => handleSearchChange('')}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <i className="bi bi-x text-sm"></i>
              </button>
            )}
          </div>
          
          {/* Ticket Count */}
          <span className="text-sm text-gray-500 font-medium">{threads?.length || 0} tickets</span>
        </div>
        
        {/* Active Filter Chips */}
        {hasActiveFilters() && (
          <div className="flex items-center gap-2 flex-wrap">
            {getActiveFilterChips().map((chip, index) => (
              <div
                key={index}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
                  chip.type === 'status' 
                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                    : 'bg-purple-50 text-purple-700 border-purple-200'
                }`}
              >
                <span>{chip.icon}</span>
                <span>{chip.label}</span>
                <button
                  onClick={() => removeFilter(chip.type, chip.value)}
                  className="hover:bg-black/10 rounded-full p-0.5 ml-1 transition-colors"
                  title={`Remove ${chip.label} filter`}
                >
                  <i className="bi bi-x text-xs"></i>
                </button>
              </div>
            ))}
          </div>
        )}
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
