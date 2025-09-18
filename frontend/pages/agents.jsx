'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '../components/AuthContext';
import { apiGet, apiPost, apiPut, apiDelete } from '../lib/apiClient';

export default function AgentsPage() {
  const { agent } = useAuth();
  const [agents, setAgents] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingAgent, setEditingAgent] = useState(null);
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'L1',
    department_id: ''
  });

  // Role options
  const roleOptions = [
    { value: 'L1', label: 'L1 Support' },
    { value: 'L2', label: 'L2 Support' },
    { value: 'L3', label: 'L3 Support' },
    { value: 'MANAGER', label: 'Manager' }
  ];

  // Check permissions
  const canManageAgents = agent && ['L2', 'L3', 'MANAGER'].includes(agent.role);
  const canCreateDelete = agent && ['L3', 'MANAGER'].includes(agent.role);

  useEffect(() => {
    loadData();
  }, []);

  // Reload data when department filter changes
  useEffect(() => {
    loadData(departmentFilter);
  }, [departmentFilter]);

  const loadData = async (deptFilter = departmentFilter) => {
    setLoading(true);
    try {
      // Build agents URL with optional department filter
      let agentsUrl = '/agents/management';
      if (deptFilter && deptFilter !== 'all') {
        agentsUrl += `?department_id=${deptFilter}`;
      }
      
      const [agentsRes, deptRes] = await Promise.all([
        apiGet(agentsUrl),
        apiGet('/departments')
      ]);
      
      setAgents(agentsRes.agents || []);
      setDepartments(deptRes.departments || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingAgent) {
        // Update existing agent
        await apiPut(`/agents/${editingAgent.id}`, formData);
      } else {
        // Create new agent
        await apiPost('/agents', formData);
      }
      
      await loadData(departmentFilter);
      resetForm();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (agentId) => {
    if (!window.confirm('Are you sure you want to delete this agent?')) return;
    
    try {
      await apiDelete(`/agents/${agentId}`);
      await loadData(departmentFilter);
    } catch (err) {
      setError(err.message);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      email: '',
      password: '',
      role: 'L1',
      department_id: ''
    });
    setEditingAgent(null);
    setShowAddModal(false);
  };

  const startEdit = (agent) => {
    setFormData({
      name: agent.name,
      email: agent.email,
      password: '',
      role: agent.role,
      department_id: agent.department_id || ''
    });
    setEditingAgent(agent);
    setShowAddModal(true);
  };

  if (!canManageAgents) {
    return (
      <div className="h-full bg-gray-50 flex items-center justify-center">
        <div className="bg-white p-8 rounded-xl shadow-lg text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Access Denied</h1>
          <p className="text-gray-600">You don't have permission to manage agents.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="h-full bg-gray-50 flex items-center justify-center">
        <div className="text-lg text-gray-600">Loading agents...</div>
      </div>
    );
  }

  return (
    <div className="h-full bg-gray-50 overflow-auto">
      {/* Header */}
      <div className="bg-white shadow-sm border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center gap-6">
              <div>
                <p className="text-gray-600">Manage support team members</p>
              </div>
              
              {/* Department Filter */}
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-gray-700">Filter by Department:</label>
                <select
                  value={departmentFilter}
                  onChange={(e) => setDepartmentFilter(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                >
                  <option value="all">All Departments</option>
                  {departments.map((dept) => (
                    <option key={dept.id} value={dept.id}>
                      {dept.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {canCreateDelete && (
              <button
                onClick={() => setShowAddModal(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition-colors flex items-center gap-2"
              >
                <span>+</span>
                Add Agent
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {error}
            <button 
              onClick={() => setError(null)}
              className="float-right font-bold"
            >×</button>
          </div>
        </div>
      )}

      {/* Agents Grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {agents.map((agent) => (
            <div key={agent.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
              {/* Agent Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center text-white font-bold text-lg">
                    {agent.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{agent.name}</h3>
                    <p className="text-sm text-gray-500">{agent.email}</p>
                  </div>
                </div>
                
                {canCreateDelete && (
                  <div className="flex gap-1">
                    <button
                      onClick={() => startEdit(agent)}
                      className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="Edit agent"
                    >
                      ✏️
                    </button>
                    {agent.id !== agent?.id && (
                      <button
                        onClick={() => handleDelete(agent.id)}
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete agent"
                      >
                        🗑️
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Agent Info */}
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">Role:</span>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    agent.role === 'MANAGER' ? 'bg-purple-100 text-purple-700' :
                    agent.role === 'L3' ? 'bg-blue-100 text-blue-700' :
                    agent.role === 'L2' ? 'bg-green-100 text-green-700' :
                    'bg-gray-100 text-gray-700'
                  }`}>
                    {agent.role}
                  </span>
                </div>
                
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">Department:</span>
                  <span className="text-sm font-medium text-gray-900">
                    {agent.department_name}
                  </span>
                </div>

                {/* Statistics */}
                <div className="pt-3 border-t border-gray-100">
                  <div className="grid grid-cols-2 gap-4 text-center">
                    <div>
                      <div className="text-lg font-bold text-blue-600">{agent.stats.total_tickets}</div>
                      <div className="text-xs text-gray-500">Total Tickets</div>
                    </div>
                    <div>
                      <div className="text-lg font-bold text-green-600">{agent.stats.resolution_rate}%</div>
                      <div className="text-xs text-gray-500">Resolution Rate</div>
                    </div>
                  </div>
                  
                  <div className="mt-3 grid grid-cols-2 gap-4 text-center">
                    <div>
                      <div className="text-sm font-medium text-gray-700">{agent.stats.resolved_tickets}</div>
                      <div className="text-xs text-gray-500">Resolved</div>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-700">{agent.stats.recent_activity}</div>
                      <div className="text-xs text-gray-500">Last 30 days</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Add/Edit Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              {editingAgent ? 'Edit Agent' : 'Add New Agent'}
            </h2>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Password {editingAgent && '(leave blank to keep current)'}
                </label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({...formData, password: e.target.value})}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required={!editingAgent}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({...formData, role: e.target.value})}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  {roleOptions.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                <select
                  value={formData.department_id}
                  onChange={(e) => setFormData({...formData, department_id: e.target.value})}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Select Department</option>
                  {departments.map(dept => (
                    <option key={dept.id} value={dept.id}>
                      {dept.name}
                    </option>
                  ))}
                </select>
              </div>
              
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={resetForm}
                  className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 py-2 px-4 rounded-lg font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg font-medium transition-colors"
                >
                  {editingAgent ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
