import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, NavLink, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Badge, ErrorBox, Field, FileInput, Input, Loading, Notice, Select, StatusBadge, Table, useAction } from '../components/ui.jsx';
import { BookingCard } from './TestDriveManage.jsx';
import { Tracker } from '../components/Features.jsx';
import { dmy, usd, usd2, ymd } from '../utils.js';

export function NextStepCard({ o }) {
  const { t } = useTranslation();
  const order = (o.orders || []).find((x) => x.stage !== 'delivered');
  const tl = useQuery({ queryKey: ['timeline', order?.id], queryFn: () => api.get(`/me/deals/${order.id}/timeline`), enabled: !!order });
  if (!order) return null;
  const pending = (o.contracts || []).find((c) => c.deal_id === order.id && c.status === 'pending_signature');
  const steps = tl.data?.steps || [];
  const doneCount = steps.filter((s) => s.done).length;
  let next = 'next_wait';
  if (pending) next = 'next_sign';
  else if (order.stage === 'reserved') next = 'next_contract';
  else if (order.stage === 'contract_signed' && !tl.data?.delivery_slot) next = 'next_slot';
  else if (order.stage === 'contract_signed') next = 'next_pay';
  else if (order.stage === 'paid') next = tl.data?.delivery_slot ? 'next_collect' : 'next_slot';
  return <section className="card border-brand-200 bg-brand-50" aria-labelledby="next-step-h">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-xs font-semibold uppercase tracking-wide text-brand-700">{t('acc.your_order')}</p>
        <h2 id="next-step-h" className="text-lg font-bold">{order.car}</h2>
        <p className="mt-1 text-sm"><b>{t('acc.next_step')}:</b> {t(`acc.${next}`)}</p></div>
      <div className="flex gap-2"><Link className="btn-primary btn-sm" to={`/account/orders/${order.id}`}>{t('acc.open')}</Link>
        <button className="btn-secondary btn-sm" onClick={() => window.dispatchEvent(new Event('fsm:open-chat'))}>{t('acc.contact_us')}</button></div>
    </div>
    {steps.length > 0 && <div className="mt-3" role="progressbar" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={doneCount} aria-label={t('acc.progress')}>
      <div className="h-2 overflow-hidden rounded-full bg-white ring-1 ring-brand-200"><div className="h-full bg-brand-600" style={{ width: `${(doneCount / steps.length) * 100}%` }} /></div>
      <p className="mt-1 text-xs text-slate-600">{doneCount} / {steps.length}</p></div>}
  </section>;
}

