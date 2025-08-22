// // SupportApp.jsx
// import React, { useState, useEffect } from 'react';
// import dayjs from 'dayjs';
// import relativeTime from 'dayjs/plugin/relativeTime';
// import '../styles/globals.css';
// dayjs.extend(relativeTime);

// ////////////////////////////////////////////////////////////////////////////////
// // ─── GroupedTickets Component ───────────────────────────────────────────────
// export function GroupedTickets({ threads, onSelect, selectedId }) {
//   const [openTeam, setOpenTeam] = useState(null);
//   const [openCat, setOpenCat]   = useState({});

//   // Build grouping: { team: { category: [tickets] } }
//   const grouped = threads.reduce((acc, t) => {
//     acc[t.assigned_team] = acc[t.assigned_team] || {};
//     acc[t.assigned_team][t.predicted_category] = acc[t.assigned_team][t.predicted_category] || [];
//     acc[t.assigned_team][t.predicted_category].push(t);
//     return acc;
//   }, {});

//   return (
//     <div className="w-80 bg-white border-r overflow-auto">
//       {Object.entries(grouped).map(([team, cats]) => (
//         <div key={team} className="border-b">
//           <button
//             className="w-full text-left px-4 py-2 font-semibold hover:bg-gray-100"
//             onClick={() => setOpenTeam(openTeam === team ? null : team)}
//           >
//             {team}
//           </button>
//           {openTeam === team && (
//             <div className="pl-4">
//               {Object.entries(cats).map(([cat, tickets]) => (
//                 <div key={cat} className="border-b">
//                   <button
//                     className="w-full text-left px-4 py-1 hover:bg-gray-50 text-sm italic"
//                     onClick={() =>
//                       setOpenCat(prev => ({
//                         ...prev,
//                         [team]: prev[team] === cat ? null : cat
//                       }))
//                     }
//                   >
//                     {cat} ({tickets.length})
//                   </button>
//                   {openCat[team] === cat && (
//                     <ul className="pl-4 space-y-1">
//                       {tickets.map(t => (
//                         <li key={t.id}>
//                           <button
//                             className={`w-full text-left text-sm hover:underline ${
//                               selectedId === t.id ? 'font-bold text-blue-600' : ''
//                             }`}
//                             onClick={() => onSelect(t.id)}
//                           >
//                             #{t.id}: {t.text.slice(0, 30)}…
//                           </button>
//                         </li>
//                       ))}
//                     </ul>
//                   )}
//                 </div>
//               ))}
//             </div>
//           )}
//         </div>
//       ))}
//     </div>
//   );
// }

// ////////////////////////////////////////////////////////////////////////////////
// // ─── ChatHistory Component ──────────────────────────────────────────────────
// export function ChatHistory({ threadId }) {
//   const [ticket, setTicket]     = useState(null);
//   const [messages, setMessages] = useState([]);
//   const [newMsg, setNewMsg]     = useState('');
//   const [loading, setLoading]   = useState(false);
//   const [error, setError]       = useState(null);
//   const [stepInfo, setStepInfo] = useState(null);
//   const [loadingStep, setLoadingStep] = useState(false);
//   const [stepError, setStepError]     = useState(null);
//   const scrollRef = React.useRef();

//   // Load thread on change
//   useEffect(() => {
//     if (!threadId) return;
//     setLoading(true);
//     setError(null);

//     fetch(`/threads/${threadId}`)
//       .then(r => r.ok ? r.json() : Promise.reject(r.status))
//       .then(async data => {
//         setTicket(data);
//         let msgs = data.messages || [];
//         const txt = data.text || data.subject || '';
//         // Insert ticket text as first message if not present
//         if (txt && (!msgs.length || msgs[0].content !== txt)) {
//           msgs = [{ id:'ticket-text', sender:'user', content:txt, timestamp:data.created_at }, ...msgs];
//         }
//         // Fetch GPT-generated welcome message if no bot messages
//         const hasBotMsg = msgs.some(m => m.sender === 'bot');
//         if (!hasBotMsg && (msgs.length === 0 || (msgs.length === 1 && msgs[0].id === 'ticket-text'))) {
//           let userName = data.user_name || 'there';
//           try {
//             const resp = await fetch('/assistant-welcome', {
//               method: 'POST',
//               headers: { 'Content-Type': 'application/json' },
//               body: JSON.stringify({ user_name: userName })
//             });
//             const welcome = await resp.json();
//             console.log('Assistant welcome API response:', welcome);
//             const welcomeMsg = {
//               id: 'assistant-welcome',
//               sender: 'bot',
//               content: welcome.message,
//               timestamp: new Date().toISOString()
//             };
//             msgs = [welcomeMsg, ...msgs];
//           } catch (e) {
//             console.error('Assistant welcome API error:', e);
//             // fallback to static message if GPT fails
//             const welcomeMsg = {
//               id: 'assistant-welcome',
//               sender: 'bot',
//               content: `👋 Hi ${userName}, thanks for contacting IT Support! I’m Alice, your virtual assistant. How can I help you today?`,
//               timestamp: new Date().toISOString()
//             };
//             msgs = [welcomeMsg, ...msgs];
//           }
//         }
//         console.log('Final messages array:', msgs);
//         setMessages(msgs);
//       })
//       .catch(() => setError('Failed to load thread'))
//       .finally(() => setLoading(false));
//   }, [threadId]);

//   // Scroll and detect steps
//   useEffect(() => {
//     if (scrollRef.current) {
//       scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
//     }
//     if (messages.length) {
//       const last = messages[messages.length-1];
//       if (last.step && last.total) setStepInfo({ step: last.step, total: last.total });
//       else setStepInfo(null);
//     }
//   }, [messages]);

