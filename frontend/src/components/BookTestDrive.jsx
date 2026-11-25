import { useEffect, useState } from 'react';
import { useQuery, useQueries } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Field, Input, Notice, Spinner, useAction } from './ui.jsx';
import { dmy, ymd } from '../utils.js';

// FR-TD-01 / FR-TD-04 / NFR-USA-03: the nearest free slot is already selected; a visitor only adds contact details and presses Book.
// "Choose another time" opens the date and time pickers.
export default function BookTestDrive({ trim }) {
  const { t } = useTranslation(); const { user } = useAuth(); const [run, busy] = useAction();
  const days = Array.from({ length: 14 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() + i); return d; }).filter((d) => d.getDay() !== 0);
  const [date, setDate] = useState(ymd(days[0])); const [slot, setSlot] = useState(null); const [done, setDone] = useState(null); const [other, setOther] = useState(false); const [auto, setAuto] = useState(true);
  const nearest = useQueries({ queries: days.slice(0, 6).map((d) => ({ queryKey: ['slots', trim.id, ymd(d)], queryFn: () => api.get(`/testdrives/slots?trim_id=${trim.id}&date=${ymd(d)}`) })) });
  useEffect(() => { // pick the first free slot over the next days as soon as the answers arrive
    if (!auto) return; const i = nearest.findIndex((q) => q.data?.slots?.length); const stillLoading = nearest.slice(0, i < 0 ? nearest.length : i).some((q) => q.isLoading);
    if (i >= 0 && !stillLoading) { setDate(ymd(days[i])); setSlot(nearest[i].data.slots[0].slot_start); setAuto(false); }
  }); // eslint-disable-line react-hooks/exhaustive-deps
  const [c, setC] = useState({ name: '', email: '', phone: '', consent_data: false, consent_marketing: false });
  const slots = useQuery({ queryKey: ['slots', trim.id, date], queryFn: () => api.get(`/testdrives/slots?trim_id=${trim.id}&date=${date}`) });
  const { i18n } = useTranslation();
  if (done) return <div className="space-y-2"><Notice tone="ok"><b>{t('td.booked')}</b><br />{t('td.code')}: <b className="font-mono">{done.code}</b> · {dmy(done.slot_start, true)}</Notice>
    <p className="text-sm text-slate-600">{t('td.confirmation_sent')}</p>
    <Link className="btn-secondary btn-sm" to={user ? '/account' : `/test-drive/manage?code=${done.code}`}>{t('td.manage')}</Link></div>;
  const submit = async (e) => {
    e.preventDefault(); if (!slot) return;
    const body = { trim_id: trim.id, slot_start: slot, language: i18n.language, ...(user ? {} : { contact: c }) };
    const r = await run(() => api.post('/testdrives', body)); if (r) setDone(r);
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="rounded-xl bg-brand-50 p-3" aria-live="polite">
        {slot ? <><div className="text-xs font-semibold uppercase tracking-wide text-brand-700">{t('td.your_slot')}</div><div className="text-lg font-extrabold">{dmy(slot.slice(0, 10))} · {slot.slice(11)}</div><div className="text-xs text-slate-600">{t('td.free_note', { minutes: slots.data?.slot_minutes || 30 })}</div></>
          : nearest.some((q) => q.isLoading) ? <Spinner /> : <p className="text-sm text-slate-600">{t('td.none_soon')}</p>}
        <button type="button" className="mt-2 text-xs font-semibold text-brand-700 underline" onClick={() => setOther(!other)} aria-expanded={other}>{t('td.other_time')}</button></div>
      {other && <><div><span className="label">{t('td.choose_date')}</span>
        <div className="flex flex-wrap gap-2">{days.map((d) => { const v = ymd(d); return <button type="button" key={v} onClick={() => { setAuto(false); setDate(v); setSlot(null); }} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ring-1 ${v === date ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white ring-slate-300'}`}>{dmy(d)}</button>; })}</div></div>
      <div><span className="label">{t('td.choose_time')}</span>
        {slots.isLoading ? <Spinner /> : !slots.data?.slots?.length ? <p className="text-sm text-slate-500">{t('td.no_slots')}</p> :
          <div className="flex flex-wrap gap-2">{slots.data.slots.map((s) => <button type="button" key={s.slot_start} onClick={() => setSlot(s.slot_start)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ring-1 ${slot === s.slot_start ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white ring-slate-300'}`}>{s.slot_start.slice(11)}</button>)}</div>}</div></>}
      {!user && <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('form.name')}><Input required value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} /></Field>
        <Field label={t('form.phone')}><Input type="tel" value={c.phone} onChange={(e) => setC({ ...c, phone: e.target.value })} /></Field>
        <div className="sm:col-span-2"><Field label={t('form.email')}><Input type="email" value={c.email} onChange={(e) => setC({ ...c, email: e.target.value })} /></Field></div>
        <label className="flex items-start gap-2 text-xs sm:col-span-2"><input type="checkbox" required checked={c.consent_data} onChange={(e) => setC({ ...c, consent_data: e.target.checked })} className="mt-0.5" />{t('consent.data')}</label>
        <label className="flex items-start gap-2 text-xs sm:col-span-2"><input type="checkbox" checked={c.consent_marketing} onChange={(e) => setC({ ...c, consent_marketing: e.target.checked })} className="mt-0.5" />{t('consent.marketing')}</label>
      </div>}
      <button className="btn-primary w-full" disabled={busy || !slot || (!user && !c.email && !c.phone)}>{t('td.book')}{slot ? ` · ${dmy(slot.slice(0, 10))} ${slot.slice(11)}` : ''}</button>
    </form>
  );
}
