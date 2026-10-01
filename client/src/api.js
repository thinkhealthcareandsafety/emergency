const TOKEN_KEY = 'ert_admin_token';
const DISPLAY_KEY = 'ert_display_key';

export const store = {
  get(k) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k, v) {
    try {
      if (v == null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    } catch {
      /* storage unavailable (kiosk/private mode) — the app still works for this session */
    }
  },
};

export const auth = {
  token: () => store.get(TOKEN_KEY),
  set: (t) => store.set(TOKEN_KEY, t),
  clear: () => store.set(TOKEN_KEY, null),
};

export const displayKey = {
  get: () => store.get(DISPLAY_KEY),
  set: (k) => store.set(DISPLAY_KEY, k),
};

export async function api(path, { method = 'GET', body, query } = {}) {
  const headers = {};
  const token = auth.token();
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload = body;
  if (body && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const qs = query ? `?${new URLSearchParams(query)}` : '';
  const res = await fetch(`${path}${qs}`, { method, headers, body: payload });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path.startsWith('/api/admin')) {
    auth.clear();
    if (!location.pathname.startsWith('/login')) location.assign('/login');
  }
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}
