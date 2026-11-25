import i18n from './i18n/index.js';

// UX: optional Arabic-Indic digits (٠١٢٣) when reading Arabic; stored per browser
export const arabicDigits = () => { try { return i18n.language === 'ar' && localStorage.getItem('fsm_digits') === 'ar'; } catch { return false; } };
const dg = (s) => (arabicDigits() ? String(s).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]) : s);
const numLocale = () => (i18n.language === 'ar' ? 'ar-LB' : 'en-US');
// NFR-LOC-01: prices in USD with the LBP equivalent
export const usd = (n) => (n == null ? '-' : dg(new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)));
export const usd2 = (n) => (n == null ? '-' : dg(new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(n)));
export const lbp = (n) => (n == null ? '-' : dg(`${new Intl.NumberFormat(numLocale()).format(Math.round(n))} LBP`));
export const num = (n) => dg(new Intl.NumberFormat(numLocale()).format(n));
// NFR-LOC-01: dates as day/month/year
export function dmy(v, withTime = false) {
  if (!v) return '-'; const s = String(v);
  const d = /^\d{4}-\d\d-\d\d \d\d:\d\d$/.test(s) ? new Date(s.replace(' ', 'T')) : new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  const p = (x) => String(x).padStart(2, '0'); const base = `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
  return dg(withTime ? `${base} ${p(d.getHours())}:${p(d.getMinutes())}` : base);
}
export const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const cx = (...a) => a.filter(Boolean).join(' ');
export const STAFF_ROLES = ['sales_consultant', 'sales_manager', 'general_manager', 'accountant', 'delivery_coordinator', 'administrator'];
export const isStaff = (u) => !!u && STAFF_ROLES.includes(u.role);
// Friendly, translated message for known error codes; otherwise the server's own message (UX: say what to do next)
export const errMsg = (e) => {
  if (e && e.code && i18n.exists(`err.${e.code}`)) return i18n.t(`err.${e.code}`, e.details && typeof e.details === 'object' ? e.details : {});
  if (e && e.status === 0) return i18n.t('err.network');
  return (e && e.message) || i18n.t('err.generic');
};

// F1: same level-payment formula as the backend (backend/src/services/calc.js)
export function monthlyPayment(price, downPercent, term, ratePercent) {
  const financed = price * (1 - downPercent / 100); const i = ratePercent / 100 / 12;
  return i === 0 ? financed / term : (financed * i) / (1 - Math.pow(1 + i, -term));
}

// Only same-site paths are allowed as a post-login destination: "//host", "/\\host" and absolute URLs would send the visitor to another site.
export function safeNext(v, fallback = '/home') {
  const s = typeof v === 'string' ? v : '';
  return /^\/(?![/\\])[^\s\\]*$/.test(s) ? s : fallback;
}
