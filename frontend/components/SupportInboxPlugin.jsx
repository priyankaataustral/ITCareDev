import React, { useState, useEffect } from 'react';
import ProfileDropdown from './ProfileDropdown';
import Sidebar from './Sidebar';
import LoadingBot from './LoadingBot';
import GroupedTickets from './GroupedTickets';
import ChatHistory from './ChatHistory';
import 'bootstrap-icons/font/bootstrap-icons.css';
import { useAuth } from './AuthContext';

// Use environment variable for API base URL
const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:5000";

const authHeaders = () => {
  try {
    const t = localStorage.getItem('authToken');
    return t ? { Authorization: `Bearer ${t}` } : {};
  } catch {
    return {};
  }
};

export default function SupportInboxPlugin() {
  const [selectedId, setSelectedId] = useState(null);
  // Stable onBack handler to avoid remounts
  const handleBack = React.useCallback(() => setSelectedId(null), []);
  const [dark, setDark] = useState(false);
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [departments, setDepartments] = useState([]);
  const [error, setError] = useState(null);
  // grab the logged-in agent from context
  const { agent } = useAuth();

  useEffect(() => {
     document.documentElement.classList.toggle('dark', dark);
   }, [dark]);

  useEffect(() => {
    setLoading(true);
    fetch(`${API_BASE}/threads?limit=20&offset=0`, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(),
      },
    })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(payload => {
        const list = Array.isArray(payload)
          ? payload
          : (payload.threads || []);
        setThreads(list);
        setLoading(false);
      })
      .catch(err => {
        setError(err);
        setLoading(false);
      });
  }, []);

    // NEW: load departments for the dropdown/filter in the new list (inside Sidebar)
  useEffect(() => { 
    fetch(`${API_BASE}/departments`, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(),
      },
    })
      .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(data => {
        const list = Array.isArray(data) ? data : (data.departments || []);
        setDepartments(list);
      })
      .catch(() => {});
  }, []);

  useEffect(() => { console.log('DEPARTMENTS', departments); }, [departments]);


  if (loading) {
    return (
      <div className="fixed inset-0 w-full h-full min-h-screen h-screen bg-gray-50 flex items-center justify-center">
        <LoadingBot />
      </div>
    );
  }
  return (
    <div
      className="fixed inset-0 w-full h-full min-h-screen h-screen bg-gray-50 shadow-2xl overflow-auto grid grid-cols-[1fr_3fr] grid-rows-[auto_1fr_auto]"
    >
      {/* Sidebar with tabs */}
      <div className="row-start-2 row-end-3 col-start-1 col-end-2 flex flex-col items-start h-full overflow-y-auto bg-white p-0">
          <Sidebar
          agentId={agent?.id}
          onSelect={setSelectedId}
          selectedId={selectedId}
          threads={threads}
          departments={departments}
          useNewList={true}   // tell Sidebar to render the new Open Tickets UI via adapter
        />
      </div>

      {/* Main header (row 1, col 2) */}
      <div className="col-start-2 row-start-1 row-end-2 border-b bg-white flex items-center justify-between px-6">
        <div className="flex items-center">
          {selectedId ? (
            <>
              {/* <button onClick={() => setSelectedId(null)} className="text-indigo-900">&larr;</button> */}
              <h2 className="text-xl font-semibold ml-2 text-indigo-900">#{selectedId}</h2>
            </>
          ) : (
            <div className="text-indigo-900">Select a ticket</div>
          )}
        </div>
        <div className="flex items-center">
          <button
            onClick={() => setDark(d => !d)}
            className="bg-white text-black dark:bg-black dark:text-white"
            aria-label="Toggle dark mode"
          >
            {dark ? <i className="bi bi-sun" id="icon"></i> : <i className="bi bi-moon-stars" id="icon"></i>}
          </button>
          <ProfileDropdown />
        </div>
      </div>

      {/* Chat + Related container (row 2, col 2) */}
      <div className="row-start-2 row-end-3 col-start-2 col-end-3 flex items-center justify-center h-full bg-transparent">
        <div className="flex-1 bg-white p-6 shadow-lg h-full flex flex-col">
          {selectedId ? (
            <ChatHistory
              threadId={selectedId}
              onBack={handleBack}
              className="flex-1"
            />
          ) : (
            <div className="h-full flex items-center justify-center text-indigo-900">
              No ticket selected
            </div>  
          )}
        </div>
      </div>
    </div>
  );
}
