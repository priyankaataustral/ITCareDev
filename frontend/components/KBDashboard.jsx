
import React, { useEffect, useMemo, useState, useCallback } from "react";
import dayjs from "dayjs";
import { useAuth } from "../components/AuthContext"; // adjust path if needed
import Gate from "./Gate"; // adjust path if needed

// Use environment variable for API base URL
const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:5000";

/**
 * UI: Agent Knowledge Dashboard
 * - Review solutions (send confirm email, promote to KB)
 * - Manage KB drafts (publish, archive)
 * - Handle feedback (resolve, triage)
 * - Light analytics (counts & trends)
 *
 * Props
 * - open: boolean — show/hide overlay
 * - onClose: () => void
 */
export default function KBDashboard({ open, onClose }) {
  const authedFetch = useAuthedFetch();
  const [tab, setTab] = useState("review");

  // --- API endpoints (adjust if your backend uses different paths) ---
  const API = useMemo(() => ({
    solutions: `${API_BASE}/solutions`, // GET list; POST actions may be on /solutions/:id/*
    solutionConfirm: (id) => `${API_BASE}/solutions/${id}/send_confirmation_email`,
    articles: `${API_BASE}/kb/articles`, // GET list
    promoteFromSolution: (id) => `${API_BASE}/solutions/${id}/promote`, // POST
    publishArticle: (id) => `${API_BASE}/kb/articles/${id}/publish`,
    archiveArticle: (id) => `${API_BASE}/kb/articles/${id}/archive`,
    feedback: `${API_BASE}/kb/feedback`, // GET list
    resolveFeedback: (id) => `${API_BASE}/kb/feedback/${id}/resolve`,
    analytics: `${API_BASE}/kb/analytics`,
  }), [API_BASE]);

  // --- State ---
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [solutions, setSolutions] = useState([]);
  const [articles, setArticles] = useState([]);
  const [feedback, setFeedback] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [agentStats, setAgentStats] = useState([]);

  const [q, setQ] = useState(""); // search
  const [statusFilter, setStatusFilter] = useState("all");

  // --- Data fetchers ---
  const refresh = useCallback(async () => {
    if (!open) return;
    setLoading(true); setErr("");
    try {
      const [solR, artR, fbR, anR] = await Promise.all([
        // solutions: prefer statuses relevant to review
        authedFetch(`${API.solutions}?status=draft,sent_for_confirm,confirmed_by_user,published&limit=50`),
        authedFetch(`${API.articles}?status=draft,published,archived&limit=50`),
        authedFetch(`${API.feedback}?limit=50`),
        authedFetch(API.analytics).catch(() => null),
      ]);
      const sol = (await solR.json()) || [];
      const art = (await artR.json()) || [];
      const fb  = (await fbR.json())  || [];
      const mx  = anR ? await anR.json() : null;
      setSolutions(Array.isArray(sol) ? sol : (sol.items || []));
      setArticles(Array.isArray(art) ? art : (art.items || []));
      setFeedback(Array.isArray(fb) ? fb : (fb.items || []));
      setMetrics(mx);
    } catch (e) {
      setErr(`Failed to load: ${e.message || e}`);
    } finally {
      setLoading(false);
    }
  }, [API, authedFetch, open]);


  // Fetch agent analytics when analytics tab is loaded
  useEffect(() => {
    if (tab !== 'analytics' || !open) return;
    (async () => {
      try {
        const res = await authedFetch(`${API_BASE}/kb/analytics/agents`);
        const data = await res.json();
        setAgentStats(Array.isArray(data.agents) ? data.agents : []);
      } catch (e) {
        setAgentStats([]);
      }
    })();
  }, [tab, open, authedFetch]);

  // --- Actions ---
  const sendConfirmEmail = async (solution) => {
    try {
      const r = await authedFetch(API.solutionConfirm(solution.id), { method: 'POST' });
      if (!r.ok) throw new Error((await r.json()).error || 'Failed');
      toast(`Confirmation email queued for solution #${solution.id}`);
    } catch (e) { toast(`Error: ${e.message || e}`, true); }
  };

  const promoteToKB = async (solution) => {
    try {
  // Copy confirm link helper (component scope)
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
      const r = await authedFetch(API.promoteFromSolution(solution.id), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Failed');
      toast(`Promoted to KB as article #${data.article_id || ''}`);
      refresh();
    } catch (e) { toast(`Error: ${e.message || e}`, true); }
  };

  const publishArticle = async (article) => {
    try {
      const r = await authedFetch(API.publishArticle(article.id), { method: 'POST' });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Failed');
      toast(`Published article #${article.id}`);
      refresh();
    } catch (e) { toast(`Error: ${e.message || e}`, true); }
  };

  const archiveArticle = async (article) => {
    try {
      const r = await authedFetch(API.archiveArticle(article.id), { method: 'POST' });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Failed');
      toast(`Archived article #${article.id}`);
      refresh();
    } catch (e) { toast(`Error: ${e.message || e}`, true); }
  };

  const resolveFeedback = async (f) => {
    try {
      const r = await authedFetch(API.resolveFeedback(f.id), { method: 'POST' });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Failed');
      toast(`Resolved feedback #${f.id}`);
      refresh();
    } catch (e) { toast(`Error: ${e.message || e}`, true); }
  };

  // --- Derived filtered lists ---
  const filteredSolutions = useMemo(() => {
    const term = q.toLowerCase();
    return solutions.filter(s => {
      const hit = !term ||
        String(s.text || '').toLowerCase().includes(term) ||
        String(s.ticket_id || '').toLowerCase().includes(term) ||
        String(s.status || '').toLowerCase().includes(term);
      const statusOk = statusFilter === 'all' || String(s.status || '').toLowerCase() === statusFilter;
      return hit && statusOk;
    });
  }, [solutions, q, statusFilter]);

  const filteredArticles = useMemo(() => {
    const term = q.toLowerCase();
    return articles.filter(a => {
      const hit = !term ||
        String(a.title || '').toLowerCase().includes(term) ||
        String(a.problem_summary || '').toLowerCase().includes(term) ||
        String(a.status || '').toLowerCase().includes(term);
      return hit && (statusFilter === 'all' || String(a.status || '').toLowerCase() === statusFilter);
    });
  }, [articles, q, statusFilter]);

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
    <div className="fixed inset-0 z-[1000] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal>
      <div className="bg-white dark:bg-gray-900 w-full max-w-6xl rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-800/50">
          <div className="flex items-center gap-2">
            <span className="text-xl">📚</span>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Knowledge Dashboard</h2>
          </div>
          <button onClick={onClose} className="px-3 py-1 rounded-full text-sm bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600">Close</button>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-200 dark:border-gray-800">
          <div className="flex gap-1 rounded-xl bg-gray-100 dark:bg-gray-800 p-1">
            {[
              { id: 'review', label: 'Review' },
              { id: 'feedback', label: 'Feedback' },
              { id: 'analytics', label: 'Analytics' },
            ].map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`px-3 py-1 rounded-lg text-sm ${tab===t.id? 'bg-white dark:bg-gray-700 shadow text-gray-900 dark:text-gray-100':'text-gray-600 dark:text-gray-300'}`}>{t.label}</button>
            ))}
          </div>
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search…" className="flex-1 min-w-[120px] px-3 py-2 rounded-lg ring-1 ring-gray-300 dark:ring-gray-700 bg-white dark:bg-gray-900 text-sm" />
          <select value={statusFilter} onChange={(e)=>setStatusFilter(e.target.value)} className="px-3 py-2 rounded-lg ring-1 ring-gray-300 dark:ring-gray-700 bg-white dark:bg-gray-900 text-sm">
            <option value="all">All</option>
            <option value="draft">Draft</option>
            <option value="sent_for_confirm">Sent for confirm</option>
            <option value="confirmed_by_user">Confirmed</option>
            <option value="published">Published</option>
            <option value="open">Open (feedback)</option>
            <option value="resolved">Resolved (feedback)</option>
          </select>
          <button onClick={refresh} disabled={loading} className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm disabled:opacity-50">Refresh</button>
        </div>

        {err && <div className="px-5 py-2 text-sm text-red-600">{err}</div>}

        {/* Content */}
        <div className="p-5 max-h-[70vh] overflow-y-auto">
          {tab === 'review' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
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
                                {['draft','sent_for_confirm'].includes(String(s.status).toLowerCase()) && (
                                  <button className="btn-subtle" onClick={()=>sendConfirmEmail(s)}>✉️ Send confirm</button>
                                )}
                                {(s.confirm_url || s.confirm_token) && (
                                  <button className="btn-subtle" onClick={()=>copyConfirmLink(s)}>🔗 Copy link</button>
                                )}
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

              {/* Articles */}
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
                          <td className="py-2 pr-3"><StatusBadge value={a.status} /></td>
                          <td className="py-2 pr-3">{a.approved_by || '-'}</td>
                          <td className="py-2 pr-3">
                            <div className="flex flex-wrap gap-2">
                              <Gate roles={["L2","L3","MANAGER"]}>
                                {String(a.status).toLowerCase()==='draft' && (
                                  <button className="btn-subtle" onClick={()=>publishArticle(a)}>🚀 Publish</button>
                                )}
                                {String(a.status).toLowerCase()==='published' && (
                                  <button className="btn-subtle" onClick={()=>archiveArticle(a)}>🗄️ Archive</button>
                                )}
                              </Gate>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {filteredArticles.length===0 && (
                        <tr><td colSpan={5} className="py-6 text-center text-gray-500">No articles found.</td></tr>
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
                <h3 className="font-semibold text-gray-900 dark:text-gray-100">Feedback Inbox</h3>
                <span className="text-xs text-gray-500">{filteredFeedback.length} shown</span>
              </header>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-gray-500">
                    <tr>
                      <th className="py-2 pr-3">ID</th>
                      <th className="py-2 pr-3">Article</th>
                      <th className="py-2 pr-3">Type</th>
                      <th className="py-2 pr-3">Rating</th>
                      <th className="py-2 pr-3">Comment</th>
                      <th className="py-2 pr-3">When</th>
                      <th className="py-2 pr-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredFeedback.map(f => {
                      const st = f.resolved_at ? 'resolved' : 'open';
                      return (
                        <tr key={f.id} className="border-t border-gray-100 dark:border-gray-800 align-top">
                          <td className="py-2 pr-3">#{f.id}</td>
                          <td className="py-2 pr-3">#{f.kb_article_id}</td>
                          <td className="py-2 pr-3"><StatusBadge value={f.feedback_type} /></td>
                          <td className="py-2 pr-3">{f.rating ?? '-'}</td>
                          <td className="py-2 pr-3 max-w-[40ch]"><div className="line-clamp-2 text-gray-800 dark:text-gray-100">{f.comment}</div></td>
                          <td className="py-2 pr-3 text-gray-500">{fmt(f.created_at)}</td>
                          <td className="py-2 pr-3">
                            <div className="flex flex-wrap gap-2">
                              {st === 'open' ? (
                                <button className="btn-subtle" onClick={()=>resolveFeedback(f)}>✅ Resolve</button>
                              ) : (
                                <span className="text-xs text-gray-400">Resolved</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {filteredFeedback.length===0 && (
                      <tr><td colSpan={7} className="py-6 text-center text-gray-500">No feedback yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {tab === 'analytics' && (
            <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <KPI title="Solutions awaiting confirm" value={solutions.filter(s=>String(s.status).toLowerCase()==='sent_for_confirm').length} />
              <KPI title="Draft KB articles" value={articles.filter(a=>String(a.status).toLowerCase()==='draft').length} />
              <KPI title="Published KB articles" value={articles.filter(a=>String(a.status).toLowerCase()==='published').length} />
              <KPI title="Open feedback" value={feedback.filter(f=>!f.resolved_at).length} />
              <KPI title="Avg. rating (last 50)" value={avg(feedback.map(f=>Number(f.rating)).filter(Boolean)).toFixed(2)} />
              <KPI title="Total confirmations" value={solutions.filter(s=>String(s.status).toLowerCase()==='confirmed_by_user').length} />
              <KPI title="Confirm rate" value={confirmRate(solutions)} />
              <KPI title="Avg time to confirm" value={avgHoursToConfirm(solutions)} />

              {/* Agent analytics table */}
              <div className="md:col-span-3 rounded-2xl border border-gray-200 dark:border-gray-800 p-4 mt-4">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">Agent Activity</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-gray-500">
                      <tr>
                        <th className="py-2 pr-3">Agent</th>
                        <th className="py-2 pr-3">Solved</th>
                        <th className="py-2 pr-3">Active</th>
                      </tr>
                    </thead>
                    <tbody>
                      {agentStats.length > 0 ? agentStats.map(a => (
                        <tr key={a.agent_id} className="border-t border-gray-100 dark:border-gray-800 align-top">
                          <td className="py-2 pr-3">{a.agent_id}</td>
                          <td className="py-2 pr-3">{a.solved}</td>
                          <td className="py-2 pr-3">{a.active}</td>
                        </tr>
                      )) : (
                        <tr><td colSpan={3} className="py-6 text-center text-gray-500">No agent data.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Simple trend (client-side) */}
              <div className="md:col-span-3 rounded-2xl border border-gray-200 dark:border-gray-800 p-4">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">7-day activity (client-side)</h4>
                <MiniSparkline series={build7DaySeries(solutions, articles, feedback)} />
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

// Helper for agent analytics fetch
function authHeaders() {
  const authToken = (typeof window !== 'undefined' && window.localStorage && window.localStorage.getItem('token')) || '';
  return authToken ? { Authorization: `Bearer ${authToken}` } : {};
}

// --- Helpers ---
function useAuthedFetch(){
  const { authToken } = useAuth();
  return useCallback((url, opts={}) => {
    const headers = { ...(opts.headers||{}), ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) };
    return fetch(url, { ...opts, headers, credentials: 'include' });
  }, [authToken]);
}

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
