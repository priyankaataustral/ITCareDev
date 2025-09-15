import React, { useState, useEffect } from 'react';
import { apiGet } from '../lib/apiClient';

export default function EscalationPopup({ isOpen, onClose, onEscalate, ticketId }) {
  const [departments, setDepartments] = useState([]);
  const [agents, setAgents] = useState([]);
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [selectedAgent, setSelectedAgent] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(false);

  // Load departments and agents when popup opens
  useEffect(() => {
    if (isOpen) {
      setLoadingData(true);
      Promise.all([
        apiGet('/departments').catch(() => ({ departments: [] })),
        apiGet('/agents').catch(() => ({ agents: [] }))
      ])
        .then(([deptData, agentData]) => {
          setDepartments(Array.isArray(deptData) ? deptData : (deptData.departments || []));
          setAgents(Array.isArray(agentData) ? agentData : (agentData.agents || []));
        })
        .finally(() => setLoadingData(false));
    }
  }, [isOpen]);

  // Filter agents by selected department
  const filteredAgents = selectedDepartment 
    ? agents.filter(agent => agent.department_id === parseInt(selectedDepartment))
    : agents;

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!reason.trim()) {
      alert('Please provide a reason for escalation');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        reason: reason.trim(),
        department_id: selectedDepartment ? parseInt(selectedDepartment) : null,
        agent_id: selectedAgent ? parseInt(selectedAgent) : null
      };

      await onEscalate(payload);
      
      // Reset form
      setSelectedDepartment('');
      setSelectedAgent('');
      setReason('');
      onClose();
    } catch (error) {
      console.error('Escalation failed:', error);
      alert(`Escalation failed: ${error.message || error}`);
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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4 shadow-2xl">
        <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
          Escalate Ticket #{ticketId}
        </h3>
        
        {loadingData ? (
          <div className="text-center py-4">
            <div className="text-gray-500">Loading...</div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Department Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Target Department
              </label>
              <select
                value={selectedDepartment}
                onChange={(e) => {
                  setSelectedDepartment(e.target.value);
                  setSelectedAgent(''); // Reset agent when department changes
                }}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select Department (Optional)</option>
                {departments.map(dept => (
                  <option key={dept.id} value={dept.id}>
                    {dept.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Agent Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Assign to Agent
              </label>
              <select
                value={selectedAgent}
                onChange={(e) => setSelectedAgent(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={!filteredAgents.length}
              >
                <option value="">Select Agent (Optional)</option>
                {filteredAgents.map(agent => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name} ({agent.role})
                  </option>
                ))}
              </select>
              {selectedDepartment && !filteredAgents.length && (
                <p className="text-sm text-gray-500 mt-1">No agents found in selected department</p>
              )}
            </div>

            {/* Reason for Escalation */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Reason for Escalation *
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Please explain why this ticket needs to be escalated..."
                rows={3}
                required
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={handleCancel}
                disabled={loading}
                className="flex-1 px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-600 rounded-md hover:bg-gray-200 dark:hover:bg-gray-500 transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || !reason.trim()}
                className="flex-1 px-4 py-2 bg-orange-500 text-white rounded-md hover:bg-orange-600 transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Escalating...
                  </>
                ) : (
                  <>🛠 Escalate</>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
