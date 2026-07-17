const API_BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || res.statusText || 'Request failed');
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export function createQueueApi(code) {
  return {
    code,
    getQueue: () => request(`/api/q/${code}`),
    checkin: (body) =>
      request(`/api/q/${code}/checkin`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    getTicket: (ticketId) => request(`/api/q/${code}/tickets/${ticketId}`),
    cancelTicket: (ticketId) =>
      request(`/api/q/${code}/tickets/${ticketId}/cancel`, {
        method: 'POST',
        body: '{}',
      }),
  };
}

/** Resolve public queue code from QR URL: /q/:code or ?q=code */
export function resolveQueueCode() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('q')) return params.get('q').trim();

  const parts = window.location.pathname.replace(/\/+$/, '').split('/').filter(Boolean);
  const qIdx = parts.indexOf('q');
  if (qIdx >= 0 && parts[qIdx + 1]) return parts[qIdx + 1];

  return null;
}
