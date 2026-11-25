import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Badge, Field, Input, Notice, Select, useAction } from '../components/ui.jsx';
import { dmy, usd } from '../utils.js';

const SEGMENTS = ['small', 'sedan', 'suv', 'premium']; const CONDITIONS = ['excellent', 'good', 'fair', 'poor'];
export function OfferBadge({ r }) {
  const { t } = useTranslation();
  if (r.status === 'offered') return <Badge tone="green">{t('tradein.offered', { amount: usd(r.offer_usd), date: dmy(r.offer_valid_until) })}</Badge>;
  if (r.status === 'expired') return <Badge tone="amber">{t('tradein.expired')}</Badge>;
  if (r.status === 'requested') return <Badge tone="blue">{t('tradein.requested')}</Badge>;
  return null;
}
// F4: instant trade-in estimate; a consultant confirms a real offer after seeing the car
export default function TradeIn() {
  const { t, i18n } = useTranslation(); const { user } = useAuth(); const [run, busy] = useAction(); const year = new Date().getFullYear();
  const [f, setF] = useState({ segment: 'sedan', brand: '', model: '', year, mileage_km: 60000, condition: 'good' });
  const [c, setC] = useState({ name: '', email: '', phone: '', consent_data: false }); const [res, setRes] = useState(null); const [asked, setAsked] = useState(false);
  const mine = useQuery({ queryKey: ['tradein-mine'], queryFn: () => api.get('/tradein/mine'), enabled: user?.role === 'customer' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const estimate = async (e) => { e.preventDefault(); const r = await run(() => api.post('/tradein/estimate', { ...f, year: Number(f.year), mileage_km: Number(f.mileage_km), lang: i18n.language })); if (r) { setRes(r); setAsked(false); } };
  const ask = async (e) => {
    e.preventDefault(); const body = { ...f, year: Number(f.year), mileage_km: Number(f.mileage_km), send_to_consultant: true, lang: i18n.language, ...(user ? {} : c) };
    const r = await run(() => api.post('/tradein/estimate', body), t('tradein.sent')); if (r) { setRes(r); setAsked(true); mine.refetch && user && mine.refetch(); }
  };
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div><h1 className="display text-3xl">{t('tradein.title')}</h1><p className="mt-1 text-slate-600">{t('tradein.hint')}</p></div>
      <form onSubmit={estimate} className="card grid gap-3 sm:grid-cols-2">
        <Field label={t('tradein.segment')}><Select value={f.segment} onChange={set('segment')}>{SEGMENTS.map((s) => <option key={s} value={s}>{t(`tradein.seg_${s}`)}</option>)}</Select></Field>
        <Field label={t('tradein.condition')}><Select value={f.condition} onChange={set('condition')}>{CONDITIONS.map((s) => <option key={s} value={s}>{t(`tradein.cond_${s}`)}</option>)}</Select></Field>
        <Field label={t('tradein.brand')}><Input value={f.brand} onChange={set('brand')} /></Field>
        <Field label={t('tradein.model')}><Input value={f.model} onChange={set('model')} /></Field>
        <Field label={t('tradein.year')}><Input type="number" required min={year - 25} max={year + 1} value={f.year} onChange={set('year')} /></Field>
        <Field label={t('tradein.mileage')}><Input type="number" required min="0" step="1000" value={f.mileage_km} onChange={set('mileage_km')} /></Field>
        <div className="sm:col-span-2"><button className="btn-primary" disabled={busy}>{t('tradein.get')}</button></div>
      </form>
      {res && <div className="card space-y-3 border-brand-200" aria-live="polite">
        <div className="text-xs font-semibold uppercase tracking-wide text-brand-700">{t('tradein.range')}</div>
        <div className="text-3xl font-extrabold text-brand-700">{usd(res.est_low)} – {usd(res.est_high)}</div>
        <p className="text-xs text-slate-600">{t('tradein.note')}</p>
        {res.status === 'estimated' && !asked && (user ? <button className="btn-primary" disabled={busy} onClick={ask}>{t('tradein.ask')}</button> :
          <form onSubmit={ask} className="grid gap-3 rounded-lg bg-slate-100 p-3 sm:grid-cols-2">
            <Field label={t('form.name')}><Input required value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} /></Field>
            <Field label={t('form.phone')}><Input type="tel" value={c.phone} onChange={(e) => setC({ ...c, phone: e.target.value })} /></Field>
            <div className="sm:col-span-2"><Field label={t('form.email')}><Input type="email" value={c.email} onChange={(e) => setC({ ...c, email: e.target.value })} /></Field></div>
            <label className="flex items-start gap-2 text-xs sm:col-span-2"><input type="checkbox" required checked={c.consent_data} onChange={(e) => setC({ ...c, consent_data: e.target.checked })} className="mt-0.5" />{t('consent.data')}</label>
            <div className="sm:col-span-2"><button className="btn-primary" disabled={busy || (!c.email && !c.phone)}>{t('tradein.ask')}</button></div></form>)}
        {(asked || res.status !== 'estimated') && <Notice tone="ok">{t('tradein.sent')}</Notice>}
      </div>}
      {mine.data?.length > 0 && <div className="card"><h2 className="mb-2 font-bold">{t('tradein.mine')}</h2><ul className="divide-y text-sm">{mine.data.map((r) => <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2"><span>{[r.brand, r.model, r.year].filter(Boolean).join(' ')} · {usd(r.est_low)} – {usd(r.est_high)}</span><OfferBadge r={r} /></li>)}</ul></div>}
    </div>
  );
}
