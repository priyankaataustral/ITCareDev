import React, { useState, useEffect } from 'react';
import { apiGet, apiPost, API_BASE } from '../lib/apiClient';

const authHeaders = () => {
  try {
    const authToken = localStorage.getItem('authToken');
    return authToken ? { Authorization: `Bearer ${authToken}` } : {};
  } catch {
    return {};
  }
};

export default function EscalationSummaries({ onUnreadCountChange }) {
  const [summaries, setSummaries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadSummaries();
  }, []);

  const loadSummaries = async () => {
    try {
      setLoading(true);
      const data = await apiGet('/escalation-summaries');
      setSummaries(Array.isArray(data.summaries) ? data.summaries : []);
    } catch (err) {
      setError(err.message || 'Failed to load escalation summaries');
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (summaryId) => {
    try {
      await apiPost(`/escalation-summaries/${summaryId}/mark-read`);
      setSummaries(prev => prev.map(s => 
        s.id === summaryId ? { ...s, is_read: true, read_at: new Date().toISOString() } : s
      ));
    } catch (err) {
      console.error('Failed to mark as read:', err);
    }
  };

  // Download escalation report function
  const downloadEscalationReport = async (ticketId, summaryId) => {
    try {
      const url = `${API_BASE}/threads/${ticketId}/download-summary`;
      const response = await fetch(url, {
        method: 'GET',
        headers: authHeaders(),
      });
      
      if (!response.ok) {
        throw new Error('Failed to download report');
      }
      
      const blob = await response.blob();
      const link = document.createElement('a');
      link.href = window.URL.createObjectURL(blob);
      link.download = `escalation_report_${ticketId}_${new Date().toISOString().slice(0,10)}.txt`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Failed to download escalation report:', err);
      alert('Failed to download escalation report');
    }
  };

  const unreadCount = summaries.filter(s => !s.is_read).length;

  // Notify parent component of unread count changes
  useEffect(() => {
    if (onUnreadCountChange) {
      onUnreadCountChange(unreadCount);
    }
  }, [unreadCount, onUnreadCountChange]);

  if (loading) {
    return (
      <div className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        <div className="text-center text-gray-500">Loading escalation summaries...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
        <div className="text-red-600 dark:text-red-400">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
     {/*} <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <h3 className="font-semibold text-gray-900 dark:text-white">
          📋 Escalation Summaries
        </h3>
        {unreadCount > 0 && (
          <span className="bg-red-500 text-white text-xs px-2 py-1 rounded-full">
            {unreadCount} new
          </span>
        )}
      </div>*/}

      <div className="max-h-96 overflow-y-auto">
        {summaries.length === 0 ? (
          <div className="p-4 text-center text-gray-500 dark:text-gray-400">
            No escalation summaries yet
          </div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {summaries.map((summary) => (
              <div
                key={summary.id}
                className={`p-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition ${
                  !summary.is_read ? 'bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500' : ''
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="font-medium text-blue-600 dark:text-blue-400">
                    Ticket #{summary.ticket_id}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        downloadEscalationReport(summary.ticket_id, summary.id);
                      }}
                      className="px-2 py-1 bg-green-600 hover:bg-green-700 text-white text-xs rounded transition-colors shadow-sm"
                      title="Download comprehensive escalation report"
                    >
                      📄 Download
                    </button>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {new Date(summary.created_at).toLocaleDateString()} at{' '}
                      {new Date(summary.created_at).toLocaleTimeString()}
                    </div>
                  </div>
                </div>

                {summary.ticket_subject && (
                  <div className="text-sm font-medium text-gray-900 dark:text-white mb-2">
                    {summary.ticket_subject}
                  </div>
                )}

                <div className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                  <strong>Escalated from L{summary.from_level} → L{summary.to_level}</strong>
                </div>

                <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                  <strong>Reason:</strong> {summary.reason}
                </div>

                <div className="flex flex-wrap gap-2 text-xs">
                  {summary.escalated_by && (
                    <span className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                      By: {summary.escalated_by}
                    </span>
                  )}
                  {summary.target_department && (
                    <span className="bg-blue-100 dark:bg-blue-800 px-2 py-1 rounded">
                      Dept: {summary.target_department}
                    </span>
                  )}
                  {summary.target_agent && (
                    <span className="bg-green-100 dark:bg-green-800 px-2 py-1 rounded">
                      Agent: {summary.target_agent}
                    </span>
                  )}
                  {!summary.is_read && (
                    <span className="bg-red-100 dark:bg-red-800 text-red-700 dark:text-red-300 px-2 py-1 rounded font-medium">
                      NEW
                    </span>
                  )}
                </div>

                {summary.summary_note && (
                  <div className="mt-2 text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-700 p-2 rounded">
                    <strong>Note:</strong> {summary.summary_note}
                  </div>
                )}

                {/* Mark as read functionality */}
                {!summary.is_read && (
                  <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-600">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        markAsRead(summary.id);
                      }}
                      className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors"
                    >
                      Mark as Read
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {summaries.length > 0 && (
        <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400 text-center">
          {summaries.length} total escalation{summaries.length !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
}
