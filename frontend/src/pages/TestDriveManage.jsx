import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Badge, ErrorBox, Field, FileInput, Input, Notice, Select, StatusBadge, useAction } from '../components/ui.jsx';
import { dmy, ymd } from '../utils.js';

// FR-TD-02 / FR-TD-03: guests find their booking with code + email; customers use the same screen from their account
export function BookingCard({ td: initial, creds }) {
  const { t } = useTranslation(); const [td, setTd] = useState(initial); const [run, busy] = useAction(); const [file, setFile] = useState(null); const [date, setDate] = useState(ymd(new Date(Date.now() + 86400000))); const [slots, setSlots] = useState(null);
  const body = (b = {}) => ({ ...creds, ...b });
  const loadSlots = async (d) => { setDate(d); const r = await api.get(`/testdrives/slots?trim_id=${td.trim_id}&date=${d}`); setSlots(r.slots); };
  const reschedule = async (s) => { const r = await run(() => api.post(`/testdrives/${td.id}/reschedule`, body({ slot_start: s })), t('td.rescheduled')); if (r) { setTd(r); setSlots(null); } };
  const cancel = async () => { if (!confirm(t('td.cancel_confirm'))) return; const r = await run(() => api.post(`/testdrives/${td.id}/cancel`, body()), t('td.cancelled')); if (r) setTd(r); };
  const upload = async () => { if (!file) return; const r = await run(() => api.upload(`/testdrives/${td.id}/license`, file, creds || {}), t('td.license_uploaded')); if (r) setTd({ ...td, license_uploaded: true, license_verified: false }); };
  return (
    <div className="card space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><div className="font-bold">{td.car}</div><div className="text-sm text-slate-600">{dmy(td.slot_start, true)} · <span className="font-mono">{td.code}</span></div></div><StatusBadge value={td.status} /></div>
      {td.status === 'booked' && <>
        <div className="flex flex-wrap items-center gap-2 text-sm">{t('td.license')}: {td.license_verified ? <Badge tone="green">{t('td.license_verified')}</Badge> : td.license_uploaded ? <Badge tone="amber">{t('td.license_pending')}</Badge> : <Badge tone="red">{t('td.license_missing')}</Badge>}</div>
        <div className="grid items-end gap-2 sm:grid-cols-[1fr_auto]"><FileInput onFile={setFile} label={t('td.license')} /><button className="btn-secondary btn-sm" disabled={!file || busy} onClick={upload}>{t('td.upload_license')}</button></div>
        <p className="text-xs text-slate-500">{t('td.license_hint')}</p>
        <div className="space-y-2 border-t pt-3"><span className="label">{t('td.reschedule')}</span>
          <input type="date" aria-label={t('td.choose_date')} className="input max-w-xs" min={ymd(new Date())} value={date} onChange={(e) => loadSlots(e.target.value)} />
          {slots && <div className="flex flex-wrap gap-2">{slots.length ? slots.map((s) => <button key={s.slot_start} className="btn-secondary btn-sm" disabled={busy} onClick={() => reschedule(s.slot_start)}>{s.slot_start.slice(11)}</button>) : <span className="text-sm text-slate-500">{t('td.no_slots')}</span>}</div>}
          <button className="btn-danger btn-sm" disabled={busy} onClick={cancel}>{t('td.cancel')}</button></div></>}
    </div>
  );
}
export default function TestDriveManage() {
  const { t } = useTranslation(); const { user } = useAuth(); const [p] = useSearchParams(); const [f, setF] = useState({ code: p.get('code') || '', email: user?.email || '' }); const [td, setTd] = useState(null); const [err, setErr] = useState(null);
  const find = async (e) => { e.preventDefault(); setErr(null); setTd(null); try { setTd(await api.get(`/testdrives/lookup?code=${encodeURIComponent(f.code.trim())}&email=${encodeURIComponent(f.email.trim())}`)); } catch (x) { setErr(x); } };
  return <div className="mx-auto max-w-xl space-y-4"><h1 className="text-2xl font-bold">{t('nav.my_booking')}</h1>
    <form onSubmit={find} className="card grid gap-3 sm:grid-cols-2"><Field label={t('td.code')}><Input required value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} /></Field><Field label={t('form.email')}><Input type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field><div className="sm:col-span-2"><button className="btn-primary">{t('td.find')}</button></div></form>
    {err && <Notice tone="warn">{t('td.not_found')}</Notice>}
    {td && <BookingCard key={td.id} td={td} creds={{ code: f.code.trim(), email: f.email.trim() }} />}</div>;
}
