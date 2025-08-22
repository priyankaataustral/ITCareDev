// apiFetch.js
export function apiFetch(path, opts = {}) {
  const token = localStorage.getItem('token'); // wherever you store it
  return fetch(path, {
    credentials: 'include',                       // send cookies if any
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}