function Overview() {
  const { t } = useTranslation(); const q = useQuery({ queryKey: ['overview'], queryFn: () => api.get('/me/overview') });
  return <Loading q={q}>{(o) => (
    <div className="space-y-6">
      <NextStepCard o={o} />
      <section className="card"><h2 className="mb-3 font-bold">{t('acc.enquiries')}</h2><Table rows={o.enquiries} cols={[
        { label: t('acc.car'), render: (r) => r.car }, { label: t('acc.source'), render: (r) => t(`source.${r.source}`, r.source) }, { label: t('acc.stage'), render: (r) => <StatusBadge value={r.stage} /> }, { label: t('acc.date'), render: (r) => dmy(r.created_at) },
        { label: '', render: (r) => ['reserved', 'contract_signed', 'paid', 'delivered'].includes(r.stage) ? <Link className="btn-secondary btn-sm" to={`/account/orders/${r.id}`}>{t('acc.open')}</Link> : null }]} /></section>
      <section><h2 className="mb-3 font-bold">{t('acc.appointments')}</h2><div className="grid gap-3 md:grid-cols-2">{o.appointments.length ? o.appointments.map((a) => <BookingCard key={a.id} td={{ ...a, trim_id: a.trim_id }} creds={null} />) : <p className="text-sm text-slate-500">{t('common.none')}</p>}</div></section>
      <section className="card"><h2 className="mb-3 font-bold">{t('acc.deposits')}</h2><Table rows={o.deposits} cols={[{ label: t('acc.receipt'), render: (r) => r.receipt_number }, { label: t('acc.amount'), render: (r) => `${r.amount.toLocaleString()} ${r.currency}` }, { label: 'USD', render: (r) => usd2(r.amount_usd) }, { label: t('acc.date'), render: (r) => dmy(r.created_at) },
        { label: '', render: (r) => <button className="btn-secondary btn-sm" onClick={() => api.open(`/payments/${r.id}/receipt.pdf`)}>PDF</button> }]} /></section>
      <section className="card"><h2 className="mb-3 font-bold">{t('acc.contracts')}</h2><Table rows={o.contracts} cols={[{ label: t('acc.number'), render: (r) => r.number }, { label: t('acc.amount'), render: (r) => usd(r.total_usd) }, { label: t('acc.status'), render: (r) => <Badge tone={r.status === 'signed' ? 'green' : 'amber'}>{t(`contract.${r.status}`, r.status)}</Badge> },
        { label: '', render: (r) => <span className="flex gap-2"><button className="btn-secondary btn-sm" onClick={() => api.open(`/contracts/${r.id}/pdf`)}>PDF</button><Link className="btn-primary btn-sm" to={`/account/orders/${r.deal_id}`}>{r.status === 'pending_signature' ? t('acc.sign') : t('acc.open')}</Link></span> }]} /></section>
      <section className="card"><h2 className="mb-3 font-bold">{t('acc.orders')}</h2><Table rows={o.orders} cols={[{ label: t('acc.car'), render: (r) => r.car }, { label: t('acc.stage'), render: (r) => <StatusBadge value={r.stage} /> }, { label: t('acc.total'), render: (r) => usd(r.total_usd) }, { label: t('acc.paid'), render: (r) => usd(r.paid_usd) }, { label: t('acc.balance'), render: (r) => usd(r.balance_usd) },
        { label: '', render: (r) => <Link className="btn-secondary btn-sm" to={`/account/orders/${r.id}`}>{t('acc.open')}</Link> }]} /></section>
    </div>)}</Loading>;
}

