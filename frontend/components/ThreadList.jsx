// frontend/components/ThreadList.jsx
'use client';

import React, { useEffect, useState } from 'react';
import Gate from './Gate';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useAuth } from '../components/AuthContext';
import { apiGet, apiPost, apiPatch } from '../lib/apiClient'; // <— use centralized client

dayjs.extend(relativeTime);

const FALLBACK_DEPTS = [
  { id: 1, name: 'ERP' },
  { id: 2, name: 'CRM' },
  { id: 3, name: 'SRM' },
  { id: 4, name: 'Network' },
  { id: 5, name: 'Security' },
];

// Assignment Pill Component
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
        className="px-2 py-0.5 bg-green-50 dark:bg-green-900 text-green-800 dark:text-green-200 text-[11px] font-medium rounded-full hover:bg-green-100 transition-colors flex items-center gap-1"
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
        <div className="absolute top-full left-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg z-50 min-w-[150px]">
          <div className="p-1">
            <button
              onClick={() => handleAssign(null)}
              className="w-full text-left px-2 py-1 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
            >
              🚫 Unassign
            </button>
            {loading ? (
              <div className="px-2 py-1 text-xs text-gray-500">Loading...</div>
            ) : (
              agents.map(agent => (
                <button
                  key={agent.id}
                  onClick={() => handleAssign(agent.id)}
                  className={`w-full text-left px-2 py-1 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 rounded ${
                    ticket.assigned_to === agent.id ? 'bg-green-50 dark:bg-green-900' : ''
                  }`}
                >
                  👤 {agent.name} ({agent.role})
                  {ticket.assigned_to === agent.id && ' ✓'}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

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
        prevThreads.map(thread =>
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
        prevThreads.map(thread =>
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

  const filteredThreads = threads.filter(t => {
    if (activeDeptId === 'all') return true;
    return t.department_id === parseInt(activeDeptId);
  });

  const departmentsList = departments.length > 0 ? departments : FALLBACK_DEPTS;

  return (
    <div className="space-y-3 max-h-[calc(100vh-200px)] overflow-y-auto">
      {filteredThreads.map((t) => {
        const isSelected = selectedId === t.id;
        const dept = departmentsList.find(d => d.id === t.department_id);
        const deptName = dept?.name || 'Unknown';
        
        const updatedTs = t.updated_at || t.lastActivity;

        return (
          <div
            key={t.id}
            onClick={() => onSelect?.(t.id)}
            className={`relative p-3 border rounded-lg cursor-pointer transition-all duration-200 ${
              isSelected
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 shadow-md'
                : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-sm'
            }`}
          >
            {/* Header */}
            <div className="flex justify-between items-start mb-2">
              <h3 className={`font-medium text-sm ${
                isSelected ? 'text-blue-900 dark:text-blue-100' : 'text-gray-900 dark:text-gray-100'
              }`}>
                #{t.id} - {t.subject}
              </h3>
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 text-[10px] font-medium rounded-full ${
                  t.status === 'open' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                  t.status === 'closed' ? 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200' :
                  t.status === 'escalated' ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' :
                  'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                }`}>
                  {t.status.toUpperCase()}
                </span>
              </div>
            </div>

            {/* Content */}
            <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
              <strong>From:</strong> {t.requester_name} ({t.requester_email})
            </p>
            <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
              <strong>Department:</strong> {deptName}
            </p>

            {/* Pills */}
            <div className="flex flex-wrap gap-1 mb-2">
              <span className="px-2 py-0.5 bg-blue-50 dark:bg-blue-900 text-blue-800 dark:text-blue-200 text-[11px] font-medium rounded-full">
                Level: {t.level}
              </span>
              <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-[11px] font-medium rounded-full">
                Status: {t.status}
              </span>
            </div>

            {/* Assignment Pill */}
            <AssignmentPill 
              ticket={t} 
              onAssignmentChange={handleAssignmentChange}
            />

            {/* Footer */}
            <div className="border-t border-gray-100 dark:border-gray-800 pt-1 mt-1">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Last activity: {dayjs(updatedTs || t.lastActivity).fromNow()}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
