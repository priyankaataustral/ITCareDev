// frontend/components/ThreadList.jsx
'use client';

import React, { useEffect, useState } from 'react';
import Gate from './Gate';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useAuth } from '../components/AuthContext';
import { apiGet, apiPost, apiPatch } from '../lib/apiClient'; // <— use centralized client

dayjs.extend(relativeTime);

const FALLBACK_DEPTS = [
  { id: 1, name: 'ERP' },
  { id: 2, name: 'CRM' },
  { id: 3, name: 'SRM' },
  { id: 4, name: 'Network' },
  { id: 5, name: 'Security' },
];

export default function ThreadList({
  onSelect,
  threads: threadsProp = [],
  selectedId,
  departments = [],
}) {
  const [threads, setThreads] = useState(threadsProp);
  // No polling: only update thread list on mount/prop change or after ticket view
  const [loading, setLoading] = useState(!threadsProp?.length);
  const [error, setError] = useState(null);
  const { token, agent } = useAuth();

  const [overrideOpen, setOverrideOpen] = useState({});     // { [id]: boolean }
  const [overrideDept, setOverrideDept] = useState({});     // { [id]: number|null }
  const [overrideReason, setOverrideReason] = useState({}); // { [id]: string }
  const [saving, setSaving] = useState({});                 // { [id]: boolean }

  const [summaries, setSummaries] = useState({});
  const [activeDeptId, setActiveDeptId] = useState('all');

  // Load threads if parent didn't supply them
  useEffect(() => {
    if (threadsProp?.length) {
      setThreads(threadsProp);
      setLoading(false);
      return;
    }
    setLoading(true);

    apiGet(`/threads?limit=20&offset=0`)
      .then((payload) => {
        const list = Array.isArray(payload) ? payload : payload.threads || [];
        setThreads(list);
      })
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setLoading(false));
  }, [threadsProp, token]); // keep token in deps so list refreshes after login

  // (Optional) fetch short summaries for each ticket
  useEffect(() => {
    let cancelled = false;
    async function run() {
      const out = {};
      for (const t of threads) {
        try {
          const resp = await apiPost(`/summarize`, {
            text: t.text || t.subject || '',
          });
          out[t.id] = (resp && resp.summary) ? resp.summary : '';
        } catch {
          out[t.id] = '';
        }
      }
      if (!cancelled) setSummaries(out);
    }
    if (threads.length) run();
    return () => {
      cancelled = true;
    };
  }, [threads]);

  if (loading) return <div className="p-6 text-center text-gray-500">Loading tickets…</div>;
  if (error)   return <div className="p-6 text-center text-red-500">Error: {error}</div>;

  // Build department options, add Unassigned
  const deptOptions = [
    ...((departments?.length ? departments : FALLBACK_DEPTS).map(d => ({
      id: Number(d.id),
      name: String(d.name),
    })))
  ];
  const deptNameById = Object.fromEntries(deptOptions.map(d => [d.id, d.name]));

  // Add Unassigned option to dropdown
  const filterOptions = [
    { id: 'all', name: 'All' },
    ...deptOptions,
    { id: 'unassigned', name: 'Unassigned' },
  ];

  const role = agent?.role;
  const roleFiltered = (threads || []).filter(t => {
    const lvl = Number(t.level ?? 1);
    if (role === 'L2') return lvl >= 2;
    if (role === 'L3') return lvl === 3;
    return true; // L1 & MANAGER see all
  });

  // Filter by department, including unassigned
  const filteredThreads =
    activeDeptId === 'all'
      ? roleFiltered
      : activeDeptId === 'unassigned'
        ? roleFiltered.filter(t =>
            t.department === null ||
            t.department_id === null ||
            t.department === undefined ||
            t.department_id === undefined ||
            t.department === '' ||
            t.department_id === ''
          )
        : roleFiltered.filter(t =>
            (t.department_id ?? t.department?.id) === Number(activeDeptId)
          );

  return (
    <div className="overflow-auto pr-2 bg-gray-50 dark:bg-gray-900 p-4 space-y-3 max-w-sm w-full rounded-2xl shadow-lg border border-gray-100 dark:border-gray-800">
      {/* Header + filter */}
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-lg font-bold text-blue-700 dark:text-blue-300">Open Tickets</h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-600 dark:text-gray-300">Department</span>
          <select
            className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm"
            value={activeDeptId}
            onChange={(e) => setActiveDeptId(e.target.value)}
          >
            {filterOptions.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Ticket cards */}
      {filteredThreads.map((t) => {
        const isActive = selectedId === t.id;
        const depId = t.department_id ?? t.department?.id ?? null;
        const depName = t.department?.name || t.department || (depId ? deptNameById[depId] : 'Unassigned');
        const updatedTs = t.updated_at || t.lastActivity;

        return (
          <div
            key={t.id}
            className={`bg-white dark:bg-gray-800 border rounded-xl shadow-sm transition cursor-pointer mb-2 px-3 py-2
              ${isActive ? 'ring-2 ring-indigo-300 dark:ring-indigo-600 shadow-md z-10 border-transparent' : 'border-gray-200 dark:border-gray-700 hover:bg-indigo-50 dark:hover:bg-indigo-900'}`}
            tabIndex={0}
            aria-label={`Open ticket ${t.id}`}
            onClick={() => onSelect?.(t.id)}
          >
            {/* Header row */}
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[15px] font-semibold text-gray-900 dark:text-gray-100 whitespace-nowrap">
                  #{t.id}
                </span>
                <span className="px-2 py-0.5 bg-purple-50 dark:bg-purple-900 text-purple-800 dark:text-purple-200 text-[11px] font-medium rounded-full max-w-[120px] truncate">
                  {depName || 'Unassigned'}
                </span>
              </div>
              <div className="flex flex-col items-end gap-1 min-w-0">
                <Gate roles={['MANAGER']}>
                  <button
                    className="px-2 py-0.5 bg-gray-200 dark:bg-gray-700 text-[11px] rounded-full text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-600 hover:bg-gray-300 dark:hover:bg-gray-600 transition"
                    onClick={(e) => {
                      e.stopPropagation();
                      const current = t.department_id ?? t.department?.id ?? '';
                      setOverrideOpen((o) => ({ ...o, [t.id]: !o[t.id] }));
                      setOverrideDept((d) => ({ ...d, [t.id]: current }));
                    }}
                    disabled={saving[t.id]}
                  >
                    Override
                  </button>
                </Gate>
                {updatedTs && (
                  <span className="text-xs text-gray-400 mt-0.5 whitespace-nowrap">
                    {dayjs(updatedTs).format('M/D/YYYY, h:mm A')}
                  </span>
                )}
              </div>
            </div>

            {/* Override controls */}
            {overrideOpen[t.id] && (
              <div className="mt-2 bg-gray-50 dark:bg-gray-900 border-t border-b border-gray-200 dark:border-gray-700 flex flex-col gap-2 px-2 py-2 rounded">
                <label className="text-xs font-medium text-gray-700 dark:text-gray-200">Department:</label>
                <select
                  className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm"
                  value={overrideDept[t.id] ?? ''}
                  onChange={(e) => setOverrideDept((d) => ({ ...d, [t.id]: e.target.value ? Number(e.target.value) : '' }))}
                  onClick={(e) => e.stopPropagation()}
                >
                  <option value="">Unassigned</option>
                  {deptOptions.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>

                <label className="text-xs font-medium text-gray-700 dark:text-gray-200 mt-2">Reason:</label>
                <input
                  className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm"
                  value={overrideReason[t.id] || ''}
                  onChange={(e) => setOverrideReason((r) => ({ ...r, [t.id]: e.target.value }))}
                  onClick={(e) => e.stopPropagation()}
                  placeholder="Reason for override"
                />

                <div className="flex gap-2 mt-2">
                  <button
                    className="px-3 py-1 bg-blue-600 text-white rounded-full text-xs font-semibold hover:bg-blue-700 disabled:opacity-50"
                    disabled={saving[t.id] || overrideDept[t.id] === undefined}
                    onClick={async (e) => {
                      e.stopPropagation();
                      setSaving((s) => ({ ...s, [t.id]: true }));
                      const prevDeptId = t.department_id ?? t.department?.id ?? null;
                      try {
                        await apiPatch(`/threads/${t.id}/department`, {
                          department_id: overrideDept[t.id],
                          reason: overrideReason[t.id],
                        });
                        setThreads((cur) =>
                          cur.map((ticket) =>
                            ticket.id === t.id ? { ...ticket, department_id: overrideDept[t.id] } : ticket
                          )
                        );
                        setOverrideOpen((o) => ({ ...o, [t.id]: false }));
                        alert('Department updated successfully.');
                      } catch (err) {
                        alert('Failed to update department: ' + (err.message || err));
                        setThreads((cur) =>
                          cur.map((ticket) =>
                            ticket.id === t.id ? { ...ticket, department_id: prevDeptId } : ticket
                          )
                        );
                      } finally {
                        setSaving((s) => ({ ...s, [t.id]: false }));
                      }
                    }}
                  >
                    Save
                  </button>
                  <button
                    className="px-3 py-1 bg-gray-300 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-full text-xs font-semibold hover:bg-gray-400 dark:hover:bg-gray-600"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOverrideOpen((o) => ({ ...o, [t.id]: false }));
                    }}
                    disabled={saving[t.id]}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Summary (2 lines) */}
            {summaries[t.id] && (
              <div className="mt-2">
                <p className="line-clamp-2 text-sm text-gray-800 dark:text-gray-200">{summaries[t.id]}</p>
              </div>
            )}

            {/* Metadata pills */}
            <div className="flex flex-wrap gap-1 mt-2 mb-1">
              <span className="px-2 py-0.5 bg-blue-50 dark:bg-blue-900 text-blue-800 dark:text-blue-200 text-[11px] font-medium rounded-full">
                Level: {t.level}
              </span>
              <span className="px-2 py-0.5 bg-yellow-50 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 text-[11px] font-medium rounded-full">
                Urgency: {t.urgency_level}
              </span>
              <span className="px-2 py-0.5 bg-pink-50 dark:bg-pink-900 text-pink-800 dark:text-pink-200 text-[11px] font-medium rounded-full">
                Impact: {t.impact_level}
              </span>
              <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-[11px] font-medium rounded-full">
                Status: {t.status}
              </span>
            </div>

            {/* Footer */}
            <div className="border-t border-gray-100 dark:border-gray-800 pt-1 mt-1">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Last activity: {dayjs(updatedTs || t.lastActivity).fromNow()}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
