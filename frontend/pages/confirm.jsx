'use client';
import React, { useEffect, useState } from 'react';

const RAW_BASE = process.env.NEXT_PUBLIC_API_BASE || '';
const API_BASE = /^https?:\/\//i.test(RAW_BASE) ? RAW_BASE : 'http://localhost:5000';
console.log('[Confirm] API_BASE =', API_BASE);

export default function ConfirmPage() {
  const [loading, setLoading] = useState(true);
  const [valid, setValid] = useState(false);
  const [action, setAction] = useState(null); // 'confirm' | 'not_confirm'
  const [ticketId, setTicketId] = useState(null);
  const [attemptId, setAttemptId] = useState(null);
  const [email, setEmail] = useState(null);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(null);

  // form fields
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [reason, setReason] = useState('Did not work');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const authToken = params.get('token');
    const a = (params.get('a') || '').toLowerCase();
    if (!authToken || !a) {
      setLoading(false);
      setValid(false);
      setError('Missing token or action in URL.');
      return;
    }

    setAction(a === 'confirm' ? 'confirm' : 'not_confirm');

    // Record the click (CONFIRMED / NOT_CONFIRMED) on the backend.
    fetch(`${API_BASE}/solutions/confirm?token=${encodeURIComponent(authToken)}&a=${encodeURIComponent(a)}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'include',
    })
     .then(async (r) => {
        // read body even on non-2xx so we can surface .reason/.error
        const raw = await r.text().catch(() => '');
        let body;
        try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
        if (!r.ok) {
          const reason = body?.reason || body?.error || r.statusText || `HTTP ${r.status}`;
          throw new Error(reason);
        }
        return body ?? {};
      
    })
    .then((data) => {
        if (data?.ok) {
          setTicketId(data.ticket_id ?? null);
          setAttemptId(data.attempt_id ?? null);
          setEmail(data.user_email ?? null);
          setValid(true);
        } else {
          setValid(false);
          setError(data?.reason || 'Invalid or expired link');
        }
      })
      .catch((e) => {
        setValid(false);
        setError(e?.message || 'Failed to record confirmation.');
      })
      .finally(() => setLoading(false));
  }, []);

  const submitFeedback = async (e) => {
    e.preventDefault();
    if (!ticketId) {
      // If we can't tie feedback to a ticket, still complete UX
      setDone(true);
      return;
    }
    setSubmitting(true);
    setError(null);

    try {
      const body =
        action === 'confirm'
          ? { type: 'CONFIRM', rating, comment, attempt_id: attemptId, user_email: email }
          : { type: 'REJECT', reason, comment, attempt_id: attemptId, user_email: email };

      const res = await fetch(`${API_BASE}/threads/${ticketId}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setDone(true);
    } catch (err) {
      setError(err?.message || 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center min-h-screen"><div className="text-lg">Processing…</div></div>;
  if (!valid) return <div className="flex items-center justify-center min-h-screen"><div className="bg-white shadow-lg rounded-lg p-8 max-w-md w-full text-center"><h1 className="text-2xl font-bold mb-2 text-red-600">Invalid or expired link</h1><p className="text-gray-600">Please check your email link or contact support.</p></div></div>;

  if (done) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="bg-white shadow-lg rounded-lg p-8 max-w-md w-full text-center">
          <h1 className="text-2xl font-bold mb-2 text-green-600">Thank you!</h1>
          <p className="text-gray-700">Your feedback has been recorded. We appreciate your response.</p>
        </div>
      </div>
    );
  }

  // Star rating component
  const StarRating = ({ value, onChange }) => (
    <div className="flex items-center space-x-1">
      {[1,2,3,4,5].map(star => (
        <button
          key={star}
          type="button"
          className={`text-2xl focus:outline-none ${star <= value ? 'text-yellow-400' : 'text-gray-300'} transition-colors`}
          onClick={() => onChange(star)}
          aria-label={`Rate ${star}`}
        >★</button>
      ))}
    </div>
  );

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="bg-white shadow-2xl rounded-2xl p-8 max-w-md w-full">
        {action === 'confirm' ? (
          <>
            <h1 className="text-2xl font-bold mb-2 text-green-700 flex items-center gap-2">Thanks for confirming <span role="img" aria-label="party">🎉</span></h1>
            <p className="mb-6 text-gray-700">Could you rate the solution and add a quick comment?</p>
            <form onSubmit={submitFeedback} className="space-y-5">
              <div>
                <span className="block text-sm font-medium text-gray-700 mb-1">Rating</span>
                <StarRating value={rating} onChange={setRating} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Comment (optional)</label>
                <textarea
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 transition"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={3}
                />
              </div>
              <button
                disabled={submitting}
                className="w-full py-2 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shadow-md transition disabled:opacity-60"
              >
                {submitting ? 'Submitting…' : 'Submit feedback'}
              </button>
            </form>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold mb-2 text-red-700 flex items-center gap-2">Sorry it didn’t work <span role="img" aria-label="sad">😕</span></h1>
            <p className="mb-6 text-gray-700">Tell us what happened so we can fix it.</p>
            <form onSubmit={submitFeedback} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
                <select
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 transition"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                >
                  <option>Did not work</option>
                  <option>Steps unclear</option>
                  <option>Did not apply to my device</option>
                  <option>Other</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description <span className="text-red-500">*</span></label>
                <textarea
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 transition"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={3}
                  required
                />
              </div>
              <button
                disabled={submitting}
                className="w-full py-2 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shadow-md transition disabled:opacity-60"
              >
                {submitting ? 'Sending…' : 'Send feedback'}
              </button>
            </form>
          </>
        )}
        {error && <div className="mt-6 text-red-600 text-sm text-center">{error}</div>}
      </div>
    </div>
  );
}
