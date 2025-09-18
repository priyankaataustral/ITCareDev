'use client';

import React, { useState, useEffect } from 'react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useAuth } from './AuthContext';
import { apiGet } from '../lib/apiClient';

dayjs.extend(relativeTime);

export default function MyDashboard({ open, onClose }) {
  const { agent } = useAuth();
  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('my-tickets'); // 'my-tickets', 'department-tickets', 'activity'

  useEffect(() => {
    if (open) {
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

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[1000] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-7xl h-full max-h-[90vh] overflow-hidden flex flex-col">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center">
              <i className="bi bi-speedometer2 text-white text-xl"></i>
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">My Dashboard</h2>
              <p className="text-gray-600">Personal workload and department overview</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-2 hover:bg-gray-100 rounded-xl transition-colors"
            aria-label="Close dashboard"
          >
            <i className="bi bi-x-lg text-2xl"></i>
          </button>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-600">Loading your dashboard...</p>
            </div>
          </div>
        )}

        {/* Error State */}
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

        {/* Dashboard Content */}
        {!loading && !error && dashboardData && (
          <>
            {/* Summary Cards */}
            <div className="p-6 border-b border-gray-100">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {/* My Open Tickets */}
                <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-4 rounded-xl border border-blue-200">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
                      <i className="bi bi-person-check text-white"></i>
                    </div>
                    <div>
                      <p className="text-sm text-blue-700 font-medium">My Open Tickets</p>
                      <p className="text-2xl font-bold text-blue-900">{dashboardData.summary.my_open_tickets}</p>
                    </div>
                  </div>
                </div>

                {/* My Total Tickets */}
                <div className="bg-gradient-to-br from-green-50 to-green-100 p-4 rounded-xl border border-green-200">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-green-600 rounded-lg flex items-center justify-center">
                      <i className="bi bi-ticket text-white"></i>
                    </div>
                    <div>
                      <p className="text-sm text-green-700 font-medium">My Total Tickets</p>
                      <p className="text-2xl font-bold text-green-900">{dashboardData.summary.my_total_tickets}</p>
                    </div>
                  </div>
                </div>

                {/* Department Open */}
                <div className="bg-gradient-to-br from-orange-50 to-orange-100 p-4 rounded-xl border border-orange-200">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-orange-600 rounded-lg flex items-center justify-center">
                      <i className="bi bi-building text-white"></i>
                    </div>
                    <div>
                      <p className="text-sm text-orange-700 font-medium">Dept Open</p>
                      <p className="text-2xl font-bold text-orange-900">{dashboardData.summary.dept_open_tickets}</p>
                    </div>
                  </div>
                </div>

                {/* Recent Activity */}
                <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-4 rounded-xl border border-purple-200">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-purple-600 rounded-lg flex items-center justify-center">
                      <i className="bi bi-activity text-white"></i>
                    </div>
                    <div>
                      <p className="text-sm text-purple-700 font-medium">Recent Activity</p>
                      <p className="text-2xl font-bold text-purple-900">{dashboardData.summary.recent_activity_count}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Tabs Navigation */}
            <div className="px-6 pt-4">
              <div className="flex gap-1 rounded-xl bg-gray-100 p-1 w-fit">
                {[
                  { id: 'my-tickets', label: '👤 My Tickets', count: dashboardData.my_tickets.total },
                  { id: 'department-tickets', label: '🏢 Department Tickets', count: dashboardData.department_tickets.total },
                  { id: 'activity', label: '📈 Recent Activity', count: dashboardData.recent_activity.length }
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

            {/* Content Area */}
            <div className="flex-1 overflow-auto p-6">
              
              {/* My Tickets Tab */}
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
                        <div key={ticket.id} className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow">
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-2">
                                <h4 className="font-semibold text-gray-900">#{ticket.id}</h4>
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
                              <h5 className="font-medium text-gray-800 mb-2">{ticket.subject}</h5>
                              <div className="flex items-center gap-4 text-sm text-gray-600 mb-2">
                                <span>👤 {ticket.requester_name}</span>
                                <span>🏢 {ticket.department.name}</span>
                                <span>📅 {dayjs(ticket.created_at).fromNow()}</span>
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

              {/* Department Tickets Tab */}
              {activeTab === 'department-tickets' && (
                <div>
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-semibold text-gray-900">
                      {dashboardData.department_tickets.department_name} Department Tickets
                    </h3>
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
                        <div key={ticket.id} className={`bg-white border rounded-xl p-4 hover:shadow-md transition-shadow ${
                          ticket.is_mine ? 'border-blue-200 bg-blue-50' : 'border-gray-200'
                        }`}>
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-2">
                                <h4 className="font-semibold text-gray-900">#{ticket.id}</h4>
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
                              <h5 className="font-medium text-gray-800 mb-2">{ticket.subject}</h5>
                              <div className="flex items-center gap-4 text-sm text-gray-600 mb-2">
                                <span>👤 {ticket.requester_name}</span>
                                <span>👨‍💼 {ticket.assigned_agent.name}</span>
                                <span>📅 {dayjs(ticket.created_at).fromNow()}</span>
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

              {/* Recent Activity Tab */}
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
