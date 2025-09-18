'use client';
import KBDashboard from './KBDashboard';
import Gate from './Gate';
import EscalationPopup from './EscalationPopup';
import DeescalationPopup from './DeescalationPopup';
import React, { useEffect, useState, useRef, useMemo } from 'react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { apiGet, apiPost, apiPatch, API_BASE } from '../lib/apiClient';
import TicketHistoryPanel from './TicketHistoryPanel';
// import { apiFetch } from '/apiFetch';
dayjs.extend(relativeTime);

// =========================
// Config & helpers
// =========================


const authHeaders = () => {
  try {
    const authToken = localStorage.getItem('authToken');
    return authToken ? { Authorization: `Bearer ${authToken}` } : {};
  } catch {
    return {};
  }
};

// Markdown-lite + lists + mentions
function renderListOrText(text, mentionRenderer) {
  if (typeof text !== 'string') return text;
  const renderMentions =
    typeof mentionRenderer === 'function' ? mentionRenderer : (s) => s;

  const applyMarkdown = (str) => {
    if (typeof str !== 'string') return str;
    const BOLD_RE = /\*\*([^*]+)\*\*|\*([^*]+)\*/g;
    let lastIndex = 0;
    let out = [];
    let match;
    let key = 0;
    while ((match = BOLD_RE.exec(str)) !== null) {
      if (match.index > lastIndex) out.push(str.slice(lastIndex, match.index));
      const boldText = match[1] || match[2];
      out.push(<strong key={key++}>{boldText}</strong>);
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < str.length) out.push(str.slice(lastIndex));
    return out;
  };

  // Ordered list
  const ordered = [...text.matchAll(
    /(?:^|\s)(\d+[\.)])\s+([\s\S]*?)(?=(?:\s+\d+[\.)]\s)|$)/g
  )];
  if (ordered.length > 1) {
    const firstIdx = text.search(/\d+[\.)]\s+/);
    const intro = firstIdx > 0 ? text.slice(0, firstIdx).trim() : '';
    return (
      <>
        {intro && (
          <div className="mb-2 whitespace-pre-line">
            {applyMarkdown(renderMentions(intro))}
          </div>
        )}
        <ol className="list-decimal ml-5 space-y-1">
          {ordered.map((m, i) => (
            <li key={i} className="whitespace-pre-line">
              {applyMarkdown(renderMentions(m[2].trim()))}
            </li>
          ))}
        </ol>
      </>
    );
  }

  // Bulleted list
  const bullets = [...text.matchAll(
    /(?:^|\n)\s*[-*•]\s+([^\n]+?)(?=(?:\n\s*[-*•]\s+)|$)/g
  )];
  if (bullets.length > 1) {
    return (
      <ul className="list-disc ml-5 space-y-1">
        {bullets.map((m, i) => (
          <li key={i} className="whitespace-pre-line">
            {applyMarkdown(renderMentions(m[1].trim()))}
          </li>
        ))}
      </ul>
    );
  }

  const fixed = text.replace(/(?!^)(\s*)(\d+[\.)]|[-*•])\s+/g, '\n$2 ');
  return (
    <span className="whitespace-pre-line">
      {applyMarkdown(renderMentions(fixed))}
    </span>
  );
}

