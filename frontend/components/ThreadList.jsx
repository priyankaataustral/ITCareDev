// frontend/components/ThreadList.jsx
'use client';
import React, { useEffect, useState } from 'react';
import Gate from './Gate';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useAuth } from '../components/AuthContext';
import { apiGet, apiPost, apiPatch, API_BASE } from '../lib/apiClient'; // <— use centralized client

const authHeaders = () => {
  try {
    const authToken = localStorage.getItem('authToken');
    return authToken ? { Authorization: `Bearer ${authToken}` } : {};
  } catch {
    return {};
  }
};
// DepartmentOverridePill component will be defined inline below

dayjs.extend(relativeTime);

const FALLBACK_DEPTS = [
  { id: 1, name: 'ERP' },
  { id: 2, name: 'CRM' },
  { id: 3, name: 'SRM' },
  { id: 4, name: 'Network' },
  { id: 5, name: 'Security' },
];

// Save Proposed Fix Button Component
const SaveProposedFixButton = ({ ticket }) => {
  const [isSaved, setIsSaved] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [savedFix, setSavedFix] = useState(null);
  
  // Check if this ticket has a saved fix
  useEffect(() => {
    try {
      const savedFixes = JSON.parse(localStorage.getItem('savedProposedFixes') || '{}');
      setIsSaved(!!savedFixes[ticket.id]);
    } catch (error) {
      console.error('Error checking saved fixes:', error);
    }
  }, [ticket.id]);
  
  const handleSaveProposedFix = async (e) => {
    e.stopPropagation();
    setIsLoading(true);
    
    try {
      // Fetch the proposed fix from the API
      const response = await apiGet(`/tickets/${ticket.id}/ai-proposed-fix`);
      
      if (response.proposed_fix) {
        // Save to localStorage
        const savedFixes = JSON.parse(localStorage.getItem('savedProposedFixes') || '{}');
        savedFixes[ticket.id] = {
          ...response.proposed_fix,
          ticket_subject: ticket.subject,
          ticket_id: ticket.id,
          saved_at: new Date().toISOString()
        };
        
        localStorage.setItem('savedProposedFixes', JSON.stringify(savedFixes));
        setIsSaved(true);
        
        // Show quick success message
        const originalText = e.target.textContent;
        e.target.textContent = '✅ Saved!';
        setTimeout(() => {
          if (e.target) e.target.textContent = originalText;
        }, 2000);
      }
    } catch (error) {
      console.error('Failed to save proposed fix:', error);
      alert('Failed to save proposed fix. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleViewSavedFix = (e) => {
    e.stopPropagation();
    
    try {
      const savedFixes = JSON.parse(localStorage.getItem('savedProposedFixes') || '{}');
      const fix = savedFixes[ticket.id];
      
      if (fix) {
        setSavedFix(fix);
        setShowModal(true);
      }
    } catch (error) {
      console.error('Error viewing saved fix:', error);
      alert('Error loading saved fix.');
    }
  };
  
  const handleCopyToClipboard = async () => {
    if (!savedFix) return;
    
    const fixText = `Proposed Fix for Ticket #${ticket.id}: ${ticket.subject}\n\n` +
                   `Confidence: ${savedFix.confidence}%\n` +
                   `Risk Level: ${savedFix.risk_level}\n\n` +
                   `AI Analysis:\n${savedFix.reasoning}\n\n` +
                   `Solution:\n${savedFix.content}`;
    
    try {
      await navigator.clipboard.writeText(fixText);
      alert('Solution copied to clipboard!');
    } catch (error) {
      console.error('Failed to copy:', error);
      alert('Failed to copy to clipboard');
    }
  };
  
  const handleRemoveSaved = (e) => {
    e.stopPropagation();
    
    try {
      const savedFixes = JSON.parse(localStorage.getItem('savedProposedFixes') || '{}');
      delete savedFixes[ticket.id];
      localStorage.setItem('savedProposedFixes', JSON.stringify(savedFixes));
      setIsSaved(false);
      setShowModal(false);
    } catch (error) {
      console.error('Error removing saved fix:', error);
    }
  };
  
  if (isSaved) {
    return (
      <>
        <button
          onClick={handleViewSavedFix}
          className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 transition-colors flex items-center gap-1 font-medium"
          title="View saved proposed fix"
        >
          🔖 Saved
        </button>
        
        {/* Saved Fix Modal */}
        {showModal && savedFix && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowModal(false)}>
            <div className="bg-white rounded-lg p-6 max-w-2xl max-h-[80vh] overflow-y-auto m-4" onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-gray-900">
                  💡 Saved Fix for Ticket #{ticket.id}
                </h3>
                <button
                  onClick={() => setShowModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>
              
              <div className="space-y-4">
                <div>
                  <h4 className="font-medium text-gray-700">Ticket Subject:</h4>
                  <p className="text-gray-600">{ticket.subject}</p>
                </div>
                
                <div className="flex gap-4">
                  <div>
                    <span className="text-sm font-medium">Confidence: </span>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      savedFix.confidence >= 80 ? 'bg-green-100 text-green-700' :
                      savedFix.confidence >= 60 ? 'bg-yellow-100 text-yellow-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {savedFix.confidence}%
                    </span>
                  </div>
                  <div>
                    <span className="text-sm font-medium">Risk Level: </span>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      savedFix.risk_level === 'low' ? 'bg-green-100 text-green-700' :
                      savedFix.risk_level === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {savedFix.risk_level}
                    </span>
                  </div>
                </div>
                
                <div>
                  <h4 className="font-medium text-gray-700 mb-2">AI Analysis:</h4>
                  <div className="bg-blue-50 p-3 rounded-md">
                    <p className="text-gray-700 text-sm">{savedFix.reasoning}</p>
                  </div>
                </div>
                
                <div>
                  <h4 className="font-medium text-gray-700 mb-2">Proposed Solution:</h4>
                  <div className="bg-gray-50 p-3 rounded-md">
                    <p className="text-gray-700 text-sm whitespace-pre-wrap">{savedFix.content}</p>
                  </div>
                </div>
                
                <div className="text-xs text-gray-500">
                  Saved on: {new Date(savedFix.saved_at).toLocaleString()}
                </div>
              </div>
              
              <div className="flex gap-2 mt-6">
                <button
                  onClick={handleCopyToClipboard}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                >
                  📋 Copy Solution
                </button>
                <button
                  onClick={handleRemoveSaved}
                  className="px-4 py-2 bg-red-100 text-red-700 rounded-md hover:bg-red-200 transition-colors"
                >
                  🗑️ Remove
                </button>
                <button
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }
  
  return (
    <button
      onClick={handleSaveProposedFix}
      disabled={isLoading}
      className={`px-2 py-1 text-xs rounded-md transition-colors flex items-center gap-1 font-medium ${
        isLoading 
          ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
          : 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
      }`}
      title="Save proposed fix for later reference"
    >
      {isLoading ? '⏳ Saving...' : '🔖 Save Fix'}
    </button>
  );
};

// Professional Assignment Pill Component
const AssignmentPill = ({ ticket, onAssignmentChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [currentAgent, setCurrentAgent] = useState(null);
  const { agent: currentUser } = useAuth();
  
  useEffect(() => {
    // Find current assigned agent name
    if (ticket.assigned_to && agents.length > 0) {
      const agent = agents.find(a => a.id === ticket.assigned_to);
      setCurrentAgent(agent);
    }
  }, [ticket.assigned_to, agents]);
  
  // Check if user can assign tickets based on department routing rules
  // Backend requires L2, L3, or MANAGER role
  const canAssignTickets = () => {
    const isHelpdesk = currentUser?.department_id === 7;
    const isManager = currentUser?.role === 'MANAGER';
    const isL2OrL3 = ['L2', 'L3'].includes(currentUser?.role);
    const isL1 = currentUser?.role === 'L1';
    
    // Debug logging
    console.log('Assignment Debug:', {
      currentUser,
      ticket,
      isHelpdesk,
      isManager,
      isL2OrL3,
      isL1,
      userDept: currentUser?.department_id,
      ticketDept: ticket.department_id,
      userRole: currentUser?.role,
      backendRequirement: 'L2, L3, or MANAGER only'
    });
    
    // Backend endpoint requires L2, L3, or MANAGER role
    if (!isManager && !isL2OrL3) {
      console.log('Assignment blocked: User role not L2/L3/MANAGER');
      return false;
    }
    
    // Helpdesk can assign to anyone within the ticket's department
    if (isHelpdesk) {
      console.log('Assignment allowed: Helpdesk user');
      return true;
    }
    
    // Managers can assign within their own department OR to Helpdesk (for escalation/routing)
    if (isManager) {
      console.log('Assignment allowed: Manager can assign within own dept or to Helpdesk');
      return true;
    }
    
    // L2/L3 can only assign within their own department
    if (isL2OrL3 && currentUser?.department_id === ticket.department_id) {
      console.log('Assignment allowed: L2/L3 within same department');
      return true;
    }
    
    console.log('Assignment blocked: No valid permission found');
    return false;
  };
  
  const getTargetDepartmentForAgents = () => {
    const isHelpdesk = currentUser?.department_id === 7;
    const isManager = currentUser?.role === 'MANAGER';
    
    if (isHelpdesk) {
      // Helpdesk can assign to agents in the ticket's current department
      return ticket.department_id;
    } else if (isManager) {
      // Managers can assign within their own department OR to Helpdesk (dept 7)
      // For the assignment dropdown, show agents from the ticket's current department
      // but also include Helpdesk agents for routing purposes
      return ticket.department_id;
    } else {
      // L2/L3 can only assign within their own department
      return currentUser?.department_id;
    }
  };
  
  const handleDropdownOpen = async () => {
    if (!canAssignTickets()) {
      return; // Don't open if user doesn't have permission
    }
    
    if (!isOpen) {
      setLoading(true);
      try {
        const isManager = currentUser?.role === 'MANAGER';
        const isHelpdesk = currentUser?.department_id === 7;
        
        if (isManager && !isHelpdesk) {
          // Managers from other departments can assign to their own dept + Helpdesk
          const [ownDeptResponse, helpdeskResponse] = await Promise.all([
            apiGet(`/agents?department_id=${currentUser.department_id}`),
            apiGet(`/agents?department_id=7`) // Helpdesk
          ]);
          
          const ownDeptAgents = ownDeptResponse.agents || [];
          const helpdeskAgents = helpdeskResponse.agents || [];
          
          // Combine and deduplicate agents
          const allAgents = [...ownDeptAgents, ...helpdeskAgents];
          const uniqueAgents = allAgents.filter((agent, index, self) => 
            index === self.findIndex(a => a.id === agent.id)
          );
          
          setAgents(uniqueAgents);
        } else {
          // Helpdesk or L2/L3: use single department
          const targetDepartmentId = getTargetDepartmentForAgents();
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
  
  // Show assignment pill with appropriate permissions
  const hasAssignPermission = canAssignTickets();
  
  if (!hasAssignPermission) {
    const userRole = currentUser?.role;
    const isL1 = userRole === 'L1';
    const isInValidDepartment = currentUser?.department_id === 7; // Helpdesk
    
    return (
      <div className="px-3 py-1.5 bg-gray-50 border border-gray-200 text-gray-500 text-xs font-medium rounded-lg flex items-center gap-1.5 shadow-sm">
        <span>👤</span>
        {currentAgent ? (
          <span>Assigned: {currentAgent.name}</span>
        ) : (
          <span>Unassigned</span>
        )}
        <span className="text-xs text-gray-400">
          {isL1 && !isInValidDepartment 
            ? '(L1 only in Helpdesk)' 
            : '(Need L2/L3/Manager)'
          }
        </span>
      </div>
    );
  }

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
              className="w-full text-left px-4 py-2 text-sm hover:bg-rose-50 dark:hover:bg-rose-900/50 rounded transition-colors flex items-center gap-2"
            >
              <span className="text-rose-500">🚫</span>
              <span>Unassign</span>
            </button>
            {loading ? (
              <div className="px-4 py-2 text-sm text-gray-500">Loading agents...</div>
            ) : agents.length > 0 ? (
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
            ) : (
              <div className="px-4 py-2 text-sm text-gray-500">
                {currentUser?.department_id === 7 
                  ? 'No agents in this department' 
                  : 'No agents available in your department'
                }
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// Department Override Pill Component
const DepartmentOverridePill = ({ ticket, onDepartmentChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [reason, setReason] = useState('');
  const { agent: currentUser } = useAuth();
  
  // Get current department info
  const currentDept = departments.find(d => d.id === ticket.department_id);
  
  // Check if user can change departments based on your routing rules
  // Backend requires L2, L3, or MANAGER role
  const canChangeDepartment = () => {
    const isHelpdesk = currentUser?.department_id === 7;
    const isManager = currentUser?.role === 'MANAGER';
    const isL2OrL3 = ['L2', 'L3'].includes(currentUser?.role);
    const isL1 = currentUser?.role === 'L1';
    
    
    // Backend endpoint requires L2, L3, or MANAGER role
    if (!isManager && !isL2OrL3) {
      return false;
    }
    
    // Only Helpdesk L2/L3/Managers and other department L2/L3/Managers can change departments
    return isHelpdesk || isManager || isL2OrL3;
  };
  
  const getAvailableDepartments = () => {
    if (!departments.length) return [];
    
    const isHelpdesk = currentUser?.department_id === 7;
    const isManager = currentUser?.role === 'MANAGER';
    const isL2OrL3 = ['L2', 'L3'].includes(currentUser?.role);
    
    
    if (isHelpdesk) {
      // Helpdesk can route to any department
      return departments.filter(dept => dept.id !== ticket.department_id);
    } else if (isManager && currentUser?.department_id !== 7) {
      // Department managers can only send back to Helpdesk (id: 7)
      return departments.filter(dept => dept.id === 7);
    } else if (isL2OrL3 && currentUser?.department_id !== 7) {
      // L2/L3 from other departments can only send back to Helpdesk (id: 7)
      return departments.filter(dept => dept.id === 7);
    }
    
    return [];
  };
  
  const handleDropdownOpen = async () => {
    // Check if user has permission before opening
    if (!canChangeDepartment()) {
      return;
    }
    
    if (!isOpen) {
      setLoading(true);
      try {
        const response = await apiGet('/departments');
        const fetchedDepartments = response.departments || response || [];
        setDepartments(fetchedDepartments);
        
      } catch (error) {
        console.error('Failed to fetch departments:', error);
        setLoading(false);
        return; // Don't open dropdown on error
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
  
  // Show a disabled state instead of hiding completely when user doesn't have permission
  if (!canChangeDepartment()) {
    const userRole = currentUser?.role;
    const isL1 = userRole === 'L1';
    const isInValidDepartment = currentUser?.department_id === 7; // Helpdesk
    
    const tooltipMessage = !currentUser?.department_id 
      ? 'Please log out and log back in to refresh permissions'
      : isL1 && !isInValidDepartment 
        ? 'L1 role only allowed in Helpdesk department' 
        : 'Requires L2, L3, or Manager role';
    
    return (
      <div className="px-3 py-1.5 bg-gray-50 border border-gray-200 text-gray-500 text-xs font-medium rounded-lg flex items-center gap-1.5 shadow-sm cursor-not-allowed" title={tooltipMessage}>
        <span>🏢</span>
        <span>{currentDept?.name || 'Dept'}</span>
        <span className="text-xs text-gray-400">
          {!currentUser?.department_id
            ? '(Re-login needed)'
            : isL1 && !isInValidDepartment 
              ? '(L1 → Helpdesk only)' 
              : '(Need L2/L3/Manager)'
          }
        </span>
      </div>
    );
  }
  
  const availableDepts = getAvailableDepartments();
  
  
  return (
    <div className="relative inline-block">
      <button
        onClick={handleDropdownOpen}
        className="px-3 py-1.5 bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 text-purple-700 text-xs font-medium rounded-lg hover:from-purple-100 hover:to-pink-100 transition-all duration-200 flex items-center gap-1.5 shadow-sm"
      >
        <span>🏢</span>
        <span>{currentDept?.name || 'Dept'}</span>
        <span className="text-[10px]">▼</span>
      </button>
      
      {isOpen && (
        <div className="absolute top-full left-0 mt-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-50 min-w-[220px] overflow-hidden">
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
  // Department filtering is now handled by backend based on user's department

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
    console.log('Assignment attempt:', { ticketId, agentId, currentUser: agent });
    try {
      const response = await apiPost(`/threads/${ticketId}/assign`, {
        agent_id: agentId
      });
      
      console.log('Assignment successful:', response);
      
      // Update local state
      setThreads(prevThreads =>
        (prevThreads || []).map(thread =>
          thread.id === ticketId
            ? { ...thread, assigned_to: agentId }
            : thread
        )
      );
      
      alert('Assignment updated successfully');
      
    } catch (error) {
      console.error('Failed to assign ticket:', error);
      alert(`Failed to update assignment: ${error.message}`);
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

  // No frontend filtering needed - backend handles department visibility
  const filteredThreads = threads || [];

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
                  {/* <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                    t.status === 'open' ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' :
                    t.status === 'closed' ? 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300' :
                    t.status === 'escalated' ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' :
                    'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                  }`}>
                    {String(t.status || 'open').toUpperCase()}
                </span> */}
              </div>
                <h3 className={`font-semibold text-sm leading-tight ${
                  isSelected ? 'text-blue-900 dark:text-blue-100' : 'text-gray-900 dark:text-gray-100'
                }`}>
                  {t.subject || 'No subject'}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-600 bg-slate-100 px-2 py-1 rounded-md font-medium">
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

              {/* Department Override Button */}
                <div onClick={(e) => e.stopPropagation()}>
                  <DepartmentOverridePill
                    ticket={t}
                    onDepartmentChange={handleDepartmentChange}
                  />
                </div>
              </div>
              
              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                {/* Bookmark/Save Proposed Fix Button */}
                <SaveProposedFixButton ticket={t} />
                
                {/* Download Report for Escalated Tickets */}
                {(t.status === 'escalated' || t.level > 1) && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const url = `${API_BASE}/threads/${t.id}/download-summary`;
                      fetch(url, {
                        method: 'GET',
                        headers: authHeaders(),
                      })
                        .then(response => {
                          if (!response.ok) {
                            throw new Error('Failed to download report');
                          }
                          return response.blob();
                        })
                        .then(blob => {
                          const link = document.createElement('a');
                          link.href = window.URL.createObjectURL(blob);
                          link.download = `escalation_report_${t.id}.txt`;
                          document.body.appendChild(link);
                          link.click();
                          document.body.removeChild(link);
                        })
                        .catch(err => {
                          console.error('Download failed:', err);
                          alert('Failed to download escalation report');
                        });
                    }}
                    className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded-md hover:bg-green-200 transition-colors flex items-center gap-1 font-medium"
                    title="Download escalation report"
                  >
                    📄 Report
                  </button>
                )}
                
                {/* Archive Button for Closed Tickets */}
                {(t.status === 'closed' || t.status === 'resolved') && !t.archived && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      // Handle archive action
                    }}
                    className="px-2 py-1 text-xs bg-violet-100 text-violet-700 rounded-md hover:bg-violet-200 transition-colors flex items-center gap-1 font-medium"
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
