const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:5000').replace(/\/+$/, '');


// Get tickets with pagination
export async function getTickets({ limit = 50, offset = 0 } = {}) {
  const res = await fetch(`${API_BASE}/tickets?limit=${limit}&offset=${offset}`);
  if (!res.ok) throw new Error(`Error ${res.status}`);
  return res.json();
}

export async function setTicketDepartment(id, { department_id, reason }) {
  const authToken = typeof window !== 'undefined' ? localStorage.getItem('authToken') : null;

  const headers = { 'Content-Type': 'application/json' };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

  const res = await fetch(`${API_BASE}/threads/${id}/department`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ department_id, reason }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}


export async function fetchThreads() {
  const res = await fetch(`${API_BASE}/threads`)
  if (!res.ok) throw new Error(`Error ${res.status}`)
  return res.json()
}

export async function fetchTicket(id) {
  const res = await fetch(`${API_BASE}/tickets/${id}`)
  if (!res.ok) throw new Error(`Error ${res.status}`)
  return res.json()
}

export async function sendMessage(ticketId, message) {
  const res = await fetch(`${API_BASE}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ticketId, message }),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error || `Error ${res.status}`)
  }
  return res.json()
}

export async function searchContext(ticketId) {
  const res = await fetch(`${API_BASE}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ticketId }),
  })
  if (!res.ok) throw new Error(`Error ${res.status}`)
  return res.json()
}


