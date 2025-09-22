import React, { useEffect, useState } from 'react';
import { useAuth } from '../components/AuthContext';
import { useRouter } from 'next/router';

export default function AdminPanel() {
  const { agent, loading } = useAuth();
  const router = useRouter();
  const [accessDenied, setAccessDenied] = useState(false);

  useEffect(() => {
    // Wait for auth to load
    if (loading) return;

    // Check if user is logged in
    if (!agent) {
      router.push('/login');
      return;
    }

    // Check if user has manager role
    if (agent.role !== 'MANAGER') {
      setAccessDenied(true);
      // Optionally redirect after showing error
      setTimeout(() => {
        router.push('/');
      }, 3000);
      return;
    }
  }, [agent, loading, router]);

  // Show loading while auth is being determined
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Show access denied for non-managers
  if (accessDenied || (agent && agent.role !== 'MANAGER')) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8 text-center">
          <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mb-4">
            <i className="bi bi-shield-exclamation text-red-600 text-xl"></i>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h2>
          <p className="text-gray-600 mb-6">
            You don't have permission to access the admin panel. This area is restricted to managers only.
          </p>
          <div className="space-y-3">
            <p className="text-sm text-gray-500">
              Current role: <span className="font-medium">{agent?.role || 'Unknown'}</span>
            </p>
            <p className="text-sm text-gray-500">
              Required role: <span className="font-medium">MANAGER</span>
            </p>
          </div>
          <button
            onClick={() => router.push('/')}
            className="mt-6 w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // Main admin panel for managers
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center">
              <button
                onClick={() => router.push('/')}
                className="mr-4 text-gray-600 hover:text-gray-900"
              >
                <i className="bi bi-arrow-left text-xl"></i>
              </button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Admin Panel</h1>
                <p className="text-sm text-gray-600">System administration and management</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <div className="text-sm text-gray-600">
                Welcome, <span className="font-medium">{agent.name || agent.email}</span>
              </div>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                <i className="bi bi-shield-check mr-1"></i>
                Manager
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Welcome Card */}
        <div className="bg-white rounded-lg shadow-sm border p-6 mb-8">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="flex items-center justify-center h-12 w-12 rounded-lg bg-blue-100">
                <i className="bi bi-gear text-blue-600 text-xl"></i>
              </div>
            </div>
            <div className="ml-4">
              <h2 className="text-lg font-medium text-gray-900">Welcome to the Admin Panel</h2>
              <p className="text-gray-600">
                Manage users, system settings, and monitor application performance from this central hub.
              </p>
            </div>
          </div>
        </div>

        {/* Admin Sections Placeholder */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* User Management */}
          <div className="bg-white rounded-lg shadow-sm border p-6 hover:shadow-md transition-shadow cursor-pointer">
            <div className="flex items-center mb-4">
              <div className="flex-shrink-0">
                <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-purple-100">
                  <i className="bi bi-people text-purple-600"></i>
                </div>
              </div>
              <div className="ml-3">
                <h3 className="text-lg font-medium text-gray-900">User Management</h3>
              </div>
            </div>
            <p className="text-gray-600 text-sm mb-4">
              Manage user accounts, roles, and permissions across the system.
            </p>
            <div className="text-xs text-gray-500">
              Coming soon...
            </div>
          </div>

          {/* System Settings */}
          <div className="bg-white rounded-lg shadow-sm border p-6 hover:shadow-md transition-shadow cursor-pointer">
            <div className="flex items-center mb-4">
              <div className="flex-shrink-0">
                <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-green-100">
                  <i className="bi bi-sliders text-green-600"></i>
                </div>
              </div>
              <div className="ml-3">
                <h3 className="text-lg font-medium text-gray-900">System Settings</h3>
              </div>
            </div>
            <p className="text-gray-600 text-sm mb-4">
              Configure application settings, email templates, and system parameters.
            </p>
            <div className="text-xs text-gray-500">
              Coming soon...
            </div>
          </div>

          {/* Analytics & Reports */}
          <div className="bg-white rounded-lg shadow-sm border p-6 hover:shadow-md transition-shadow cursor-pointer">
            <div className="flex items-center mb-4">
              <div className="flex-shrink-0">
                <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-orange-100">
                  <i className="bi bi-graph-up text-orange-600"></i>
                </div>
              </div>
              <div className="ml-3">
                <h3 className="text-lg font-medium text-gray-900">Analytics & Reports</h3>
              </div>
            </div>
            <p className="text-gray-600 text-sm mb-4">
              View system analytics, performance metrics, and generate reports.
            </p>
            <div className="text-xs text-gray-500">
              Coming soon...
            </div>
          </div>

          {/* Knowledge Base Management */}
          <div className="bg-white rounded-lg shadow-sm border p-6 hover:shadow-md transition-shadow cursor-pointer">
            <div className="flex items-center mb-4">
              <div className="flex-shrink-0">
                <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-blue-100">
                  <i className="bi bi-book text-blue-600"></i>
                </div>
              </div>
              <div className="ml-3">
                <h3 className="text-lg font-medium text-gray-900">Knowledge Base</h3>
              </div>
            </div>
            <p className="text-gray-600 text-sm mb-4">
              Manage knowledge base articles, categories, and content organization.
            </p>
            <div className="text-xs text-gray-500">
              Coming soon...
            </div>
          </div>

          {/* System Logs */}
          <div className="bg-white rounded-lg shadow-sm border p-6 hover:shadow-md transition-shadow cursor-pointer">
            <div className="flex items-center mb-4">
              <div className="flex-shrink-0">
                <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-gray-100">
                  <i className="bi bi-file-text text-gray-600"></i>
                </div>
              </div>
              <div className="ml-3">
                <h3 className="text-lg font-medium text-gray-900">System Logs</h3>
              </div>
            </div>
            <p className="text-gray-600 text-sm mb-4">
              Monitor system activity, error logs, and audit trails.
            </p>
            <div className="text-xs text-gray-500">
              Coming soon...
            </div>
          </div>

          {/* Backup & Maintenance */}
          <div className="bg-white rounded-lg shadow-sm border p-6 hover:shadow-md transition-shadow cursor-pointer">
            <div className="flex items-center mb-4">
              <div className="flex-shrink-0">
                <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-red-100">
                  <i className="bi bi-shield-check text-red-600"></i>
                </div>
              </div>
              <div className="ml-3">
                <h3 className="text-lg font-medium text-gray-900">Backup & Maintenance</h3>
              </div>
            </div>
            <p className="text-gray-600 text-sm mb-4">
              Manage system backups, maintenance schedules, and security updates.
            </p>
            <div className="text-xs text-gray-500">
              Coming soon...
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="mt-8 bg-white rounded-lg shadow-sm border p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">System Overview</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <div className="text-2xl font-bold text-blue-600">-</div>
              <div className="text-sm text-gray-600">Total Users</div>
            </div>
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <div className="text-2xl font-bold text-green-600">-</div>
              <div className="text-sm text-gray-600">Active Tickets</div>
            </div>
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <div className="text-2xl font-bold text-orange-600">-</div>
              <div className="text-sm text-gray-600">Knowledge Articles</div>
            </div>
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <div className="text-2xl font-bold text-purple-600">Online</div>
              <div className="text-sm text-gray-600">System Status</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}