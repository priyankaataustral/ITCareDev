'use client';

import React, { useState, useEffect } from 'react';
import ProfileDropdown from './ProfileDropdown';
import Sidebar from './Sidebar';
import LoadingBot from './LoadingBot';
import GroupedTickets from './GroupedTickets';
import ChatHistory from './ChatHistory';
import KBDashboard from './KBDashboard';
import 'bootstrap-icons/font/bootstrap-icons.css';
import { useAuth } from './AuthContext';
import { apiGet } from '../lib/apiClient'; // only import what we use

export default function SupportInboxPlugin() {
  const [selectedId, setSelectedId] = useState(null);
  const handleBack = React.useCallback(() => setSelectedId(null), []);
  const [dark, setDark] = useState(false);
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [departments, setDepartments] = useState([]);
  const [error, setError] = useState(null);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const { agent } = useAuth();

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);

  // Load threads
  useEffect(() => {
    setLoading(true);
    apiGet(`/threads?limit=20&offset=0`)
      .then((payload) => {
        const list = Array.isArray(payload) ? payload : (payload.threads || []);
        setThreads(list);
      })
      .catch((err) => setError(err))
      .finally(() => setLoading(false));
  }, []);

  // Load departments
  useEffect(() => {
    apiGet(`/departments`)
      .then((data) => {
        const list = Array.isArray(data) ? data : (data.departments || []);
        setDepartments(list);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    console.log('DEPARTMENTS', departments);
  }, [departments]);

  if (loading) {
    return (
      <div className="fixed inset-0 w-full h-full min-h-screen h-screen bg-gray-50 flex items-center justify-center">
        <LoadingBot />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 w-full h-full min-h-screen h-screen bg-gray-50 shadow-2xl overflow-auto grid grid-cols-[1fr_3fr] grid-rows-[auto_1fr_auto]">
      {/* Sidebar with tabs */}
      <div className="row-start-2 row-end-3 col-start-1 col-end-2 flex flex-col items-start h-full overflow-y-auto bg-white p-0">
        <Sidebar
          agentId={agent?.id}
          onSelect={setSelectedId}
          selectedId={selectedId}
          threads={threads}
          departments={departments}
          useNewList={true}
        />
      </div>

      {/* Header */}
      <div className="col-start-2 row-start-1 row-end-2 border-b bg-white flex items-center justify-between px-6">
        <div className="flex items-center">
          {selectedId ? (
            <h2 className="text-xl font-semibold ml-2 text-indigo-900">#{selectedId}</h2>
          ) : (
            <div className="text-indigo-900">Select a ticket</div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowAnalytics(true)}
            className="flex items-center px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium"
            aria-label="Open Analytics Dashboard"
          >
            <i className="bi bi-graph-up mr-2"></i>
            Analytics
          </button>
          <button
            onClick={() => setDark((d) => !d)}
            className="bg-white text-black dark:bg-black dark:text-white p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            aria-label="Toggle dark mode"
          >
            {dark ? <i className="bi bi-sun"></i> : <i className="bi bi-moon-stars"></i>}
          </button>
          <ProfileDropdown />
        </div>
      </div>

      {/* Chat / Content */}
      <div className="row-start-2 row-end-3 col-start-2 col-end-3 flex items-center justify-center h-full bg-transparent">
        <div className="flex-1 bg-white p-6 shadow-lg h-full flex flex-col">
          {selectedId ? (
            <ChatHistory threadId={selectedId} onBack={handleBack} className="flex-1" />
          ) : (
            <div className="h-full flex items-center justify-center text-indigo-900">
              No ticket selected
            </div>
          )}
        </div>
      </div>

      {/* Analytics Dashboard Modal */}
      {showAnalytics && (
        <KBDashboard 
          open={showAnalytics} 
          onClose={() => setShowAnalytics(false)} 
        />
      )}
    </div>
  );
}
