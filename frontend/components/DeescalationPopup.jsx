import React, { useState, useEffect } from 'react';
import { apiGet } from '../lib/apiClient';
import { useAuth } from './AuthContext';

export default function DeescalationPopup({ isOpen, onClose, onDeescalate, ticketId, ticket }) {
  const [departments, setDepartments] = useState([]);
  const [agents, setAgents] = useState([]);
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [selectedAgent, setSelectedAgent] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const { agent: currentUser } = useAuth();

  // Department-specific routing logic matching escalation patterns
  const getAvailableDepartments = (allDepartments) => {
    if (!allDepartments.length) return [];
    
    const isHelpdesk = currentUser?.department_id === 7;
    const isManager = currentUser?.role === 'MANAGER';
    
    console.log('De-escalation Department Filtering:', {
      currentUser,
      isHelpdesk,
      isManager,
      userDept: currentUser?.department_id,
      ticketDept: ticket?.department_id
    });
    
    if (isHelpdesk) {
      // Helpdesk can de-escalate to any department
      return allDepartments;
    } else if (isManager) {
      // Department managers can de-escalate within their dept OR to Helpdesk
      return allDepartments.filter(dept => 
        dept.id === currentUser?.department_id || dept.id === 7
      );
    } else {
      // L2/L3 can only de-escalate within their own department
      return allDepartments.filter(dept => dept.id === currentUser?.department_id);
    }
  };
  
  const getAvailableAgents = (allAgents) => {
    if (!allAgents.length) return [];
    
    const isHelpdesk = currentUser?.department_id === 7;
    const isManager = currentUser?.role === 'MANAGER';
    
    console.log('De-escalation Agent Filtering:', {
      currentUser,
      isHelpdesk,
      isManager,
      totalAgents: allAgents.length
    });
    
    if (isHelpdesk) {
      // Helpdesk can de-escalate to agents in any department
      return allAgents;
    } else if (isManager) {
      // Department managers can de-escalate to agents in their dept OR Helpdesk
      return allAgents.filter(agent => 
        agent.department_id === currentUser?.department_id || agent.department_id === 7
      );
    } else {
      // L2/L3 can only de-escalate to agents within their own department
      return allAgents.filter(agent => agent.department_id === currentUser?.department_id);
    }
  };

  // Load departments and agents when popup opens
  useEffect(() => {
    if (isOpen) {
      setLoadingData(true);
      Promise.all([
        apiGet('/departments'),
        apiGet('/agents/management')
      ]).then(([deptData, agentData]) => {
        const availableDepartments = getAvailableDepartments(deptData.departments || []);
        const availableAgents = getAvailableAgents(agentData.agents || []);
        
        setDepartments(availableDepartments);
        setAgents(availableAgents);
        
        // Auto-select current ticket's department if available
        if (ticket?.department_id && availableDepartments.find(d => d.id === ticket.department_id)) {
          setSelectedDepartment(ticket.department_id.toString());
        }
        
        console.log('De-escalation data loaded:', {
          allDepartments: deptData.departments?.length || 0,
          availableDepartments: availableDepartments.length,
          allAgents: agentData.agents?.length || 0,
          availableAgents: availableAgents.length
        });
      }).catch(error => {
        console.error('Failed to load de-escalation data:', error);
        alert('Failed to load departments and agents');
      }).finally(() => {
        setLoadingData(false);
      });
    }
  }, [isOpen, currentUser, ticket]);

  // Filter agents by selected department (from already permission-filtered agents)
  const filteredAgents = selectedDepartment 
    ? agents.filter(agent => agent.department_id === parseInt(selectedDepartment))
    : agents;
    
  // Debug logging for agent filtering
  console.log('De-escalation Agent Filtering:', {
    selectedDepartment,
    totalAgents: agents.length,
    filteredAgents: filteredAgents.length,
    agentDepts: agents.map(a => ({ id: a.id, name: a.name, dept: a.department_id }))
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!reason.trim()) {
      alert('Please provide a reason for de-escalation');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        reason: reason.trim(),
        department_id: selectedDepartment ? parseInt(selectedDepartment) : null,
        agent_id: selectedAgent ? parseInt(selectedAgent) : null
      };

      await onDeescalate(payload);
      
      // Reset form
      setSelectedDepartment('');
      setSelectedAgent('');
      setReason('');
      onClose();
    } catch (error) {
      console.error('De-escalation failed:', error);
      alert(`De-escalation failed: ${error.message || error}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setSelectedDepartment('');
    setSelectedAgent('');
    setReason('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <span className="text-2xl">↩️</span>
              De-escalate Ticket
            </h2>
            <button
              onClick={handleCancel}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1"
              disabled={loading}
            >
              <i className="bi bi-x-lg text-xl"></i>
            </button>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
            Move this ticket to a lower support level with proper routing
          </p>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {loadingData ? (
            <div className="text-center py-8">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500"></div>
              <p className="text-gray-600 dark:text-gray-400 mt-2">Loading departments and agents...</p>
            </div>
          ) : (
            <>
              {/* Current Ticket Info */}
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                <h3 className="font-medium text-gray-900 dark:text-white mb-2">Current Ticket Status</h3>
                <div className="space-y-1 text-sm">
                  <p className="text-gray-600 dark:text-gray-400">
                    <span className="font-medium">Level:</span> L{ticket?.level || 1}
                  </p>
                  <p className="text-gray-600 dark:text-gray-400">
                    <span className="font-medium">Status:</span> {ticket?.status || 'open'}
                  </p>
                  <p className="text-gray-600 dark:text-gray-400">
                    <span className="font-medium">Current Department:</span> {
                      departments.find(d => d.id === ticket?.department_id)?.name || 'Unknown'
                    }
                  </p>
                </div>
              </div>

              {/* Reason Field */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Reason for De-escalation *
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Explain why this ticket should be de-escalated..."
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent dark:bg-gray-700 dark:text-white resize-none"
                  rows={3}
                  required
                />
              </div>

              {/* Department Selection */}
              {departments.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Target Department (Optional)
                  </label>
                  <select
                    value={selectedDepartment}
                    onChange={(e) => {
                      setSelectedDepartment(e.target.value);
                      setSelectedAgent(''); // Reset agent when department changes
                    }}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                  >
                    <option value="">Keep current department</option>
                    {departments.map(dept => (
                      <option key={dept.id} value={dept.id}>
                        {dept.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Leave empty to keep in current department
                  </p>
                </div>
              )}

              {/* Agent Selection */}
              {filteredAgents.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Assign to Agent (Optional)
                  </label>
                  <select
                    value={selectedAgent}
                    onChange={(e) => setSelectedAgent(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                  >
                    <option value="">No specific assignment</option>
                    {filteredAgents.map(agent => (
                      <option key={agent.id} value={agent.id}>
                        {agent.name} - {agent.role}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Leave empty for department pool assignment
                  </p>
                </div>
              )}

              {/* Warning if no routing options */}
              {departments.length === 0 && agents.length === 0 && (
                <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-lg p-4">
                  <div className="flex items-center gap-2">
                    <i className="bi bi-exclamation-triangle text-yellow-600 dark:text-yellow-400"></i>
                    <p className="text-sm text-yellow-700 dark:text-yellow-300">
                      No routing options available based on your permissions. De-escalation will proceed within current department.
                    </p>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={handleCancel}
              disabled={loading}
              className="flex-1 px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || loadingData || !reason.trim()}
              className="flex-1 px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  De-escalating...
                </>
              ) : (
                <>
                  <span>↩️</span>
                  De-escalate Ticket
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
