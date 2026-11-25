import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../api.js';
import { Badge, ErrorBox, Field, Input, Loading, Select, Spinner } from './ui.jsx';
import { dmy, num, usd } from '../utils.js';

// Small animated SVG line chart shared by the EV savings calculator (F2) and the price history (F3)
export function LineChart({ labels, series, fmt = usd, step = false, label }) {
  const W = 600; const H = 240; const L = 62; const R = 14; const T = 12; const B = 30;
  const all = series.flatMap((s) => s.values); let lo = Math.min(...all); let hi = Math.max(...all);
  if (lo === hi) { lo -= 1; hi += 1; } const pad = (hi - lo) * 0.1; lo -= pad; hi += pad;
  const x = (i) => (labels.length === 1 ? (L + W - R) / 2 : L + (i * (W - L - R)) / (labels.length - 1));
  const y = (v) => T + ((hi - v) / (hi - lo)) * (H - T - B);
  const d = (vals) => vals.map((v, i) => (i === 0 ? `M${x(0)} ${y(v)}` : step ? `H${x(i)} V${y(v)}` : `L${x(i)} ${y(v)}`)).join(' ');
  const ticks = [0, 1, 2, 3].map((i) => lo + ((hi - lo) * i) / 3);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={label}>
      {ticks.map((v) => <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="currentColor" strokeOpacity="0.12" /><text x={L - 6} y={y(v) + 4} textAnchor="end" fontSize="11" className="fill-current text-slate-500">{fmt(Math.round(v / 10) * 10)}</text></g>)}
      {labels.map((l, i) => (labels.length <= 8 || i % Math.ceil(labels.length / 6) === 0) && <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize="11" className="fill-current text-slate-500">{l}</text>)}
      {series.map((s) => <g key={s.name}>
        {labels.length > 1 && <path d={d(s.values)} fill="none" stroke={s.color} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" strokeDasharray={s.dashed ? '7 6' : undefined} pathLength={s.dashed ? undefined : 1} className={s.dashed ? '' : 'chart-line'} />}
        {s.values.map((v, i) => (i === s.values.length - 1 || labels.length === 1) && <circle key={i} cx={x(i)} cy={y(v)} r="4.5" fill={s.color} />)}
      </g>)}
    </svg>
  );
}

// F2: Lebanon EV savings calculator (fuel and electricity prices come from staff-set settings)
export function EvSavings({ trim }) {
  const { t } = useTranslation(); const [km, setKm] = useState(40); const [pid, setPid] = useState('');
  const petrol = useQuery({ queryKey: ['trims', 'petrol'], queryFn: () => api.get('/catalogue/trims?fuel_type=petrol') });
  const q = useQuery({ queryKey: ['evs', trim.id, km, pid], queryFn: () => api.get(`/catalogue/ev-savings?trim_id=${trim.id}&daily_km=${km}${pid ? `&petrol_trim_id=${pid}` : ''}`), placeholderData: (p) => p, retry: false });
  const x = q.data;
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">{t('evs.hint')}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={`${t('evs.km')}: ${km} km`}><input type="range" className="w-full accent-brand-600" min="5" max="200" step="5" value={km} onChange={(e) => setKm(Number(e.target.value))} aria-label={t('evs.km')} /></Field>
        <Field label={t('evs.vs')}><Select value={pid || x?.petrol.id || ''} onChange={(e) => setPid(e.target.value)}>{petrol.data?.map((p) => <option key={p.id} value={p.id}>{p.brand} {p.model} {p.name}</option>)}</Select></Field>
      </div>
      {q.error && !x ? <ErrorBox error={q.error} /> : !x ? <Spinner /> : <>
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="rounded-lg bg-slate-100 p-3"><div className="text-xs text-slate-600">{t('evs.yearly_ev')}</div><div className="text-lg font-bold">{usd(x.yearly_ev)}</div></div>
          <div className="rounded-lg bg-slate-100 p-3"><div className="text-xs text-slate-600">{t('evs.yearly_petrol')}</div><div className="text-lg font-bold">{usd(x.yearly_petrol)}</div></div>
          <div className="rounded-lg bg-emerald-50 p-3"><div className="text-xs text-emerald-800">{t('evs.save_year')}</div><div className="text-lg font-extrabold text-emerald-700">{usd(Math.max(0, x.yearly_saving))}</div></div>
        </div>
        <LineChart label={t('evs.chart')} labels={x.series.map((s) => t('evs.year_n', { n: s.year }))} series={[{ name: 'ev', color: '#4da3ff', values: x.series.map((s) => s.ev_total) }, { name: 'petrol', color: '#94a3b8', dashed: true, values: x.series.map((s) => s.petrol_total) }]} />
        <div className="flex flex-wrap gap-4 text-xs text-slate-600"><span className="flex items-center gap-1"><i className="inline-block h-1 w-5 rounded" style={{ background: "#4da3ff" }} />{x.ev.label}</span><span className="flex items-center gap-1"><i className="inline-block h-1 w-5 rounded" style={{ background: "#94a3b8" }} />{x.petrol.label}</span></div>
        <p className="text-sm font-semibold">{x.break_even_years === 0 ? t('evs.instant') : x.break_even_years == null ? t('evs.never') : t('evs.breakeven', { years: num(x.break_even_years) })}{x.total_saving > 0 ? ` · ${t('evs.total5', { amount: usd(x.total_saving) })}` : ''}</p>
        <p className="text-xs text-slate-500">{t('evs.prices', { fuel: x.fuel_price_usd_per_l, elec: x.electricity_usd_per_kwh })}</p></>}
    </div>
  );
}

