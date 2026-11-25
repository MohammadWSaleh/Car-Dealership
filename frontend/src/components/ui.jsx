import { Children, createContext, isValidElement, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cx, dmy, errMsg, lbp, usd } from '../utils.js';

// Loading placeholder: grey bars instead of a bare "..." so the page does not jump when data arrives
export const Spinner = () => <div role="status" aria-busy="true" aria-label="Loading" className="space-y-3 py-6" data-testid="skeleton"><div className="h-4 w-1/3 animate-pulse rounded bg-slate-200" /><div className="h-4 w-full animate-pulse rounded bg-slate-100" /><div className="h-4 w-5/6 animate-pulse rounded bg-slate-100" /><div className="h-4 w-2/3 animate-pulse rounded bg-slate-100" /></div>;
export const EmptyState = ({ title, hint, action }) => <div className="py-10 text-center"><div aria-hidden="true" className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-600">∅</div><p className="font-semibold text-slate-700">{title}</p>{hint && <p className="mt-1 text-sm text-slate-500">{hint}</p>}{action && <div className="mt-3">{action}</div>}</div>;
export function Loading({ q, children }) {
  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorBox error={q.error} />;
  return children(q.data);
}
export const ErrorBox = ({ error }) => <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700 ring-1 ring-red-200">{errMsg(error)}</div>;
export const Notice = ({ children, tone = 'info' }) => <div className={cx('rounded-lg p-3 text-sm ring-1', tone === 'warn' ? 'bg-amber-50 text-amber-800 ring-amber-200' : tone === 'ok' ? 'bg-emerald-50 text-emerald-800 ring-emerald-200' : 'bg-brand-50 text-brand-900 ring-brand-100')}>{children}</div>;

export function Field({ label, children, hint }) {
  return <label className="block"><span className="label">{label}</span>{children}{hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}</label>;
}
export const Input = (p) => <input {...p} className={cx('input', p.className)} />;
export const Select = ({ children, ...p }) => <select {...p} className={cx('input', p.className)}>{children}</select>;
export const Textarea = (p) => <textarea rows={3} {...p} className={cx('input', p.className)} />;

const TONES = { green: 'bg-emerald-100 text-emerald-800', blue: 'bg-sky-100 text-sky-800', amber: 'bg-amber-100 text-amber-800', red: 'bg-red-100 text-red-700', slate: 'bg-slate-100 text-slate-700', violet: 'bg-violet-100 text-violet-800' };
export const Badge = ({ tone = 'slate', children }) => <span className={cx('badge', TONES[tone])}>{children}</span>;
const STAGE_TONE = { lead: 'slate', quoted: 'blue', reserved: 'amber', contract_signed: 'violet', paid: 'green', delivered: 'green', lost: 'red', in_stock: 'green', in_transit: 'amber', order_only: 'slate', sold: 'violet', booked: 'blue', completed: 'green', cancelled: 'red', pending_approval: 'amber', rejected: 'red', approved: 'green', pending: 'amber', open: 'amber', submitted: 'blue', withdrawn: 'slate' };
export function StatusBadge({ value, ns = 'status' }) { const { t } = useTranslation(); return value ? <Badge tone={STAGE_TONE[value] || 'slate'}>{t(`${ns}.${value}`, value)}</Badge> : null; }

export function Price({ usd: u, lbp: l, big }) { return <span><span className={cx('font-bold', big ? 'text-2xl' : 'text-base')}>{usd(u)}</span>{l != null && <span className="ms-2 text-xs text-slate-500">≈ {lbp(l)}</span>}</span>; }
export const Date_ = ({ v, time }) => <span>{dmy(v, time)}</span>;

