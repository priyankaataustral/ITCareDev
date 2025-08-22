// 'use client';
// import React, { useEffect, useState } from 'react';

// const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:5000';

// export default function ConfirmPage() {
//   const [loading, setLoading] = useState(true);
//   const [valid, setValid] = useState(false);
//   const [action, setAction] = useState(null); // 'confirm' | 'not_confirm'
//   const [ticketId, setTicketId] = useState(null);
//   const [attemptId, setAttemptId] = useState(null);
//   const [email, setEmail] = useState(null);
//   const [done, setDone] = useState(false);
//   const [error, setError] = useState(null);

//   // form fields
//   const [rating, setRating] = useState(0);
//   const [comment, setComment] = useState('');
//   const [reason, setReason] = useState('Did not work');
//   const [submitting, setSubmitting] = useState(false);

//   useEffect(() => {
//     const params = new URLSearchParams(window.location.search);
//     const token = params.get('token');
//     const a = (params.get('a') || '').toLowerCase();
//     if (!token || !a) {
//       setLoading(false);
//       setValid(false);
//       return;
//     }

//     setAction(a === 'confirm' ? 'confirm' : 'not_confirm');

//     // Record the click (CONFIRMED / NOT_CONFIRMED) on the backend.
//     fetch(`${API_BASE}/confirm?token=${encodeURIComponent(token)}&a=${encodeURIComponent(a)}`, {
//       method: 'GET',
//       credentials: 'include',
//     })
//       .then((r) => (r.ok ? r.json() : Promise.reject(r.statusText)))
//       .then((data) => {
//         setTicketId(data.ticket_id ?? null);
//         setAttemptId(data.attempt_id ?? null);
//         setEmail(data.user_email ?? null);
//         setValid(true);
//       })
//       .catch((e) => setError(typeof e === 'string' ? e : 'Failed to record confirmation.'))
//       .finally(() => setLoading(false));
//   }, []);

//   const submitFeedback = async (e) => {
//     e.preventDefault();
//     if (!ticketId) {
//       // If we can't tie feedback to a ticket, still complete UX
//       setDone(true);
//       return;
//     }
//     setSubmitting(true);
//     setError(null);

//     try {
//       const body =
//         action === 'confirm'
//           ? { type: 'CONFIRM', rating, comment, attempt_id: attemptId, user_email: email }
//           : { type: 'REJECT', reason, comment, attempt_id: attemptId, user_email: email };

//       const res = await fetch(`${API_BASE}/threads/${ticketId}/feedback`, {
//         method: 'POST',
//         headers: { 'Content-Type': 'application/json' },
//         body: JSON.stringify(body),
//       });
//       const data = await res.json();
//       if (!res.ok) throw new Error(data.error || 'Failed');
//       setDone(true);
//     } catch (err) {
//       setError(err?.message || 'Something went wrong');
//     } finally {
//       setSubmitting(false);
//     }
//   };

//   if (loading) return <div className="p-6">Processing…</div>;
//   if (!valid) return <div className="p-6">Invalid or expired link.</div>;

//   if (done) {
//     return (
//       <div className="max-w-lg mx-auto p-6">
//         <h1 className="text-xl font-semibold mb-2">Thanks!</h1>
//         <p>Your feedback has been recorded.</p>
//       </div>
//     );
//   }

//   return (
//     <div className="max-w-lg mx-auto p-6">
//       {action === 'confirm' ? (
//         <>
//           <h1 className="text-xl font-semibold mb-2">Thanks for confirming 🎉</h1>
//           <p className="mb-4">Could you rate the solution and add a quick comment?</p>
//           <form onSubmit={submitFeedback} className="space-y-3">
//             <label className="block">
//               <span className="text-sm">Rating (1–5)</span>
//               <input
//                 type="number"
//                 min={1}
//                 max={5}
//                 value={rating}
//                 onChange={(e) => setRating(Number(e.target.value))}
//                 className="mt-1 w-24 border rounded px-2 py-1"
//                 required
//               />
//             </label>
//             <label className="block">
//               <span className="text-sm">Comment (optional)</span>
//               <textarea
//                 className="mt-1 w-full border rounded px-2 py-2"
//                 value={comment}
//                 onChange={(e) => setComment(e.target.value)}
//               />
//             </label>
//             <button disabled={submitting} className="px-4 py-2 rounded bg-indigo-600 text-white">
//               {submitting ? 'Submitting…' : 'Submit feedback'}
//             </button>
//           </form>
//         </>
//       ) : (
//         <>
//           <h1 className="text-xl font-semibold mb-2">Sorry it didn’t work 😕</h1>
//           <p className="mb-4">Tell us what happened so we can fix it.</p>
//           <form onSubmit={submitFeedback} className="space-y-3">
//             <label className="block">
//               <span className="text-sm">Reason</span>
//               <select
//                 className="mt-1 w-full border rounded px-2 py-2"
//                 value={reason}
//                 onChange={(e) => setReason(e.target.value)}
//               >
//                 <option>Did not work</option>
//                 <option>Steps unclear</option>
//                 <option>Did not apply to my device</option>
//                 <option>Other</option>
//               </select>
//             </label>
//             <label className="block">
//               <span className="text-sm">Description (optional)</span>
//               <textarea
//                 className="mt-1 w-full border rounded px-2 py-2"
//                 value={comment}
//                 onChange={(e) => setComment(e.target.value)}
//               />
//             </label>
//             <button disabled={submitting} className="px-4 py-2 rounded bg-indigo-600 text-white">
//               {submitting ? 'Sending…' : 'Send feedback'}
//             </button>
//           </form>
//         </>
//       )}
//       {error && <div className="mt-4 text-red-600 text-sm">{error}</div>}
//     </div>
//   );
// }
