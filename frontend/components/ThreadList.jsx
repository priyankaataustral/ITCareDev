// frontend/components/ThreadList.jsx
'use client';
import React, { useEffect, useState } from 'react';
import Gate from './Gate';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useAuth } from '../components/AuthContext';
import { apiGet, apiPost, apiPatch } from '../lib/apiClient'; // <— use centralized client
import DepartmentOverridePill from '../components/DepartmentOverridePill';

dayjs.extend(relativeTime);

const FALLBACK_DEPTS = [
  { id: 1, name: 'ERP' },
  { id: 2, name: 'CRM' },
  { id: 3, name: 'SRM' },
  { id: 4, name: 'Network' },
  { id: 5, name: 'Security' },
];

// Professional Assignment Pill Component
const AssignmentPill = ({ ticket, onAssignmentChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [currentAgent, setCurrentAgent] = useState(null);
  
  useEffect(() => {
    // Find current assigned agent name
    if (ticket.assigned_to && agents.length > 0) {
      const agent = agents.find(a => a.id === ticket.assigned_to);
      setCurrentAgent(agent);
    }
  }, [ticket.assigned_to, agents]);
  
  const handleDropdownOpen = async () => {
    if (!isOpen && ticket.department_id) {
      setLoading(true);
      try {
        const response = await apiGet(`/agents?department_id=${ticket.department_id}`);
        setAgents(response.agents || []);
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
  
  return (
    <div className="relative inline-block">
      <button
        onClick={handleDropdownOpen}
        className="px-3 py-1.5 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 text-blue-700 text-xs font-medium rounded-lg hover:from-blue-100 hover:to-indigo-100 transition-all duration-200 flex items-center gap-1.5 shadow-sm"
      >
        <span>👤</span>
        {currentAgent ? (
          <span>Assigned: {currentAgent.name}</span>
        ) : (
          <span>Unassigned</span>
        )}
        <span className="text-[10px]">▼</span>
      </button>
      
      {isOpen && (
        <div className="absolute top-full left-0 mt-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-50 min-w-[180px] overflow-hidden">
          <div className="py-2">
            <button
              onClick={() => handleAssign(null)}
              className="w-full text-left px-4 py-2 text-sm hover:bg-red-50 dark:hover:bg-red-900/50 rounded transition-colors flex items-center gap-2"
            >
              <span className="text-red-500">🚫</span>
              <span>Unassign</span>
            </button>
            {loading ? (
              <div className="px-4 py-2 text-sm text-gray-500">Loading agents...</div>
            ) : (
              agents.map(agent => (
                <button
                  key={agent.id}
                  onClick={() => handleAssign(agent.id)}
                  className={`w-full text-left px-4 py-2 text-sm hover:bg-blue-50 dark:hover:bg-blue-900/50 transition-colors flex items-center justify-between ${
                    ticket.assigned_to === agent.id ? 'bg-blue-50 dark:bg-blue-900/50 text-blue-700' : 'text-gray-700'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 bg-gradient-to-r from-blue-100 to-indigo-100 rounded-full flex items-center justify-center text-xs font-semibold text-blue-600">
                    {(agent?.name || '?').charAt(0)}
                    </span>
                    <div>
                      <div className="font-medium">{agent.name}</div>
                      <div className="text-xs text-gray-500">{agent.role}</div>
                    </div>
                  </div>
                  {ticket.assigned_to === agent.id && <span className="text-blue-500">✓</span>}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// Department Override Pill Component
// Add this DepartmentOverridePill component after the AssignmentPill component (around line 95)



export default function ThreadList({
  onSelect,
  threads: threadsProp = [],
  selectedId,
  departments = [],
}) {
  const [threads, setThreads] = useState(threadsProp);
  // No polling: only update thread list on mount/prop change or after ticket view
  const [loading, setLoading] = useState(!threadsProp?.length);
  const [error, setError] = useState(null);
  const { token, agent } = useAuth();

  const [overrideOpen, setOverrideOpen] = useState({});     // { [id]: boolean }
  const [overrideDept, setOverrideDept] = useState({});     // { [id]: number|null }
  const [overrideReason, setOverrideReason] = useState({}); // { [id]: string }
  const [saving, setSaving] = useState({});                 // { [id]: boolean }

  const [summaries, setSummaries] = useState({});
  const [activeDeptId, setActiveDeptId] = useState('all');

  // Load threads if parent didn't supply them
  useEffect(() => {
    if (threadsProp?.length) {
      setThreads(threadsProp);
      setLoading(false);
      return;
    }
    setLoading(true);

    apiGet(`/threads?limit=20&offset=0`)
      .then((response) => {
        setThreads(response.threads || []);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load threads:', err);
        setError('Failed to load threads');
        setLoading(false);
      });
  }, [threadsProp]);

  // Load escalation summaries for tickets
  const loadSummary = async (threadId) => {
    if (summaries[threadId]) return summaries[threadId];
    try {
      const response = await apiGet(`/escalation-summaries?ticket_id=${threadId}`);
      const summary = response.escalation_summaries?.[0];
      setSummaries(prev => ({ ...prev, [threadId]: summary }));
      return summary;
    } catch (err) {
      console.error(`Failed to load summary for ${threadId}:`, err);
      return null;
    }
  };

  // Handle assignment change
  const handleAssignmentChange = async (ticketId, agentId) => {
    try {
      const response = await apiPost(`/threads/${ticketId}/assign`, {
        agent_id: agentId
      });
      
      // Update local state
      setThreads(prevThreads =>
        (prevThreads || []).map(thread =>
          thread.id === ticketId
            ? { ...thread, assigned_to: agentId }
            : thread
        )
      );
      
    } catch (error) {
      console.error('Failed to assign ticket:', error);
      alert('Failed to update assignment');
    }
  };

  // Handle department change
  const handleDepartmentChange = async (ticketId, departmentId, reason) => {
    try {
      const response = await apiPatch(`/threads/${ticketId}/department`, {
        department_id: departmentId,
        reason: reason
      });
      
      // Update local state
      setThreads(prevThreads =>
        (prevThreads || []).map(thread =>
          thread.id === ticketId
            ? { ...thread, department_id: departmentId }
            : thread
        )
      );
      
      alert('Department changed successfully');
      
    } catch (error) {
      console.error('Failed to change department:', error);
      alert(`Failed to change department: ${error.message}`);
      throw error;
    }
  };

  const handleBulkUpdate = async (threadId) => {
    if (saving[threadId]) return;

    const summary = summaries[threadId];
    if (!summary) {
      alert('Please load the summary first');
      return;
    }

    if (!overrideDept[threadId] || !overrideReason[threadId]?.trim()) {
      alert('Please select a department and provide a reason');
      return;
    }

    setSaving(prev => ({ ...prev, [threadId]: true }));

    try {
      const payload = {
        department_id: overrideDept[threadId],
        reason: overrideReason[threadId].trim(),
        agent_id: null
      };

      const response = await apiPost(`/threads/${threadId}/escalate`, payload);

      // Reset states
      setOverrideOpen(prev => ({ ...prev, [threadId]: false }));
      setOverrideDept(prev => ({ ...prev, [threadId]: null }));
      setOverrideReason(prev => ({ ...prev, [threadId]: '' }));

      // Update thread status locally
      setThreads(prevThreads =>
        (prevThreads || []).map(thread =>
          thread.id === threadId
            ? { ...thread, status: 'escalated', department_id: payload.department_id }
            : thread
        )
      );

      alert('Ticket escalated successfully');
    } catch (error) {
      console.error('Escalation failed:', error);
      alert('Failed to escalate ticket');
    } finally {
      setSaving(prev => ({ ...prev, [threadId]: false }));
    }
  };

  if (loading) return <div className="p-4 text-center text-gray-500">Loading tickets...</div>;
  if (error) return <div className="p-4 text-center text-red-500">{error}</div>;

  const filteredThreads = (threads || []).filter(t => {
    if (activeDeptId === 'all') return true;
    return t.department_id === parseInt(activeDeptId);
  });

  const departmentsList = departments.length > 0 ? departments : FALLBACK_DEPTS;

  return (
    <div className="space-y-4 max-h-[calc(100vh-200px)] overflow-y-auto p-2">
      {filteredThreads.map((t) => {
        const isSelected = selectedId === t.id;
        const dept = departmentsList.find(d => d.id === t.department_id);
        const deptName = dept?.name || 'Unknown';
        
        const updatedTs = t.updated_at || t.lastActivity;

        return (
          <div
            key={t.id}
            onClick={() => onSelect?.(t.id)}
            className={`relative p-4 border rounded-xl cursor-pointer transition-all duration-300 ${
              isSelected
                ? 'border-blue-500 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 shadow-lg ring-2 ring-blue-200'
                : 'border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600 hover:shadow-md bg-white dark:bg-gray-800'
            }`}
          >
            {/* Header with Status Badge */}
            <div className="flex justify-between items-start mb-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-mono text-gray-500 bg-gray-100 px-2 py-1 rounded-md">#{t.id}</span>
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                    t.status === 'open' ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' :
                    t.status === 'closed' ? 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300' :
                    t.status === 'escalated' ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' :
                    'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                  }`}>
                    {String(t.status || 'open').toUpperCase()}
                  </span>
                </div>
                <h3 className={`font-semibold text-sm leading-tight ${
                  isSelected ? 'text-blue-900 dark:text-blue-100' : 'text-gray-900 dark:text-gray-100'
                }`}>
                  {t.subject || 'No subject'}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 bg-blue-50 px-2 py-1 rounded-md">
                  Level {t.level}
                </span>
              </div>
            </div>

            {/* Content Section */}
            <div className="space-y-2 mb-3">
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1">
                  <span className="text-xs text-gray-500">👤</span>
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{t.requester_name}</span>
                </div>
                <span className="text-xs text-gray-400">•</span>
                <span className="text-xs text-gray-500">{t.requester_email}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">🏢</span>
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{deptName}</span>
                <span className="text-xs text-gray-400">•</span>
                <span className="text-xs text-gray-500">Priority: {t.priority}</span>
              </div>
            </div>

            {/* Action Section */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <AssignmentPill 
                  ticket={t} 
                  onAssignmentChange={handleAssignmentChange}
                />

              {/* Department Override Button - Add this */}
                <div onClick={(e) => e.stopPropagation()}>
                  <DepartmentOverridePill
                    ticket={t}
                    onDepartmentChange={handleDepartmentChange}
                  />
                </div>
              </div>
              
              {/* Archive Button for Closed Tickets */}
              <div className="flex items-center gap-2">
                {(t.status === 'closed' || t.status === 'resolved') && !t.archived && (
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      // Handle archive action
                    }}
                    className="px-2 py-1 text-xs bg-purple-100 text-purple-700 rounded-md hover:bg-purple-200 transition-colors flex items-center gap-1"
                  >
                    📦 Archive
                  </button>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="border-t border-gray-100 dark:border-gray-700 pt-2 mt-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  Last activity: {dayjs(updatedTs || t.lastActivity).fromNow()}
                </span>
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                    t.archived ? 'bg-gray-500 text-white' :
                    t.status === 'open' ? 'bg-green-500 text-white' :
                    t.status === 'escalated' ? 'bg-orange-500 text-white' :
                    t.status === 'closed' ? 'bg-red-500 text-white' :
                    t.status === 'resolved' ? 'bg-blue-500 text-white' :
                    'bg-gray-400 text-white'
                  }`}>
                    <span>{
                      t.archived ? '📦' :
                      t.status === 'open' ? '🟢' :
                      t.status === 'escalated' ? '🟠' :
                      t.status === 'closed' ? '🔴' :
                      t.status === 'resolved' ? '🔵' :
                      '❓'
                    }</span>
                    <span>{t.archived ? 'Archived' : t.status}</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