export function Modal({ title, onClose, children, wide }) {
  useEffect(() => { const h = (e) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={cx('max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl', wide ? 'sm:max-w-3xl' : 'sm:max-w-lg')}>
        <div className="mb-4 flex items-start justify-between gap-3"><h2 className="text-lg font-bold">{title}</h2><button className="text-slate-500 hover:text-slate-800" onClick={onClose} aria-label="Close">✕</button></div>
        {children}
      </div>
    </div>
  );
}

// text of whatever a column renders (string, number or React element) - used for sorting and searching
export function textOf(n) {
  if (n == null || typeof n === 'boolean') return '';
  if (typeof n === 'string' || typeof n === 'number') return String(n);
  if (Array.isArray(n)) return n.map(textOf).join(' ');
  if (isValidElement(n)) return Children.toArray(n.props.children).map(textOf).join(' ');
  return '';
}
function sortValue(v) { // dd/mm/yyyy -> yyyymmdd, "$1,234.50" -> 1234.5, otherwise case-insensitive text
  const t = String(v).trim(); const d = t.match(/^(\d{2})\/(\d{2})\/(\d{4})/); if (d) return Number(`${d[3]}${d[2]}${d[1]}`);
  const n = t.replace(/[,$\s]/g, ''); if (n !== '' && /^-?\d+(\.\d+)?$/.test(n)) return Number(n); return t.toLowerCase();
}
const cmp = (a, b) => (typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), undefined, { numeric: true }));
function useNarrow() {
  const q = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(max-width: 639px)') : null; const [n, setN] = useState(!!q?.matches);
  useEffect(() => { if (!q) return undefined; const h = () => setN(q.matches); q.addEventListener?.('change', h); return () => q.removeEventListener?.('change', h); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return n;
}
// Table: click a header to sort, search box for longer lists, sticky header, and a card layout on phones
export function Table({ cols, rows, empty, onRow, searchable }) {
  const { t } = useTranslation(); const narrow = useNarrow(); const [sort, setSort] = useState(null); const [term, setTerm] = useState('');
  const showSearch = searchable ?? (rows?.length > 8);
  const view = useMemo(() => {
    let list = rows || [];
    if (term.trim()) { const q = term.trim().toLowerCase(); list = list.filter((r) => cols.map((c) => textOf(c.render ? c.render(r) : r[c.key])).join(' ').toLowerCase().includes(q)); }
    if (sort != null) { const c = cols[sort.i]; const val = (r) => sortValue(textOf(c.render ? c.render(r) : r[c.key])); list = [...list].sort((a, b) => sort.dir * cmp(val(a), val(b))); }
    return list;
  }, [rows, cols, term, sort]);
  if (!rows || !rows.length) return <EmptyState title={empty || t('common.none')} />;
  const canSort = (c) => !!c.label;
  const toggle = (i) => setSort((s) => (s && s.i === i ? (s.dir === 1 ? { i, dir: -1 } : null) : { i, dir: 1 }));
  const search = showSearch && <div className="p-3"><input type="search" className="input max-w-xs" placeholder={t('common.search')} aria-label={t('common.search')} value={term} onChange={(e) => setTerm(e.target.value)} /></div>;
  const none = view.length === 0 && <p className="py-6 text-center text-sm text-slate-500">{t('common.no_match')}</p>;
  if (narrow) { // phones: one card per row, first column is the title
    return <div>{search}<ul className="divide-y divide-slate-100">{view.map((r, i) => (
      <li key={r.id ?? i} className={cx('space-y-1 p-3', onRow && 'cursor-pointer active:bg-slate-50')} onClick={onRow ? () => onRow(r) : undefined}>
        {cols.map((c, ci) => { const v = c.render ? c.render(r) : r[c.key]; return ci === 0 ? <div key={ci} className="font-semibold">{v}</div> : (c.label || textOf(v)) ? <div key={ci} className="flex justify-between gap-3 text-sm"><span className="text-slate-500">{c.label}</span><span className="text-end">{v}</span></div> : null; })}
      </li>))}</ul>{none}</div>;
  }
  return (
    <div>{search}<div className="max-h-[75vh] overflow-auto"><table className="min-w-full divide-y divide-slate-200">
      <thead className="sticky top-0 z-10 bg-white shadow-[0_1px_0_#e2e8f0]"><tr>{cols.map((c, i) => <th key={c.key || c.label || i} className="th" aria-sort={sort?.i === i ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}>
        {canSort(c) ? <button type="button" className="inline-flex items-center gap-1 font-inherit uppercase" onClick={() => toggle(i)}>{c.label}<span aria-hidden="true" className="text-[10px] text-slate-600">{sort?.i === i ? (sort.dir === 1 ? '▲' : '▼') : '↕'}</span></button> : c.label}</th>)}</tr></thead>
      <tbody className="divide-y divide-slate-100">{view.map((r, i) => (
        <tr key={r.id ?? i} className={cx(onRow && 'cursor-pointer hover:bg-slate-50')} onClick={onRow ? () => onRow(r) : undefined}>{cols.map((c, ci) => <td key={c.key || c.label || ci} className="td">{c.render ? c.render(r) : r[c.key]}</td>)}</tr>))}
      </tbody></table></div>{none}</div>
  );
}

// toasts
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((msg, tone = 'ok') => { const id = Math.random(); setItems((x) => [...x, { id, msg, tone }]); setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 4000); }, []);
  return <ToastCtx.Provider value={push}>{children}
    <div className="pointer-events-none fixed bottom-4 end-4 z-[60] flex w-72 flex-col gap-2" aria-live="polite">{items.map((i) => <div key={i.id} className={cx('pointer-events-auto rounded-lg px-4 py-3 text-sm text-white shadow-lg', i.tone === 'err' ? 'bg-red-600' : 'bg-slate-900')}>{i.msg}</div>)}</div></ToastCtx.Provider>;
}

// Run an async action with toast feedback
export function useAction() {
  const toast = useToast(); const [busy, setBusy] = useState(false);
  const run = async (fn, okMsg) => { setBusy(true); try { const r = await fn(); if (okMsg) toast(okMsg); return r; } catch (e) { toast(errMsg(e), 'err'); return undefined; } finally { setBusy(false); } };
  return [run, busy];
}
export const PageTitle = ({ children, actions }) => <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-bold">{children}</h1><div className="flex flex-wrap gap-2">{actions}</div></div>;
export const Stat = ({ label, value, sub }) => <div className="card"><div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div><div className="mt-1 text-2xl font-bold">{value}</div>{sub && <div className="text-xs text-slate-500">{sub}</div>}</div>;
export function FileInput({ onFile, accept = '.pdf,.png,.jpg,.jpeg', label }) { return <input type="file" accept={accept} aria-label={label} onChange={(e) => onFile(e.target.files[0])} className="block w-full text-sm file:me-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-brand-700" />; }
