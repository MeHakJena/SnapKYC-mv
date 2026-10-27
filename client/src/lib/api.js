// Small helper for calling the backend.
// VITE_API_URL is only needed when the frontend is hosted separately (e.g. Vercel).
export const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

export async function api(path, { method = 'GET', body, token, secret, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (secret) headers['x-session-secret'] = secret;
  let payload;
  if (form) payload = form; // FormData sets its own content type
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, { method, headers, body: payload });
  } catch {
    throw new Error('Cannot reach the server. If it was idle it may be waking up, try again in 30 seconds.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

// sessionStorage is per tab, so an agent tab and a reviewer tab in the same
// browser stay logged in as different people.
export const store = {
  get(key) {
    try {
      return JSON.parse(sessionStorage.getItem(key));
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage unavailable: app still works for this page view */
    }
  },
  remove(key) {
    try {
      sessionStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};

export const fmtTime = (iso) => (iso ? new Date(iso).toLocaleString() : '—');
