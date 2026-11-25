class HttpError extends Error {
  constructor(status, code, message, extra) {
    super(message || code);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}
const bad = (code, message, extra) => new HttpError(400, code, message, extra);
const forbidden = (code = 'forbidden', message = 'You do not have access to this function') => new HttpError(403, code, message);
const notFound = (what = 'Record') => new HttpError(404, 'not_found', `${what} not found`);
const conflict = (code, message, extra) => new HttpError(409, code, message, extra);

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const parseJson = (s, fallback) => { try { return JSON.parse(s); } catch { return fallback; } };

function required(body, fields) {
  const missing = fields.filter((f) => body[f] === undefined || body[f] === null || body[f] === '');
  if (missing.length) throw bad('missing_fields', `Missing: ${missing.join(', ')}`, { fields: missing });
}
const isEmail = (s) => typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const normPhone = (s) => (s ? String(s).replace(/[^\d+]/g, '') : '');
const randomCode = (n = 8) => {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < n; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
};
const pad = (n, w) => String(n).padStart(w, '0');
// local naive date helpers (showroom local time, stored as "YYYY-MM-DD HH:mm")
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1, 2)}-${pad(d.getDate(), 2)}`;
const slotStr = (d) => `${ymd(d)} ${pad(d.getHours(), 2)}:${pad(d.getMinutes(), 2)}`;
const parseSlot = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/.exec(s || '');
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], 0, 0);
};
const usd = (n) => `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const lbpFmt = (n) => `LBP ${Math.round(n).toLocaleString('en-US')}`;
const dmy = (iso) => {
  const d = iso instanceof Date ? iso : new Date(String(iso).replace(' ', 'T'));
  if (isNaN(d)) return String(iso);
  return `${pad(d.getDate(), 2)}/${pad(d.getMonth() + 1, 2)}/${d.getFullYear()}`;
};

module.exports = { HttpError, bad, forbidden, notFound, conflict, round2, parseJson, required, isEmail, normPhone, randomCode, pad, ymd, slotStr, parseSlot, usd, lbpFmt, dmy };
