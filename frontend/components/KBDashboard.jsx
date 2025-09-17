'use client';

import React, { useEffect, useMemo, useState, useCallback } from "react";
import dayjs from "dayjs";
import { useAuth } from "../components/AuthContext"; // keep if Gate/children rely on context
import Gate from "./Gate";
import { apiGet, apiPost } from "../lib/apiClient"; // ← use the centralized client
import { useDateRangeAnalytics } from "../hooks/useAnalytics";
import { ComprehensiveAnalytics } from "./AnalyticsSection";

/**
 * UI: Agent Knowledge Dashboard
 * - Review solutions (send confirm email, promote to KB)
 * - Manage KB drafts (publish, archive)
 * - Handle feedback (resolve, triage)
 * - Light analytics (counts & trends)
 */
export default function KBDashboard({ open, onClose }) {
  const [tab, setTab] = useState("review");
  const [analyticsTab, setAnalyticsTab] = useState("overview");

  // --- State ---
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [solutions, setSolutions] = useState([]);
  const [articles, setArticles] = useState([]);
  const [feedback, setFeedback] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [agentStats, setAgentStats] = useState([]);

  // --- Analytics Hook ---
  const analytics = useDateRangeAnalytics(30);

  const [q, setQ] = useState(""); // search
  const [statusFilter, setStatusFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all"); // Filter by source type
  // Upload state
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  // --- Data fetchers (now use apiGet/apiPost which return parsed JSON) ---
  const refresh = useCallback(async () => {
    if (!open) return;
    setLoading(true); setErr("");
    try {
      const [sol, art, fb, mx] = await Promise.all([
        apiGet('/solutions?status=draft,sent,confirmed,published&limit=50'),
        apiGet('/kb/articles?status=draft,published,archived&limit=100'), // Increased limit to show more articles
        apiGet('/kb/feedback?limit=50'),
        apiGet('/kb/analytics').catch(() => null),
      ]);
      setSolutions(Array.isArray(sol) ? sol : (sol.items || []));
      setArticles(Array.isArray(art) ? art : (art.items || []));
      setFeedback(Array.isArray(fb) ? fb : (fb.items || fb.feedback || []));
      setMetrics(mx);
    } catch (e) {
      setErr(`Failed to load: ${e.message || e}`);
    } finally {
      setLoading(false);
    }
  }, [open]);

    // Upload function
    const handleUploadProtocol = async (e) => {
      e.preventDefault();
      if (!uploadFile) {
        setErr("Please select a file to upload");
        return;
      }
  
      setUploading(true);
      setErr("");
  
      try {
        const formData = new FormData();
        formData.append('file', uploadFile);
  
        const response = await fetch('/kb/protocols/upload', {
          method: 'POST',
          body: formData,
          credentials: 'include'
        });
  
        const result = await response.json();
  
        if (!response.ok) {
          throw new Error(result.error || 'Upload failed');
        }
  
        setShowUploadModal(false);
        setUploadFile(null);
        setErr("");
        
        // Show success message
        alert(`Protocol "${result.filename}" uploaded successfully!`);
        
        // Refresh the protocols list if needed
        await refresh();
  
      } catch (error) {
        setErr(error.message);
      } finally {
        setUploading(false);
      }
    };

  // Fetch agent analytics when analytics tab is loaded
  useEffect(() => {
    if (tab !== 'analytics' || !open) return;
    (async () => {
      try {
        const data = await apiGet('/kb/analytics/agents');
        setAgentStats(Array.isArray(data?.agents) ? data.agents : []);
      } catch {
        setAgentStats([]);
      }
    })();
  }, [tab, open]);

  // --- Actions ---
  const sendConfirmEmail = async (solution) => {
    try {
      await apiPost(`/solutions/${solution.id}/send_confirmation_email`, {});
      toast(`Confirmation email queued for solution #${solution.id}`);
    } catch (e) { toast(`Error: ${e.message || e}`, true); }
  };

  const copyConfirmLink = async (s) => {
    const url =
      s.confirm_url ||
      (s.confirm_token
        ? `${window.location.origin}/solutions/confirm?token=${encodeURIComponent(s.confirm_token)}`
        : "");
    if (!url) return toast("No confirm link available", true);
    await navigator.clipboard.writeText(url);
    toast("Confirm link copied");
  };

  const promoteToKB = async (solution) => {
    try {
      const data = await apiPost(`/solutions/${solution.id}/promote`, {});
      toast(`Promoted to KB as article #${data.article_id || ''}`);
      refresh();
    } catch (e) { toast(`Error: ${e.message || e}`, true); }
  };

  const loadProtocols = async () => {
    try {
      const result = await apiPost('/kb/protocols/load', {});
      toast(`Protocols loaded: ${result.results?.loaded || 0} loaded, ${result.results?.skipped || 0} skipped`);
      
      // Add protocol files to the articles list
      if (result.protocols && Array.isArray(result.protocols)) {
        console.log('Protocols received from backend:', result.protocols);
        setArticles(prevArticles => {
          // Remove existing protocol entries to avoid duplicates
          const nonProtocolArticles = prevArticles.filter(a => a.source !== 'Protocol');
          // Add new protocol entries
          const newArticles = [...nonProtocolArticles, ...result.protocols];
          console.log('Updated articles list:', newArticles);
          return newArticles;
        });
      } else {
        console.log('No protocols received or invalid format:', result);
      }
      
      // Only refresh other data, not articles (to preserve protocol display)
      setLoading(true);
      try {
        const [sol, fb, mx] = await Promise.all([
          apiGet('/solutions?status=draft,sent,confirmed,published&limit=50'),
          apiGet('/kb/feedback?limit=50'),
          apiGet('/kb/analytics').catch(() => null),
        ]);
        setSolutions(Array.isArray(sol) ? sol : (sol.items || []));
        setFeedback(Array.isArray(fb) ? fb : (fb.items || fb.feedback || []));
        setMetrics(mx);
      } catch (e) {
        console.error('Error refreshing data:', e);
        setErr(e.message || 'Failed to refresh data');
      } finally {
        setLoading(false);
      }
    } catch (e) { toast(`Error loading protocols: ${e.message || e}`, true); }
  };

  const publishArticle = async (article) => {
    try {
      await apiPost(`/kb/articles/${article.id}/publish`, {});
      toast(`Published article #${article.id}`);
      refresh();
    } catch (e) { toast(`Error: ${e.message || e}`, true); }
  };

  const archiveArticle = async (article) => {
    try {
      await apiPost(`/kb/articles/${article.id}/archive`, {});
      toast(`Archived article #${article.id}`);
      refresh();
    } catch (e) { toast(`Error: ${e.message || e}`, true); }
  };

  const resolveFeedback = async (f) => {
    try {
      await apiPost(`/kb/feedback/${f.id}/resolve`, {});
      toast(`Resolved feedback #${f.id}`);
      refresh();
    } catch (e) { toast(`Error: ${e.message || e}`, true); }
  };

  // --- Derived filtered lists ---
  // Only show solutions that are confirmed by user and not yet promoted to KB
  const filteredSolutions = useMemo(() => {
    const term = q.toLowerCase();
    return solutions.filter(s => {
      const isConfirmed = String(s.status || '').toLowerCase() === 'confirmed';
      const notPromoted = s.published_article_id == null;
      const hit = !term ||
        String(s.text || '').toLowerCase().includes(term) ||
        String(s.ticket_id || '').toLowerCase().includes(term) ||
        String(s.status || '').toLowerCase().includes(term);
      return isConfirmed && notPromoted && hit;
    });
  }, [solutions, q]);

  const filteredArticles = useMemo(() => {
    const term = q.toLowerCase();
    return articles.filter(a => {
      const hit = !term ||
        String(a.title || '').toLowerCase().includes(term) ||
        String(a.problem_summary || '').toLowerCase().includes(term) ||
        String(a.status || '').toLowerCase().includes(term);
      const statusOk = statusFilter === 'all' || String(a.status || '').toLowerCase() === statusFilter;
      const sourceOk = sourceFilter === 'all' || String(a.source || '').toLowerCase() === sourceFilter;
      return hit && statusOk && sourceOk;
    });
  }, [articles, q, statusFilter, sourceFilter]);

  const filteredFeedback = useMemo(() => {
    const term = q.toLowerCase();
    return feedback.filter(f => {
      const hit = !term ||
        String(f.comment || '').toLowerCase().includes(term) ||
        String(f.feedback_type || '').toLowerCase().includes(term) ||
        String(f.user_email || '').toLowerCase().includes(term);
      const st = f.resolved_at ? 'resolved' : 'open';
      return hit && (statusFilter === 'all' || st === statusFilter);
    });
  }, [feedback, q, statusFilter]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[1000] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="bg-white dark:bg-gray-900 w-full max-w-6xl rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-800/50">
          <div className="flex items-center gap-2">
            <span className="text-xl">📚</span>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Knowledge Dashboard</h2>
          </div>
          <button onClick={onClose} className="px-3 py-1 rounded-full text-sm bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600">Close</button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-200 dark:border-gray-800">
          <div className="flex gap-1 rounded-xl bg-gray-100 dark:bg-gray-800 p-1">
            {[
              { id: 'review', label: 'Review' },
              { id: 'articles', label: 'Articles' },
              { id: 'feedback', label: 'Feedback' },
              { id: 'analytics', label: '📊 Analytics' },
            ].map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`px-3 py-1 rounded-lg text-sm ${tab===t.id? 'bg-white dark:bg-gray-700 shadow text-gray-900 dark:text-gray-100':'text-gray-600 dark:text-gray-300'}`}>{t.label}</button>
            ))}
          </div>
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search…" className="flex-1 min-w-[120px] px-3 py-2 rounded-lg ring-1 ring-gray-300 dark:ring-gray-700 bg-white dark:bg-gray-900 text-sm" />
        </div>


        {/* Content Area Header */}
        <div className="px-5 py-3 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {tab === 'review' && '📝 Review pending solutions and drafts'}
              {tab === 'articles' && '📚 Knowledge base articles and protocols'}
              {tab === 'feedback' && '💬 User feedback and ratings'}
              {tab === 'analytics' && '📊 Performance metrics and insights'}
            </span>
          <button onClick={refresh} disabled={loading} className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm disabled:opacity-50">Refresh</button>
          </div>
        </div>

        {err && <div className="px-5 py-2 text-sm text-red-600">{err}</div>}

        {/* Content */}
        <div className="p-5 max-h-[70vh] overflow-y-auto">
          {tab === 'review' && (
            <div className="grid grid-cols-1 gap-5">
              {/* Solutions */}
              <section className="rounded-2xl border border-gray-200 dark:border-gray-800 p-4">
                <header className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100">Solutions</h3>
                  <span className="text-xs text-gray-500">{filteredSolutions.length} shown</span>
                </header>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-gray-500">
                      <tr>
                        <th className="py-2 pr-3">ID</th>
                        <th className="py-2 pr-3">Ticket</th>
                        <th className="py-2 pr-3">Status</th>
                        <th className="py-2 pr-3">Agent</th>
                        <th className="py-2 pr-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSolutions.map(s => (
                        <tr key={s.id} className="border-t border-gray-100 dark:border-gray-800 align-top">
                          <td className="py-2 pr-3">#{s.id}</td>
                          <td className="py-2 pr-3">
                            <div className="text-gray-800 dark:text-gray-100 font-medium">{s.ticket_id}</div>
                            <div className="text-xs text-gray-500 line-clamp-2 max-w-[28ch]">{s.text}</div>
                            <div className="text-[11px] text-gray-500 mt-1">
                              {s.sent_for_confirm_at && <>Sent {fmt(s.sent_for_confirm_at)}</>}
                              {s.confirmed_at && (
                                <span className="ml-2 text-emerald-600">
                                  Confirmed {fmt(s.confirmed_at)}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-2 pr-3">
                            <StatusBadge value={s.status} />
                          </td>
                          <td className="py-2 pr-3">{s.owner || s.agent || s.user_email || '-'}</td>
                          <td className="py-2 pr-3">
                            <div className="flex flex-wrap gap-2">
                              <Gate roles={["L2","L3","MANAGER"]}>
                                {/* Only show Promote button for confirmed & not yet promoted solutions */}
                                <button className="btn-subtle" onClick={()=>promoteToKB(s)}>⬆️ Promote</button>
                              </Gate>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {filteredSolutions.length===0 && (
                        <tr><td colSpan={5} className="py-6 text-center text-gray-500">No solutions found.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          )}

          {tab === 'articles' && (
            <div>
              {/* Quick Access List */}
              <div className="px-5 py-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-gray-800 dark:to-gray-700 border-b border-gray-200 dark:border-gray-600">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">📋 Quick Access</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  <button 
                    onClick={() => setShowUploadModal(true)}
                    className="flex items-center gap-3 p-3 bg-white dark:bg-gray-800 rounded-lg shadow-sm hover:shadow-md transition-shadow border border-gray-200 dark:border-gray-600 text-left group"
                  >
                    <div className="flex-shrink-0 w-8 h-8 bg-purple-100 dark:bg-purple-900 rounded-lg flex items-center justify-center">
                      <span className="text-purple-600 dark:text-purple-400">📤</span>
                    </div>
                    <div>
                      <div className="font-medium text-gray-900 dark:text-gray-100 text-sm">Upload Protocol</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">Add new procedure documents</div>
                    </div>
                  </button>

                  <button 
                    onClick={loadProtocols}
                    className="flex items-center gap-3 p-3 bg-white dark:bg-gray-800 rounded-lg shadow-sm hover:shadow-md transition-shadow border border-gray-200 dark:border-gray-600 text-left group"
                  >
                    <div className="flex-shrink-0 w-8 h-8 bg-green-100 dark:bg-green-900 rounded-lg flex items-center justify-center">
                      <span className="text-green-600 dark:text-green-400">📄</span>
                    </div>
                    <div>
                      <div className="font-medium text-gray-900 dark:text-gray-100 text-sm">Load Protocols</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">Standard procedures & workflows</div>
                    </div>
                  </button>

                  {/* <button 
                    onClick={() => window.open('https://proud-tree-0c99b8f00.1.azurestaticapps.net/kb_protocols/email_issues.txt', '_blank')}
                    className="flex items-center gap-3 p-3 bg-white dark:bg-gray-800 rounded-lg shadow-sm hover:shadow-md transition-shadow border border-gray-200 dark:border-gray-600 text-left group"
                  >
                    <div className="flex-shrink-0 w-8 h-8 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center">
                      <span className="text-blue-600 dark:text-blue-400">✉️</span>
                    </div>
                    <div>
                      <div className="font-medium text-gray-900 dark:text-gray-100 text-sm">Email Issues</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">Outlook, SMTP, delivery problems</div>
                    </div>
                  </button>

                  <button 
                    onClick={() => window.open('https://proud-tree-0c99b8f00.1.azurestaticapps.net/kb_protocols/network_troubleshooting.txt', '_blank')}
                    className="flex items-center gap-3 p-3 bg-white dark:bg-gray-800 rounded-lg shadow-sm hover:shadow-md transition-shadow border border-gray-200 dark:border-gray-600 text-left group"
                  >
                    <div className="flex-shrink-0 w-8 h-8 bg-purple-100 dark:bg-purple-900 rounded-lg flex items-center justify-center">
                      <span className="text-purple-600 dark:text-purple-400">🌐</span>
                    </div>
                    <div>
                      <div className="font-medium text-gray-900 dark:text-gray-100 text-sm">Network Issues</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">Connectivity, WiFi, VPN problems</div>
                    </div>
                  </button>

                  <button 
                    onClick={() => window.open('https://proud-tree-0c99b8f00.1.azurestaticapps.net/kb_protocols/password_reset.txt', '_blank')}
                    className="flex items-center gap-3 p-3 bg-white dark:bg-gray-800 rounded-lg shadow-sm hover:shadow-md transition-shadow border border-gray-200 dark:border-gray-600 text-left group"
                  >
                    <div className="flex-shrink-0 w-8 h-8 bg-yellow-100 dark:bg-yellow-900 rounded-lg flex items-center justify-center">
                      <span className="text-yellow-600 dark:text-yellow-400">🔑</span>
                    </div>
                    <div>
                      <div className="font-medium text-gray-900 dark:text-gray-100 text-sm">Password Reset</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">Account recovery & access issues</div>
                    </div>
                  </button>

                  <button 
                    onClick={() => window.open('https://proud-tree-0c99b8f00.1.azurestaticapps.net/kb_protocols/printer_setup.txt', '_blank')}
                    className="flex items-center gap-3 p-3 bg-white dark:bg-gray-800 rounded-lg shadow-sm hover:shadow-md transition-shadow border border-gray-200 dark:border-gray-600 text-left group"
                  >
                    <div className="flex-shrink-0 w-8 h-8 bg-red-100 dark:bg-red-900 rounded-lg flex items-center justify-center">
                      <span className="text-red-600 dark:text-red-400">🖨️</span>
                    </div>
                    <div>
                      <div className="font-medium text-gray-900 dark:text-gray-100 text-sm">Printer Setup</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">Installation, drivers, troubleshooting</div>
                    </div>
                  </button>

                  <button 
                    onClick={() => window.open('https://proud-tree-0c99b8f00.1.azurestaticapps.net/kb_protocols/new_po_device_allocation.txt', '_blank')}
                    className="flex items-center gap-3 p-3 bg-white dark:bg-gray-800 rounded-lg shadow-sm hover:shadow-md transition-shadow border border-gray-200 dark:border-gray-600 text-left group"
                  >
                    <div className="flex-shrink-0 w-8 h-8 bg-emerald-100 dark:bg-emerald-900 rounded-lg flex items-center justify-center">
                      <span className="text-emerald-600 dark:text-emerald-400">🛒</span>
                    </div>
                    <div>
                      <div className="font-medium text-gray-900 dark:text-gray-100 text-sm">New PO Device</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">Equipment allocation & decommission</div>
                    </div>
                  </button>

                  <button 
                    onClick={() => window.open('https://proud-tree-0c99b8f00.1.azurestaticapps.net/kb_protocols/printer_duplex_configuration.txt', '_blank')}
                    className="flex items-center gap-3 p-3 bg-white dark:bg-gray-800 rounded-lg shadow-sm hover:shadow-md transition-shadow border border-gray-200 dark:border-gray-600 text-left group"
                  >
                    <div className="flex-shrink-0 w-8 h-8 bg-orange-100 dark:bg-orange-900 rounded-lg flex items-center justify-center">
                      <span className="text-orange-600 dark:text-orange-400">📄</span>
                    </div>
                    <div>
                      <div className="font-medium text-gray-900 dark:text-gray-100 text-sm">Printer Duplex</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">Double-sided printing configuration</div>
                    </div>
                  </button> */}

                  {/* <button 
                    onClick={() => window.open('https://proud-tree-0c99b8f00.1.azurestaticapps.net/kb_protocols/access_request_reports_module.txt', '_blank')}
                    className="flex items-center gap-3 p-3 bg-white dark:bg-gray-800 rounded-lg shadow-sm hover:shadow-md transition-shadow border border-gray-200 dark:border-gray-600 text-left group"
                  >
                    <div className="flex-shrink-0 w-8 h-8 bg-cyan-100 dark:bg-cyan-900 rounded-lg flex items-center justify-center">
                      <span className="text-cyan-600 dark:text-cyan-400">📊</span>
                    </div>
                    <div>
                      <div className="font-medium text-gray-900 dark:text-gray-100 text-sm">Reports Access</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">Cost view permissions & security</div>
                    </div>
                  </button> */}
                </div>
              </div>
              <section className="rounded-2xl border border-gray-200 dark:border-gray-800 p-4">
                <header className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100">KB Articles</h3>
                  <span className="text-xs text-gray-500">{filteredArticles.length} shown</span>
                </header>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-gray-500">
                      <tr>
                        <th className="py-2 pr-3">ID</th>
                        <th className="py-2 pr-3">Title</th>
                        <th className="py-2 pr-3">Source</th>
                        <th className="py-2 pr-3">Status</th>
                        <th className="py-2 pr-3">Approved By</th>
                        <th className="py-2 pr-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredArticles.map(a => (
                        <tr key={a.id} className="border-t border-gray-100 dark:border-gray-800 align-top">
                          <td className="py-2 pr-3">#{a.id}</td>
                          <td className="py-2 pr-3">
                            <div className="text-gray-800 dark:text-gray-100 font-medium line-clamp-1">{a.title || '(untitled)'}</div>
                            <div className="text-xs text-gray-500 line-clamp-2 max-w-[40ch]">{a.problem_summary}</div>
                          </td>
                          <td className="py-2 pr-3">
                            <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                              a.source === 'protocol' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' :
                              a.source === 'ai' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200' :
                              a.source === 'human' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                              'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
                            }`}>
                              {a.source === 'protocol' ? '📄 Protocol' :
                               a.source === 'ai' ? '🤖 AI' :
                               a.source === 'human' ? '👤 Human' :
                               a.source || 'Unknown'}
                            </span>
                          </td>
                          <td className="py-2 pr-3"><StatusBadge value={a.status} /></td>
                          <td className="py-2 pr-3">{a.approved_by || '-'}</td>
                          <td className="py-2 pr-3">
                            <div className="flex flex-wrap gap-2">
                              {(a.source === 'protocol' || a.source === 'Protocol') && (
                                <a 
                                  href={a.url || `https://proud-tree-0c99b8f00.1.azurestaticapps.net/kb_protocols/${a.filename || 'email_issues.txt'}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 dark:bg-blue-900 dark:text-blue-200"
                                >
                                  📄 View Source
                                </a>
                              )}
                              {a.source !== 'protocol' && a.source !== 'Protocol' && (
                                <Gate roles={["L2","L3","MANAGER"]}>
                                  {String(a.status).toLowerCase()==='draft' && (
                                    <button className="btn-subtle" onClick={()=>publishArticle(a)}>🚀 Publish</button>
                                  )}
                                </Gate>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                      {filteredArticles.length===0 && (
                        <tr><td colSpan={6} className="py-6 text-center text-gray-500">No articles found.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          )}


          {tab === 'feedback' && (
            <section className="rounded-2xl border border-gray-200 dark:border-gray-800 p-4">
              <header className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-900 dark:text-gray-100">Unified Feedback Inbox</h3>
                <span className="text-xs text-gray-500">{filteredFeedback.length} shown</span>
              </header>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-gray-500">
                    <tr>
                      <th className="py-2 pr-3">Source</th>
                      <th className="py-2 pr-3">Subject</th>
                      <th className="py-2 pr-3">Type</th>
                      <th className="py-2 pr-3">Rating</th>
                      <th className="py-2 pr-3">Comment</th>
                      <th className="py-2 pr-3">User</th>
                      <th className="py-2 pr-3">When</th>
                      <th className="py-2 pr-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredFeedback.map(f => {
                      const st = f.resolved_at ? 'resolved' : 'open';
                      const isTicketFeedback = f.source === 'ticket_solution';
                      const isKBFeedback = f.source === 'kb_article';
                      
                      // Display different info based on source
                      const sourceDisplay = isTicketFeedback ? '🎫 Ticket' : '📚 KB Article';
                      const subjectDisplay = isTicketFeedback 
                        ? (f.ticket_subject || `Ticket #${f.ticket_id}`)
                        : (f.article_title || `Article #${f.kb_article_id}`);
                      
                      // Rating display with stars
                      const ratingDisplay = f.rating ? (
                        <div className="flex items-center gap-1">
                          <span className="text-yellow-400">{'★'.repeat(f.rating)}</span>
                          <span className="text-gray-300">{'★'.repeat(5 - f.rating)}</span>
                          <span className="text-xs text-gray-500">({f.rating}/5)</span>
                        </div>
                      ) : '-';
                      
                      return (
                        <tr key={f.id} className="border-t border-gray-100 dark:border-gray-800 align-top">
                          <td className="py-2 pr-3">
                            <span className="text-xs px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-700">
                              {sourceDisplay}
                            </span>
                          </td>
                          <td className="py-2 pr-3 max-w-[25ch]">
                            <div className="line-clamp-1 font-medium text-gray-900 dark:text-gray-100">
                              {subjectDisplay}
                            </div>
                            {isTicketFeedback && f.reason && (
                              <div className="text-xs text-red-600 dark:text-red-400">
                                Reason: {f.reason}
                              </div>
                            )}
                          </td>
                          <td className="py-2 pr-3">
                            <StatusBadge value={f.feedback_type} />
                          </td>
                          <td className="py-2 pr-3">
                            {ratingDisplay}
                          </td>
                          <td className="py-2 pr-3 max-w-[30ch]">
                            <div className="line-clamp-2 text-gray-800 dark:text-gray-100">
                              {f.comment || '-'}
                            </div>
                          </td>
                          <td className="py-2 pr-3 text-xs text-gray-600 dark:text-gray-400">
                            {f.user_email || 'Anonymous'}
                          </td>
                          <td className="py-2 pr-3 text-gray-500 text-xs">
                            {fmt(f.created_at)}
                          </td>
                          <td className="py-2 pr-3">
                            <div className="flex flex-wrap gap-2">
                              {st === 'open' ? (
                                <button 
                                  className="btn-subtle text-xs" 
                                  onClick={() => resolveFeedback(f)}
                                >
                                  ✅ Resolve
                                </button>
                              ) : (
                                <span className="text-xs text-gray-400">Resolved</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {filteredFeedback.length === 0 && (
                      <tr>
                        <td colSpan={8} className="py-8 text-center text-gray-500">
                          <div className="flex flex-col items-center gap-2">
                            <div className="text-2xl">📝</div>
                            <div>No feedback received yet</div>
                            <div className="text-xs">Feedback from solution confirmations and KB articles will appear here</div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {tab === 'analytics' && (
            <ComprehensiveAnalytics 
              analytics={analytics}
              analyticsTab={analyticsTab}
              setAnalyticsTab={setAnalyticsTab}
            />
          )}
        </div>
      </div>

      {/* Upload Protocol Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-[1100] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">Upload Protocol Document</h3>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Select .txt file
              </label>
              <input
                type="file"
                accept=".txt"
                onChange={(e) => setUploadFile(e.target.files[0])}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-gray-100"
              />
            </div>
            
            {uploadFile && (
              <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-700 rounded-md">
                <div className="text-sm text-gray-700 dark:text-gray-300">
                  <strong>File:</strong> {uploadFile.name}
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  <strong>Size:</strong> {(uploadFile.size / 1024).toFixed(1)} KB
                </div>
              </div>
            )}
            
            {err && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/50 border border-red-200 dark:border-red-800 rounded-md">
                <div className="text-sm text-red-600 dark:text-red-400">{err}</div>
              </div>
            )}
            
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowUploadModal(false);
                  setUploadFile(null);
                  setErr('');
                }}
                disabled={uploading}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleUploadProtocol}
                disabled={!uploadFile || uploading}
                className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {uploading ? 'Uploading...' : 'Upload'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Helpers ---
function fmt(ts){
  if (!ts) return '-';
  const d = dayjs(ts);
  return d.isValid() ? d.fromNow?.() || d.format('YYYY-MM-DD HH:mm') : String(ts);
}

function avg(arr){
  if (!arr.length) return 0;
  return arr.reduce((a,b)=>a+b,0)/arr.length;
}

function build7DaySeries(solutions, articles, feedback){
  const buckets = {}; // yyyy-mm-dd -> counts
  const mark = (ts, key) => {
    const d = dayjs(ts).format('YYYY-MM-DD');
    buckets[d] = buckets[d] || { s:0, a:0, f:0 };
    buckets[d][key]++;
  };
  solutions.forEach(s=>mark(s.updated_at || s.created_at, 's'));
  articles.forEach(a=>mark(a.updated_at || a.created_at, 'a'));
  feedback.forEach(f=>mark(f.created_at, 'f'));
  const days = [...Array(7)].map((_,i)=> dayjs().subtract(6-i,'day').format('YYYY-MM-DD'));
  return days.map(d => ({ day: d.slice(5), solutions: (buckets[d]?.s)||0, articles: (buckets[d]?.a)||0, feedback: (buckets[d]?.f)||0 }));
}

function StatusBadge({ value }){
  const v = String(value||'').toLowerCase();
  const map = {
    draft: 'bg-blue-100 text-blue-800',
    sent_for_confirm: 'bg-yellow-100 text-yellow-800',
    confirmed_by_user: 'bg-green-100 text-green-800',
    published: 'bg-purple-100 text-purple-800',
    archived: 'bg-gray-200 text-gray-700',
    open: 'bg-orange-100 text-orange-800',
    resolved: 'bg-emerald-100 text-emerald-800',
    helpful: 'bg-emerald-100 text-emerald-700',
    not_helpful: 'bg-rose-100 text-rose-700',
    issue: 'bg-amber-100 text-amber-700',
  };
  const cls = map[v] || 'bg-gray-100 text-gray-700';
  return <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${cls}`}>{value}</span>;
}

function KPI({ title, value }){
  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-800 p-4">
      <div className="text-xs uppercase tracking-wide text-gray-500">{title}</div>
      <div className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">{Number.isFinite(value)? value : (value ?? '-') }</div>
    </div>
  );
}

function MiniSparkline({ series }){
  // very light bar-style sparkline using pure divs
  const max = Math.max(1, ...series.map(p => p.solutions + p.articles + p.feedback));
  return (
    <div className="flex items-end gap-2 h-24">
      {series.map((p,i)=>{
        const v = p.solutions + p.articles + p.feedback;
        const h = Math.round((v/max)*96);
        return (
          <div key={i} className="flex flex-col items-center">
            <div className="w-4 bg-indigo-400 rounded-t" style={{ height: h }} />
            <div className="text-[10px] text-gray-500 mt-1">{p.day}</div>
          </div>
        );
      })}
    </div>
  );
}

function confirmRate(solutions){
  const status = (s) => String(s?.status || "").toLowerCase();
  const sent = solutions.filter(s =>
    ["sent_for_confirm", "confirmed_by_user", "published"].includes(status(s))
  ).length;

  const confirmed = solutions.filter(s =>
    ["confirmed_by_user", "published"].includes(status(s))
  ).length;

  if (!sent) return "—";
  return `${Math.round((confirmed / sent) * 100)}%`;
}

function avgHoursToConfirm(solutions){
  const diffs = solutions.map(s => {
    const started = s.sent_for_confirm_at || s.created_at;
    const done = s.confirmed_at;
    if (!started || !done) return null;
    const minutes = dayjs(done).diff(dayjs(started), "minute");
    return minutes >= 0 ? minutes / 60 : null;
  }).filter(v => v != null);

  if (!diffs.length) return "—";
  return `${(diffs.reduce((a,b)=>a+b,0) / diffs.length).toFixed(1)}h`;
}

function toast(msg, isErr){
  // tiny inline toast; replace with your own system if present
  const el = document.createElement('div');
  el.textContent = msg;
  el.className = `fixed z-[1100] bottom-4 left-1/2 -translate-x-1/2 px-3 py-2 rounded-lg text-sm shadow-lg ${isErr? 'bg-rose-600 text-white':'bg-gray-900 text-white'}`;
  document.body.appendChild(el);
  setTimeout(()=>{ el.remove(); }, 2200);
}

/*
 * Minimal Tailwind button class used above
 * .btn-subtle {
 *   @apply px-2.5 py-1 rounded-lg ring-1 ring-gray-300 dark:ring-gray-700 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-800 dark:text-gray-100 text-xs;
 * }
 */
