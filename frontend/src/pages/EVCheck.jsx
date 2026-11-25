import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Badge, Field, Input, Notice, Select, useAction } from '../components/ui.jsx';
import { usd } from '../utils.js';

// FR-EV-01..03
export default function EVCheck() {
  const { t, i18n } = useTranslation(); const { user } = useAuth(); const [run, busy] = useAction();
  const [a, setA] = useState({ daily_km: 40, parking: 'private_garage', home_charging: 'true', power_source: 'grid', budget_usd: 45000 });
  const [res, setRes] = useState(null); const [contact, setContact] = useState({ name: '', email: '', phone: '', consent_data: false }); const [sent, setSent] = useState(false);
  const submit = async (e) => { e.preventDefault(); const r = await run(() => api.post('/ev/check', { ...a, daily_km: Number(a.daily_km), budget_usd: Number(a.budget_usd), home_charging: a.home_charging === 'true', lang: i18n.language })); if (r) { setRes(r); setSent(false); } };
  const send = async (e) => { e.preventDefault(); const r = await run(() => api.post(`/ev/check/${res.id}/send-to-consultant`, user ? {} : { ...contact, lang: i18n.language })); if (r) setSent(true); };
  const tone = { suitable: 'green', needs_attention: 'amber', not_recommended: 'red' };
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div><h1 className="text-2xl font-bold">{t('nav.ev_check')}</h1><p className="text-slate-600">{t('ev.intro')}</p></div>
      <form onSubmit={submit} className="card grid gap-3 sm:grid-cols-2">
        <Field label={t('ev.daily_km')}><Input type="number" min="0" max="1000" required value={a.daily_km} onChange={(e) => setA({ ...a, daily_km: e.target.value })} /></Field>
        <Field label={t('ev.budget')}><Input type="number" min="0" required value={a.budget_usd} onChange={(e) => setA({ ...a, budget_usd: e.target.value })} /></Field>
        <Field label={t('ev.parking')}><Select value={a.parking} onChange={(e) => setA({ ...a, parking: e.target.value })}>{['private_garage', 'private_driveway', 'shared_garage', 'street'].map((p) => <option key={p} value={p}>{t(`ev.parking_${p}`)}</option>)}</Select></Field>
        <Field label={t('ev.home_charging')}><Select value={a.home_charging} onChange={(e) => setA({ ...a, home_charging: e.target.value })}><option value="true">{t('common.yes')}</option><option value="false">{t('common.no')}</option></Select></Field>
        <Field label={t('ev.power')}><Select value={a.power_source} onChange={(e) => setA({ ...a, power_source: e.target.value })}>{['grid', 'generator', 'solar'].map((p) => <option key={p} value={p}>{t(`ev.power_${p}`)}</option>)}</Select></Field>
        <div className="flex items-end"><button className="btn-primary w-full" disabled={busy}>{t('ev.check')}</button></div>
      </form>
      {res && <div className="card space-y-4" aria-live="polite">
        <div className="flex items-center gap-3"><h2 className="text-lg font-bold">{t('ev.result')}</h2><Badge tone={tone[res.result]}>{t(`ev.res_${res.result}`)}</Badge></div>
        <ul className="list-disc space-y-1 ps-5 text-sm">{res.reasons.map((r) => <li key={r.key}>{r.text}</li>)}</ul>
        {res.shortlist.length > 0 && <div><h3 className="mb-2 font-semibold">{t('ev.shortlist')}</h3><div className="grid gap-2 sm:grid-cols-2">{res.shortlist.map((s) => <Link key={s.id} to={`/cars/${s.id}`} className="rounded-lg p-3 ring-1 ring-slate-200 hover:ring-brand-500"><div className="font-semibold">{s.label}</div><div className="text-xs text-slate-500">{usd(s.price_usd)}{s.range_km ? ` · ${s.range_km} km` : ''}</div></Link>)}</div></div>}
        {sent ? <Notice tone="ok">{t('ev.sent')}</Notice> : <form onSubmit={send} className="space-y-3 border-t pt-4"><h3 className="font-semibold">{t('ev.send_title')}</h3>
          {!user && <div className="grid gap-3 sm:grid-cols-3"><Field label={t('form.name')}><Input required value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} /></Field><Field label={t('form.email')}><Input type="email" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} /></Field><Field label={t('form.phone')}><Input value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} /></Field>
            <label className="flex items-start gap-2 text-xs sm:col-span-3"><input type="checkbox" required checked={contact.consent_data} onChange={(e) => setContact({ ...contact, consent_data: e.target.checked })} className="mt-0.5" />{t('consent.data')}</label></div>}
          <div className="flex flex-wrap gap-2"><button className="btn-primary" disabled={busy || (!user && !contact.email && !contact.phone)}>{t('ev.send')}</button>{res.shortlist[0] && <Link className="btn-secondary" to={`/cars/${res.shortlist[0].id}`}>{t('ev.book_drive')}</Link>}</div></form>}
      </div>}
    </div>
  );
}
