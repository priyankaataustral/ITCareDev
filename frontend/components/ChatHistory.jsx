'use client';
import KBDashboard from './KBDashboard';
import Gate from './Gate';
import React, { useEffect, useState, useRef, useMemo } from 'react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
// import { apiFetch } from '/apiFetch';
dayjs.extend(relativeTime);

// =========================
// Config & helpers
// =========================
const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:5000').replace(/\/+$/, '');


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
  // Download summary handler
  const handleDownloadSummary = () => {
    if (!ticket.id) return;
    const url = `${API_BASE}/threads/${ticket.id}/download-summary`;
    // Use browser fetch to get the file and trigger download
    fetch(url, {
      method: 'GET',
      headers: authHeaders(),
    })
      .then(response => response.blob())
      .then(blob => {
        const link = document.createElement('a');
        link.href = window.URL.createObjectURL(blob);
        link.download = `ticket_${ticket.id}_summary.txt`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      });
  };
  return (
    <div className="rounded-xl bg-gradient-to-r from-yellow-50 to-white dark:from-yellow-900 dark:to-black p-4 border-l-4 border-yellow-500 shadow-md mb-4 mx-4 flex items-start gap-4">
      <span className="text-yellow-500 dark:text-yellow-300 text-3xl mt-1">📄</span>
      <div>
        <div className="font-semibold text-yellow-800 dark:text-yellow-200 text-base mb-1">Ticket Summary</div>
        <div className="text-gray-800 dark:text-gray-100 whitespace-pre-line">
          {(ticket.created || ticket.created_at) && <div>🕐 <b>Created:</b> {dayjs(ticket.created || ticket.created_at).format('MMM D, h:mm A')}</div>}
          {ticket.text && <div className="mt-2 text-sm text-gray-600 dark:text-gray-300">{ticket.text}</div>}
        </div>
        {ticket.escalated && (
          <button
            onClick={handleDownloadSummary}
            className="mt-3 px-3 py-1 rounded-full bg-indigo-500 text-white text-sm shadow hover:bg-indigo-600"
          >
            ⬇️ Download Summary
          </button>
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
        <div className="h-2 bg-indigo-500" style={{ width: `${(stepInfo.step / stepInfo.total) * 100}%` }} />
      </div>
      <span className="text-xs text-indigo-700 dark:text-indigo-300 font-semibold">Step {stepInfo.step} of {stepInfo.total} ✔️</span>
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
        <button onClick={onDraft} className="px-3 py-1 rounded-full bg-indigo-600 text-white text-sm">
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
            className="px-4 py-2 rounded-full bg-indigo-600 text-white text-sm disabled:opacity-50"
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
                  className="mb-2 p-2 bg-purple-100 dark:bg-purple-900 rounded-xl text-purple-800 dark:text-purple-100 text-sm shadow-sm cursor-pointer border border-purple-200 dark:border-purple-700 hover:bg-purple-200 dark:hover:bg-purple-800 transition flex flex-col"
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
    <div className={`composer-bar w-full px-4 py-3 bg-white/90 dark:bg-black/90 shadow-xl sticky bottom-0 rounded-t-2xl ` + (drawerOpen ? 'pointer-events-none opacity-40 z-10' : 'z-40')}>
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

// function RightTopPanel({
//   tid,
//   API_BASE,
//   panelOpen,
//   setPanelOpen,
//   suggestedPrompts,
//   suggestedPromptsLoading,
//   suggestedPromptsError,
//   relatedTickets,
//   relatedTicketsLoading,
//   relatedTicketsError,
//   handleRelatedTicketClick,
//   stepInfo,
//   timeline,
//   timelineLoading,
//   timelineError,
//   openSections,
//   toggleSection,
// }) {
//   return (
//     <aside className="flex flex-col gap-2 w-full md:w-80 max-w-xs">
//       {/* Activity collapsible at the top */}
//       <TimelinePanel
//         events={timeline}
//         loading={timelineLoading}
//         error={timelineError}
//         openSections={openSections}
//         toggleSection={toggleSection}
//       />
//       <SuggestedPrompts
//         threadId={tid}
//         prompts={suggestedPrompts}
//         open={panelOpen}
//         onToggle={() => setPanelOpen((v) => !v)}
//         apiBase={API_BASE}
//       />
//       <RelatedTicketList
//         tickets={relatedTickets}
//         loading={relatedTicketsLoading}
//         error={relatedTicketsError}
//         onClick={handleRelatedTicketClick}
//         openSections={openSections}
//         toggleSection={toggleSection}
//       />
//       <StepProgressBar stepInfo={stepInfo} />
//     </aside>
//   );
// }


// =========================
// Main Component
// =========================
function ChatHistory({ threadId, onBack, className = '' }) {
  // Core ticket/messages
  const [ticket, setTicket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [confirmLinks, setConfirmLinks] = useState({ confirm: '', notConfirm: '' });
  const [panelOpen, setPanelOpen] = useState(true); 


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
  const [openSections, setOpenSections] = useState({ suggested: true, related: false, activity: false });
  const toggleSection = (section) => setOpenSections(prev => ({ ...prev, [section]: !prev[section] }));

  // Thread nav
  const [parentThreadId, setParentThreadId] = useState(null);
  const [activeThreadId, setActiveThreadId] = useState(threadId);
  const tid = activeThreadId || threadId;

  // KB overlay
  const [showKB, setShowKB] = useState(false);

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
  // For “show editor empty”
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


//   const getConfirmLinks = async () => {
//   // Use cached if available
//   if (confirmLinks.confirm && confirmLinks.notConfirm) return confirmLinks;

//   // 1) Try direct links endpoint
//   try {
//     const r = await fetch(`${API_BASE}/threads/${tid}/confirm-links`, {
//       headers: authHeaders(),
//       credentials: 'include'
//     });
//     if (r.ok) {
//       const data = await r.json();
//       const links = {
//         confirm: data?.confirm_url || data?.confirm || '',
//         notConfirm: data?.not_confirm_url || data?.notConfirm || data?.deny_url || ''
//       };
//       if (links.confirm && links.notConfirm) {
//         setConfirmLinks(links);
//         return links;
//       }
//     }
//   } catch {}

//   // 2) Try token -> build signed links
//   try {
//     const r2 = await fetch(`${API_BASE}/threads/${tid}/confirm-token`, {
//       method: 'POST',
//       headers: { 'Content-Type': 'application/json', ...authHeaders() },
//       credentials: 'include'
//     });
//     const data2 = await r2.json();
//     if (r2.ok && data2?.token) {
//       const origin = (typeof window !== 'undefined' && window.location?.origin) || 'http://localhost:3000';
//       const links = {
//         confirm: `${origin}/confirm?token=${encodeURIComponent(data2.token)}&a=confirm`,
//         notConfirm: `${origin}/confirm?token=${encodeURIComponent(data2.token)}&a=not_confirm`
//       };
//       setConfirmLinks(links);
//       return links;
//     }
//   } catch {}

//   // 3) **DEMO FALLBACK** (always produce visible links even if unauthorized)
//   const origin = (typeof window !== 'undefined' && window.location?.origin) || 'http://localhost:3000';
//   const demoLinks = {
//     confirm: `${origin}/confirm?thread=${encodeURIComponent(tid)}&a=confirm&demo=1`,
//     notConfirm: `${origin}/confirm?thread=${encodeURIComponent(tid)}&a=not_confirm&demo=1`
//   };
//   setConfirmLinks(demoLinks);
//   return demoLinks;
// };

  // const getConfirmLinks = async () => {
  //   // Use cached if available
  //   if (confirmLinks.confirm && confirmLinks.notConfirm) return confirmLinks;

  //   // Try a direct links endpoint (if your API exposes it)
  //   try {
  //     const r = await fetch(`${API_BASE}/threads/${tid}/confirm-links`, {
  //       headers: authHeaders(),
  //       credentials: 'include'
  //     });
  //     if (r.ok) {
  //       const data = await r.json();
  //       const links = {
  //         confirm: data?.confirm_url || data?.confirm || '',
  //         notConfirm: data?.not_confirm_url || data?.notConfirm || data?.deny_url || ''
  //       };
  //       if (links.confirm && links.notConfirm) {
  //         setConfirmLinks(links);
  //         return links;
  //       }
  //     }
  //   } catch {}

  //   // Otherwise get a token and build the URLs against the app origin
  //   try {
  //     const r2 = await fetch(`${API_BASE}/threads/${tid}/confirm-token`, {
  //       method: 'POST',
  //       headers: { 'Content-Type': 'application/json', ...authHeaders() },
  //       credentials: 'include'
  //     });
  //     const data2 = await r2.json();
  //     if (r2.ok && data2?.token) {
  //       const origin = (typeof window !== 'undefined' && window.location?.origin) || 'http://localhost:3000';
  //       const links = {
  //         confirm: `${origin}/confirm?token=${encodeURIComponent(data2.token)}&a=confirm`,
  //         notConfirm: `${origin}/confirm?token=${encodeURIComponent(data2.token)}&a=not_confirm`
  //       };
  //       setConfirmLinks(links);
  //       return links;
  //     }
  //   } catch {}

  //   // Last resort: empty (won't append)
  //   return { confirm: '', notConfirm: '' };
  // };

  const getConfirmLinks = async () => {
  // Use cache
  if (confirmLinks.confirm && confirmLinks.notConfirm) return confirmLinks;

  // 1) Server-prepared links
  try {
    const r = await fetch(`${API_BASE}/threads/${tid}/confirm-links`, {
      headers: authHeaders(),
      credentials: 'include'
    });
    if (r.ok) {
      const data = await r.json();
      const links = {
        confirm: data?.confirm_url || data?.confirm || '',
        notConfirm: data?.not_confirm_url || data?.notConfirm || data?.deny_url || ''
      };
      if (links.confirm && links.notConfirm) {
        setConfirmLinks(links);
        return links;
      }
    } else {
      console.warn('[getConfirmLinks] confirm-links status:', r.status);
    }
  } catch (e) {
    console.warn('[getConfirmLinks] confirm-links error:', e);
  }

  // 2) Signed token → build URLs
  try {
    const r2 = await fetch(`${API_BASE}/threads/${tid}/confirm-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      credentials: 'include'
    });
    const data2 = await r2.json().catch(() => ({}));
    if (r2.ok && data2?.token) {
      const origin = (typeof window !== 'undefined' && window.location?.origin) || 'http://localhost:3000';
      const links = {
        confirm: `${origin}/solutions/confirm?token=${encodeURIComponent(data2.token)}&a=confirm`,
        notConfirm: `${origin}/solutions/confirm?token=${encodeURIComponent(data2.token)}&a=not_confirm`,
      };
      setConfirmLinks(links);
      return links;
    } else {
      console.warn('[getConfirmLinks] confirm-token status:', r2.status, data2);
    }
  } catch (e) {
    console.warn('[getConfirmLinks] confirm-token error:', e);
  }

  // 3) Dev fallback (lets you SEE links even if you’re logged out)
  const origin = (typeof window !== 'undefined' && window.location?.origin) || 'http://localhost:3000';
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
      ? `I’m following up on your request: "${ticket.text}".`
      : `I’m following up on your request.`;
    return `${greeting}

  ${summary}
  Here’s a quick update: I'm preparing the next steps and will share the final fix shortly.

  Best regards,
  Support Team`;
  };

  // const draftFromBackendOrBuild = async (solutionLike) => {
  //   const candidate = (solutionLike || '').trim();

  //   // Ask backend first (and request links if it supports them)
  //   try {
  //     if (candidate) {
  //       const res = await fetch(`${API_BASE}/threads/${tid}/draft-email`, {
  //         method: 'POST',
  //         headers: { 'Content-Type': 'application/json', ...authHeaders() },
  //         credentials: 'include',
  //         body: JSON.stringify({ solution: candidate, include_links: false })
  //       });
  //       let data = {};
  //       try { data = await res.json(); } catch {}
  //       let email = (data?.email && String(data.email).trim()) || '';

  //       // If backend didn't include the confirm links, append ours
  //       const hasConfirmLinks = /\/confirm\?token=.*?&a=/.test(email);
  //       if (!hasConfirmLinks) {
  //         const links = await getConfirmLinks();
  //         if (links.confirm && links.notConfirm) {
  //           const base = email || buildEmailFromAnyText(candidate);
  //           email = `${base}

  // —

  // Please let us know if the fix worked:

  // ✅ Solution worked: ${links.confirm}
  // ❌ Didn’t solve the problem: ${links.notConfirm}`;
  //         } else if (!email) {
  //           email = buildEmailFromAnyText(candidate);
  //         }
  //       }
  //       return email;
  //     }
  //   } catch {}

  //   // Pure frontend fallback (+links if we can fetch them)
  //   const base = buildEmailFromAnyText(candidate);
  //   const links = await getConfirmLinks();
  //   if (links.confirm && links.notConfirm) {
  //     return `${base}

  // —

  // Please let us know if the fix worked:

  // ✅ Solution worked: ${links.confirm}
  // ❌ Didn’t solve the problem: ${links.notConfirm}`;
  //   }
  //   return base;
  // };

// const draftFromBackendOrBuild = async (solutionLike) => {
//   const candidate = (solutionLike || '').trim();

//   try {
//     if (candidate) {
//       const res = await fetch(`${API_BASE}/threads/${tid}/draft-email`, {
//         method: 'POST',
//         headers: { 'Content-Type': 'application/json', ...authHeaders() },
//         credentials: 'include',
//         body: JSON.stringify({ solution: candidate, include_links: false })
//       });
//       let data = {};
//       try { data = await res.json(); } catch {}
//       let email = (data?.email && String(data.email).trim()) || '';

//       // If backend didn't include the confirm links, insert ours BEFORE "Best regards,"
//       const hasConfirmLinks = /\/confirm\?token=.*?&a=/.test(email);
//       if (!hasConfirmLinks) {
//         const links = await getConfirmLinks();
//         if (links.confirm && links.notConfirm) {
//           const base = email || buildEmailFromAnyText(candidate);
//           const confirmBlock = `Please let us know if the fix worked:

// ✅ Solution worked: ${links.confirm}
// ❌ Didn’t solve the problem: ${links.notConfirm}`;
//           email = insertBeforeBestRegards(base, confirmBlock);
//         } else if (!email) {
//           email = buildEmailFromAnyText(candidate);
//         }
//       }
//       return email;
//     }
//   } catch {}

//   // Pure frontend fallback (+links inserted BEFORE "Best regards,")
//   const base = buildEmailFromAnyText(candidate);
//   const links = await getConfirmLinks();
//   if (links.confirm && links.notConfirm) {
//     const confirmBlock = `Please let us know if the fix worked:

// ✅ Solution worked: ${links.confirm}
// ❌ Didn’t solve the problem: ${links.notConfirm}`;
//     return insertBeforeBestRegards(base, confirmBlock);
//   }
//   return base;
// };

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

  // Backend didn’t give a draft — return a plain, link-free email
  return buildEmailFromAnyText(candidate);
};


// const draftFromBackendOrBuild = async (solutionLike) => {
//   const candidate = (solutionLike || '').trim();

//   // Get base from backend (no links requested) or fallback
//   try {
//     if (candidate) {
//       const res = await fetch(`${API_BASE}/threads/${tid}/draft-email`, {
//         method: 'POST',
//         headers: { 'Content-Type': 'application/json', ...authHeaders() },
//         credentials: 'include',
//         body: JSON.stringify({ solution: candidate, include_links: false })
//       });
//       const data = await res.json().catch(() => ({}));
//       email = (data?.email && String(data.email).trim()) || '';
//     }
//   } catch {}
//   if (!email) email = buildEmailFromAnyText(candidate);

//   // Fetch (or build) links → insert BEFORE "Best regards,"
//   const { confirm, notConfirm } = await getConfirmLinks();
//   const block =
// `Please let us know if the fix worked:

// ✅ Solution worked: ${confirm}
// ❌ Didn’t solve the problem: ${notConfirm}`;

//   return insertBeforeBestRegards(email, block);
// };


// const draftFromBackendOrBuild = async (solutionLike) => {
//   const candidate = (solutionLike || '').trim();

//   try {
//     if (candidate) {
//       // **Ask backend to include links again**
//       const res = await fetch(`${API_BASE}/threads/${tid}/draft-email`, {
//         method: 'POST',
//         headers: { 'Content-Type': 'application/json', ...authHeaders() },
//         credentials: 'include',
//         body: JSON.stringify({ solution: candidate, include_links: true })
//       });

//       let data = {};
//       try { data = await res.json(); } catch {}
//       let email = asPlainTextPreservingLinks((data?.email && String(data.email).trim()) || '');

//       // If backend didn't include the confirm links, or they are missing,
//       // build them and insert BEFORE "Best regards," so sanitize won't cut them.
//       const hasConfirmLinks = /\/confirm\?token=.*?&a=/.test(email);
//       if (!hasConfirmLinks) {
//         const links = await getConfirmLinks();
//         if (links.confirm && links.notConfirm) {
//           const base = email || buildEmailFromAnyText(candidate);
//           const block =
// `Please let us know if the fix worked:

// ✅ Solution worked: ${links.confirm}
// ❌ Didn’t solve the problem: ${links.notConfirm}`;
//           email = insertBeforeBestRegards(base, block);
//         } else if (!email) {
//           email = buildEmailFromAnyText(candidate);
//         }
//       } else {
//         // Backend included links; make sure they survive sanitize by moving them
//         // before "Best regards," if needed.
//         const BR_RE = /(^|\n)\s*Best regards,?/i;
//         if (BR_RE.test(email) && email.indexOf('confirm?') > email.search(BR_RE)) {
//           // If links are after the signature, pull them up above it
//           const after = email.slice(email.search(BR_RE));
//           const before = email.slice(0, email.search(BR_RE));
//           const tailWithLinks = email.match(/.*confirm\?.*$/ms)?.[0] || '';
//           email = before + '\n\n' + tailWithLinks + '\n\n' + after;
//         }
//       }

//       return email;
//     }
//   } catch {}

//   // Pure frontend fallback (+links) — also insert BEFORE "Best regards,"
//   const base = buildEmailFromAnyText(candidate);
//   const links = await getConfirmLinks();
//   if (links.confirm && links.notConfirm) {
//     const block =
// `Please let us know if the fix worked:

// ✅ Solution worked: ${links.confirm}
// ❌ Didn’t solve the problem: ${links.notConfirm}`;
//     return insertBeforeBestRegards(base, block);
//   }
//   return base;
// };



  // Fetch an explicit solution (without adding bubbles), then show the panel
  const ensureSolutionThenGet = async () => {
    let best = getBestSolutionText();
    if (best && best.trim()) return best;

    try {
      const resp = await fetch(`${API_BASE}/threads/${tid}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        credentials: 'include',
        body: JSON.stringify({
          message: 'propose a solution',
          history: buildHistory(messages),
          no_store: true,
          source: 'suggested'
        })
      });
      const data = await resp.json();
      if (resp.ok && data?.type === 'solution' && typeof data.text === 'string' && data.text.trim()) {
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

// // Insert a block right before "Best regards,"
// const insertBeforeBestRegards = (body, block) => {
//   const re = /(^|\n)\s*Best regards,?/i;
//   const m = re.exec(body);
//   if (!m) return `${body.trim()}\n\n${block}`; // fallback if no BR line found
//   return `${body.slice(0, m.index).trimEnd()}\n\n${block}\n\n${body.slice(m.index)}`;
// };


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
    fetch(`${API_BASE}/threads/${activeThreadId}`, { headers: authHeaders(), credentials: 'include' })
      .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
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
    fetch(`${API_BASE}/threads/${activeThreadId}/timeline`, { headers: authHeaders(), credentials: 'include' })
      .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(data => setTimeline(Array.isArray(data) ? data : []))
      .catch(() => setTimelineError('Failed to load timeline'))
      .finally(() => setTimelineLoading(false));
  }, [activeThreadId, timelineRefresh]);

  // Refresh messages when timeline changes (merge, not replace)
  useEffect(() => {
    if (!activeThreadId) return;
    fetch(`${API_BASE}/threads/${activeThreadId}`, { headers: authHeaders(), credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => {
        const fresh = Array.isArray(data.messages)
          ? data.messages.map(m => ({
              ...m,
              sender: (m.sender === 'bot' ? 'assistant' : m.sender),
              content: toDisplayString(m.content),
            }))
          : [];
        setMessages(prev => {
          const seen = new Set(prev.map(m => m.id));
          const merged = [...prev];
          for (const m of fresh) {
            if (m?.source === 'suggested' || m?.transient || m?.meta?.transient) continue;
            if (!m?.id || seen.has(m.id)) continue;
            const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
            const mIsAssistant = m.sender === 'assistant' || m.sender === 'bot';
            const existsByText =
              mIsAssistant &&
              merged.some(p =>
                (p.sender === 'assistant' || p.sender === 'bot') &&
                norm(toDisplayString(p.content)) === norm(toDisplayString(m.content))
              );
            if (existsByText) continue;
            merged.push(m);
          }
          return merged;
        });
      })
      .catch(() => {});
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
    fetch(`${API_BASE}/threads/${activeThreadId}`, { headers: authHeaders(), credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
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
            className="font-bold text-blue-700 bg-blue-100 rounded px-1 mx-0.5 cursor-pointer hover:underline"
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

  // Suggested prompts
  const [suggestedPrompts, setSuggestedPrompts] = useState([]);
  const [suggestedPromptsLoading, setSuggestedPromptsLoading] = useState(false);
  const [suggestedPromptsError, setSuggestedPromptsError] = useState(null);


  useEffect(() => {
    if (!tid) return;
    setSuggestedPromptsLoading(true);
    setSuggestedPromptsError(null);

    fetch(`${API_BASE}/threads/${tid}/suggested-prompts`, { credentials: "include", headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
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
    fetch(`${API_BASE}/threads/${tid}/related-tickets`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
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
      const resp = await fetch(`${API_BASE}/threads/${tid}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        credentials: 'include',
        body: JSON.stringify({
              message: text,
              history: lastMessages,
              no_store: true,
              ...(options.source ? { source: options.source } : {})
            })
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Error');

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

      const resp = await fetch(`${API_BASE}/threads/${tid}/step`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        credentials: 'include',
        body: JSON.stringify({ ok })
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error);
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
      const resp = await fetch(`${API_BASE}/threads/${tid}/solution`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        credentials: 'include',
        body: JSON.stringify({ solved }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Error');
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

  // Escalate / Close (with downloadable report)
  const handleAction = async action => {
    setActionLoading(true);
    setActionError(null);
    try {
      if (action === 'escalate') {
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

        const resp = await fetch(`${API_BASE}/threads/${tid}/escalate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          credentials: 'include',
          body: JSON.stringify({ report: reportText })
        });
        if (!resp.ok) throw new Error('Failed to escalate');
        const data = await resp.json();
        setTicket(t => ({ ...t, status: data.status }));

        const blob = new Blob([reportText], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        setMessages(prev => [
          ...prev,
          { id: `temp-${Date.now()}-escalate`, sender: 'bot', content: `Ticket escalated to L2 support.${notifyUser ? ' (notification sent)' : ' (no notification)'}`, timestamp: new Date().toISOString() },
          { id: `temp-${Date.now()}-dl`, sender: 'bot', content: <a href={url} download={`ticket_${tid}_report.txt`} className="underline text-blue-600">ticket_{tid}_report.txt</a>, timestamp: new Date().toISOString() }
        ]);
        setTimelineRefresh(x => x + 1);
      } else {
        const resp = await fetch(`${API_BASE}/threads/${tid}/close`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          credentials: 'include',
          body: JSON.stringify({ notify: notifyUser })
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || 'Failed to close');

        setTicket(t => ({ ...t, status: data.status }));
        setMessages(prev => [
          ...prev,
          {
            ...(data.message || {}),
            id: `temp-${Date.now()}-close`,
            sender: 'bot',
            content: `${data.message?.content || 'Ticket closed.'}${notifyUser ? ' (notification sent)' : ' (no notification)'}`
          }
        ]);
        setTimelineRefresh(x => x + 1);
      }
    } catch (e) {
      setActionError('Failed to update ticket.');
    } finally {
      setActionLoading(false);
    }
  };

  // TicketHeader
  function TicketHeader({ ticket, onBack, onEscalate, onClose, actionLoading, darkMode, setDarkMode, showKB, setShowKB }) {
    const handleDeescalate = async () => {
      const note = window.prompt('Add a short note for de-escalation (optional):') || '';
      setActionLoading(true);
      try {
        const resp = await fetch(`${API_BASE}/threads/${ticket?.id}/deescalate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          credentials: 'include',
          body: JSON.stringify({ note })
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || 'Failed');
        setTicket(t => ({ ...t, status: data.status, level: Number(data.level) }));
        setMessages(prev => [...prev, {
          id: `temp-${Date.now()}-deesc`,
          sender: 'system',
          content: `↩️ De-escalated to L${data.level}${note ? ` (note: ${note})` : ''}.`
        }]);
        setTimelineRefresh(x => x + 1);
      } catch (e) {
        setActionError(e.message);
      } finally {
        setActionLoading(false);
      }
    };

    return (
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-black/80 backdrop-blur-md sticky top-0 z-40">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2 rounded-full bg-blue-100 hover:bg-blue-200 transition text-blue-700 font-bold"
            aria-label="Back"
          >←</button>
          <span className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            Ticket #{ticket?.id || tid}
          </span>
          <button
            onClick={() => setShowKB(v => !v)}
            className="px-2.5 py-1 rounded-lg ring-1 ring-gray-300 dark:ring-gray-700 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-800 dark:text-gray-100 text-xs"
            aria-label="Show Knowledge Base"
          >📚 KB</button>
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
              onClick={() => handleAction('escalate')}
              disabled={actionLoading}
              className="flex items-center gap-1 px-3 py-1 bg-orange-500 text-white rounded-full hover:bg-orange-600 transition disabled:opacity-50 text-sm"
            >🛠 Escalate</button>
          </Gate>

          {/* De-escalate: L2, L3, MANAGER only */}
          <Gate roles={["L2", "L3", "MANAGER"]}>
            {ticket?.level > 1 && (
              <button
                onClick={handleDeescalate}
                disabled={actionLoading}
                className="flex items-center gap-1 px-3 py-1 bg-amber-500 text-white rounded-full hover:bg-amber-600 transition disabled:opacity-50 text-sm"
              >↩️ De-escalate</button>
            )}
          </Gate>

          {/* Close: MANAGER */}
          <Gate roles={["MANAGER"]}>
            <button
              onClick={() => handleAction('close')}
              disabled={actionLoading}
              className="flex items-center gap-1 px-3 py-1 bg-gray-700 text-white rounded-full hover:bg-gray-900 transition disabled:opacity-50 text-sm"
            >🚫 Close</button>
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
      const res = await fetch(`${API_BASE}/threads/${tid}/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        // credentials: 'include',
        body: JSON.stringify({ email: emailToSend, cc: ccUnique })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Error sending email');

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
      {showKB && <KBDashboard open={showKB} onClose={() => setShowKB(false)} />}

      <div className={`flex flex-col h-full min-h-screen w-full ${darkMode ? 'dark' : ''} ${className} bg-white dark:bg-black transition-colors`}>
        <TicketHeader
          ticket={ticket}
          showKB={showKB}
          setShowKB={setShowKB}
          onBack={parentThreadId ? () => { setActiveThreadId(parentThreadId); setParentThreadId(null); } : onBack}
          onEscalate={() => handleAction('escalate')}
          onClose={() => handleAction('close')}
          actionLoading={actionLoading}
          darkMode={darkMode}
          setDarkMode={setDarkMode}
        />

        <div className="mx-4 md:mx-4 mt-0 md:grid md:grid-cols-12 md:gap-4">
          {/* LEFT: Ticket + Chat */}
          <div className="md:col-span-8 flex flex-col">
            <TicketInfoCard ticket={ticket} />

            {/* CHAT PANEL (moved here) */}
            <div className="flex-1 flex flex-col relative min-w-0">
              {/* Messages */}
              <div
                ref={scrollRef}
                className="overflow-y-auto p-2 sm:p-4 space-y-4 bg-[#F9FAFB] dark:bg-black scroll-smooth max-h-[calc(100vh-260px)] min-h-[200px]"
                style={{ paddingBottom: 'var(--composer-height, 120px)' }}
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
                      <div className="bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-bl-3xl rounded-br-3xl rounded-tl-xl rounded-tr-lg border border-gray-200 dark:border-gray-700" style={{ padding: '12px 20px', margin: '4px 0', maxWidth: '75vw', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
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
                    } style={{ padding: '12px 20px', margin: '4px 0', maxWidth: '75vw', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
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

              {/* Composer */}
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

          {/* RIGHT: Collapsibles */}
          <div className="md:col-span-4 flex flex-col gap-2">
            <div className="md:sticky md:top-20">
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
    </>
  );
}

export default React.memo(ChatHistory);