const STEPS = ['reserved', 'contract_signed', 'paid', 'car_ready', 'delivered'];
function Timeline({ dealId }) {
  const { t } = useTranslation(); const q = useQuery({ queryKey: ['timeline', dealId], queryFn: () => api.get(`/me/deals/${dealId}/timeline`) });
  return <Loading q={q}>{(tl) => <div>{tl.waiting_for_car && <Notice tone="warn">{t('acc.waiting_car')}</Notice>}
    <ol className="mt-3 grid gap-3 sm:grid-cols-5">{tl.steps.map((s, i) => <li key={s.key} className={`rounded-lg p-3 text-sm ring-1 ${s.done ? 'bg-emerald-50 ring-emerald-200' : 'bg-white ring-slate-200'}`}><div className="flex items-center gap-2 font-semibold"><span className={`grid h-6 w-6 place-items-center rounded-full text-xs ${s.done ? 'bg-emerald-600 text-white' : 'bg-slate-200'}`}>{s.done ? '✓' : i + 1}</span>{t(`timeline.${s.key}`)}</div><div className="mt-1 text-xs text-slate-500">{s.at ? dmy(s.at) : '—'}</div></li>)}</ol>
    {tl.delivery_slot && <p className="mt-3 text-sm">{t('acc.delivery_slot')}: <b>{dmy(tl.delivery_slot, true)}</b></p>}</div>}</Loading>;
}
function DeliverySlot({ deal }) {
  const { t } = useTranslation(); const qc = useQueryClient(); const [run, busy] = useAction(); const [date, setDate] = useState(ymd(new Date(Date.now() + 2 * 86400000)));
  const slots = useQuery({ queryKey: ['dslots', deal.id, date], queryFn: () => api.get(`/me/deals/${deal.id}/delivery-slots?date=${date}`) });
  const pick = async (s) => { if (await run(() => api.post(`/me/deals/${deal.id}/delivery-slot`, { slot_start: s }), t('acc.slot_saved'))) qc.invalidateQueries({ queryKey: ['timeline'] }); };
  return <div className="space-y-2"><input type="date" className="input max-w-xs" min={ymd(new Date())} value={date} onChange={(e) => setDate(e.target.value)} aria-label={t('acc.delivery_slot')} />
    <div className="flex flex-wrap gap-2">{slots.data?.slots?.length ? slots.data.slots.map((s) => <button key={s.slot_start} disabled={busy} className="btn-secondary btn-sm" onClick={() => pick(s.slot_start)}>{s.slot_start.slice(11)}</button>) : <span className="text-sm text-slate-500">{t('td.no_slots')}</span>}</div></div>;
}
function Order() {
  const { id } = useParams(); const { t } = useTranslation(); const { user } = useAuth(); const qc = useQueryClient(); const [run, busy] = useAction(); const [name, setName] = useState(user?.name || ''); const [ok, setOk] = useState(false); const [file, setFile] = useState(null); const [refCode, setRefCode] = useState('');
  const q = useQuery({ queryKey: ['deal', id], queryFn: () => api.get(`/deals/${id}`) }); const reg = useQuery({ queryKey: ['registration', id], queryFn: () => api.get(`/me/deals/${id}/registration`), retry: false });
  const refresh = () => { qc.invalidateQueries({ queryKey: ['deal', id] }); qc.invalidateQueries({ queryKey: ['overview'] }); qc.invalidateQueries({ queryKey: ['timeline', id] }); qc.invalidateQueries({ queryKey: ['tracker', id] }); };
  return <Loading q={q}>{(d) => (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-xl font-bold">{d.car_label}</h2><StatusBadge value={d.stage} /></div>
      <section className="card"><h3 className="mb-2 font-bold">{t('tr.title')}</h3><Tracker dealId={id} /></section>
      <section className="card"><h3 className="mb-2 font-bold">{t('acc.progress')}</h3><Timeline dealId={id} /></section>
      <section className="card space-y-1 text-sm"><h3 className="mb-2 font-bold">{t('acc.money')}</h3>
        <div className="flex justify-between"><span>{t('acc.total')}</span><b>{usd2(d.financials.total_usd)}</b></div><div className="flex justify-between"><span>{t('acc.paid')}</span><b>{usd2(d.financials.paid_usd)}</b></div><div className="flex justify-between"><span>{t('acc.balance')}</span><b>{usd2(d.financials.balance_usd)}</b></div>
        {d.price_locked_until && <p className="pt-1 text-xs text-slate-500">{t('acc.price_locked', { date: dmy(d.price_locked_until) })}</p>}
        <Table rows={d.payments} cols={[{ label: t('acc.receipt'), render: (r) => r.receipt_number || '-' }, { label: t('acc.kind'), render: (r) => t(`pay.${r.kind}`, r.kind) }, { label: 'USD', render: (r) => usd2(r.amount_usd) }, { label: t('acc.date'), render: (r) => dmy(r.created_at) }, { label: '', render: (r) => r.receipt_number ? <button className="btn-secondary btn-sm" onClick={() => api.open(`/payments/${r.id}/receipt.pdf`)}>PDF</button> : null }]} /></section>
      {d.contract && <section className="card space-y-3"><h3 className="font-bold">{t('acc.contract')} {d.contract.number}</h3><div className="flex flex-wrap gap-2"><button className="btn-secondary btn-sm" onClick={() => api.open(`/contracts/${d.contract.id}/pdf`)}>{t('acc.view_pdf')}</button>{d.stage !== 'lead' && ['paid', 'delivered'].includes(d.stage) && <button className="btn-secondary btn-sm" onClick={() => api.open(`/invoices/${d.invoice_id || ''}/pdf`).catch(() => {})} hidden>.</button>}</div>
        {d.contract.status === 'pending_signature' ? <div className="space-y-2 rounded-lg bg-brand-50 p-3"><p className="text-sm">{t('acc.sign_text')}</p><Field label={t('acc.typed_name')}><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} className="mt-1" />{t('acc.accept_terms')}</label>
          <button className="btn-primary" disabled={busy || !ok || !name.trim()} onClick={async () => { if (await run(() => api.post(`/contracts/${d.contract.id}/sign`, { typed_name: name, accept: true }), t('acc.signed'))) refresh(); }}>{t('acc.sign')}</button></div>
          : <Badge tone="green">{t('acc.signed')} {dmy(d.contract.signed_at)}</Badge>}</section>}
      {['contract_signed', 'paid'].includes(d.stage) && <section className="card space-y-3"><h3 className="font-bold">{t('acc.delivery')}</h3><DeliverySlot deal={d} />
        <div className="border-t pt-3"><h4 className="mb-1 text-sm font-semibold">{t('acc.registration_docs')}</h4>
          {reg.data && <ul className="mb-2 space-y-1 text-sm">{reg.data.registration.map((r) => <li key={r.doc_key || r.key}>{r.ready ? '✓' : '○'} {t(`reg.${r.doc_key || r.key}`)}</li>)}</ul>}
          {reg.data && (reg.data.identity_uploaded ? <Badge tone="green">{t('acc.identity_uploaded')}</Badge> : <div className="grid items-end gap-2 sm:grid-cols-[1fr_auto]"><FileInput onFile={setFile} label={t('acc.identity')} /><button className="btn-secondary btn-sm" disabled={!file || busy} onClick={async () => { if (await run(() => api.upload(`/me/deals/${id}/identity`, file), t('acc.identity_uploaded'))) { reg.refetch(); } }}>{t('acc.upload_identity')}</button></div>)}</div></section>}
      {['lead', 'quoted', 'reserved'].includes(d.stage) && <section className="card"><h3 className="mb-2 font-bold">{t('acc.referral_title')}</h3><div className="flex gap-2"><Input value={refCode} onChange={(e) => setRefCode(e.target.value.toUpperCase())} placeholder={t('form.referral_code')} /><button className="btn-secondary" disabled={!refCode || busy} onClick={async () => { if (await run(() => api.post(`/deals/${id}/referral`, { code: refCode }), t('acc.referral_added'))) refresh(); }}>{t('common.apply')}</button></div></section>}
    </div>)}</Loading>;
}
function OwnersCircle() {
  const { t } = useTranslation(); const [run, busy] = useAction(); const qc = useQueryClient(); const [amount, setAmount] = useState(''); const [dealId, setDealId] = useState('');
  const q = useQuery({ queryKey: ['oc'], queryFn: () => api.get('/me/owners-circle'), retry: false }); const ev = useQuery({ queryKey: ['oc-events'], queryFn: () => api.get('/me/owners-circle/events'), retry: false }); const ov = useQuery({ queryKey: ['overview'], queryFn: () => api.get('/me/overview') });
  if (q.error) return <Notice>{t('oc.not_member')}</Notice>;
  return <Loading q={q}>{(m) => { const open = (ov.data?.orders || []).filter((o) => ['reserved', 'contract_signed'].includes(o.stage) && o.balance_usd > 0);
    return <div className="space-y-5">
      <div className="rounded-2xl bg-gradient-to-br from-brand-900 to-brand-600 p-6 text-white shadow-lg sm:max-w-md"><div className="text-xs uppercase tracking-widest text-brand-100">{t('oc.title')}</div><div className="mt-6 font-mono text-xl tracking-widest">{m.card_number}</div><div className="mt-4 flex items-end justify-between"><div><div className="text-xs text-brand-100">{t('oc.member')}</div><div className="font-semibold">{m.member_name}</div></div><Badge tone={m.tier === 'Ambassador' ? 'amber' : 'blue'}>{t(`oc.tier_${m.tier}`)}</Badge></div></div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="card space-y-2"><h3 className="font-bold">{t('oc.referral')}</h3><p className="text-sm text-slate-600">{t('oc.referral_text')}</p><div className="rounded-lg bg-slate-100 p-3 font-mono text-lg font-bold tracking-widest">{m.referral_code}</div>
          <div className="flex gap-2"><input readOnly className="input text-xs" value={`${location.origin}${m.referral_link}`} aria-label={t('oc.link')} /><button className="btn-secondary btn-sm" onClick={() => navigator.clipboard?.writeText(`${location.origin}${m.referral_link}`)}>{t('common.copy')}</button></div>
          <p className="text-sm">{m.referrals_to_ambassador > 0 ? t('oc.to_ambassador', { n: m.referrals_to_ambassador }) : t('oc.is_ambassador')}</p></div>
        <div className="card space-y-2"><h3 className="font-bold">{t('oc.credit')}</h3><div className="text-3xl font-extrabold text-emerald-700">{usd2(m.credit_balance)}</div>
          {m.credit_balance > 0 && (open.length ? <div className="space-y-2"><Select value={dealId} onChange={(e) => setDealId(e.target.value)}><option value="">{t('oc.choose_deal')}</option>{open.map((o) => <option key={o.id} value={o.id}>{o.car} · {usd(o.balance_usd)}</option>)}</Select><div className="flex gap-2"><Input type="number" min="1" max={m.credit_balance} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="USD" /><button className="btn-primary" disabled={busy || !dealId || !amount} onClick={async () => { if (await run(() => api.post('/me/owners-circle/apply-credit', { deal_id: Number(dealId), amount: Number(amount) }), t('oc.credit_applied'))) { setAmount(''); qc.invalidateQueries(); } }}>{t('oc.use_credit')}</button></div></div> : <p className="text-xs text-slate-500">{t('oc.no_open_deal')}</p>)}</div></div>
      <div className="card"><h3 className="mb-2 font-bold">{t('oc.referrals_list')}</h3><Table rows={m.referrals} cols={[{ label: t('form.name'), render: (r) => r.contact_name }, { label: t('acc.status'), render: (r) => <Badge tone={r.status === 'credited' ? 'green' : 'amber'}>{t(`ref.${r.status}`, r.status)}</Badge> }, { label: t('oc.credit'), render: (r) => r.credit_usd ? usd2(r.credit_usd) : '-' }, { label: t('acc.date'), render: (r) => dmy(r.created_at) }]} /></div>
      <div className="card"><h3 className="mb-2 font-bold">{t('oc.events')}</h3><Loading q={ev}>{(list) => list.length ? <ul className="space-y-3">{list.map((e) => <li key={e.id} className="rounded-lg p-3 ring-1 ring-slate-200"><div className="flex items-center gap-2 font-semibold">{e.title} <Badge tone={e.kind === 'early_access' ? 'violet' : 'blue'}>{t(`oc.kind_${e.kind}`)}</Badge></div><p className="text-sm text-slate-600">{e.description}</p>{e.starts_on && <p className="text-xs text-slate-500">{dmy(e.starts_on)}</p>}</li>)}</ul> : <p className="text-sm text-slate-500">{t('common.none')}</p>}</Loading></div>
    </div>; }}</Loading>;
}
function Profile() {
  const { t } = useTranslation(); const { user, setUser, setLanguage } = useAuth(); const [run, busy] = useAction();
  const [f, setF] = useState({ name: user.name, phone: user.phone || '', notify_pref: user.notify_pref || 'email', consent_marketing: !!user.consent_marketing, language: user.language });
  const save = async (e) => { e.preventDefault(); const r = await run(() => api.put('/me', f), t('common.saved')); if (r) { setUser(r.user || { ...user, ...f }); if (f.language !== user.language) setLanguage(f.language); } };
  return <form onSubmit={save} className="card grid max-w-xl gap-3"><Field label={t('form.name')}><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></Field><Field label={t('form.email')}><Input value={user.email} disabled /></Field><Field label={t('form.phone')}><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
    <Field label={t('profile.language')}><Select value={f.language} onChange={(e) => setF({ ...f, language: e.target.value })}><option value="en">English</option><option value="ar">العربية</option></Select></Field>
    <Field label={t('profile.notify')}><Select value={f.notify_pref} onChange={(e) => setF({ ...f, notify_pref: e.target.value })}><option value="email">{t('profile.email')}</option><option value="whatsapp">WhatsApp</option></Select></Field>
    <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={f.consent_marketing} onChange={(e) => setF({ ...f, consent_marketing: e.target.checked })} className="mt-1" />{t('consent.marketing')}</label><p className="text-xs text-slate-500">{t('profile.optout_note')}</p>
    <div><button className="btn-primary" disabled={busy}>{t('common.save')}</button></div></form>;
}
function Privacy() {
  const { t } = useTranslation(); const qc = useQueryClient(); const [run, busy] = useAction();
  const q = useQuery({ queryKey: ['dreq'], queryFn: () => api.get('/me/data-requests') }); const n = useQuery({ queryKey: ['notifs'], queryFn: () => api.get('/me/notifications') });
  const ask = async (type) => { if (type === 'erasure' && !confirm(t('privacy.erase_confirm'))) return; if (await run(() => api.post('/me/data-requests', { type }), t('privacy.requested'))) qc.invalidateQueries({ queryKey: ['dreq'] }); };
  return <div className="space-y-5"><div className="card space-y-3"><h3 className="font-bold">{t('privacy.title')}</h3><p className="text-sm text-slate-600">{t('privacy.text')}</p><div className="flex flex-wrap gap-2"><button className="btn-secondary" disabled={busy} onClick={() => ask('export')}>{t('privacy.export')}</button><button className="btn-danger" disabled={busy} onClick={() => ask('erasure')}>{t('privacy.erase')}</button></div>
    <Loading q={q}>{(list) => <Table rows={list} cols={[{ label: t('acc.kind'), render: (r) => t(`privacy.type_${r.type}`) }, { label: t('acc.status'), render: (r) => <StatusBadge value={r.status} /> }, { label: t('acc.date'), render: (r) => dmy(r.requested_at) }, { label: t('privacy.due'), render: (r) => dmy(r.due_at) },
      { label: '', render: (r) => r.type === 'export' && r.status === 'completed' ? <button className="btn-secondary btn-sm" onClick={() => api.open(`/me/data-requests/${r.id}/download`, 'my-data.json')}>{t('privacy.download')}</button> : null }]} />}</Loading></div>
    <div className="card"><h3 className="mb-2 font-bold">{t('privacy.messages')}</h3><Loading q={n}>{(list) => <Table rows={list} cols={[{ label: t('acc.date'), render: (r) => dmy(r.created_at, true) }, { label: t('privacy.channel'), render: (r) => r.channel }, { label: t('privacy.subject'), render: (r) => r.subject }]} />}</Loading></div></div>;
}
export default function Account() {
  const { t } = useTranslation(); const { user, loading } = useAuth();
  if (loading) return null; if (!user) return <Navigate to="/login?next=/account" replace />; if (user.role !== 'customer') return <Navigate to="/staff" replace />;
  const tab = ({ isActive }) => `whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium ${isActive ? 'bg-brand-600 text-white' : 'bg-white ring-1 ring-slate-200 hover:bg-slate-50'}`;
  return <div className="space-y-5"><h1 className="text-2xl font-bold">{t('acc.hello', { name: user.name })}</h1>
    <nav className="flex gap-2 overflow-x-auto pb-1" aria-label="Account"><NavLink end to="/account" className={tab}>{t('acc.overview')}</NavLink><NavLink to="/account/owners-circle" className={tab}>{t('oc.title')}</NavLink><NavLink to="/account/profile" className={tab}>{t('acc.profile')}</NavLink><NavLink to="/account/privacy" className={tab}>{t('privacy.title')}</NavLink></nav>
    <Routes><Route index element={<Overview />} /><Route path="orders/:id" element={<Order />} /><Route path="owners-circle" element={<OwnersCircle />} /><Route path="profile" element={<Profile />} /><Route path="privacy" element={<Privacy />} /></Routes></div>;
}
