// frontend/lib/api.js (thin wrapper—no API_BASE here)
import { apiGet, apiPost, apiPatch } from "./apiClient";

export function getTickets({ limit = 50, offset = 0 } = {}) {
  return apiGet(`/tickets?limit=${limit}&offset=${offset}`);
}

export function setTicketDepartment(id, { department_id, reason }) {
  return apiPatch(`/threads/${id}/department`, { department_id, reason });
}

export function fetchThreads() {
  return apiGet(`/threads`);
}

export function fetchTicket(id) {
  return apiGet(`/tickets/${id}`);
}

export function sendMessage(ticketId, message) {
  return apiPost(`/chat`, { ticketId, message });
}

export function searchContext(ticketId) {
  return apiPost(`/search`, { ticketId });
}
