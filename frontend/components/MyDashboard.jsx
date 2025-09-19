'use client';

import React, { useState, useEffect } from 'react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useAuth } from './AuthContext';
import { apiGet, apiPost } from '../lib/apiClient';

dayjs.extend(relativeTime);

// -------------------------------------
// DashboardAssignmentPill (unchanged)
// -------------------------------------
const DashboardAssignmentPill = ({ ticket, onAssignmentChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [currentAgent, setCurrentAgent] = useState(null);
  const { agent: currentUser } = useAuth();
  
  useEffect(() => {
    if (ticket.assigned_to && agents.length > 0) {
      const agent = agents.find(a => a.id === ticket.assigned_to);
      setCurrentAgent(agent);
    }
  }, [ticket.assigned_to, agents]);
  
  const canAssignTickets = () => {
    const isHelpdesk = currentUser?.department_id === 7;
    const isManager = currentUser?.role === 'MANAGER';
    const isL2OrL3 = ['L2', 'L3'].includes(currentUser?.role);
    if (!isManager && !isL2OrL3) return false;
    return isHelpdesk || isManager || isL2OrL3;
  };
  
  const handleDropdownOpen = async () => {
    if (!canAssignTickets()) return;
    if (!isOpen) {
      setLoading(true);
      try {
        const isManager = currentUser?.role === 'MANAGER';
        const isHelpdesk = currentUser?.department_id === 7;
        
        if (isManager && !isHelpdesk) {
          const [ownDeptResponse, helpdeskResponse] = await Promise.all([
            apiGet(`/agents?department_id=${currentUser.department_id}`),
            apiGet(`/agents?department_id=7`),
          ]);
          
          const ownDeptAgents = ownDeptResponse.agents || [];
          const helpdeskAgents = helpdeskResponse.agents || [];
          const allAgents = [...ownDeptAgents, ...helpdeskAgents];
          const uniqueAgents = allAgents.filter((agent, index, self) => 
            index === self.findIndex(a => a.id === agent.id)
          );
          setAgents(uniqueAgents);
        } else {
          const targetDepartmentId = isHelpdesk ? ticket.department_id : currentUser?.department_id;
          const response = await apiGet(`/agents?department_id=${targetDepartmentId}`);
          setAgents(response.agents || []);
        }
      } catch (error) {
        console.error('Failed to fetch agents:', error);
      }
      setLoading(false);
    }
    setIsOpen(!isOpen);
  };
  
  const handleAssign = (agentId) => {
    onAssignmentChange(ticket.id, agentId);
    setIsOpen(false);
  };
  
  const hasAssignPermission = canAssignTickets();
  
  if (!hasAssignPermission) {
    return (
      <div className="px-2 py-1 bg-gray-50 border border-gray-200 text-gray-500 text-xs font-medium rounded-md flex items-center gap-1">
        <span>👤</span>
        {ticket.assigned_agent ? (
          <span>Assigned: {ticket.assigned_agent.name}</span>
        ) : (
          <span>Unassigned</span>
        )}
      </div>
    );
  }

  return (
    <div className="relative inline-block">
      <button
        onClick={handleDropdownOpen}
        className="px-2 py-1 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 text-blue-700 text-xs font-medium rounded-md hover:from-blue-100 hover:to-indigo-100 transition-all duration-200 flex items-center gap-1"
      >
        <span>👤</span>
        {ticket.assigned_agent ? (
          <span>{ticket.assigned_agent.name}</span>
        ) : (
          <span>Unassigned</span>
        )}
        <span className="text-[10px]">▼</span>
      </button>
      
      {isOpen && (
        <div className="absolute top-full left-0 mt-2 bg-white border border-gray-200 rounded-xl shadow-xl z-50 min-w-[160px] overflow-hidden">
          <div className="py-2">
            <button
              onClick={() => handleAssign(null)}
              className="w-full text-left px-3 py-2 text-sm hover:bg-rose-50 transition-colors flex items-center gap-2"
            >
              <span className="text-rose-500">🚫</span>
              <span>Unassign</span>
            </button>
            {loading ? (
              <div className="px-3 py-2 text-sm text-gray-500">Loading agents...</div>
            ) : agents.length > 0 ? (
              agents.map(agent => (
                <button
                  key={agent.id}
                  onClick={() => handleAssign(agent.id)}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition-colors flex items-center gap-2 ${
                    ticket.assigned_to === agent.id ? 'bg-blue-50 text-blue-700' : 'text-gray-700'
                  }`}
                >
                  <span className="w-5 h-5 bg-gradient-to-r from-blue-100 to-indigo-100 rounded-full flex items-center justify-center text-xs font-semibold text-blue-600">
                    {(agent?.name || '?').charAt(0)}
                  </span>
                  <div>
                    <div className="font-medium">{agent.name}</div>
                    <div className="text-xs text-gray-500">{agent.role}</div>
                  </div>
                </button>
              ))
            ) : (
              <div className="px-3 py-2 text-sm text-gray-500">No agents available</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// -------------------------------------
// DashboardDepartmentPill (unchanged)
// -------------------------------------
const DashboardDepartmentPill = ({ ticket, onDepartmentChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [reason, setReason] = useState('');
  const { agent: currentUser } = useAuth();
  
  const currentDept = departments.find(d => d.id === ticket.department_id) || ticket.department;
  
  const canChangeDepartment = () => {
    const isHelpdesk = currentUser?.department_id === 7;
    const isManager = currentUser?.role === 'MANAGER';
    const isL2OrL3 = ['L2', 'L3'].includes(currentUser?.role);
    if (!isManager && !isL2OrL3) return false;
    return isHelpdesk || isManager || isL2OrL3;
  };
  
  const getAvailableDepartments = () => {
    if (!departments.length) return [];
    const isHelpdesk = currentUser?.department_id === 7;
    const isManager = currentUser?.role === 'MANAGER';
    const isL2OrL3 = ['L2', 'L3'].includes(currentUser?.role);
    
    if (isHelpdesk) {
      return departments.filter(dept => dept.id !== ticket.department_id);
    } else if (isManager && currentUser?.department_id !== 7) {
      return departments.filter(dept => dept.id === 7);
    } else if (isL2OrL3 && currentUser?.department_id !== 7) {
      return departments.filter(dept => dept.id === 7);
    }
    return [];
  };
  
  const handleDropdownOpen = async () => {
    if (!canChangeDepartment()) return;
    if (!isOpen) {
      setLoading(true);
      try {
        const response = await apiGet('/departments');
        const fetchedDepartments = response.departments || response || [];
        setDepartments(fetchedDepartments);
      } catch (error) {
        console.error('Failed to fetch departments:', error);
        setLoading(false);
        return;
      }
      setLoading(false);
    }
    setIsOpen(!isOpen);
  };
  
  const handleChange = async (departmentId) => {
    if (!reason.trim()) {
      alert('Please provide a reason for department change');
      return;
    }
    try {
      await onDepartmentChange(ticket.id, departmentId, reason);
      setIsOpen(false);
      setReason('');
    } catch (error) {
      // Error handled in parent
    }
  };
  
  if (!canChangeDepartment()) {
    return (
      <div className="px-2 py-1 bg-gray-50 border border-gray-200 text-gray-500 text-xs font-medium rounded-md flex items-center gap-1">
        <span>🏢</span>
        <span>{currentDept?.name || 'Dept'}</span>
      </div>
    );
  }
  
  const availableDepts = getAvailableDepartments();

  return (
    <div className="relative inline-block">
      <button
        onClick={handleDropdownOpen}
        className="px-2 py-1 bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 text-purple-700 text-xs font-medium rounded-md hover:from-purple-100 hover:to-pink-100 transition-all duration-200 flex items-center gap-1"
      >
        <span>🏢</span>
        <span>{currentDept?.name || 'Dept'}</span>
        <span className="text-[10px]">▼</span>
      </button>
      
      {isOpen && (
        <div className="absolute top-full left-0 mt-2 bg-white border border-gray-200 rounded-xl shadow-xl z-50 min-w-[200px] overflow-hidden">
          <div className="p-3">
            <div className="mb-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Reason for change:
              </label>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why change department?"
                className="w-full text-xs px-2 py-1 border border-gray-300 rounded"
              />
            </div>
            
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {loading ? (
                <div className="text-xs text-gray-500 p-2">Loading departments...</div>
              ) : availableDepts.length > 0 ? (
                availableDepts.map(dept => (
                  <button
                    key={dept.id}
                    onClick={() => handleChange(dept.id)}
                    disabled={!reason.trim()}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed rounded"
                  >
                    <span>🏢</span>
                    <span>{dept.name}</span>
                  </button>
                ))
              ) : (
                <div className="text-xs text-gray-500 p-2">
                  {currentUser?.department_id === 7 ? 'No other departments available' : 'Can only route to Helpdesk'}
                </div>
              )}
            </div>
            
            <button
              onClick={() => {
                setIsOpen(false);
                setReason('');
              }}
              className="mt-2 w-full text-xs text-gray-500 hover:text-gray-700 py-1 border-t pt-2"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// -------------------------------------
// MyDashboard (with window controls + new tab)
// -------------------------------------
export default function MyDashboard({ open, onClose, onSelectTicket }) {
  const { agent } = useAuth();
  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('my-tickets'); // + 'insights'
  const [winState, setWinState] = useState('normal'); // 'normal' | 'max' | 'min'

  useEffect(() => {
    if (open) {
      setWinState('normal');
      loadDashboard();
    }
  }, [open]);

  const loadDashboard = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet('/dashboard/my-tickets');
      setDashboardData(data);
    } catch (err) {
      setError(err.message || 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  };

  const handleAssignmentChange = async (ticketId, agentId) => {
    try {
      await apiPost(`/threads/${ticketId}/assign`, { agent_id: agentId });
      await loadDashboard();
    } catch (error) {
      console.error('Assignment failed:', error);
      alert('Failed to assign ticket. Please try again.');
    }
  };

  const handleDepartmentChange = async (ticketId, departmentId, reason) => {
    try {
      await apiPost(`/threads/${ticketId}/change-department`, { 
        department_id: departmentId, 
        reason: reason 
      });
      await loadDashboard();
    } catch (error) {
      console.error('Department change failed:', error);
      alert('Failed to change department. Please try again.');
      throw error;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'open': return 'bg-green-100 text-green-800 border-green-200';
      case 'escalated': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'closed': return 'bg-gray-100 text-gray-800 border-gray-200';
      case 'resolved': return 'bg-blue-100 text-blue-800 border-blue-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getPriorityColor = (priority) => {
    switch (priority?.toLowerCase()) {
      case 'high': return 'bg-red-100 text-red-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'low': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getLevelBadge = (level) => {
    const colors = {
      1: 'bg-blue-100 text-blue-800',
      2: 'bg-orange-100 text-orange-800',
      3: 'bg-red-100 text-red-800'
    };
    return colors[level] || 'bg-gray-100 text-gray-800';
  };

  // Closed: nothing
  if (!open) return null;

  // Minimized: show dock pill
  if (winState === 'min') {
    return (
      <button
        onClick={() => setWinState('normal')}
        className="fixed bottom-4 right-4 z-[1000] px-4 py-2 bg-white border border-gray-200 rounded-xl shadow-lg flex items-center gap-2 hover:shadow-xl transition"
        aria-label="Restore My Dashboard"
      >
        <span className="w-6 h-6 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-lg flex items-center justify-center">
          <i className="bi bi-speedometer2 text-white text-sm" />
        </span>
        <span className="text-sm font-medium text-gray-800">My Dashboard</span>
        <i className="bi bi-chevron-up text-gray-500" />
      </button>
    );
  }

  const frameSizing =
    winState === 'max'
      ? 'w-[95vw] h-[96vh] max-w-[95vw] max-h-[96vh]'
      : 'w-full max-w-7xl h-full max-h-[90vh]';

  return (
    <div className="fixed inset-0 z-[1000] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className={`bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col ${frameSizing}`}>
        
        {/* Header with window controls */}
        <div
          className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50 select-none"
          onDoubleClick={() => setWinState(s => (s === 'max' ? 'normal' : 'max'))}
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center">
              <i className="bi bi-speedometer2 text-white text-xl"></i>
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">My Dashboard</h2>
              <p className="text-gray-600">Personal workload and department overview</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setWinState('min')}
              className="text-gray-500 hover:text-gray-700 p-2 hover:bg-gray-100 rounded-lg"
              aria-label="Minimize"
            >
              <i className="bi bi-dash-lg text-xl" />
            </button>
            {winState !== 'max' ? (
              <button
                onClick={() => setWinState('max')}
                className="text-gray-500 hover:text-gray-700 p-2 hover:bg-gray-100 rounded-lg"
                aria-label="Maximize"
              >
                <i className="bi bi-fullscreen text-xl" />
              </button>
            ) : (
              <button
                onClick={() => setWinState('normal')}
                className="text-gray-500 hover:text-gray-700 p-2 hover:bg-gray-100 rounded-lg"
                aria-label="Restore"
              >
                <i className="bi bi-fullscreen-exit text-xl" />
              </button>
            )}
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 p-2 hover:bg-gray-100 rounded-lg"
              aria-label="Close"
            >
              <i className="bi bi-x-lg text-xl" />
            </button>
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-600">Loading your dashboard...</p>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-16 h-16 bg-red-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                <i className="bi bi-exclamation-triangle text-red-600 text-2xl"></i>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Unable to load dashboard</h3>
              <p className="text-gray-600 mb-4">{error}</p>
              <button
                onClick={loadDashboard}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Try Again
              </button>
            </div>
          </div>
        )}

        {/* Content */}
        {!loading && !error && dashboardData && (
          <>
            {/* Tabs */}
            <div className="px-6 pt-6">
              <div className="flex gap-1 rounded-xl bg-gray-100 p-1 w-fit">
                {[
                  { id: 'my-tickets', label: '👤 My Tickets', count: dashboardData.my_tickets.total },
                  { id: 'department-tickets', label: '🏢 Department Tickets', count: dashboardData.department_tickets.total },
                  { id: 'activity', label: '📈 Recent Activity', count: dashboardData.recent_activity.length },
                  // NEW tab
                  { id: 'insights', label: '🔎 Insights', count: 1 },
                ].map(tab => (
                  <button 
                    key={tab.id} 
                    onClick={() => setActiveTab(tab.id)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                      activeTab === tab.id 
                        ? 'bg-white shadow text-blue-600' 
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    {tab.label}
                    <span className="bg-gray-200 text-gray-700 px-2 py-1 rounded-full text-xs">
                      {tab.count}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Tab Panels */}
            <div className="flex-1 overflow-auto p-6">
              
              {/* My Tickets */}
              {activeTab === 'my-tickets' && (
                <div>
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-semibold text-gray-900">My Assigned Tickets</h3>
                    <div className="flex gap-2">
                      {Object.entries(dashboardData.my_tickets.counts).map(([status, count]) => (
                        <span 
                          key={status}
                          className={`px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(status)}`}
                        >
                          {status.charAt(0).toUpperCase() + status.slice(1)}: {count}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="grid gap-4">
                    {dashboardData.my_tickets.tickets.length === 0 ? (
                      <div className="text-center py-12">
                        <div className="w-16 h-16 bg-gray-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                          <i className="bi bi-ticket text-gray-400 text-2xl"></i>
                        </div>
                        <p className="text-gray-600">No tickets assigned to you yet</p>
                      </div>
                    ) : (
                      dashboardData.my_tickets.tickets.map((ticket) => (
                        <div 
                          key={ticket.id} 
                          className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow"
                        >
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-2">
                                <h4 
                                  className="font-semibold text-gray-900 cursor-pointer hover:text-blue-600"
                                  onClick={() => {
                                    if (onSelectTicket) {
                                      onSelectTicket(ticket.id);
                                      onClose();
                                    }
                                  }}
                                >
                                  #{ticket.id}
                                </h4>
                                <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(ticket.status)}`}>
                                  {ticket.status}
                                </span>
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getPriorityColor(ticket.priority)}`}>
                                  {ticket.priority}
                                </span>
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getLevelBadge(ticket.level)}`}>
                                  L{ticket.level}
                                </span>
                              </div>
                              <h5 
                                className="font-medium text-gray-800 mb-2 cursor-pointer hover:text-blue-600"
                                onClick={() => {
                                  if (onSelectTicket) {
                                    onSelectTicket(ticket.id);
                                    onClose();
                                  }
                                }}
                              >
                                {ticket.subject}
                              </h5>
                              <div className="flex items-center gap-4 text-sm text-gray-600 mb-2">
                                <span>👤 {ticket.requester_name}</span>
                                <span>🏢 {ticket.department.name}</span>
                                <span>📅 {dayjs(ticket.created_at).fromNow()}</span>
                              </div>
                              
                              <div className="flex items-center gap-2 mb-3">
                                <DashboardAssignmentPill 
                                  ticket={ticket} 
                                  onAssignmentChange={handleAssignmentChange} 
                                />
                                <DashboardDepartmentPill 
                                  ticket={ticket} 
                                  onDepartmentChange={handleDepartmentChange} 
                                />
                              </div>
                              
                              {ticket.latest_message_preview && (
                                <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded-lg">
                                  {ticket.latest_message_preview}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* Department Tickets */}
              {activeTab === 'department-tickets' && (
                <div>
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">
                        {dashboardData.department_tickets.department_name}
                      </h3>
                      {dashboardData.department_tickets.is_helpdesk_view && (
                        <p className="text-sm text-gray-600 mt-1">
                          Viewing tickets from all departments across the organization
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {Object.entries(dashboardData.department_tickets.counts).map(([status, count]) => (
                        <span 
                          key={status}
                          className={`px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(status)}`}
                        >
                          {status.charAt(0).toUpperCase() + status.slice(1)}: {count}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="grid gap-4">
                    {dashboardData.department_tickets.tickets.length === 0 ? (
                      <div className="text-center py-12">
                        <div className="w-16 h-16 bg-gray-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                          <i className="bi bi-building text-gray-400 text-2xl"></i>
                        </div>
                        <p className="text-gray-600">No tickets in your department yet</p>
                      </div>
                    ) : (
                      dashboardData.department_tickets.tickets.map((ticket) => (
                        <div 
                          key={ticket.id} 
                          className={`bg-white border rounded-xl p-4 hover:shadow-md transition-shadow ${
                            ticket.is_mine ? 'border-blue-200 bg-blue-50' : 'border-gray-200'
                          }`}
                        >
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-2">
                                <h4 
                                  className="font-semibold text-gray-900 cursor-pointer hover:text-blue-600"
                                  onClick={() => {
                                    if (onSelectTicket) {
                                      onSelectTicket(ticket.id);
                                      onClose();
                                    }
                                  }}
                                >
                                  #{ticket.id}
                                </h4>
                                {ticket.is_mine && (
                                  <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium">
                                    Mine
                                  </span>
                                )}
                                <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(ticket.status)}`}>
                                  {ticket.status}
                                </span>
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getPriorityColor(ticket.priority)}`}>
                                  {ticket.priority}
                                </span>
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getLevelBadge(ticket.level)}`}>
                                  L{ticket.level}
                                </span>
                              </div>
                              <h5 
                                className="font-medium text-gray-800 mb-2 cursor-pointer hover:text-blue-600"
                                onClick={() => {
                                  if (onSelectTicket) {
                                    onSelectTicket(ticket.id);
                                    onClose();
                                  }
                                }}
                              >
                                {ticket.subject}
                              </h5>
                              <div className="flex items-center gap-4 text-sm text-gray-600 mb-2">
                                <span>👤 {ticket.requester_name}</span>
                                <span>👨‍💼 {ticket.assigned_agent.name}</span>
                                {dashboardData.department_tickets.is_helpdesk_view && ticket.department && (
                                  <span>🏢 {ticket.department.name}</span>
                                )}
                                <span>📅 {dayjs(ticket.created_at).fromNow()}</span>
                              </div>
                              
                              <div className="flex items-center gap-2 mb-3">
                                <DashboardAssignmentPill 
                                  ticket={ticket} 
                                  onAssignmentChange={handleAssignmentChange} 
                                />
                                <DashboardDepartmentPill 
                                  ticket={ticket} 
                                  onDepartmentChange={handleDepartmentChange} 
                                />
                              </div>
                              
                              {ticket.latest_message_preview && (
                                <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded-lg">
                                  {ticket.latest_message_preview}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* Recent Activity */}
              {activeTab === 'activity' && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-6">Recent Activity (Last 7 Days)</h3>
                  <div className="space-y-4">
                    {dashboardData.recent_activity.length === 0 ? (
                      <div className="text-center py-12">
                        <div className="w-16 h-16 bg-gray-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                          <i className="bi bi-activity text-gray-400 text-2xl"></i>
                        </div>
                        <p className="text-gray-600">No recent activity</p>
                      </div>
                    ) : (
                      dashboardData.recent_activity.map((activity, index) => (
                        <div key={index} className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl">
                          <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                            <i className={`bi ${activity.action === 'updated' ? 'bi-pencil' : 'bi-chat-dots'} text-blue-600`}></i>
                          </div>
                          <div className="flex-1">
                            <p className="font-medium text-gray-900">
                              You {activity.action} ticket #{activity.id}
                            </p>
                            <p className="text-sm text-gray-600">{activity.subject}</p>
                            <p className="text-xs text-gray-500 mt-1">
                              {dayjs(activity.updated_at).fromNow()}
                            </p>
                          </div>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(activity.status)}`}>
                            {activity.status}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* NEW: Insights */}
              {activeTab === 'insights' && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-6">Insights</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                    <div className="p-4 rounded-xl border border-gray-200 bg-white">
                      <div className="text-xs text-gray-500 mb-1">My Open Tickets</div>
                      <div className="text-2xl font-bold text-gray-900">
                        {dashboardData?.my_tickets?.counts?.open ?? 0}
                      </div>
                    </div>
                    <div className="p-4 rounded-xl border border-gray-200 bg-white">
                      <div className="text-xs text-gray-500 mb-1">Dept Open</div>
                      <div className="text-2xl font-bold text-gray-900">
                        {dashboardData?.department_tickets?.counts?.open ?? 0}
                      </div>
                    </div>
                    <div className="p-4 rounded-xl border border-gray-200 bg-white">
                      <div className="text-xs text-gray-500 mb-1">Escalated</div>
                      <div className="text-2xl font-bold text-gray-900">
                        {dashboardData?.department_tickets?.counts?.escalated ?? 0}
                      </div>
                    </div>
                    <div className="p-4 rounded-xl border border-gray-200 bg-white">
                      <div className="text-xs text-gray-500 mb-1">Closed (7d)</div>
                      <div className="text-2xl font-bold text-gray-900">
                        {
                          (dashboardData?.recent_activity || []).filter(a => a.status === 'closed').length
                        }
                      </div>
                    </div>
                  </div>

                  <div className="bg-white border border-gray-200 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="font-semibold text-gray-900">Quick Wins</h4>
                      <span className="text-xs text-gray-500">
                        Based on your recent activity
                      </span>
                    </div>
                    <ul className="space-y-2">
                      {(dashboardData?.my_tickets?.tickets || []).slice(0, 5).map(t => (
                        <li key={t.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <div className="flex items-center gap-3">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getPriorityColor(t.priority)}`}>
                              {t.priority}
                            </span>
                            <span className="text-gray-800 font-medium">#{t.id} — {t.subject}</span>
                          </div>
                          <button
                            onClick={() => {
                              if (onSelectTicket) {
                                onSelectTicket(t.id);
                                onClose();
                              }
                            }}
                            className="text-sm px-3 py-1 rounded-md border border-blue-200 text-blue-700 hover:bg-blue-50"
                          >
                            Open
                          </button>
                        </li>
                      ))}
                      {(!dashboardData?.my_tickets?.tickets || dashboardData.my_tickets.tickets.length === 0) && (
                        <li className="text-sm text-gray-500 p-3">Nothing to show here yet.</li>
                      )}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