function toDisplayString(content) {
  if (content == null) return '';
  if (typeof content === 'string') {
    if (/^\s*[{[]/.test(content)) {
      try {
        const obj = JSON.parse(content);
        if (obj && typeof obj.text === 'string')  return obj.text;
        if (obj && typeof obj.reply === 'string') return obj.reply;
      } catch {}
    }
    return content;
  }
  if (typeof content === 'object') {
    if (typeof content.text === 'string')    return content.text;
    if (typeof content.reply === 'string')   return content.reply;
    if (typeof content.message === 'string') return content.message;
    if (Array.isArray(content))              return content.join('\n');
  }
  return String(content ?? '');
}

// =========================
// Small UI pieces
// =========================
function CollapsibleSection({ title, children, isOpen, onToggle }) {
  return (
    <div className="rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow mb-2">
      <button
        className="w-full flex items-center justify-between px-4 py-2 font-semibold text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-400 rounded-t-xl bg-gray-50 dark:bg-gray-800"
        onClick={onToggle}
        aria-expanded={isOpen}
      >
        <span>{title}</span>
        <span className="ml-2">{isOpen ? '▲' : '▼'}</span>
      </button>
      {isOpen && (
        <div className="px-4 py-2 max-h-60 overflow-y-auto">{children}</div>
      )}
    </div>
  );
}

function TicketInfoCard({ ticket }) {
  if (!ticket) return null;
  
  // Enhanced download summary handler
  const handleDownloadSummary = () => {
    if (!ticket.id) return;
    const url = `${API_BASE}/threads/${ticket.id}/download-summary`;
    // Use browser fetch to get the file and trigger download
    fetch(url, {
      method: 'GET',
      headers: authHeaders(),
    })
      .then(response => {
        if (!response.ok) {
          throw new Error('Failed to download report');
        }
        return response.blob();
      })
      .then(blob => {
        const link = document.createElement('a');
        link.href = window.URL.createObjectURL(blob);
        link.download = `escalation_report_${ticket.id}_${new Date().toISOString().slice(0,10)}.txt`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      })
      .catch(err => {
        console.error('Download failed:', err);
        alert('Failed to download escalation report');
      });
  };

  const isEscalated = ticket.status === 'escalated' || ticket.level > 1;
  return (
    <div className="rounded-xl bg-gradient-to-r from-yellow-50 to-white dark:from-yellow-900 dark:to-black p-3 border-l-4 border-yellow-500 shadow-sm mb-3 mx-4 flex items-start gap-3">
      <span className="text-yellow-500 dark:text-yellow-300 text-2xl">📄</span>
      <div>
        <div className="font-semibold text-yellow-800 dark:text-yellow-200 text-sm mb-1">Ticket Summary</div>
        <div className="text-gray-800 dark:text-gray-100 whitespace-pre-line text-sm">
          {(ticket.created || ticket.created_at) && <div className="text-xs">🕐 <b>Created:</b> {dayjs(ticket.created || ticket.created_at).format('MMM D, h:mm A')}</div>}
          {ticket.level > 1 && <div className="text-xs">⬆️ <b>Level:</b> L{ticket.level}</div>}
          {ticket.text && <div className="mt-1 text-xs text-gray-600 dark:text-gray-300">{ticket.text}</div>}
        </div>
        
        {/* Show download button for escalated tickets */}
        {isEscalated && (
          <div className="mt-2 flex gap-2">
            <button
              onClick={handleDownloadSummary}
              className="px-2 py-1 rounded-full bg-green-600 text-white text-xs shadow hover:bg-green-700 transition-colors"
              title="Download comprehensive escalation report with ticket history"
            >
              📄 Download Report
            </button>
            {ticket.status === 'escalated' && (
              <span className="px-2 py-0.5 bg-orange-100 text-orange-800 text-xs rounded-full">
                🚨 Escalated
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StepProgressBar({ stepInfo }) {
  if (!stepInfo || !stepInfo.step || !stepInfo.total) return null;
  return (
    <div className="flex items-center gap-2 px-4 py-2">
      <div className="w-32 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div className="h-2 bg-blue-600" style={{ width: `${(stepInfo.step / stepInfo.total) * 100}%` }} />
      </div>
      <span className="text-xs text-blue-700 dark:text-blue-300 font-semibold">Step {stepInfo.step} of {stepInfo.total} ✔️</span>
    </div>
  );
}

function ProposedSolutionBox({ text, onDraft, onDismiss }) {
  if (!text) return null;
  return (
    <div className="mx-4 mb-3 rounded-xl border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/30 p-4 shadow-sm">
      <div className="text-emerald-800 dark:text-emerald-100 font-semibold mb-2">Proposed solution</div>
      <pre className="whitespace-pre-wrap text-sm text-gray-800 dark:text-gray-100">{text}</pre>
      <div className="mt-3 flex gap-2">
        <button onClick={onDraft} className="px-3 py-1 rounded-full bg-blue-600 text-white text-sm hover:bg-blue-700 transition-colors">
          ✉️ Draft email
        </button>
        <button
          onClick={() => onDismiss?.(String(text || '').trim())}
         
          className="mt-3 px-3 py-1 rounded-full bg-gray-200 dark:bg-gray-700 text-sm"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

// Modern, sticky email editor
function DraftEmailEditor({
  open,
  body,
  setBody,
  cc,
  setCc,
  loading,
  error,
  onSend,
  onCancel,
  aiDraft,
  showAIDisclaimer,
  setShowAIDisclaimer,
}) {
  if (!open) return null;

  return (
    <div className="w-full border-t border-gray-200 dark:border-gray-800 bg-white/95 dark:bg-black/95 backdrop-blur sticky bottom-0 z-[60] pointer-events-auto">
      <div className="max-w-4xl mx-auto px-4 py-3">
        <div className="font-semibold mb-2 text-gray-900 dark:text-gray-100">Draft email</div>

        <textarea
          className="w-full min-h-[140px] rounded-lg ring-1 ring-gray-300 dark:ring-gray-700 bg-white dark:bg-gray-900 p-3 text-sm"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />

        <div className="mt-2 flex items-center gap-2">
          <input
            className="flex-grow rounded-lg ring-1 ring-gray-300 dark:ring-gray-700 bg-white dark:bg-gray-900 p-2 text-sm"
            placeholder="CC (comma or space separated)"
            value={cc}
            onChange={(e) => setCc(e.target.value)}
          />
          <button
            onClick={onSend}
            disabled={loading}
            className="px-4 py-2 rounded-full bg-blue-600 text-white text-sm disabled:opacity-50 hover:bg-blue-700 transition-colors"
          >
            {loading ? 'Sending…' : 'Send'}
          </button>
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 rounded-full bg-gray-200 dark:bg-gray-700 text-sm"
          >
            Cancel
          </button>
        </div>

        {/* AI disclaimer toggle (only if the body came from AI) */}
        {aiDraft && (
          <div className="mt-2 flex items-center gap-2">
            <input
              type="checkbox"
              id="ai-disclaimer-toggle"
              checked={showAIDisclaimer}
              onChange={(e) => setShowAIDisclaimer(e.target.checked)}
              className="accent-indigo-600"
            />
            <label
              htmlFor="ai-disclaimer-toggle"
              className="text-xs text-gray-600 dark:text-gray-300 select-none"
            >
              Include AI-generated draft disclaimer
            </label>
          </div>
        )}

        {error && <div className="mt-2 text-sm text-red-600">{error}</div>}
      </div>
    </div>
  );
}



// Types for prompts
// type Prompt = string | { kind: 'ask_user'; text: string } | { kind: 'automate'; intent: string; label?: string };
function SuggestedPrompts({
  threadId,
  prompts = [],
  open,
  onToggle,
  onPromptSelect,
  apiBase = API_BASE,
}) {
  // const postChat = (body) =>
  //   fetch(`${apiBase}/threads/${threadId}/chat`, {
  //     method: "POST",
  //     credentials: "include",
  //     headers: { "Content-Type": "application/json", ...authHeaders() },
  //     body: JSON.stringify(body),
  //   });

  const toText = (p) => {
    if (typeof p === "string") return p;
    if (p && typeof p === 'object') {
    if (p.kind === 'ask_user') return String(p.text || '');
    if (p.kind === 'automate') return String(p.label || p.intent || '');
    if (typeof p.text === 'string') return p.text; // generic fallback
  }
  return '';
};

  // Instead of sending immediately, call onPromptSelect to set the send box
  // const handleClick = (p) => {
  //   // window.alert('[DEBUG] SuggestedPrompts button clicked: ' + (typeof p === 'string' ? p : JSON.stringify(p)));
  //   // console.debug('[DEBUG] SuggestedPrompts button clicked:', p);
  //   if (typeof p === "string") {
  //     if (typeof onPromptSelect === "function") onPromptSelect(p);
  //     return;
  //   }
  //   if (p.kind === "ask_user") {
  //     if (typeof onPromptSelect === "function") onPromptSelect(p.text);
  //     return;
  //   }
  //   if (p.kind === "automate") {
  //     if (typeof onPromptSelect === "function") onPromptSelect(p.intent);
  //     return;
  //   }
  // };

  const handleClick = (p) => { const text = toText(p).trim(); if (!text) return; onPromptSelect?.(text); };

  const labelFor = (p) =>
    typeof p === "string" ? p : p.kind === "ask_user" ? p.text : p.label || p.intent;

  // Filter out 'Should I escalate this?' from prompts
  const filteredPrompts = Array.isArray(prompts)
    ? prompts.filter(p => {
        const label = labelFor(p).trim().toLowerCase();
        return label !== 'should i escalate this?';
      })
    : prompts;

  return (
    <CollapsibleSection title={<span>💡 Suggested Prompts</span>} isOpen={open} onToggle={onToggle}>
      <div className="max-h-48 overflow-y-auto space-y-2">
        {filteredPrompts.length === 0 ? (
          <div className="text-sm text-gray-400">No suggestions available.</div>
        ) : (
          filteredPrompts.map((p, i) => (
            <button
              key={i}
              type="button"
              className="w-full rounded-lg px-3 py-1.5 text-sm shadow"
              onClick={() => handleClick(p)}
              title={labelFor(p)}
            >
              {labelFor(p)}
            </button>
          ))
        )}
      </div>
    </CollapsibleSection>
  );
}
function RelatedTicketList({ tickets, loading, error, onClick, openSections, toggleSection }) {
  const firstThreeWords = (str) => {
    if (!str) return '';
    const words = str.trim().split(/\s+/);
    return words.slice(0, 3).join(' ') + (words.length > 3 ? '…' : '');
  };
  return (
    <CollapsibleSection
      title={<span>📚 Related Tickets</span>}
      isOpen={openSections.related}
      onToggle={() => toggleSection('related')}
    >
      <div className="max-h-48 overflow-y-auto">
        {loading ? (
          <div className="text-sm text-gray-500">Loading related tickets…</div>
        ) : error ? (
          <div className="text-sm text-red-600">{error}</div>
        ) : tickets.length === 0 ? (
          <div className="text-sm text-gray-400">No similar tickets found.</div>
        ) : (
          <div className="flex flex-col gap-2">
            {tickets.map((t, idx) => {
              const summarySource = t.title || t.subject || t.summary || t.text || 'Related ticket';
              return (
                <div
                  key={t.id || idx}
                  className="mb-2 p-2 bg-slate-50 dark:bg-slate-800 rounded-xl text-slate-800 dark:text-slate-100 text-sm shadow-sm cursor-pointer border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 transition flex flex-col"
                  onClick={() => onClick(t)}
                >
                  <div className="font-medium">
                    {firstThreeWords(summarySource)}
                  </div>
                  {typeof t.similarity === 'number' && (
                    <div className="text-xs text-purple-400 mt-1">Similarity: {(t.similarity * 100).toFixed(1)}%</div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </CollapsibleSection>
  );
}

function TimelinePanel({ events, loading, error, openSections, toggleSection }) {
  const icon = (type) => {
    switch ((type || '').toUpperCase()) {
      case 'OPENED': return '🟢';
      case 'ESCALATED': return '🟣';
      case 'DEESCALATED': return '🟡';
      case 'CLOSED': return '⚫';
      case 'EMAIL_SENT': return '✉️';
      case 'EMAIL_FAILED': return '❗';
      case 'SOLUTION_CONFIRMED':
      case 'USER_CONFIRMED':
      case 'CONFIRMED':
      case 'CONFIRM_OK': return '✅';
      case 'SOLUTION_DENIED':
      case 'USER_DENIED':
      case 'NOT_FIXED':
      case 'CONFIRM_NO':
      case 'NOT_CONFIRMED':
      case 'NOT_CONFIRM': return '🚫';
      default: return '📌';
    }
  };

  const label = (ev) => {
    const t = (ev.type || ev.event_type || '').toUpperCase();
    const d = ev.details || {};
    switch (t) {
      case 'OPENED': return 'Ticket opened';
      case 'ESCALATED': return `Escalated ${d.from_level ? `L${d.from_level} → ` : ''}${d.to_level ? `L${d.to_level}` : 'next level'}`;
      case 'DEESCALATED': return `De-escalated to ${d.to_level ? `L${d.to_level}` : 'lower level'}${d.note ? ` (note: ${d.note})` : ''}`;
      case 'CLOSED': return 'Ticket closed';
      case 'EMAIL_SENT': return `Email sent${d.template ? ` (${d.template})` : ''}${d.to ? ` to ${d.to}` : ''}`;
      case 'EMAIL_FAILED': return 'Email failed';
      case 'SOLUTION_CONFIRMED':
      case 'USER_CONFIRMED':
      case 'CONFIRMED':
      case 'CONFIRM_OK': return 'User confirmed the solution';
      case 'SOLUTION_DENIED':
      case 'USER_DENIED':
      case 'NOT_FIXED':
      case 'CONFIRM_NO':
      case 'NOT_CONFIRMED':
      case 'NOT_CONFIRM': return `User says not fixed${d.reason ? `: ${d.reason}` : ''}`;
      default:
        return d.label || d.message || (ev.type || ev.event_type) || 'Event';
    }
  };

const safeEvents = Array.isArray(events)
  ? [...events].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  : [];

const dedupedEvents = [];
let prevType = null, prevLabel = null;

for (const ev of safeEvents) {
  const type = (ev.type || ev.event_type || '').toUpperCase();
  const lbl = label(ev);
  if (type === prevType && lbl === prevLabel) continue;
  dedupedEvents.push(ev);
  prevType = type;
  prevLabel = lbl;
}


  return (
    <CollapsibleSection
      title={<span>🕒 Activity</span>}
      isOpen={openSections.activity}
      onToggle={() => toggleSection('activity')}
    >
      {loading && <div className="text-sm text-gray-500">Loading timeline…</div>}
      {error && !loading && <div className="text-sm text-red-600">{error}</div>}
      {!loading && !error && (
        <ul className="space-y-2">
         {dedupedEvents.length === 0 ? (
            <li className="text-sm text-gray-400">No events yet.</li>
          ) : (
            dedupedEvents.map((ev, i) => (
              <li key={ev.id ?? i} className="text-sm flex items-start gap-2">
                <span className="mt-0.5">{icon(ev.type || ev.event_type)}</span>
                <div className="flex-1">
                  <div className="text-gray-800 dark:text-gray-100">{label(ev)}</div>
                  <div className="text-[11px] text-gray-500">
                    {dayjs(ev.created_at).fromNow()}
                  </div>
                </div>
              </li>
            ))
          )}
        </ul>
      )}
    </CollapsibleSection>
  );
}

function ChatComposer({ value, onChange, onSend, sending, textareaRef, autoFocus, drawerOpen }) {
  return (
    <div className="composer-bar w-full px-4 py-3 bg-white dark:bg-gray-900 shadow-xl border-t border-gray-200 dark:border-gray-700">
      <div className="flex items-center w-full max-w-4xl mx-auto gap-3">
        <input
          ref={textareaRef}
          type="text"
          aria-label="Type a message"
          placeholder="Type a message…"
          className="flex-grow rounded-full bg-white dark:bg-gray-800 shadow-inner ring-1 ring-gray-200 dark:ring-gray-700 px-6 py-3 placeholder-gray-400 dark:placeholder-gray-400 text-base focus:outline-none focus:ring-2 focus:ring-indigo-400 transition"
          value={value}
          onChange={e => {
            if (typeof e.target.value === 'string') onChange(e.target.value);
          }}
          onKeyDown={e => !sending && e.key === 'Enter' && onSend()}
          autoFocus={autoFocus}
        />
        <button 
          onClick={onSend}
          aria-label="Send message"
          disabled={sending}
          className="px-6 py-3 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white font-semibold rounded-full shadow-md transform hover:-translate-y-0.5 transition disabled:opacity-50"
        >
          🚀 {sending ? 'Sending…' : 'Send'}
        </button>
      </div>
    </div>
  );
}


// =========================
// Main Component
// =========================
function ChatHistory({ threadId, onBack, className = '' }) {
  // Core ticket/messages
  const [ticket, setTicket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [confirmLinks, setConfirmLinks] = useState({ confirm: '', notConfirm: '' });
  const [panelOpen, setPanelOpen] = useState(true);
  
  // Escalation popup state
  const [showEscalationPopup, setShowEscalationPopup] = useState(false);
  const [showDeescalationPopup, setShowDeescalationPopup] = useState(false); 


  // De-duplicate (user/bot/assistant) across entire stream (not just adjacent)
  const displayMessages = useMemo(() => {
    const out = [];
    const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');

    for (const cur of messages) {
      const prev = out[out.length - 1];
      const curIsAssistant = cur.sender === 'assistant' || cur.sender === 'bot';
      const prevIsAssistant = prev && (prev.sender === 'assistant' || prev.sender === 'bot');

      // Only suppress if the *previous* assistant bubble is identical
      if (
        curIsAssistant &&
        prevIsAssistant &&
        norm(toDisplayString(prev.content)) === norm(toDisplayString(cur.content))
      ) {
        continue;
      }
      out.push(cur);
    }
    return out;
  }, [messages]);



  // Sidebar (collapsible)
  const [openSections, setOpenSections] = useState({ suggested: true, related: false, activity: false, history: false });
  const toggleSection = (section) => setOpenSections(prev => ({ ...prev, [section]: !prev[section] }));

  // Thread nav
  const [parentThreadId, setParentThreadId] = useState(null);
  const [activeThreadId, setActiveThreadId] = useState(threadId);
  const tid = activeThreadId || threadId;


  // Timeline
  const [timeline, setTimeline] = useState([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState(null);
  const [timelineRefresh, setTimelineRefresh] = useState(0);

  // Dark mode
  const [darkMode, setDarkMode] = useState(false);

  // Loading state for thread
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Composer
  const [sending, setSending] = useState(false);
  const [newMsg, setNewMsg] = useState('');

  // Actions (escalate/close)
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState(null);


  // Actions (escalate/close)
  const [notifyUser, setNotifyUser] = useState(false);

  // Solution/steps
  const [pendingSolution, setPendingSolution] = useState(null);
  const [showSolutionPrompt, setShowSolutionPrompt] = useState(false);
  const [stepInfo, setStepInfo] = useState(null);
  const [loadingStep, setLoadingStep] = useState(false);
  const [stepError, setStepError] = useState(null);

  // Refs
  const messageRefs = useRef({});
  const scrollRef = useRef(null);
  const scrollBottomRef = useRef(null);
  const textareaRef = useRef(null);
  const tempIdRef = useRef(1);
  const [highlightedMsgId, setHighlightedMsgId] = useState(null);
  const solutionPanelRef = useRef(null);

  // CC state
  const [cc, setCc] = useState('');

  // History panel
  const [showTicketHistory, setShowTicketHistory] = useState(false);
  const [ticketHistory, setTicketHistory] = useState([]);
  const [ticketHistoryLoading, setTicketHistoryLoading] = useState(false);
  const [ticketHistoryError, setTicketHistoryError] = useState(null);

  
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [closeReason, setCloseReason] = useState('');
  const [archiveReason, setArchiveReason] = useState('');

  // Draft Email Editor (new)
  const [showDraftEditor, setShowDraftEditor] = useState(false);
  const [draftEditorBody, setDraftEditorBody] = useState('');
  const [aiDraft, setAiDraft] = useState(false); // Track if draft is AI-generated
  const [showAIDisclaimer, setShowAIDisclaimer] = useState(true); // Toggle for disclaimer

  // Allow common typos/synonyms
  const DRAFT_WORD = '(?:draft|drat|draf|darft|drfat|daft|compose|write|prepare|create)';
  const EMAIL_WORD = '(?:email|mail|message|reply)';

  const ADJ_WORDS = '(?:short|brief|concise|detailed|formal|informal|friendly|professional|polite|casual|clear|simple|comprehensive|thorough|succinct)';
  const ADJ_BLOCK = `(?:${ADJ_WORDS}(?:\\s+${ADJ_WORDS})*)?`; // zero or more adjectives
  // For "show editor empty"
  const DRAFT_EMAIL_OPEN_EMPTY_RE =
    /\b(?:open|show)\s+(?:the\s+)?(?:draft\s+)?email\s+editor\b|\bcompose\s+(?:a\s+)?new\s+email\s+(?:from\s+scratch|without\s+solution)\b/i;

  const DRAFT_EMAIL_WITH_SOLUTION_RE = new RegExp(
   `\\b${DRAFT_WORD}(?:\\s+(?:me|us))?\\s+` +
   `(?:(?:a|an|the)\\s+)?` +              // optional article
   `${ADJ_BLOCK}\\s*` +                   // optional adjectives (" short", " brief", …)
   `${EMAIL_WORD}` +                      // email/mail/message/reply
   `(?:\\s+(?:to|for)\\s+(?:the\\s+)?user)?` +  // optional "to/for the user"
   `(?:\\s+(?:with|including|containing)\\s+(?:the\\s+)?(?:solution|fix|steps))?` + // "with solution"
   `\\b`,
   'i'
 );

  const GENERIC_DRAFT_EMAIL_RE = new RegExp(
   `\\b${DRAFT_WORD}(?:\\s+(?:me|us))?\\s+` +
   `(?:(?:a|an|the)\\s+)?` +  // optional article
   `${ADJ_BLOCK}\\s*` +       // optional adjectives
   `${EMAIL_WORD}\\b`,
   'i'
 );

  // Needed by sendMessage to decide whether to show the Proposed Solution panel
  const EXPLICIT_SOLUTION_INTENT_RE =
    /\b(?:draft|write|compose|prepare|create)\s+(?:the\s+)?(?:final\s+)?solution\b|\bpropose\s+(?:a\s+)?solution\b|\bwhat(?:'s| is)\s+the\s+fix\b/i;


  const MAX_HISTORY = 4;
  const MAX_MSG_CHARS = 600;
  const buildHistory = (msgs) => msgs.slice(-MAX_HISTORY).map(m => ({
    role: m.sender === 'user' ? 'user' : 'assistant',
    content: (typeof m.content === 'string' ? m.content : JSON.stringify(m.content)).slice(0, MAX_MSG_CHARS),
  }));

  const looksLikeSolution = (s) =>
  /\blikely fix\b|\bsolution\b|\bsteps\b|^\s*\d+\./i.test(s || '');

  const getBestSolutionText = () => {
    if (pendingSolution) return pendingSolution;

    // 1) Last explicit solution bubble
    const fromType = [...messages].reverse().find(
      m => m.type === 'solution' && (m.text || m.content)
    );
    if (fromType) return String(fromType.text || fromType.content || '');

    // 2) Last assistant msg that "looks like" a fix/steps
    const lastFixy = [...messages].reverse().find(
      m => (m.sender === 'assistant' || m.sender === 'bot')
        && typeof m.content === 'string'
        && looksLikeSolution(m.content)
    );
    if (lastFixy) return lastFixy.content;

    // 3) Otherwise, last assistant text
    const anyAssistant = [...messages].reverse().find(
      m => (m.sender === 'assistant' || m.sender === 'bot') && (m.text || m.content)
    );
    return String(anyAssistant?.text || anyAssistant?.content || '');
  };



  const getConfirmLinks = async () => {
  // Use cache
  if (confirmLinks.confirm && confirmLinks.notConfirm) return confirmLinks;

  // 1) Server-prepared links
  try {
      const data = await apiGet(`/threads/${tid}/confirm-links`);
      const links = {
        confirm: data?.confirm_url || data?.confirm || '',
        notConfirm: data?.not_confirm_url || data?.notConfirm || data?.deny_url || ''
      };
      if (links.confirm && links.notConfirm) {
        setConfirmLinks(links);
        return links;
      }
    } catch (e) { console.warn('[getConfirmLinks] confirm-links error:', e); }

  // 2) Signed token → build URLs
  try {
    const data2 = await apiPost(`/threads/${tid}/confirm-token`, {});
    if (data2?.token) {
      const origin = (typeof window !== 'undefined' && window.location?.origin);
      const links = {
        confirm: `${origin}/solutions/confirm?token=${encodeURIComponent(data2.token)}&a=confirm`,
        notConfirm: `${origin}/solutions/confirm?token=${encodeURIComponent(data2.token)}&a=not_confirm`,
      };
      setConfirmLinks(links);
      return links;
    }
  } catch (e) { console.warn('[getConfirmLinks] confirm-token error:', e); }

  // 3) Dev fallback (lets you SEE links even if you're logged out)
  const origin = (typeof window !== 'undefined' && window.location?.origin);
  const links = {
    confirm: `${origin}/confirm?thread=${encodeURIComponent(tid)}&a=confirm&demo=1`,
    notConfirm: `${origin}/confirm?thread=${encodeURIComponent(tid)}&a=not_confirm&demo=1`,
  };
  console.warn('[getConfirmLinks] using demo fallback links (check your auth).');
  setConfirmLinks(links);
  return links;
};



  const buildEmailFromAnyText = (text) => {
    // Remove all asterisks (**) used for markdown bold/italic
    let solution = (text || '').replace(/\*\*/g, '').replace(/\*/g, '').trim();
    const greeting = ticket?.requester_name ? `Hi ${ticket.requester_name},` : 'Hi there,';
    if (solution) {
      return `${greeting}

  ${solution}

  Best regards,
  Support Team`;
    }
    const summary = ticket?.text
      ? `I'm following up on your request: "${ticket.text}".`
      : `I'm following up on your request.`;
    return `${greeting}

  ${summary}
  Here's a quick update: I'm preparing the next steps and will share the final fix shortly.

  Best regards,
  Support Team`;
  };



// Convert simple HTML (especially <a>) to plain text while keeping URLs visible.
function asPlainTextPreservingLinks(htmlOrText = '') {
  let s = String(htmlOrText);

  // Replace <br> and <p> with newlines for readability
  s = s.replace(/<\s*br\s*\/?>/gi, '\n')
       .replace(/<\/\s*p\s*>/gi, '\n')
       .replace(/<\s*p[^>]*>/gi, '');

  // Turn <a href="URL">text</a> into "text: URL"
  s = s.replace(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (m, href, text) => {
    // strip any tags inside the anchor text
    const inner = text.replace(/<[^>]+>/g, '').trim();
    return inner ? `${inner}: ${href}` : href;
  });

  // Strip all remaining tags
  s = s.replace(/<[^>]+>/g, '');

  // Decode a few common entities
  s = s.replace(/&nbsp;/g, ' ')
       .replace(/&amp;/g, '&')
       .replace(/&lt;/g, '<')
       .replace(/&gt;/g, '>');

  return s.trim();
}

  // Insert a block right before the "Best regards," line (case-insensitive).
const insertBeforeBestRegards = (body, block) => {
  const BR_RE = /(^|\n)\s*Best regards,?/i;
  const m = BR_RE.exec(body || '');
  if (m) {
    const idx = m.index + m[1].length; // start of the "Best regards," line
    return body.slice(0, idx) + '\n\n' + block + '\n\n' + body.slice(idx);
  }
  // If there is no "Best regards," just append the block.
  return (body || '') + '\n\n' + block;
};

const draftFromBackendOrBuild = async (solutionLike) => {
  const candidate = (solutionLike || '').trim();

  try {
    if (candidate) {
      const res = await fetch(`${API_BASE}/threads/${tid}/draft-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        credentials: 'include',
        body: JSON.stringify({ solution: candidate, include_links: true })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.email) return String(data.email);
    }
  } catch {}

  // Backend didn't give a draft — return a plain, link-free email
  return buildEmailFromAnyText(candidate);
};




  // Fetch an explicit solution (without adding bubbles), then show the panel
  const ensureSolutionThenGet = async () => {
    let best = getBestSolutionText();
    if (best && best.trim()) return best;

    try {
      const data = await apiPost(`/threads/${tid}/chat`, {
        message: 'propose a solution',
        history: buildHistory(messages),
        no_store: true,
        source: 'suggested',
      });
      if (data?.type === 'solution' && typeof data.text === 'string' && data.text.trim()) {
        setPendingSolution(data.text);      // show Proposed Solution panel
        best = data.text;
      }
    } catch {}
    return (best || '').trim();
  };

  
  // Track the last user intent for the current send
  const lastUserIntentRef = useRef('normal'); // 'normal' | 'explicit_solution' | 'suggested'


  // --- User-friendly solution/email utilities ---
  function makeUserFriendly(text) {
    if (!text) return '';
    // Replace technical jargon with simple language
    let friendly = text
      .replace(/\btroubleshoot\b/gi, 'check')
      .replace(/\bdiagnose\b/gi, 'look into')
      .replace(/\bissue\b/gi, 'problem')
      .replace(/\bresolve\b/gi, 'fix')
      .replace(/\bconfiguration\b/gi, 'settings')
      .replace(/\bparameters?\b/gi, 'details')
      .replace(/\bexecute\b/gi, 'run')
      .replace(/\bfunction\b/gi, 'feature')
      .replace(/\bscript\b/gi, 'step')
      .replace(/\bserver\b/gi, 'system')
      .replace(/\bapplication\b/gi, 'app')
      .replace(/\binterface\b/gi, 'screen')
      .replace(/\bAPI\b/gi, 'connection')
      .replace(/\bdeploy\b/gi, 'set up')
      .replace(/\bcredentials?\b/gi, 'login info')
      .replace(/\bauthenticate\b/gi, 'log in')
      .replace(/\bvalidate\b/gi, 'check')
      .replace(/\berror\b/gi, 'problem')
      .replace(/\bexception\b/gi, 'unexpected problem')
      .replace(/\bsyntax\b/gi, 'writing')
      .replace(/\bcommand\b/gi, 'instruction')
      .replace(/\bterminal\b/gi, 'window')
      .replace(/\bconsole\b/gi, 'window')
      .replace(/\bdebug\b/gi, 'check')
      .replace(/\bcompile\b/gi, 'prepare')
      .replace(/\bbuild\b/gi, 'prepare')
      .replace(/\bframework\b/gi, 'tool')
      .replace(/\blibrary\b/gi, 'tool')
      .replace(/\bdependency\b/gi, 'needed tool')
      .replace(/\bupdate\b/gi, 'refresh')
      .replace(/\bupgrade\b/gi, 'refresh')
      .replace(/\bpatch\b/gi, 'fix')
      .replace(/\bversion\b/gi, 'type')
      .replace(/\bplatform\b/gi, 'system')
      .replace(/\bnetwork\b/gi, 'connection')
      .replace(/\bprotocol\b/gi, 'method')
      .replace(/\bport\b/gi, 'connection point')
      .replace(/\baccess\b/gi, 'open')
      .replace(/\bpermission\b/gi, 'access')
      .replace(/\bprivilege\b/gi, 'access')
      .replace(/\broot\b/gi, 'main')
      .replace(/\badmin\b/gi, 'manager')
      .replace(/\buser\b/gi, 'you')
      .replace(/\bsudo\b/gi, 'special access')
      .replace(/\bscript\b/gi, 'step')
      .replace(/\bexecute\b/gi, 'run')
      .replace(/\bterminal\b/gi, 'window');
    // Add a friendly tone
    friendly = friendly.replace(/\bplease\b/gi, 'please');
    // Add a suggestion if not present
    if (!/let me know|feel free|reach out|happy to help|hope this helps|if you need anything else/i.test(friendly)) {
      friendly += '\n\nIf you need anything else, feel free to ask!';
    }
    return friendly;
  }

  const getLastSolutionText = () => {
    if (pendingSolution) return makeUserFriendly(pendingSolution);
    const s = [...messages].reverse().find(
      m => m.type === 'solution' && (m.text || m.content)
    );
    return makeUserFriendly((s?.text || s?.content || '').toString());
  };

  const buildEmailFromSolution = (solution) => {
    const greeting = ticket?.requester_name ? `Hi ${ticket.requester_name},` : 'Hi there,';
    return `${greeting}
  \n${makeUserFriendly(solution)}\n\nBest regards,\nSupport Team`;
  };



  // Trim Subject: header, replace [User], and cut after "Best regards,"
const sanitizeEmailBody = (raw) => {
  let t = String(raw || '');

  // 1) Remove a leading "Subject: ..." line (and following blank lines)
  t = t.replace(/^\s*Subject:[^\n]*\n(?:\s*\n)*/i, '');

  // 2) Hard-code [User] -> Priyanka (handle spacing/case)
  t = t.replace(/\[\s*User\s*\]/gi, 'Priyanka');
  t = t.replace(/Hi\s*\[\s*User\s*\]\s*,/i, 'Hi Priyanka,'); // common greeting variant


  // 3) Keep text only up to (and including) "Best regards,"
  const m = /(^|\n)([^\S\r\n]*Best regards,?)/i.exec(t);
  if (m) {
    const end = m.index + m[1].length + m[2].length; // end of the "Best regards," line
    t = t.slice(0, end).trimEnd();
  }

  return t;
};



const openDraftEditor = (prefill) => {
   const processed = sanitizeEmailBody(prefill || '');
   setDraftEditorBody(processed);
   const isAIGenerated = !!(processed && processed.trim());
   setAiDraft(isAIGenerated);
   setShowAIDisclaimer(isAIGenerated); // keep the disclaimer toggle ON by default
   setShowDraftEditor(true);
};

  // --- Poll live status/level every 5s ---
  useEffect(() => {
  // If a request is in-flight, skip setting up the poller
  if (!activeThreadId || sending || loadingStep || actionLoading) return;

  const interval = setInterval(() => {
    apiGet(`/threads/${activeThreadId}`)
      .then(data => setTicket(t => {
        if (!t) return t;
        const statusChanged = t.status !== data.status;
        const levelChanged = Number(t.level) !== Number(data.level);
        if (statusChanged || levelChanged) {
          setMessages(prev => [...prev, {
            id: `sys-${Date.now()}`,
            sender: 'system',
            content:
              `Status changed: ${t.status ?? '—'} → ${data.status}` +
              (levelChanged ? ` (L${t.level} → L${Number(data.level)})` : ''),
            timestamp: new Date().toISOString()
          }]);
          setTimelineRefresh(x => x + 1);
        }
        return { ...t, status: data.status, level: Number(data.level) };
      }))
      .catch(() => {});
  }, 5000);

  return () => clearInterval(interval);
}, [activeThreadId, sending, loadingStep, actionLoading]);

  
  // Fetch timeline
  useEffect(() => {
    if (!activeThreadId) return;
    setTimelineLoading(true);
    setTimelineError(null);
    apiGet(`/threads/${activeThreadId}/timeline`)
      .then(data => setTimeline(Array.isArray(data) ? data : []))
      .catch(() => setTimelineError('Failed to load timeline'))
      .finally(() => setTimelineLoading(false));
  }, [activeThreadId, timelineRefresh]);

  // Refresh messages when timeline changes (merge, not replace)
  useEffect(() => {
    if (!activeThreadId) return;
    
    // Debounce rapid timeline changes to prevent duplicate requests
    const timeoutId = setTimeout(() => {
      apiGet(`/threads/${activeThreadId}`)
        .then(data => {
          const fresh = Array.isArray(data.messages)
            ? data.messages.map(m => ({
                ...m,
                sender: (m.sender === 'bot' ? 'assistant' : m.sender),
                content: toDisplayString(m.content),
              }))
            : [];
          setMessages(prev => {
            // Enhanced deduplication logic
            const seen = new Set(prev.map(m => m.id));
            const seenTempIds = new Set(prev.filter(m => m.id?.toString().startsWith('temp-')).map(m => m.id));
            const merged = [...prev];
            
            for (const m of fresh) {
              if (m?.source === 'suggested' || m?.transient || m?.meta?.transient) continue;
              if (!m?.id || seen.has(m.id)) continue;
              
              // Skip if this is a duplicate temporary message
              if (m.id?.toString().startsWith('temp-') && seenTempIds.has(m.id)) continue;
              
              const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
              const mIsAssistant = m.sender === 'assistant' || m.sender === 'bot';
              
              // Enhanced text-based duplicate detection
              const existsByText =
                mIsAssistant &&
                merged.some(p => {
                  const pIsAssistant = p.sender === 'assistant' || p.sender === 'bot';
                  if (!pIsAssistant) return false;
                  
                  const pContent = norm(toDisplayString(p.content));
                  const mContent = norm(toDisplayString(m.content));
                  
                  // Exact match or very similar content (accounting for timestamps)
                  return pContent === mContent || 
                         (pContent.length > 10 && mContent.length > 10 && 
                          pContent.substring(0, Math.min(pContent.length, 50)) === 
                          mContent.substring(0, Math.min(mContent.length, 50)));
                });
                
              if (existsByText) continue;
              merged.push(m);
            }
            return merged;
          });
        })
        .catch(() => {});
    }, 100); // 100ms debounce
    
    return () => clearTimeout(timeoutId);
  }, [timelineRefresh, activeThreadId]);

  useEffect(() => { setActiveThreadId(threadId); }, [threadId]);

  // useEffect(() => {
  //   setConfirmLinks({ confirm: '', notConfirm: '' });
  // }, [tid]);

  // Reset refs map when messages change
  useEffect(() => { messageRefs.current = {}; }, [messages]);

  // Scroll/highlight support
  useEffect(() => {
    if (!highlightedMsgId) return;
    const el = messageRefs.current[highlightedMsgId];
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      setTimeout(() => setHighlightedMsgId(null), 3500);
    });
  }, [highlightedMsgId]);

  useEffect(() => {
    if (pendingSolution && solutionPanelRef.current) {
      solutionPanelRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [pendingSolution]);


  // Initial thread load
  useEffect(() => {
    if (!activeThreadId) return;
    setLoading(true);
    setError(null);
    apiGet(`/threads/${activeThreadId}`)
      .then(data => {
        setTicket(data);
        const normalized = (Array.isArray(data.messages) ? data.messages : []).map((m) => {
          const c = m?.content;
          return {
            ...m,
            sender: (m.sender === 'bot' ? 'assistant' : m.sender),
            content: toDisplayString(c),
          };
        });
        setMessages(normalized);
      })
      .catch(() => setError('Failed to load thread'))
      .finally(() => setLoading(false));
  }, [activeThreadId]);

  // Smart scroll to bottom
  useEffect(() => {
    if (scrollBottomRef.current) {
      scrollBottomRef.current.style.scrollMarginBottom = '220px';
      scrollBottomRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [messages, loading]);

  // Derive step/solution prompt from messages
  useEffect(() => {
    if (!messages.length) return;
    let lastStepMsg = null;
    let foundPendingSolution = null;
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m && m.type === 'solution' && m.askToSend && m.text) { foundPendingSolution = m.text; break; }
      if ((m.sender === 'bot' || m.sender === 'assistant') && typeof m.step === 'number' && typeof m.total === 'number') {
        lastStepMsg = m; break;
      }
      if ((m.sender === 'bot' || m.sender === 'assistant') && typeof m.content === 'string' && m.content.trim() === 'Did this solve your issue?') {
        break;
      }
    }
    if (foundPendingSolution) {
      setPendingSolution(foundPendingSolution);
      setShowSolutionPrompt(false);
      setStepInfo(null);
      return;
    }
    const last = messages[messages.length - 1];
    if ((last.sender === 'bot' || last.sender === 'assistant') && typeof last.content === 'string' && last.content.trim() === 'Did this solve your issue?') {
      setShowSolutionPrompt(true);
      setStepInfo(null);
    } else if (lastStepMsg) {
      setStepInfo({ step: lastStepMsg.step, total: lastStepMsg.total });
      setShowSolutionPrompt(false);
    } else {
      setStepInfo(null);
      setShowSolutionPrompt(false);
    }
  }, [messages, loading]);

  // Fetch ticket history
  useEffect(() => {
    if (!showTicketHistory || !activeThreadId) return;
    
    setTicketHistoryLoading(true);
    setTicketHistoryError(null);
    
    apiGet(`/tickets/${activeThreadId}/history`)
      .then(data => {
        setTicketHistory(data.history || []);
      })
      .catch(() => setTicketHistoryError('Failed to load ticket history'))
      .finally(() => setTicketHistoryLoading(false));
  }, [showTicketHistory, activeThreadId]);

  // Refresh timeline on window focus
  useEffect(() => {
    const onFocus = () => setTimelineRefresh(x => x + 1);
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  // Mention rendering + click
  function renderContentWithMentions(content, onMentionClick) {
    const mentionRegexSplit = /(@[\w]+)/g;     // for .split
    const isMention = /^@[\w]+$/;              // for .test
    if (typeof content !== 'string') return content;
    const parts = content.split(mentionRegexSplit);
    return parts.map((part, idx) => {
      if (isMention.test(part)) {
        const agentName = part.slice(1);
        return (
          <span
            key={idx}
            className="font-bold text-blue-700 bg-blue-50 rounded px-1 mx-0.5 cursor-pointer hover:underline"
            onClick={() => onMentionClick(agentName)}
          >
            {part}
          </span>
        );
      }
      return part;
    });
  }

  function handleMentionClick(agentName) {
    const msg = messages.find(m => Array.isArray(m.mentions) && m.mentions.includes(agentName));
    if (!msg) return;
    setHighlightedMsgId(msg.id);
    requestAnimationFrame(() => {
      if (messageRefs.current[msg.id]) {
        messageRefs.current[msg.id].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        if (scrollRef.current) {
          const msgEl = messageRefs.current[msg.id];
          const scrollEl = scrollRef.current;
          const msgBottom = msgEl.offsetTop + msgEl.offsetHeight;
          const scrollBottom = scrollEl.scrollTop + scrollEl.offsetHeight;
          if (msgBottom > scrollBottom - 100) {
            scrollEl.scrollTop += msgBottom - (scrollBottom - 100);
          }
        }
      }
    });
    setTimeout(() => setHighlightedMsgId(null), 3500);
  }

  // Add this function inside ChatHistory component, near your other component functions

function TicketHistoryCollapsible({ 
  history, 
  loading, 
  error, 
  openSections, 
  toggleSection 
}) {
  const formatTimestamp = (timestamp) => {
    if (!timestamp) return 'Unknown time';
    const date = new Date(timestamp);
    return dayjs(date).format('MMM D, h:mm A');
  };

  const getEventIcon = (eventType) => {
    const icons = {
      'assign': '👤',
      'status_change': '📋',
      'level_change': '🚀',
      'dept_change': '🏢',
      'role_change': '🔄',
      'note': '📝',
      'archive_change': '📦'
    };
    return icons[eventType] || '📌';
  };

  return (
    <CollapsibleSection
      title={<span>📜 History</span>}
      isOpen={openSections.history}
      onToggle={() => toggleSection('history')}
    >
      <div className="max-h-48 overflow-y-auto">
        {loading && <div className="text-sm text-gray-500">Loading history…</div>}
        {error && !loading && <div className="text-sm text-red-600">{error}</div>}
        {!loading && !error && (
          history.length === 0 ? (
            <div className="text-sm text-gray-400">No history entries found.</div>
          ) : (
            <div className="space-y-2">
              {history.map((entry, index) => (
                <div 
                  key={entry.id || index} 
                  className="flex items-start gap-2 p-2 bg-gray-50 dark:bg-gray-800 rounded-lg border"
                >
                  <span className="text-lg flex-shrink-0 mt-0.5">
                    {getEventIcon(entry.event_type)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-800 dark:text-gray-100">
                      {entry.summary}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {formatTimestamp(entry.timestamp)}
                      {entry.actor && entry.actor.name && (
                        <span className="ml-2">
                          by {entry.actor.name}
                          {entry.actor.role && (
                            <span className="text-gray-400"> ({entry.actor.role})</span>
                          )}
                        </span>
                      )}
                    </div>
                    {entry.note && (
                      <div className="text-xs text-gray-600 dark:text-gray-300 mt-1 italic">
                        "{entry.note}"
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </CollapsibleSection>
  );
}

  // Suggested prompts
  const [suggestedPrompts, setSuggestedPrompts] = useState([]);
  const [suggestedPromptsLoading, setSuggestedPromptsLoading] = useState(false);
  const [suggestedPromptsError, setSuggestedPromptsError] = useState(null);


  useEffect(() => {
    if (!tid) return;
    setSuggestedPromptsLoading(true);
    setSuggestedPromptsError(null);

    apiGet(`/threads/${tid}/suggested-prompts`)
      .then((data) => {
        let prompts = Array.isArray(data.prompts) ? data.prompts : [];
        setSuggestedPrompts(prompts);
      })
      .catch(() => setSuggestedPromptsError("Failed to load suggestions"))
      .finally(() => setSuggestedPromptsLoading(false));
  }, [tid, API_BASE]);


  const showPendingSolutionAsChatAndClear = (solutionText) => {
    const text = String(solutionText || '').trim();

    // 1) Close the panel FIRST so we don't suppress solution bubbles
    setPendingSolution(null);

    // 2) No text? nothing to render
    if (!text) return;

    // 3) Push a normal assistant bubble
    setMessages(prev => [
      ...prev,
      {
        id: `temp-${tempIdRef.current++}`,
        sender: 'bot',
        type: 'solution',              // render like a normal assistant "solution"
        content: text,
        timestamp: new Date().toISOString(),
      },
    ]);
  };



  const handleSuggestedPromptClick = async (prompt) => {
    console.debug('[DEBUG] Suggested prompt clicked:', prompt);
    const trimmed = (prompt || '').trim();
    setNewMsg('');

    if (DRAFT_EMAIL_OPEN_EMPTY_RE.test(trimmed)) {
      setNewMsg('');
      setMessages(prev => [
        ...prev,
        {
          id: `temp-${tempIdRef.current++}`,
          sender: 'user',
          content: trimmed,
          source: 'suggested',
          timestamp: new Date().toISOString()
        }
      ]);
      const best = (await ensureSolutionThenGet()) || '';
      if (best.trim()) setPendingSolution(best.trim());
      openDraftEditor('');
      return;
    }

    if (DRAFT_EMAIL_WITH_SOLUTION_RE.test(trimmed) || GENERIC_DRAFT_EMAIL_RE.test(trimmed)) {
      setNewMsg('');
      setMessages(prev => [
        ...prev,
        {
          id: `temp-${tempIdRef.current++}`,
          sender: 'user',
          content: trimmed,
          source: 'suggested',
          timestamp: new Date().toISOString()
        }
      ]);
      // Show the Proposed Solution panel first (no editor yet)
      let best = (await ensureSolutionThenGet()) || '';
      if (typeof best !== 'string') best = String(best ?? '');
      const clean = best.trim();
      if (clean) setPendingSolution(clean);
      return;

    }

    // Fallback: treat as normal chat input
    setNewMsg(trimmed);
    // Fallback: send directly (mark as suggested)
    await sendMessage(trimmed, { source: 'suggested', intent: 'suggested' });
  };

  // Related tickets
  const [relatedTickets, setRelatedTickets] = useState([]);
  const [relatedTicketsLoading, setRelatedTicketsLoading] = useState(false);
  const [relatedTicketsError, setRelatedTicketsError] = useState(null);

  useEffect(() => {
    if (!tid) return;
    setRelatedTicketsLoading(true);
    setRelatedTicketsError(null);
    apiGet(`/threads/${tid}/related-tickets`)
      .then(data => setRelatedTickets(Array.isArray(data.tickets) ? data.tickets : []))
      .catch(() => setRelatedTicketsError('Failed to load related tickets'))
      .finally(() => setRelatedTicketsLoading(false));
  }, [tid]);

  const handleRelatedTicketClick = (t) => {
    if (!t?.id) return;
    setParentThreadId(activeThreadId);
    setActiveThreadId(String(t.id));
  };

  // Chat send
  const sendMessage = async (overrideText = null, options = {}) => {
    const text = String(overrideText ?? newMsg).trim();

    // Decide the intent for this message
    const isExplicitSolution = EXPLICIT_SOLUTION_INTENT_RE.test(text);
    lastUserIntentRef.current = options.intent || (isExplicitSolution ? 'explicit_solution' : 'normal');

    if (!text) return;



    // If user types 'escalate this ticket', trigger escalation
    if (/^escalate this ticket$/i.test(text.trim())) {
      setNewMsg('');
      setMessages(prev => [
        ...prev,
        {
          id: `temp-${tempIdRef.current++}`,
          sender: 'user',
          content: text,
          source: options.source || 'typed',
          timestamp: new Date().toISOString()
        }
      ]);
      // Call the escalate endpoint
      try {
        const resp = await fetch(`${API_BASE}/threads/${tid}/escalate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          credentials: 'include',
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || 'Failed to escalate');
          setMessages(prev => [
            ...prev,
            {
              id: `temp-${Date.now()}-escalate`,
              sender: 'bot',
              content: 'Ticket escalated to L2 support.',
              type: 'info',
              timestamp: new Date().toISOString(),
            },
          ]);
          setPendingSolution(null); // Hide solution box if open
        setTimelineRefresh(x => x + 1);
      } catch (e) {
        setMessages(prev => [
          ...prev,
          {
            id: `temp-${Date.now()}-escalate-error`,
            sender: 'bot',
              content: `Failed to escalate: ${e.message || e}`,
              type: 'error',
            timestamp: new Date().toISOString(),
          },
        ]);
      }
      return;
    }

    // If user types a draft email request, open only the editor (no solution box)
    // 1) Explicitly open an empty editor (keep this behavior)
    if (DRAFT_EMAIL_OPEN_EMPTY_RE.test(text)) {
      setNewMsg('');
      setMessages(prev => [
        ...prev,
        {
          id: `temp-${tempIdRef.current++}`,
          sender: 'user',
          content: text,
          source: options.source || 'typed',
          timestamp: new Date().toISOString()
        }
      ]);
      setPendingSolution(null);
      openDraftEditor(''); // empty editor by request
      return;
    }

    // 2) Draft email intent (generic or with solution) → show Proposed Solution first
    if (DRAFT_EMAIL_WITH_SOLUTION_RE.test(text) || GENERIC_DRAFT_EMAIL_RE.test(text)) {
      setNewMsg('');
      setMessages(prev => [
        ...prev,
        {
          id: `temp-${tempIdRef.current++}`,
          sender: 'user',
          content: text,
          source: options.source || 'typed',
          timestamp: new Date().toISOString()
        }
      ]);
      let best = (await ensureSolutionThenGet()) || '';
      if (typeof best !== 'string') best = String(best ?? '');
      const clean = best.trim();
      if (clean) setPendingSolution(clean); // ← show panel, NOT the editor
      return;
    }



    setSending(true);
    setError(null);
    setNewMsg('');

    setMessages(prev => [
      ...prev,
      { id: `temp-${tempIdRef.current++}`, sender: 'user', content: text, timestamp: new Date().toISOString() }
    ]);

    // show a typing placeholder to improve perceived latency
    const tempTypingId = `typing-${Date.now()}`;
    setMessages(prev => [
      ...prev,
      { id: tempTypingId, sender: 'assistant', content: '…thinking', type: 'info', timestamp: new Date().toISOString() }
    ]);


    try {
      const lastMessages = buildHistory([
        ...messages,
        { sender: 'user', content: text }  // <- include current user message
      ]);
      const data = await apiPost(`/threads/${tid}/chat`, {
        message: text,
        history: lastMessages,
        no_store: true,
        ...(options.source ? { source: options.source } : {}),
      });

      // Check for @mentions in the message and trigger refresh
      const mentionRegex = /@[\w]+/g;
      const mentions = text.match(mentionRegex);
      if (mentions && mentions.length > 0) {
        // Trigger mentions refresh for real-time updates
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('refreshMentions'));
        }, 500); // Small delay to ensure backend processing is complete
      }

      setMessages(prev => {
      let arr = prev.filter(m => m.id !== tempTypingId);

      // 1) Solution shape
      if (data?.type === 'solution' && typeof data.text === 'string' && data.text.trim()) {
        if (lastUserIntentRef.current === 'explicit_solution') {
          // Only open the Proposed Solution panel for explicit intent
          setPendingSolution(data.text);
          return arr;
        }
        // Otherwise show as a normal assistant bubble
        arr = [...arr, {
          id: `temp-${tempIdRef.current++}`,
          sender: 'bot',
          content: data.text,
          type: 'solution',
          timestamp: new Date().toISOString(),
        }];
        return arr;
      }

      // 2) Step-by-step shape
      if (data?.reply && typeof data.reply === 'object' && data.reply !== null) {
        const steps = Object.values(data.reply);
        arr = [...arr, {
          id: `temp-${tempIdRef.current++}`,
          sender: 'bot',
          content: steps[0],
          step: 1,
          total: steps.length,
          timestamp: new Date().toISOString()
        }];
        setStepInfo({ step: 1, total: steps.length, steps });
        setShowSolutionPrompt(false);
        return arr;
      }

      // 3) Plain chat shape
      arr = [...arr, {
        id: `temp-${tempIdRef.current++}`,
        sender: 'bot',
        content: toDisplayString(data.reply ?? ''),
        step: data.step,
        total: data.total,
        timestamp: new Date().toISOString()
      }];

      if (typeof data.step === 'number' && typeof data.total === 'number') {
        setStepInfo({ step: data.step, total: data.total });
        setShowSolutionPrompt(false);
      } else if (typeof data.reply === 'string' && data.reply.trim() === 'Did this solve your issue?') {
        setShowSolutionPrompt(true);
        setStepInfo(null);
      } else {
        setStepInfo(null);
        setShowSolutionPrompt(false);
      }

      return arr;
    });

    } catch (e) {
      setMessages(prev => prev.filter(m => m.id !== tempTypingId));
      setError(`Failed to send message: ${e.message}`);
    } finally {
      setSending(false);
    }
  };

  // Step confirm
  const confirmStep = async ok => {
    if (!stepInfo) return;
    setLoadingStep(true);
    setStepError(null);
    try {
      if (stepInfo.steps && Array.isArray(stepInfo.steps)) {
        const nextStep = stepInfo.step + 1;
        if (nextStep <= stepInfo.total) {
          setMessages(prev => [
            ...prev,
            {
              id: `temp-${tempIdRef.current++}`,
              sender: 'bot',
              content: stepInfo.steps[nextStep - 1],
              step: nextStep,
              total: stepInfo.total,
              timestamp: new Date().toISOString()
            }
          ]);
          if (nextStep === stepInfo.total) {
            setShowSolutionPrompt(true);
            setStepInfo(null);
          } else {
            setStepInfo({ ...stepInfo, step: nextStep });
            setShowSolutionPrompt(false);
          }
        }
        setLoadingStep(false);
        return;
      }

      const data = await apiPost(`/threads/${tid}/step`, { ok });
      if (typeof data.step === 'number' && typeof data.total === 'number') {
        if (data.step === data.total) {
          setMessages(prev => [
            ...prev,
            { id: `temp-${tempIdRef.current++}`, sender: 'bot', content: data.reply, step: data.step, total: data.total, timestamp: new Date().toISOString() },
            { id: `temp-${tempIdRef.current++}`, sender: 'bot', content: 'Did this solve your issue?', timestamp: new Date().toISOString() }
          ]);
          setShowSolutionPrompt(true);
          setStepInfo(null);
        } else {
          setMessages(prev => [
            ...prev,
            { id: `temp-${tempIdRef.current++}`, sender: 'bot', content: data.reply, step: data.step, total: data.total, timestamp: new Date().toISOString() }
          ]);
          setStepInfo({ step: data.step, total: data.total });
          setShowSolutionPrompt(false);
        }
      } else if (typeof data.reply === 'string' && data.reply.trim() === 'Did this solve your issue?') {
        setMessages(prev => [...prev, { id: `temp-${tempIdRef.current++}`, sender: 'bot', content: data.reply, timestamp: new Date().toISOString() }]);
        setShowSolutionPrompt(true);
        setStepInfo(null);
      } else {
        setMessages(prev => [...prev, { id: `temp-${tempIdRef.current++}`, sender: 'bot', content: 'Did this solve your issue?', timestamp: new Date().toISOString() }]);
        setShowSolutionPrompt(true);
        setStepInfo(null);
      }
    } catch (e) {
      setStepError(e.message);
    } finally {
      setLoadingStep(false);
    }
  };

  // Solution response (kept for completeness; not wired to UI prompt here)
  const handleSolutionResponse = async (solved) => {
    setShowSolutionPrompt(false);
    try {
      const data = await apiPost(`/threads/${tid}/solution`, { solved });
      setMessages(prev => [
        ...prev,
        {
          id: `temp-${tempIdRef.current++}`,
          sender: 'bot',
          content: solved ? '🎉 Glad I could help!' : '🚀 Ticket escalated to L2 support.',
          timestamp: new Date().toISOString()
        }
      ]);
      setTicket(t => ({ ...t, status: data.status }));
    } catch (e) {
      setMessages(prev => [
        ...prev,
        { id: `temp-${tempIdRef.current++}`, sender: 'system', content: `Solution update failed: ${e.message}`, timestamp: new Date().toISOString() }
      ]);
    }
  };

  // New escalation function that uses the popup form data
  const handleEscalateWithForm = async (escalationData) => {
    setActionLoading(true);
    setActionError(null);
    try {
      const reportLines = [];
      reportLines.push(`Ticket ID: ${tid}`);
      if (ticket?.status) reportLines.push(`Status: ${ticket.status}`);
      if (ticket?.category) reportLines.push(`Category: ${ticket.category}`);
      if (ticket?.subject) reportLines.push(`Subject: ${ticket.subject}`);
      if (ticket?.text) reportLines.push(`Text: ${ticket.text}`);
      reportLines.push('--- Chat History ---');
      messages.forEach(msg => {
        reportLines.push(`[${msg.sender}] ${typeof msg.content === 'string' ? msg.content : '[non-text content]'}`);
      });
      const reportText = reportLines.join('\n');

      const data = await apiPost(`/threads/${tid}/escalate`, escalationData);
      
      // Update ticket status and level
      setTicket(t => ({ ...t, status: data.status, level: data.level }));

      // Add escalation message from backend response
      if (data.message) {
        setMessages(prev => [
          ...prev,
          {
            id: `temp-${Date.now()}-escalate`,
            sender: 'bot',
            content: data.message.content + (notifyUser ? ' (notification sent)' : ' (no notification)'),
            timestamp: data.message.timestamp,
          }
        ]);
      }

      // Generate and offer download of report
      const blob = new Blob([reportText], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      setMessages(prev => [
        ...prev,
        { 
          id: `temp-${Date.now()}-dl`, 
          sender: 'bot', 
          content: <a href={url} download={`ticket_${tid}_report.txt`} className="underline text-blue-600">📄 Download Report: ticket_{tid}_report.txt</a>, 
          timestamp: new Date().toISOString() 
        }
      ]);
      
      // Refresh timeline and mentions
      setTimelineRefresh(x => x + 1);
      // Trigger mentions refresh to update sidebar counts
    } catch (e) {
      setActionError(e.message || String(e));
      throw e; // Re-throw to be handled by popup
    } finally {
      setActionLoading(false);
    }
  };

  // New de-escalation function that uses the popup form data
  const handleDeescalateWithForm = async (deescalationData) => {
    setActionLoading(true);
    setActionError(null);
    try {
      const data = await apiPost(`/threads/${tid}/deescalate`, deescalationData);
      
      // Update ticket status and level
      setTicket(t => ({ ...t, status: data.status, level: data.level }));

      // Add de-escalation message from backend response
      if (data.message) {
        setMessages(prev => [
          ...prev,
          {
            id: `temp-${Date.now()}-deescalate`,
            sender: 'bot',
            content: data.message.content + (notifyUser ? ' (notification sent)' : ' (no notification)'),
            timestamp: data.message.timestamp,
          }
        ]);
      }
      
      // Refresh timeline and mentions
      setTimelineRefresh(x => x + 1);
      // Trigger mentions refresh to update sidebar counts
    } catch (e) {
      setActionError(e.message || String(e));
      throw e; // Re-throw to be handled by popup
    } finally {
      setActionLoading(false);
    }
  };

 

  // Escalate / Close (with downloadable report) - Legacy function for non-popup escalations
  const handleAction = async action => {
    setActionLoading(true);
    setActionError(null);
    try {
      if (action === 'escalate') {
        // Use the new form-based escalation with default reason
        await handleEscalateWithForm({ reason: 'Standard escalation request' });
        return;
      }
      
      // Keep existing logic for close action
      if (action === 'close') {
        const data = await apiPost(`/threads/${tid}/close`, { 
                notify: notifyUser,
                reason: closeReason 
              });
              setTicket(t => ({ ...t, status: data.status }));
              setMessages(prev => [
                ...prev,
                {
                  id: `temp-${Date.now()}-close`,
                  sender: 'bot',
                  content: `✅ Ticket closed. Reason: ${data.reason || 'No reason provided'}${notifyUser ? ' (notification sent)' : ' (no notification)'}`,
                  timestamp: new Date().toISOString()
                }
              ]);
              
              // Refresh timeline and mentions
              setTimelineRefresh(x => x + 1);
              window.dispatchEvent(new CustomEvent('refreshMentions'));
            }
      // Archive action
      if (action === 'archive') {
          const data = await apiPost(`/threads/${tid}/archive`, { reason: archiveReason });
          setTicket(t => ({ ...t, archived: data.archived }));
          setMessages(prev => [
          ...prev,
            {
              id: `temp-${Date.now()}-archive`,
              sender: 'bot',
              content: `📦 Ticket archived. Reason: ${data.reason || 'No reason provided'}`,
              timestamp: data.message?.timestamp || new Date().toISOString()
            }
          ]);
              
            // Refresh timeline
            setTimelineRefresh(x => x + 1);
      }

      // Unarchive action
      if (action === 'unarchive') {
        const data = await apiPost(`/threads/${tid}/unarchive`, {});
        setTicket(t => ({ ...t, archived: data.archived, status: data.status }));
        setMessages(prev => [
          ...prev,
          {
            id: `temp-${Date.now()}-unarchive`,
            sender: 'bot',
            content: data.message?.content || '📤 Ticket unarchived.',
            timestamp: data.message?.timestamp || new Date().toISOString()
          }
        ]);
        
        // Refresh timeline
        setTimelineRefresh(x => x + 1);
      }
    } catch (e) {
      setActionError('Failed to update ticket.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCloseConfirm = async () => {
    if (!closeReason.trim()) {
      alert('Please provide a reason for closing this ticket');
      return;
    }
    
    try {
      await handleAction('close');
      setShowCloseConfirm(false);
      setCloseReason('');
    } catch (error) {
      console.error('Failed to close ticket:', error);
    }
  };

  const handleArchiveConfirm = async () => {
    if (!archiveReason.trim()) {
      alert('Please provide a reason for archiving this ticket');
      return;
    }
    
    try {
      await handleAction('archive');
      setShowArchiveConfirm(false);
      setArchiveReason('');
    } catch (error) {
      console.error('Failed to archive ticket:', error);
    }
  };

  // TicketHeader
  function TicketHeader({ ticket, onBack, onEscalate, onClose, actionLoading, darkMode, setDarkMode}) {
    // Legacy handleDeescalate removed - now using professional popup system

    return (
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-black/80 backdrop-blur-md sticky top-0 z-40">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2 rounded-full bg-slate-100 hover:bg-slate-200 transition text-slate-700 font-bold"
            aria-label="Back"
          >←</button>
          <span className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            Ticket #{ticket?.id || tid}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {typeof ticket?.level === 'number' && (
            <span
              className={
                `px-3 py-1 rounded-full text-sm font-semibold mr-1 ` +
                (ticket.level === 1
                  ? 'bg-blue-100 text-blue-800'
                  : ticket.level === 2
                  ? 'bg-purple-100 text-purple-800'
                  : 'bg-red-100 text-red-800')
              }
            >
              L{ticket.level}
            </span>
          )}
          {ticket?.status && (
            <span
              className={
                `px-3 py-1 rounded-full text-sm font-semibold mr-2 ` +
                (ticket.status?.toLowerCase() === 'open'
                  ? 'bg-green-100 text-green-800'
                  : ticket.status?.toLowerCase() === 'escalated'
                  ? 'bg-orange-100 text-orange-800'
                  : ticket.status?.toLowerCase() === 'deescalated'
                  ? 'bg-blue-200 text-blue-900 border border-blue-400'
                  : ticket.status?.toLowerCase() === 'closed'
                  ? 'bg-gray-200 text-gray-700'
                  : 'bg-blue-100 text-blue-800')
              }
            >
              {ticket.status?.toLowerCase() === 'deescalated' ? 'Deescalated' : ticket.status}
            </span>
          )}

          {/* Notify toggle for close/escalate context */}
          <label className="flex items-center gap-2 px-3 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 text-xs sm:text-sm select-none cursor-pointer">
            <input
              type="checkbox"
              className="accent-indigo-600 cursor-pointer"
              checked={notifyUser}
              onChange={e => setNotifyUser(e.target.checked)}
            />
            Notify user
          </label>

          {/* Escalate: L1, L2, L3, MANAGER */}
          <Gate roles={["L1", "L2", "L3", "MANAGER"]}>
            <button
              onClick={() => setShowEscalationPopup(true)}
              disabled={actionLoading}
              className="flex items-center gap-1 px-3 py-1 bg-amber-500 text-white rounded-full hover:bg-amber-600 transition disabled:opacity-50 text-sm shadow-sm"
            >🛠 Escalate</button>
          </Gate>

          {/* De-escalate: L2, L3, MANAGER only */}
          <Gate roles={["L2", "L3", "MANAGER"]}>
            {ticket?.level > 1 && (
              <button
                onClick={() => setShowDeescalationPopup(true)}
                disabled={actionLoading}
                className="flex items-center gap-1 px-3 py-1 bg-amber-500 text-white rounded-full hover:bg-amber-600 transition disabled:opacity-50 text-sm shadow-sm"
              >↩️ De-escalate</button>
            )}
          </Gate>

          {/* Close: MANAGER */}
          <Gate roles={["L2", "L3", "MANAGER"]}>
            {(ticket?.status === 'open' || ticket?.status === 'escalated') && (
              <button
                onClick={() => setShowCloseConfirm(true)}
                disabled={actionLoading}
                className="flex items-center gap-1 px-3 py-1 bg-rose-600 text-white rounded-full hover:bg-rose-700 transition disabled:opacity-50 text-sm shadow-sm"
              >🚫 Close</button>
            )}
          </Gate>

          {/* Archive/Unarchive: L2, L3, MANAGER only for closed tickets */}
          <Gate roles={["L2", "L3", "MANAGER"]}>
          {(ticket?.status === 'closed' || ticket?.status === 'resolved') && !ticket?.archived && (
              <button
                onClick={() => setShowArchiveConfirm(true)}
                disabled={actionLoading}
                className="flex items-center gap-1 px-3 py-1 bg-violet-600 text-white rounded-full hover:bg-violet-700 transition disabled:opacity-50 text-sm shadow-sm"
              >📦 Archive</button>
            )}
            {ticket?.archived && (
              <button
                onClick={() => handleAction('unarchive')}
                disabled={actionLoading}
                className="flex items-center gap-1 px-3 py-1 bg-emerald-600 text-white rounded-full hover:bg-emerald-700 transition disabled:opacity-50 text-sm shadow-sm"
              >📤 Unarchive</button>
            )}
          </Gate>

        </div>
      </div>
    );
  }

  // Email send (used by DraftEmailEditor)
  const handleSendFinalEmail = async () => {
    // Re-sanitize in case anything was edited in the UI
    let emailToSend = sanitizeEmailBody(draftEditorBody);
    if (aiDraft && showAIDisclaimer) {
      emailToSend = `${emailToSend}\n\n—\nAutomated draft: Created by our AI support assistant and reviewed by our team.`;
    }
    const ccList = cc
      .split(/[,\s;]+/)
      .map(s => s.trim())
      .filter(Boolean);
    const ccUnique = [...new Set(ccList.map(e => e.toLowerCase()))];
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const invalid = ccUnique.filter(e => !EMAIL_RE.test(e));
    if (invalid.length) {
      setActionError(`Invalid CC ${invalid.length > 1 ? 'addresses' : 'address'}: ${invalid.join(', ')}`);
      return;
    }

    try {
      setSending(true);
      setActionError(null);
      
      // Use apiPost for proper authentication and error handling
      console.log('Sending email to:', `/threads/${tid}/send-email`);
      console.log('Email data:', { email: emailToSend.substring(0, 100) + '...', cc: ccUnique });
      
      const data = await apiPost(`/threads/${tid}/send-email`, {
        email: emailToSend,
        cc: ccUnique
      });
      
      console.log('Email send response:', data);

      setMessages(prev => [
        ...prev,
        {
          id: `temp-${Date.now()}`,
          sender: 'system',
          content: `📤 Email sent to ${data.recipient}${ccUnique.length ? ` (cc: ${ccUnique.join(', ')})` : ''}.`,
          timestamp: new Date().toISOString()
        }
      ]);

      setShowDraftEditor(false);
      setDraftEditorBody('');
      setCc('');
      setTimelineRefresh(x => x + 1);
    } catch (e) {
      setActionError(e.message || 'Failed to send email');
    } finally {
      setSending(false);
    }
  };

  if (loading) return <div className="p-6 text-center text-gray-500">Loading chat…</div>;
  if (error)   return <div className="p-6 text-center text-red-500">{error}</div>;

  // =========================
  // Render
  // =========================
  return (
    <>

      <div className={`flex flex-col h-full min-h-screen w-full ${darkMode ? 'dark' : ''} ${className} bg-white dark:bg-black transition-colors`}>
        <TicketHeader
          ticket={ticket}
          onBack={parentThreadId ? () => { setActiveThreadId(parentThreadId); setParentThreadId(null); } : onBack}
          onEscalate={() => handleAction('escalate')}
          onClose={() => handleAction('close')}
          actionLoading={actionLoading}
          darkMode={darkMode}
          setDarkMode={setDarkMode}
        />

        {/* Ticket Info Card */}
        <div className="flex-shrink-0">
          <TicketInfoCard ticket={ticket} />
        </div>

        {/* Main Content Area - Chat + Right Sidebar */}
        <div className="flex-1 flex overflow-hidden">
            {/* Main Chat Area */}
            <div className="flex-1 flex flex-col min-w-0 relative" style={{maxWidth: 'calc(100% - 320px)', height: 'calc(100vh - 250px)'}}>
              {/* Messages */}
               <div
                 ref={scrollRef}
                 className="flex-1 overflow-y-scroll p-3 lg:p-4 space-y-3 bg-[#F9FAFB] dark:bg-black scroll-smooth"
                 style={{ paddingBottom: '120px', maxHeight: 'calc(100vh - 400px)' }}
              >
                {displayMessages.map((msg, i) => {
                // Suppress bot message bubble if it looks like a draft email (starts with 'Subject:')
                if ((msg.sender === 'bot' || msg.sender === 'assistant' || msg.type === 'email') && typeof msg.content === 'string' && msg.content.trim().startsWith('Subject:')) {
                  return null;
                }
                if (msg.type === 'solution') {
                  // While the Proposed Solution panel is visible, keep solutions out of the stream.
                  if (pendingSolution) return null;
                  // After you dismiss (pendingSolution is null), show solution messages in-stream.
                  // fall through and render like normal
                }

                const isUser = msg.sender === 'user';
                const isBot = msg.sender === 'bot' || msg.sender === 'assistant';
                const isSystem = msg.sender === 'system';
                const isSystemEvent = [
                  'not_fixed_feedback',
                  'system',
                  'diagnostics',
                  'email_sent',
                  'escalated',
                  'closed',
                  'deescalated',
                  'step',
                  'info',
                  'event',
                ].includes(msg.type);

                let displayContent = toDisplayString(msg.content);
                if (msg.downloadUrl && msg.downloadName) {
                  displayContent = (
                    <a href={msg.downloadUrl} download={msg.downloadName} className="underline text-blue-600">
                      {msg.downloadName}
                    </a>
                  );
                }

                // Left-aligned for bot/system
                if (isBot || isSystem || isSystemEvent) {
                  let icon = '🤖';
                  if (msg.type === 'not_fixed_feedback') icon = '🚫';
                  if (msg.type === 'diagnostics') icon = '🧪';
                  if (msg.type === 'email_sent') icon = '✉️';
                  if (msg.type === 'escalated') icon = '🛠';
                  if (msg.type === 'closed') icon = '🚫';
                  if (msg.type === 'deescalated') icon = '↩️';
                  if (msg.type === 'step') icon = '🪜';
                  if (msg.type === 'info') icon = 'ℹ️';
                  if (msg.type === 'event') icon = '📌';
                  return (
                    <div
                      key={msg.id ?? i}
                      ref={el => { if (el && msg.id) messageRefs.current[msg.id] = el; }}
                      className="flex w-full group justify-start"
                    >
                      <div className="bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-bl-3xl rounded-br-3xl rounded-tl-xl rounded-tr-lg border border-gray-200 dark:border-gray-700" style={{ padding: '12px 20px', margin: '4px 0', maxWidth: 'min(75%, 600px)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                        <div className="font-medium text-xs flex items-center gap-2 mb-1">
                          <span>{icon}</span>
                          <span className="inline-block align-middle text-[13px]">
                            {typeof displayContent === 'string'
                              ? renderListOrText(displayContent, (s) => renderContentWithMentions(s, handleMentionClick))
                              : displayContent}
                          </span>
                        </div>
                        <div className="text-[10px] text-gray-400 dark:text-gray-300 text-right mt-2">
                          {msg.timestamp ? dayjs(msg.timestamp).format('HH:mm') : ''}
                        </div>
                      </div>
                    </div>
                  );
                }

                // Right-aligned user messages
                return (
                  <div
                    key={msg.id ?? i}
                    ref={el => { if (el && msg.id) messageRefs.current[msg.id] = el; }}
                    className={["flex w-full group", isUser ? 'justify-end' : 'justify-start'].join(' ')}
                  >
                    <div className={
                      isUser
                        ? 'bg-blue-100 dark:bg-blue-900 text-blue-900 dark:text-blue-100 rounded-tr-3xl rounded-bl-3xl rounded-tl-xl rounded-br-lg'
                        : 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-bl-3xl rounded-br-3xl rounded-tl-xl rounded-tr-lg'
                    } style={{ padding: '12px 20px', margin: '4px 0', maxWidth: 'min(75%, 600px)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                      <div className="font-medium text-xs">
                        <span className="inline-block align-middle text-[13px]">
                          {typeof displayContent === 'string'
                            ? renderListOrText(displayContent, (s) => renderContentWithMentions(s, handleMentionClick))
                            : displayContent}
                        </span>
                      </div>
                      <div className="text-[10px] text-gray-400 dark:text-gray-300 text-right mt-2">
                        {msg.timestamp ? dayjs(msg.timestamp).format('HH:mm') : ''}
                      </div>
                    </div>
                  </div>
                );
              })}


                {/* Proposed Solution panel */}
                <div ref={solutionPanelRef}>
                  <ProposedSolutionBox
                    text={pendingSolution}
                    onDraft={async () => {
                      const sol = (await ensureSolutionThenGet()) || getLastSolutionText() || '';
                      const emailBody = await draftFromBackendOrBuild(sol);
                      setPendingSolution(null);
                      openDraftEditor(emailBody);
                    }}
                    onDismiss={showPendingSolutionAsChatAndClear}
                     
                  />
                </div>

                <div ref={scrollBottomRef} />
              </div>

              {/* Draft Email Editor */}
              <DraftEmailEditor
                open={showDraftEditor}
                body={draftEditorBody}
                setBody={setDraftEditorBody}
                cc={cc}
                setCc={setCc}
                loading={sending}
                error={actionError}
                onSend={handleSendFinalEmail}
                aiDraft={aiDraft}
                showAIDisclaimer={showAIDisclaimer}
                setShowAIDisclaimer={setShowAIDisclaimer}
                onCancel={() => {
                  setShowDraftEditor(false);
                  if (draftEditorBody) {
                    setMessages(prev => [
                      ...prev,
                      {
                        id: `temp-${tempIdRef.current++}`,
                        sender: 'bot',
                        content: draftEditorBody,
                        type: 'draft_email',
                        timestamp: new Date().toISOString(),
                      },
                    ]);
                  }
                }}
              />

               {/* Composer - Positioned slightly higher */}
               <div className="absolute bottom-5 left-0 right-0 z-50">
                 <ChatComposer
                   value={newMsg}
                   onChange={v => {
                     if (typeof v === 'string') setNewMsg(v);
                     else if (v && v.target && typeof v.target.value === 'string') setNewMsg(v.target.value);
                   }}
                   onSend={sendMessage}
                   sending={sending}
                   textareaRef={textareaRef}
                   drawerOpen={showDraftEditor}
                 />
               </div>
            </div>

          {/* RIGHT: Collapsibles Sidebar - Always Visible */}
          <div className="w-80 bg-white border-l border-gray-200 overflow-y-auto" style={{minWidth: '320px', maxWidth: '320px'}}>
            <div className="p-4 space-y-4">
              <TimelinePanel
                events={timeline}
                loading={timelineLoading}
                error={timelineError}
                openSections={openSections}
                toggleSection={toggleSection}
              />
              <SuggestedPrompts
                threadId={tid}
                prompts={suggestedPrompts}
                open={panelOpen}
                onToggle={() => setPanelOpen(v => !v)}
                apiBase={API_BASE}
                onPromptSelect={handleSuggestedPromptClick}
              />
              <RelatedTicketList
                tickets={relatedTickets}
                loading={relatedTicketsLoading}
                error={relatedTicketsError}
                onClick={handleRelatedTicketClick}
                openSections={openSections}
                toggleSection={toggleSection}
              />
              <StepProgressBar stepInfo={stepInfo} />
            </div>
          </div>
        </div>
      </div>
      
      {/* Escalation Popup */}
      <EscalationPopup
        isOpen={showEscalationPopup}
        onClose={() => setShowEscalationPopup(false)}
        onEscalate={handleEscalateWithForm}
        ticketId={tid}
        ticket={ticket}
      />

      {/* De-escalation Popup */}
      <DeescalationPopup
        isOpen={showDeescalationPopup}
        onClose={() => setShowDeescalationPopup(false)}
        onDeescalate={handleDeescalateWithForm}
        ticketId={tid}
        ticket={ticket}
      /> 

      {/* Close Confirmation Modal */}
      {showCloseConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-rose-100 dark:bg-rose-900 rounded-full flex items-center justify-center">
                <span className="text-rose-600 dark:text-rose-400 text-xl">🚫</span>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Close Ticket
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  This will mark the ticket as closed
                </p>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Reason for closing *
              </label>
              <textarea
                value={closeReason}
                onChange={(e) => setCloseReason(e.target.value)}
                placeholder="e.g., Issue resolved, duplicate ticket, invalid request..."
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-red-500 focus:border-red-500 dark:bg-gray-700 dark:text-white"
                rows={3}
                required
              />
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowCloseConfirm(false);
                  setCloseReason('');
                }}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-600 rounded-md hover:bg-gray-200 dark:hover:bg-gray-500 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCloseConfirm}
                disabled={actionLoading || !closeReason.trim()}
                className="px-4 py-2 bg-rose-600 text-white rounded-md hover:bg-rose-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
              >
                {actionLoading ? 'Closing...' : 'Close Ticket'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Archive Confirmation Modal */}
      {showArchiveConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-violet-100 dark:bg-violet-900 rounded-full flex items-center justify-center">
                <span className="text-violet-600 dark:text-violet-400 text-xl">📦</span>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Archive Ticket
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  This will move the ticket to archived status
                </p>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Reason for archiving *
              </label>
              <textarea
                value={archiveReason}
                onChange={(e) => setArchiveReason(e.target.value)}
                placeholder="e.g., Case closed, no further action needed, historical reference..."
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-purple-500 dark:bg-gray-700 dark:text-white"
                rows={3}
                required
              />
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowArchiveConfirm(false);
                  setArchiveReason('');
                }}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-600 rounded-md hover:bg-gray-200 dark:hover:bg-gray-500 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleArchiveConfirm}
                disabled={actionLoading || !archiveReason.trim()}
                className="px-4 py-2 bg-violet-600 text-white rounded-md hover:bg-violet-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
              >
                {actionLoading ? 'Archiving...' : 'Archive Ticket'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default React.memo(ChatHistory);
