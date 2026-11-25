// One small API client: token storage, sliding staff-session renewal (X-Refresh-Token), uniform errors.
const KEY = 'fsm_token';
export const getToken = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
export const setToken = (t) => { try { t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY); } catch { /* storage unavailable */ } };
let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

export class ApiError extends Error {
  constructor(status, body) { super((body && body.error && body.error.message) || `Request failed (${status})`); this.status = status; this.code = body && body.error && body.error.code; this.details = body && body.error && body.error.details; }
}
async function request(method, path, { body, form, raw } = {}) {
  const headers = {}; const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) payload = form; else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  let res; try { res = await fetch(`/api${path}`, { method, headers, body: payload }); } catch { throw new ApiError(0, { error: { code: 'network' } }); }
  const refreshed = res.headers.get('X-Refresh-Token'); if (refreshed) setToken(refreshed);
  if (raw) { if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => null)); return res; }
  const isJson = (res.headers.get('content-type') || '').includes('json');
  const data = isJson ? await res.json().catch(() => null) : await res.text();
  if (!res.ok) {
    if (res.status === 401 && token && data && data.error && ['session_expired', 'invalid_token'].includes(data.error.code)) onUnauthorized();
    throw new ApiError(res.status, isJson ? data : null);
  }
  return data;
}
export const api = {
  get: (p) => request('GET', p), post: (p, body) => request('POST', p, { body: body || {} }), put: (p, body) => request('PUT', p, { body: body || {} }),
  patch: (p, body) => request('PATCH', p, { body: body || {} }), del: (p) => request('DELETE', p),
  upload: (p, file, fields = {}, method = 'POST') => { const f = new FormData(); Object.entries(fields).forEach(([k, v]) => v !== undefined && v !== null && f.append(k, v)); if (file) f.append('file', file); return request(method, p, { form: f }); },
  // download a protected file (PDF / CSV) and open or save it
  async open(path, filename) {
    const res = await request('GET', path, { raw: true }); const blob = await res.blob(); const url = URL.createObjectURL(blob);
    if (filename) { const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); } else window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  },
};