// F3: price history and the "price locked" promise
export function LockBadge({ days }) { const { t } = useTranslation(); return <Badge tone="green">🔒 {t('price.lock', { days })}</Badge>; }
export function PriceTrend({ trim }) {
  const { t } = useTranslation(); const q = useQuery({ queryKey: ['trend', trim.id], queryFn: () => api.get(`/catalogue/trims/${trim.id}/price-trend`) });
  return <Loading q={q}>{(x) => <div className="space-y-3">
    <LineChart step label={t('price.title')} labels={x.points.map((p) => dmy(p.at))} series={[{ name: 'price', color: '#4da3ff', values: x.points.map((p) => p.price) }]} />
    <div className="flex flex-wrap items-center gap-2 text-sm"><LockBadge days={x.lock_days} /><span className="text-slate-600">{x.changes ? t('price.changes', { count: x.changes }) : t('price.stable')}</span>
      {x.changes > 0 && <span className="text-slate-600">· {t('price.low')} {usd(x.lowest_usd)} · {t('price.high')} {usd(x.highest_usd)}</span>}</div>
    <p className="text-xs text-slate-500">{t('price.note', { days: x.lock_days })}</p></div>}</Loading>;
}

// F5: QR test-drive pass (the QR holds only the booking code; staff scan it or type it)
export function QrPass({ code }) {
  const { t } = useTranslation(); const [src, setSrc] = useState('');
  useEffect(() => { let live = true; import('qrcode').then((m) => m.default.toDataURL(code, { margin: 1, width: 220, color: { dark: '#0b1220', light: '#ffffff' } })).then((u) => { if (live) setSrc(u); }).catch(() => {}); return () => { live = false; }; }, [code]);
  return <div className="flex flex-wrap items-center gap-4 rounded-xl bg-white p-3 text-slate-900 ring-1 ring-slate-200">
    {src ? <img src={src} width="132" height="132" alt={t('td.qr_alt', { code })} className="rounded" /> : <Spinner />}
    <div><div className="font-bold">{t('td.qr_title')}</div><div className="text-xs text-slate-600">{t('td.qr_hint')}</div><div className="mt-1 font-mono text-lg font-bold tracking-widest">{code}</div></div></div>;
}

// F5: staff check-in box (camera scan where the browser supports it, otherwise the code is typed)
export function CheckIn({ onDone }) {
  const { t } = useTranslation(); const [code, setCode] = useState(''); const [msg, setMsg] = useState(null); const [busy, setBusy] = useState(false); const [scanning, setScanning] = useState(false); const video = useRef(null);
  const canScan = typeof window !== 'undefined' && 'BarcodeDetector' in window && !!navigator.mediaDevices;
  const submit = async (c = code) => {
    if (!c.trim()) return; setBusy(true); setMsg(null);
    try { const r = await api.post('/testdrives/check-in', { code: c.trim() }); setMsg({ tone: 'ok', text: r.already_checked_in ? t('td.checkin_already', { name: r.booking.name }) : t('td.checkin_ok', { name: r.booking.name }) }); setCode(''); onDone && onDone(); }
    catch (e) { setMsg({ tone: 'err', error: e }); } finally { setBusy(false); }
  };
  useEffect(() => {
    if (!scanning) return undefined; let stop = false; let stream; let timer;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }); video.current.srcObject = stream; await video.current.play();
        const det = new window.BarcodeDetector({ formats: ['qr_code'] });
        const tick = async () => { if (stop) return; try { const r = await det.detect(video.current); if (r[0]) { setScanning(false); setCode(r[0].rawValue); submit(r[0].rawValue); return; } } catch { /* keep scanning */ } timer = setTimeout(tick, 300); };
        tick();
      } catch { setScanning(false); setMsg({ tone: 'err', text: t('td.scan_failed') }); }
    })();
    return () => { stop = true; clearTimeout(timer); if (stream) stream.getTracks().forEach((x) => x.stop()); };
  }, [scanning]); // eslint-disable-line react-hooks/exhaustive-deps
  return <div className="card mb-4 space-y-3"><h2 className="font-bold">{t('td.checkin_title')}</h2>
    <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <Field label={t('td.checkin_code')}><Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className="font-mono uppercase" autoComplete="off" /></Field>
      <button className="btn-primary" disabled={busy || !code.trim()}>{t('td.checkin_btn')}</button>
      {canScan && <button type="button" className="btn-secondary" onClick={() => setScanning(!scanning)}>{scanning ? t('td.checkin_stop') : t('td.checkin_scan')}</button>}</form>
    {scanning && <video ref={video} className="max-h-64 rounded-lg bg-black" muted playsInline aria-label={t('td.checkin_scan')} />}
    {msg && (msg.tone === 'ok' ? <p role="status" className="rounded-lg bg-emerald-50 p-2 text-sm font-semibold text-emerald-800">{msg.text}</p> : msg.error ? <ErrorBox error={msg.error} /> : <p role="alert" className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{msg.text}</p>)}</div>;
}

