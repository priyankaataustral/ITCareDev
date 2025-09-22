'use client';

import React, { useState, useEffect, useMemo } from 'react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useAuth } from './AuthContext';
import { apiGet, apiPost, apiPut, apiDelete } from '../lib/apiClient';

dayjs.extend(relativeTime);

// -------------------------------------
// Helpers: filtering / sorting
// -------------------------------------
const PRIORITY_WEIGHT = { high: 3, medium: 2, low: 1 };

function applyFiltersSort(tickets, filters, sort) {
  if (!Array.isArray(tickets)) return [];

  const {
    statuses = [],
    priorities = [],
    levels = [],
    query = '',
    mineOnly = false,
    dateFrom = '',
    dateTo = '',
  } = filters || {};

  const q = query.trim().toLowerCase();
  const fromTs = dateFrom ? new Date(dateFrom).getTime() : null;
  const toTs = dateTo ? new Date(dateTo).getTime() : null;

  let list = tickets.filter((t) => {
    if (statuses.length && !statuses.includes(String(t.status).toLowerCase())) return false;

    const p = String(t.priority || '').toLowerCase();
    if (priorities.length && !priorities.includes(p)) return false;

    if (levels.length && !levels.includes(Number(t.level))) return false;

    if (mineOnly && !t.is_mine) return false;

    if (q) {
      const hay = [
        t.subject,
        t.requester_name,
        t.department?.name,
        t.latest_message_preview,
        String(t.id),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }

    if (fromTs || toTs) {
      const created = new Date(t.created_at).getTime();
      if (fromTs && created < fromTs) return false;
      if (toTs && created > toTs) return false;
    }

    return true;
  });

  // Sort
  const { by = 'created_at', dir = 'desc' } = sort || {};
  const mul = dir === 'asc' ? 1 : -1;

  list.sort((a, b) => {
    if (by === 'created_at') {
      return (new Date(a.created_at) - new Date(b.created_at)) * mul;
    }
    if (by === 'priority') {
      const aw = PRIORITY_WEIGHT[String(a.priority || '').toLowerCase()] || 0;
      const bw = PRIORITY_WEIGHT[String(b.priority || '').toLowerCase()] || 0;
      return (aw - bw) * mul;
    }
    if (by === 'level') {
      return ((a.level || 0) - (b.level || 0)) * mul;
    }
    if (by === 'status') {
      return String(a.status).localeCompare(String(b.status)) * mul;
    }
    // default fallback
    return (new Date(a.created_at) - new Date(b.created_at)) * mul;
  });

  return list;
}

// -------------------------------------
// DashboardAssignmentPill (unchanged from your OG)
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
// DashboardDepartmentPill (unchanged from your OG)
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
      // handled in parent
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
// ViewToolbar (CRM-style "My Views")
// -------------------------------------
const DEFAULT_FILTERS = {
  statuses: [],
  priorities: [],
  levels: [],
  query: '',
  mineOnly: false,
  dateFrom: '',
  dateTo: '',
};

const DEFAULT_SORT = { by: 'created_at', dir: 'desc' };

function Chip({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-lg border transition-all duration-200 ${
        active 
          ? 'bg-blue-600 text-white border-blue-600 shadow-sm hover:bg-blue-700' 
          : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50 hover:border-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
      }`}
    >
      {children}
    </button>
  );
}

function ViewToolbar({
  scope, // 'my-tickets' | 'department-tickets' (for saving)
  filters, setFilters,
  sort, setSort,
  savedViews, setSavedViews,
  selectedViewId, setSelectedViewId,
}) {
  const [saving, setSaving] = useState(false);
  const [newName, setNewName] = useState('');
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  // Load saved views (personal)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiGet(`/dashboard/views?scope=personal&for=${scope}`);
        const views = Array.isArray(res?.views) ? res.views : (Array.isArray(res) ? res : []);
        if (!cancelled) setSavedViews(views);
      } catch {
        // If backend not ready, keep empty list
      }
    })();
    return () => { cancelled = true; };
  }, [scope, setSavedViews]);

  const statuses = ['open', 'escalated', 'resolved', 'closed'];
  const priorities = ['high', 'medium', 'low'];
  const levels = [1, 2, 3];

  const toggleArr = (arr, value) =>
    arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value];

  const saveAsNew = async () => {
    const name = newName.trim();
    if (!name) {
      alert('Please enter a name for the view.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name,
        scope: 'personal',
        for: scope,
        filters,
        sort,
      };
      const res = await apiPost('/dashboard/views', payload);
      const view = res?.view || { id: res?.id || String(Date.now()), ...payload };
      setSavedViews(prev => [...prev, view]);
      setSelectedViewId(view.id);
      setNewName('');
      setShowSaveDialog(false);
    } catch (e) {
      alert('Failed to save view.');
    } finally {
      setSaving(false);
    }
  };

  const updateExisting = async () => {
    if (!selectedViewId) {
      alert('Select a saved view first.');
      return;
    }
    setSaving(true);
    try {
      await apiPut(`/dashboard/views/${selectedViewId}`, { filters, sort });
      setSavedViews(prev => prev.map(v => v.id === selectedViewId ? { ...v, filters, sort } : v));
    } catch {
      alert('Failed to update view.');
    } finally {
      setSaving(false);
    }
  };

  const deleteExisting = async () => {
    if (!selectedViewId) return;
    if (!confirm('Delete this view? This action cannot be undone.')) return;
    setSaving(true);
    try {
      await apiDelete(`/dashboard/views/${selectedViewId}`);
      setSavedViews(prev => prev.filter(v => v.id !== selectedViewId));
      setSelectedViewId(null);
    } catch {
      alert('Failed to delete view.');
    } finally {
      setSaving(false);
    }
  };

  const applyView = (id) => {
    setSelectedViewId(id || null);
    if (!id) return;
    const v = savedViews.find(v => v.id === id);
    if (v) {
      setFilters({ ...DEFAULT_FILTERS, ...(v.filters || {}) });
      setSort({ ...DEFAULT_SORT, ...(v.sort || {}) });
    }
  };

  const reset = () => {
    setSelectedViewId(null);
    setFilters(DEFAULT_FILTERS);
    setSort(DEFAULT_SORT);
  };

  const hasActiveFilters = () => {
    return filters.statuses.length > 0 || 
           filters.priorities.length > 0 || 
           filters.levels.length > 0 || 
           filters.query.trim() || 
           filters.mineOnly ||
           filters.dateFrom ||
           filters.dateTo;
  };

  const getActiveFilterCount = () => {
    let count = 0;
    if (filters.statuses.length > 0) count += filters.statuses.length;
    if (filters.priorities.length > 0) count += filters.priorities.length;
    if (filters.levels.length > 0) count += filters.levels.length;
    if (filters.query.trim()) count += 1;
    if (filters.mineOnly) count += 1;
    if (filters.dateFrom || filters.dateTo) count += 1;
    return count;
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      {/* Header Section */}
      <div className="bg-gradient-to-r from-slate-50 to-gray-50 border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-6">
            {/* Saved Views */}
            <div className="flex items-center space-x-3">
              <div className="flex items-center space-x-2">
                <i className="bi bi-bookmark text-slate-600"></i>
                <label className="text-sm font-medium text-gray-700">Saved Views</label>
              </div>
              <select
                value={selectedViewId || ''}
                onChange={(e) => applyView(e.target.value || null)}
                className="min-w-[160px] text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">— All Views —</option>
                {savedViews.map(v => (
                  <option key={v.id} value={v.id}>
                    {v.name} {v.is_default && '★'}
                  </option>
                ))}
              </select>
            </div>

            {/* Quick Actions */}
            <div className="flex items-center space-x-2">
              <button
                onClick={reset}
                className="inline-flex items-center px-3 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
              >
                <i className="bi bi-arrow-clockwise mr-1"></i>
                Reset
              </button>
              
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`inline-flex items-center px-3 py-2 text-sm font-medium rounded-lg border transition-colors focus:ring-2 focus:ring-blue-500 ${
                  showFilters || hasActiveFilters()
                    ? 'bg-blue-50 text-blue-700 border-blue-200' 
                    : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                }`}
              >
                <i className="bi bi-funnel mr-1"></i>
                Filters
                {hasActiveFilters() && (
                  <span className="ml-2 px-2 py-0.5 text-xs bg-blue-100 text-blue-800 rounded-full">
                    {getActiveFilterCount()}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Search and Save Actions */}
          <div className="flex items-center space-x-4">
            {/* Global Search */}
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <i className="bi bi-search text-gray-400"></i>
              </div>
              <input
                value={filters.query}
                onChange={e => setFilters(f => ({ ...f, query: e.target.value }))}
                placeholder="Search tickets, requesters, departments..."
                className="w-80 pl-10 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              {filters.query && (
                <button
                  onClick={() => setFilters(f => ({ ...f, query: '' }))}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                >
                  <i className="bi bi-x text-gray-400 hover:text-gray-600"></i>
                </button>
              )}
            </div>

            {/* View Management */}
            <div className="flex items-center space-x-2">
              {selectedViewId && (
                <>
                  <button
                    onClick={updateExisting}
                    disabled={saving}
                    className="inline-flex items-center px-3 py-2 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 focus:ring-2 focus:ring-blue-500 disabled:opacity-50 transition-colors"
                  >
                    <i className="bi bi-arrow-up-circle mr-1"></i>
                    Update
                  </button>
                  <button
                    onClick={deleteExisting}
                    disabled={saving}
                    className="inline-flex items-center px-3 py-2 text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 focus:ring-2 focus:ring-red-500 disabled:opacity-50 transition-colors"
                  >
                    <i className="bi bi-trash mr-1"></i>
                    Delete
                  </button>
                </>
              )}
              
              <button
                onClick={() => setShowSaveDialog(!showSaveDialog)}
                className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-blue-600 rounded-lg hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 transition-colors"
              >
                <i className="bi bi-plus-circle mr-1"></i>
                Save View
              </button>
            </div>
          </div>
        </div>

        {/* Save Dialog */}
        {showSaveDialog && (
          <div className="mt-4 p-4 bg-white border border-gray-200 rounded-lg shadow-sm">
            <div className="flex items-center space-x-3">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Enter view name (e.g., 'High Priority Open')"
                className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                onKeyPress={(e) => e.key === 'Enter' && saveAsNew()}
              />
              <button
                onClick={saveAsNew}
                disabled={saving || !newName.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 focus:ring-2 focus:ring-green-500 disabled:opacity-50 transition-colors"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={() => {setShowSaveDialog(false); setNewName('');}}
                className="px-3 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Filters Section */}
      {showFilters && (
        <div className="p-6 bg-gray-50 border-b border-gray-200">
          <div className="space-y-6">
            {/* Filter Categories */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Status Filters */}
              <div className="space-y-3">
                <label className="block text-sm font-medium text-gray-700">
                  <i className="bi bi-circle-fill mr-2"></i>
                  Status
                </label>
                <div className="flex flex-wrap gap-2">
                  {statuses.map(s => (
                    <Chip
                      key={s}
                      active={filters.statuses.includes(s)}
                      onClick={() =>
                        setFilters(f => ({ ...f, statuses: toggleArr(f.statuses, s) }))
                      }
                    >
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </Chip>
                  ))}
                </div>
              </div>

              {/* Priority Filters */}
              <div className="space-y-3">
                <label className="block text-sm font-medium text-gray-700">
                  <i className="bi bi-exclamation-triangle mr-2"></i>
                  Priority
                </label>
                <div className="flex flex-wrap gap-2">
                  {priorities.map(p => (
                    <Chip
                      key={p}
                      active={filters.priorities.includes(p)}
                      onClick={() =>
                        setFilters(f => ({ ...f, priorities: toggleArr(f.priorities, p) }))
                      }
                    >
                      {p.charAt(0).toUpperCase() + p.slice(1)}
                    </Chip>
                  ))}
                </div>
              </div>

              {/* Level Filters */}
              <div className="space-y-3">
                <label className="block text-sm font-medium text-gray-700">
                  <i className="bi bi-layers mr-2"></i>
                  Support Level
                </label>
                <div className="flex flex-wrap gap-2">
                  {levels.map(l => (
                    <Chip
                      key={l}
                      active={filters.levels.includes(l)}
                      onClick={() =>
                        setFilters(f => ({ ...f, levels: toggleArr(f.levels, l) }))
                      }
                    >
                      Level {l}
                    </Chip>
                  ))}
                </div>
              </div>
            </div>

            {/* Advanced Filters */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-4 border-t border-gray-200">
              {/* Assignment & Date */}
              <div className="space-y-4">
                <label className="inline-flex items-center space-x-3">
                  <input
                    type="checkbox"
                    checked={filters.mineOnly}
                    onChange={e => setFilters(f => ({ ...f, mineOnly: e.target.checked }))}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm font-medium text-gray-700">
                    <i className="bi bi-person-check mr-2"></i>
                    Only tickets assigned to me
                  </span>
                </label>
              </div>

              {/* Date Range */}
              <div className="space-y-3">
                <label className="block text-sm font-medium text-gray-700">
                  <i className="bi bi-calendar-range mr-2"></i>
                  Date Range
                </label>
                <div className="flex items-center space-x-3">
                  <input
                    type="date"
                    value={filters.dateFrom}
                    onChange={e => setFilters(f => ({ ...f, dateFrom: e.target.value }))}
                    className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <span className="text-gray-400">to</span>
                  <input
                    type="date"
                    value={filters.dateTo}
                    onChange={e => setFilters(f => ({ ...f, dateTo: e.target.value }))}
                    className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* Sort Options */}
            <div className="pt-4 border-t border-gray-200">
              <div className="flex items-center space-x-6">
                <label className="text-sm font-medium text-gray-700">
                  <i className="bi bi-sort-down mr-2"></i>
                  Sort Options
                </label>
                <div className="flex items-center space-x-3">
                  <select
                    value={sort.by}
                    onChange={(e) => setSort(s => ({ ...s, by: e.target.value }))}
                    className="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="created_at">Date Created</option>
                    <option value="priority">Priority Level</option>
                    <option value="level">Support Level</option>
                    <option value="status">Status</option>
                  </select>
                  <select
                    value={sort.dir}
                    onChange={(e) => setSort(s => ({ ...s, dir: e.target.value }))}
                    className="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="desc">Newest First</option>
                    <option value="asc">Oldest First</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// -------------------------------------
// MyDashboard (window dots + views)
// -------------------------------------
export default function MyDashboard({ open, onClose, onSelectTicket }) {
  const { agent } = useAuth();
  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('my-tickets'); // 'my-tickets' | 'department-tickets' | 'activity'
  const [winState, setWinState] = useState('normal'); // 'normal' | 'max' | 'min'

  // Views state (separate per-tab scope)
  const [myFilters, setMyFilters] = useState(DEFAULT_FILTERS);
  const [mySort, setMySort] = useState(DEFAULT_SORT);
  const [myViews, setMyViews] = useState([]);
  const [mySelectedViewId, setMySelectedViewId] = useState(null);

  const [deptFilters, setDeptFilters] = useState(DEFAULT_FILTERS);
  const [deptSort, setDeptSort] = useState(DEFAULT_SORT);
  const [deptViews, setDeptViews] = useState([]);
  const [deptSelectedViewId, setDeptSelectedViewId] = useState(null);

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
        reason: reason,
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
      3: 'bg-red-100 text-red-800',
    };
    return colors[level] || 'bg-gray-100 text-gray-800';
  };

  // Derived: filtered + sorted lists
  const myTicketsFiltered = useMemo(() => {
    const src = dashboardData?.my_tickets?.tickets || [];
    return applyFiltersSort(src, myFilters, mySort);
  }, [dashboardData, myFilters, mySort]);

  const deptTicketsFiltered = useMemo(() => {
    const src = dashboardData?.department_tickets?.tickets || [];
    return applyFiltersSort(src, deptFilters, deptSort);
  }, [dashboardData, deptFilters, deptSort]);

  // Closed: nothing
  if (!open) return null;

  // Minimized: dock pill
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
        {/* Header with macOS-style window dots + standard controls */}
        <div
          className="flex items-center justify-between p-4 md:p-6 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50 select-none"
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

          {/* Standard icon buttons for accessibility (mirror the dots) */}
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
                  {/* Views toolbar */}
                  <ViewToolbar
                    scope="my-tickets"
                    filters={myFilters}
                    setFilters={setMyFilters}
                    sort={mySort}
                    setSort={setMySort}
                    savedViews={myViews}
                    setSavedViews={setMyViews}
                    selectedViewId={mySelectedViewId}
                    setSelectedViewId={setMySelectedViewId}
                  />

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
                    {myTicketsFiltered.length === 0 ? (
                      <div className="text-center py-12">
                        <div className="w-16 h-16 bg-gray-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                          <i className="bi bi-ticket text-gray-400 text-2xl"></i>
                        </div>
                        <p className="text-gray-600">No tickets match this view</p>
                      </div>
                    ) : (
                      myTicketsFiltered.map((ticket) => (
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
                  {/* Views toolbar */}
                  <ViewToolbar
                    scope="department-tickets"
                    filters={deptFilters}
                    setFilters={setDeptFilters}
                    sort={deptSort}
                    setSort={setDeptSort}
                    savedViews={deptViews}
                    setSavedViews={setDeptViews}
                    selectedViewId={deptSelectedViewId}
                    setSelectedViewId={setDeptSelectedViewId}
                  />

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
                    {deptTicketsFiltered.length === 0 ? (
                      <div className="text-center py-12">
                        <div className="w-16 h-16 bg-gray-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                          <i className="bi bi-building text-gray-400 text-2xl"></i>
                        </div>
                        <p className="text-gray-600">No tickets match this view</p>
                      </div>
                    ) : (
                      deptTicketsFiltered.map((ticket) => (
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
            </div>
          </>
        )}
      </div>
    </div>
  );
}