//   // Send a new message
//   const sendMessage = () => {
//     const text = newMsg.trim();
//     if (!text) return;
//     setNewMsg('');
//     const userMsg = { id:Date.now(), sender:'user', content:text, timestamp:new Date().toISOString() };
//     setMessages(m=>[...m,userMsg]);
//     fetch(`/threads/${threadId}/chat`, {
//       method:'POST',
//       headers:{ 'Content-Type':'application/json' },
//       body: JSON.stringify({ message:text })
//     })
//       .then(r=>r.json())
//       .then(data => {
//         setMessages(m => [
//           ...m,
//           { id:Date.now()+1, sender:'bot', content:data.reply, step:data.step, total:data.total, timestamp:new Date().toISOString() }
//         ]);
//       })
//       .catch(()=> setError('Failed to send message'));
//   };

//   // Confirm step
//   const confirmStep = ok => {
//     if (!stepInfo) return;
//     setLoadingStep(true);
//     setStepError(null);
//     fetch(`/threads/${threadId}/step`, {
//       method:'POST',
//       headers:{ 'Content-Type':'application/json' },
//       body: JSON.stringify({ ok })
//     })
//       .then(r=>r.json())
//       .then(data => {
//         setMessages(m=>[
//           ...m,
//           { id:Date.now()+2, sender:'bot', content:data.reply, step:data.step, total:data.total, timestamp:new Date().toISOString() }
//         ]);
//       })
//       .catch(e=>setStepError('Step error'))
//       .finally(()=>setLoadingStep(false));
//   };

//   if (!threadId) return <div className="p-6 text-gray-500">Select a ticket</div>;
//   if (loading)     return <div className="p-6 text-gray-500">Loading chat…</div>;
//   if (error)       return <div className="p-6 text-red-600">{error}</div>;

//   return (
//     <div className="flex-1 flex flex-col bg-gradient-to-br from-blue-50 to-white">
//       {/* Header */}
//       <div className="p-4 border-b bg-white">
//         <button onClick={() => window.history.back()} className="text-sm text-gray-600">← Back</button>
//         <h2 className="text-xl font-bold mt-2">#{ticket.id}</h2>
//       </div>

//       {/* Messages */}
//       <div ref={scrollRef} className="flex-1 overflow-auto p-4 space-y-4" style={{ paddingBottom: stepInfo && stepInfo.step < stepInfo.total ? 96 : 24 }}>
//         {messages.map((m,i)=>(
//           <div key={m.id||i}
//                className={`max-w-[70%] p-3 rounded-xl shadow ${
//                  m.sender==='bot' ? 'self-start bg-blue-100 text-blue-900' : 'self-end bg-gray-200 text-gray-900'
//                }`}>
//             <div className="whitespace-pre-wrap">{m.content}</div>
//             <div className="text-xs text-gray-500 mt-1 self-end">{dayjs(m.timestamp).fromNow()}</div>
//           </div>
//         ))}
//       </div>

//       {/* Step Buttons */}
//       {stepInfo && stepInfo.step < stepInfo.total && (
//         <div style={{
//           position: 'fixed',
//           left: 0,
//           bottom: 0,
//           width: '100%',
//           background: '#fff',
//           boxShadow: '0 -2px 8px rgba(0,0,0,0.08)',
//           zIndex: 100,
//           padding: '16px 0',
//           display: 'flex',
//           justifyContent: 'center',
//           gap: 16
//         }}>
//           <button onClick={()=>confirmStep(true)} disabled={loadingStep}
//                   className="px-3 py-1 bg-green-500 text-white rounded disabled:opacity-50">✅ Got it</button>
//           <button onClick={()=>confirmStep(false)} disabled={loadingStep}
//                   className="px-3 py-1 bg-red-500 text-white rounded disabled:opacity-50">❌ Didn’t work</button>
//         </div>
//       )}
//       {loadingStep && <div className="p-2 text-gray-500">Working on next step…</div>}
//       {stepError &&   <div className="p-2 text-red-600">{stepError}</div>}

//       {/* Input */}
//       <div className="p-4 border-t bg-white flex gap-2">
//         <input
//           className="flex-1 p-2 border rounded"
//           value={newMsg}
//           onChange={e=>setNewMsg(e.target.value)}
//           onKeyDown={e=>e.key==='Enter' && sendMessage()}
//           placeholder="Type a message…"
//         />
//         <button onClick={sendMessage} className="px-4 bg-blue-600 text-white rounded">Send</button>
//       </div>
//     </div>
//   );
// }

// ////////////////////////////////////////////////////////////////////////////////
// // ─── SupportApp Wrapper ───────────────────────────────────────────────────────
// export default function SupportApp() {
//   const [threads, setThreads]       = useState([]);
//   const [selectedThread, setSel]    = useState(null);
//   const [loadingThreads, setLT]     = useState(true);

//   useEffect(() => {
//     setLT(true);
//     fetch('/threads')
//       .then(r=>r.json())
//       .then(data=> setThreads(data.threads))
//       .finally(()=>setLT(false));
//   }, []);

//   return (
//     <div className="flex h-full">
//       {loadingThreads
//         ? <div className="w-80 p-4 text-gray-500">Loading tickets…</div>
//         : <GroupedTickets threads={threads} selectedId={selectedThread} onSelect={setSel} />
//       }
//       <ChatHistory threadId={selectedThread} />
//     </div>
//   );
// }
