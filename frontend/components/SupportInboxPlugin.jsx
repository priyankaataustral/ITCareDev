'use client';

import React, { useState, useEffect } from 'react';
import ProfileDropdown from './ProfileDropdown';
import Sidebar from './Sidebar';
import LoadingBot from './LoadingBot';
import GroupedTickets from './GroupedTickets';
import ChatHistory from './ChatHistory';
import KBDashboard from './KBDashboard';
import MyDashboard from './MyDashboard';
import AgentsPage from '../pages/agents';
import 'bootstrap-icons/font/bootstrap-icons.css';
import { useAuth } from './AuthContext';
import { apiGet } from '../lib/apiClient'; // only import what we use

export default function SupportInboxPlugin() {
  const [selectedId, setSelectedId] = useState(null);
  const handleBack = React.useCallback(() => setSelectedId(null), []);
  const [dark, setDark] = useState(false);
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [departments, setDepartments] = useState([]);
  const [error, setError] = useState(null);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [showDashboard, setShowDashboard] = useState(false);
  const [showAgents, setShowAgents] = useState(false);
  const [ticketFilter, setTicketFilter] = useState('open'); // 'open', 'closed', 'archived', etc.
  const [departmentFilter, setDepartmentFilter] = useState('all'); // 'all' or specific department ID
  const [searchTerm, setSearchTerm] = useState(''); // Search term for ticket numbers
  const { agent } = useAuth();

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);

  // Function to load threads based on filters
  const loadThreads = React.useCallback(async (statusFilter = ticketFilter, deptFilter = departmentFilter) => {
    setLoading(true);
    setError(null);
    
    try {
      let apiUrl = '/threads?limit=50&offset=0';
      
      if (statusFilter === 'archived') {
        // Show archived tickets (regardless of status)
        apiUrl += '&archived=true';
      } else if (statusFilter === 'all') {
        // Show all non-archived tickets (all statuses)
        apiUrl += '&archived=false';
      } else {
        // Show non-archived tickets with specific status
        apiUrl += '&archived=false&status=' + statusFilter;
      }
      
      // Add department filter if specified
      if (deptFilter && deptFilter !== 'all') {
        apiUrl += '&department_id=' + deptFilter;
      }
      
      const payload = await apiGet(apiUrl);
      const list = Array.isArray(payload) ? payload : (payload.threads || []);
      setThreads(list);
    } catch (err) {
      setError(err);
      console.error('Failed to load threads:', err);
    } finally {
      setLoading(false);
    }
  }, [ticketFilter, departmentFilter]);

  // Load threads when component mounts or filter changes
  useEffect(() => {
    loadThreads();
  }, [loadThreads]);

  // Load departments
  useEffect(() => {
    apiGet(`/departments`)
      .then((data) => {
        const list = Array.isArray(data) ? data : (data.departments || []);
        setDepartments(list);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    console.log('DEPARTMENTS', departments);
  }, [departments]);

  // Filter threads based on search term
  const filteredThreads = React.useMemo(() => {
    if (!searchTerm.trim()) {
      return threads;
    }
    
    const searchLower = searchTerm.toLowerCase().trim();
    return threads.filter(thread => {
      // Search by ticket ID
      const ticketId = String(thread.id || '').toLowerCase();
      if (ticketId.includes(searchLower)) {
        return true;
      }
      
      // Search by subject/text
      const subject = String(thread.subject || thread.text || '').toLowerCase();
      if (subject.includes(searchLower)) {
        return true;
      }
      
      // Search by requester name
      const requesterName = String(thread.requester_name || '').toLowerCase();
      if (requesterName.includes(searchLower)) {
        return true;
      }
      
      return false;
    });
  }, [threads, searchTerm]);

  const handleSearchChange = (term) => {
    setSearchTerm(term);
  };

  const handleDepartmentFilterChange = (deptId) => {
    setDepartmentFilter(deptId);
    loadThreads(ticketFilter, deptId);
  };

  if (loading) {
    return (
      <div className="fixed inset-0 w-full h-full min-h-screen h-screen bg-gray-50 flex items-center justify-center">
        <LoadingBot />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 w-full h-full min-h-screen bg-gray-50 overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 bg-white border-b border-gray-200 shadow-sm">
        <div className="flex items-center justify-between px-4 lg:px-6 py-3">
          <div className="flex items-center space-x-4">
            {selectedId ? (
              <h2 className="text-xl font-semibold text-indigo-900">#{selectedId}</h2>
            ) : (
              <div className="text-indigo-900 font-medium">Select a ticket</div>
            )}
          </div>
          <div className="flex items-center gap-2 lg:gap-3">
            <button
              onClick={() => setShowDashboard(true)}
              className="flex items-center px-2 lg:px-3 py-1.5 lg:py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-lg transition-all text-xs lg:text-sm font-medium shadow-sm"
              aria-label="Open My Dashboard"
            >
              <i className="bi bi-speedometer2 mr-1 lg:mr-2"></i>
              <span className="hidden sm:inline">My Dashboard</span>
            </button>
            
            <button
              onClick={() => setShowAnalytics(true)}
              className="flex items-center px-2 lg:px-3 py-1.5 lg:py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-xs lg:text-sm font-medium shadow-sm"
              aria-label="Open Analytics Dashboard"
            >
              <i className="bi bi-graph-up mr-1 lg:mr-2"></i>
              <span className="hidden sm:inline">Analytics</span>
            </button>
            
            {/* Agents Management - Only for L2, L3, MANAGER */}
            {agent && ['L2', 'L3', 'MANAGER'].includes(agent.role) && (
              <button
                onClick={() => setShowAgents(true)}
                className="flex items-center px-2 lg:px-3 py-1.5 lg:py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg transition-colors text-xs lg:text-sm font-medium shadow-sm"
                aria-label="Manage Agents"
              >
                <i className="bi bi-people mr-1 lg:mr-2"></i>
                <span className="hidden sm:inline">Agents</span>
              </button>
            )}
            <button
              onClick={() => setDark((d) => !d)}
              className="bg-white text-black dark:bg-black dark:text-white p-1.5 lg:p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              aria-label="Toggle dark mode"
            >
              {dark ? <i className="bi bi-sun text-sm"></i> : <i className="bi bi-moon-stars text-sm"></i>}
            </button>
            <ProfileDropdown />
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <div className="flex-shrink-0 w-80 xl:w-96 bg-white border-r border-gray-200 overflow-hidden">
          <Sidebar
            agentId={agent?.id}
            onSelect={setSelectedId}
            selectedId={selectedId}
            threads={filteredThreads}
            departments={departments}
            useNewList={false}
            ticketFilter={ticketFilter}
            onFilterChange={(filter) => {
              setTicketFilter(filter);
              loadThreads(filter, departmentFilter);
            }}
            onDepartmentFilterChange={(deptFilter) => {
              setDepartmentFilter(deptFilter);
              loadThreads(ticketFilter, deptFilter);
            }}
            departmentFilter={departmentFilter}
            onSearchChange={handleSearchChange}
          />
        </div>

        {/* Chat / Content Area */}
        <div className="flex-1 bg-gray-50 overflow-hidden">
          {selectedId ? (
            <ChatHistory threadId={selectedId} onBack={handleBack} className="h-full" />
          ) : (
            <div className="h-full flex items-center justify-center bg-white">
              <div className="text-center text-gray-500">
                <div className="text-6xl mb-4">📋</div>
                <div className="text-xl font-medium text-indigo-900 mb-2">No ticket selected</div>
                <div className="text-sm text-gray-600">Choose a ticket from the sidebar to start</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* My Dashboard Modal */}
      {showDashboard && (
        <MyDashboard 
          open={showDashboard} 
          onClose={() => setShowDashboard(false)} 
          onSelectTicket={(ticketId) => {
            setSelectedId(ticketId);
            setShowDashboard(false);
          }}
        />
      )}

      {/* Analytics Dashboard Modal */}
      {showAnalytics && (
        <KBDashboard 
          open={showAnalytics} 
          onClose={() => setShowAnalytics(false)} 
        />
      )}

      {/* Agents Management Modal */}
      {showAgents && (
        <AgentsPage 
          open={showAgents} 
          onClose={() => setShowAgents(false)} 
        />
      )}
    </div>
  );
}