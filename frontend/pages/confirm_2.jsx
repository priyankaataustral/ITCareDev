'use client';
import React, { useEffect, useState } from 'react';

const RAW_BASE = process.env.NEXT_PUBLIC_API_BASE || '';
const API_BASE = /^https?:\/\//i.test(RAW_BASE) ? RAW_BASE : '';
console.log('[Confirm_2] API_BASE =', API_BASE);

export default function Confirm2Page() {
  const [loading, setLoading] = useState(true);
  const [valid, setValid] = useState(false);
  const [action, setAction] = useState('confirm'); // 'confirm' | 'reject'
  const [solutionId, setSolutionId] = useState(null);
  const [token, setToken] = useState(null);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // form fields
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [reason, setReason] = useState('Did not work');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const authToken = params.get('token');
    const solution_id = params.get('solution_id');
    const actionParam = params.get('action');
    
    if (!authToken || !solution_id) {
      setLoading(false);
      setValid(false);
      setError('Missing token or solution_id in URL.');
      return;
    }

    setToken(authToken);
    setSolutionId(parseInt(solution_id));
    setAction(actionParam === 'reject' ? 'reject' : 'confirm');
    setLoading(false);
    setValid(true);
  }, []);

  const handleConfirmation = async (confirmAction) => {
    if (!token || !solutionId) {
      setError('Missing required parameters');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      // Call the original design backend endpoint
      const response = await fetch(`${API_BASE}/confirm-solution-original`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          token: token,
          solution_id: solutionId,
          action: confirmAction
        })
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.reason || data.error || `HTTP ${response.status}`);
      }

      if (data.ok) {
        setDone(true);
      } else {
        setError(data.reason || 'Confirmation failed');
      }
    } catch (err) {
      setError(err.message || 'Failed to process confirmation');
    } finally {
      setSubmitting(false);
    }
  };

  const submitFeedback = async (e) => {
    e.preventDefault();
    // For the original design, we first confirm the solution, then show feedback form
    await handleConfirmation(action);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  if (!valid) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="bg-white shadow-lg rounded-lg p-8 max-w-md w-full text-center">
          <h1 className="text-2xl font-bold mb-2 text-red-600">Invalid Link</h1>
          <p className="text-gray-600">Please check your email link or contact support.</p>
          <p className="text-sm text-gray-500 mt-2">{error}</p>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="bg-white shadow-lg rounded-lg p-8 max-w-md w-full text-center">
          <h1 className="text-2xl font-bold mb-2 text-green-600">Thank you!</h1>
          <p className="text-gray-700">
            {action === 'confirm' 
              ? 'Your confirmation has been recorded. We appreciate your feedback!' 
              : 'Your feedback has been recorded. We will work on improving the solution.'
            }
          </p>
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
          className={`text-2xl focus:outline-none ${
            star <= value ? 'text-yellow-400' : 'text-gray-300'
          } transition-colors`}
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
            <h1 className="text-2xl font-bold mb-2 text-green-700 flex items-center gap-2">
              Confirm Solution <span role="img" aria-label="check">✅</span>
            </h1>
            <p className="mb-6 text-gray-700">
              Did this solution resolve your issue?
            </p>
            <div className="space-y-4">
              <button
                onClick={() => handleConfirmation('confirm')}
                disabled={submitting}
                className="w-full py-3 px-4 rounded-lg bg-green-600 hover:bg-green-700 text-white font-semibold shadow-md transition disabled:opacity-60"
              >
                {submitting ? 'Processing...' : 'Yes, it worked! ✅'}
              </button>
              <button
                onClick={() => handleConfirmation('reject')}
                disabled={submitting}
                className="w-full py-3 px-4 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold shadow-md transition disabled:opacity-60"
              >
                {submitting ? 'Processing...' : 'No, still not fixed ❌'}
              </button>
            </div>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold mb-2 text-red-700 flex items-center gap-2">
              Solution Feedback <span role="img" aria-label="feedback">📝</span>
            </h1>
            <p className="mb-6 text-gray-700">
              Please provide feedback about why the solution didn't work.
            </p>
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
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description <span className="text-red-500">*</span>
                </label>
                <textarea
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 transition"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={3}
                  required
                  placeholder="Please describe what happened..."
                />
              </div>
              <button
                disabled={submitting}
                className="w-full py-2 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shadow-md transition disabled:opacity-60"
              >
                {submitting ? 'Sending...' : 'Submit Feedback'}
              </button>
            </form>
          </>
        )}
        {error && (
          <div className="mt-6 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        )}
      </div>
    </div>
  );
}