// F6: smart order tracker
const BASIS = ['booked', 'in_stock', 'in_transit', 'order'];
export function Tracker({ dealId }) {
  const { t } = useTranslation(); const q = useQuery({ queryKey: ['tracker', dealId], queryFn: () => api.get(`/deals/${dealId}/tracker`) });
  return <Loading q={q}>{(x) => {
    if (x.lost) return null;
    const cur = Math.max(0, x.steps.findIndex((s) => s.current)); const doneCount = x.steps.filter((s) => s.done).length; const pct = x.stage === 'delivered' ? 100 : ((Math.max(doneCount, cur) + 0.5) / x.steps.length) * 100;
    return <div className="space-y-4">
      {x.eta && <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-brand-50 p-4"><div><div className="text-xs font-semibold uppercase tracking-wide text-brand-700">{t('tr.eta')}</div><div className="text-2xl font-extrabold">{dmy(x.eta.date)}</div></div>
        <p className="max-w-xs text-xs text-slate-600">{t(`tr.basis_${BASIS.includes(x.eta.basis) ? x.eta.basis : 'order'}`)}</p></div>}
      <div role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(pct)} aria-label={t('tr.title')} className="relative h-2 overflow-hidden rounded-full bg-slate-200"><div className="tracker-bar absolute inset-y-0 start-0 rounded-full bg-gradient-to-r from-brand-600 to-sky-500" style={{ width: `${pct}%` }} /></div>
      <ol className="grid gap-2 sm:grid-cols-7">{x.steps.map((s, i) => <li key={s.key} aria-current={s.current ? 'step' : undefined} className={`rounded-lg p-2 text-center text-xs ring-1 ${s.done ? 'bg-emerald-50 ring-emerald-200' : s.current ? 'bg-white ring-2 ring-brand-600' : 'bg-white ring-slate-200'}`}>
        <span className={`mx-auto mb-1 grid h-6 w-6 place-items-center rounded-full text-xs font-bold ${s.done ? 'bg-emerald-600 text-white' : s.current ? 'tracker-pulse bg-brand-600 text-white' : 'bg-slate-200 text-slate-700'}`}>{s.done ? '✓' : i + 1}</span>
        <div className="font-semibold">{t(`tr.step_${s.key}`)}</div><div className="text-slate-600">{s.at ? dmy(s.at) : '—'}</div></li>)}</ol>
      {x.stage !== 'delivered' && ['contract_signed', 'paid'].includes(x.stage) && <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg bg-slate-100 p-3 text-sm"><div className="mb-1 font-semibold">{t('tr.prep')}</div>
          <div>{x.readiness.inspection.passed === x.readiness.inspection.total && x.readiness.inspection.total > 0 ? '✓' : '○'} {t('tr.insp', { done: x.readiness.inspection.passed, total: x.readiness.inspection.total })}</div>
          <div>{x.readiness.documents.ready === x.readiness.documents.total && x.readiness.documents.total > 0 ? '✓' : '○'} {t('tr.docs', { done: x.readiness.documents.ready, total: x.readiness.documents.total })}</div>
          {x.booking && <div>✓ {t('tr.booked', { slot: dmy(x.booking.slot_start, true) })}</div>}</div>
        <div className="rounded-lg bg-slate-100 p-3 text-sm"><div className="mb-1 font-semibold">{t('tr.bring')}</div><ul className="space-y-0.5">{['id', 'license', 'payment', 'insurance'].map((k) => <li key={k}>☐ {t(`tr.bring_${k}`)}</li>)}</ul></div></div>}
    </div>;
  }}</Loading>;
}
