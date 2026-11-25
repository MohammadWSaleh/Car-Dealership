import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Badge, Field, FileInput, Input, Loading, Modal, Notice, PageTitle, Select, StatusBadge, Table, Textarea, useAction } from '../components/ui.jsx';
import { dmy, lbp, usd, usd2 } from '../utils.js';

const STAGES = ['lead', 'quoted', 'reserved', 'contract_signed', 'paid', 'delivered', 'lost'];
export function DealsPage() {
  const { t } = useTranslation(); const nav = useNavigate(); const { user } = useAuth(); const [f, setF] = useState({ stage: '', q: '' }); const [adding, setAdding] = useState(false); const [view, setView] = useState(['sales_consultant', 'sales_manager'].includes(user.role) ? 'board' : 'list');
  const qs = Object.entries(f).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  const q = useQuery({ queryKey: ['deals', qs], queryFn: () => api.get(`/deals${qs ? `?${qs}` : ''}`) });
  return <div><PageTitle actions={user.role === 'sales_consultant' || user.role === 'sales_manager' ? <button className="btn-primary" onClick={() => setAdding(true)}>{t('deal.new_walkin')}</button> : null}>{t('staff.deals')}</PageTitle>
    <div className="mb-3 inline-flex rounded-lg bg-slate-100 p-1" role="tablist" aria-label={t('deal.view')}>{['board', 'list'].map((v) => <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)} className={`rounded-md px-3 py-1 text-sm font-semibold ${view === v ? 'bg-white shadow-sm' : 'text-slate-600'}`}>{t(`deal.view_${v}`)}</button>)}</div>
    <div className="mb-4 grid gap-3 sm:grid-cols-3"><Select value={f.stage} onChange={(e) => setF({ ...f, stage: e.target.value })} aria-label={t('acc.stage')}><option value="">{t('common.all')}</option>{STAGES.map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}</Select><Input placeholder={t('common.search')} value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} aria-label={t('common.search')} /></div>
    {view === 'board' ? <Loading q={q}>{(rows) => <Board rows={rows} onOpen={(id) => nav(`/staff/deals/${id}`)} />}</Loading> :
    <div className="card p-0 sm:p-0"><Loading q={q}>{(rows) => <Table rows={rows} onRow={(r) => nav(`/staff/deals/${r.id}`)} cols={[
      { label: '#', render: (r) => r.id }, { label: t('form.name'), render: (r) => <div><div className="font-semibold">{r.contact_name}</div><div className="text-xs text-slate-500">{r.contact_email || r.contact_phone}</div></div> }, { label: t('acc.car'), render: (r) => r.car_label },
      { label: t('acc.source'), render: (r) => t(`source.${r.source}`, r.source) }, { label: t('acc.stage'), render: (r) => <span className="flex items-center gap-1"><StatusBadge value={r.stage} />{r.waiting_for_car && <Badge tone="amber">{t('deal.waiting')}</Badge>}</span> },
      { label: t('deal.consultant'), render: (r) => r.consultant_name || '-' }, { label: t('acc.balance'), render: (r) => (r.total_usd ? usd(r.balance_usd) : '-') }, { label: t('acc.date'), render: (r) => dmy(r.updated_at) }]} />}</Loading></div>}
    {adding && <WalkIn onClose={() => setAdding(false)} onDone={(id) => nav(`/staff/deals/${id}`)} />}</div>;
}
// Pipeline board: one column per stage so a consultant sees at a glance where deals are waiting
const BOARD = ['lead', 'quoted', 'reserved', 'contract_signed', 'paid', 'delivered'];
function ageDays(v) { const d = new Date(String(v).replace(' ', 'T')); return Number.isNaN(d.getTime()) ? 0 : Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000)); }
export function Board({ rows, onOpen }) {
  const { t } = useTranslation(); const lost = rows.filter((r) => r.stage === 'lost').length;
  return <div><div className="flex snap-x gap-3 overflow-x-auto pb-3" data-testid="board">{BOARD.map((st) => { const col = rows.filter((r) => r.stage === st);
    return <section key={st} aria-label={t(`status.${st}`)} className="w-64 shrink-0 snap-start rounded-xl bg-slate-100 p-2">
      <h3 className="mb-2 flex items-center justify-between px-1 text-sm font-bold"><span>{t(`status.${st}`)}</span><span className="rounded-full bg-white px-2 text-xs">{col.length}</span></h3>
      <div className="space-y-2">{col.length === 0 ? <p className="px-1 py-3 text-xs text-slate-600">{t('deal.board_empty')}</p> : col.map((r) => { const age = ageDays(r.updated_at);
        return <button key={r.id} onClick={() => onOpen(r.id)} className="block w-full rounded-lg bg-white p-3 text-start shadow-sm ring-1 ring-slate-200 hover:ring-brand-500">
          <div className="flex items-start justify-between gap-2"><span className="font-semibold">{r.contact_name}</span><span className="text-xs text-slate-600">#{r.id}</span></div>
          <div className="text-xs text-slate-600">{r.car_label}</div>
          <div className="mt-2 flex flex-wrap items-center gap-1 text-[11px]">{r.waiting_for_car && <Badge tone="amber">{t('deal.waiting')}</Badge>}{r.total_usd ? <span className="font-semibold">{usd(r.balance_usd)} {t('acc.balance')}</span> : null}<span className={age >= 7 ? 'font-bold text-red-600' : 'text-slate-500'}>{t('deal.days_in_stage', { count: age })}</span></div>
          {r.consultant_name && <div className="mt-1 text-[11px] text-slate-700">{r.consultant_name}</div>}</button>; })}</div></section>; })}</div>
    {lost > 0 && <p className="text-xs text-slate-500">{t('deal.board_lost', { count: lost })}</p>}</div>;
}
function WalkIn({ onClose, onDone }) {
  const { t } = useTranslation(); const [run, busy] = useAction(); const trims = useQuery({ queryKey: ['trims', ''], queryFn: () => api.get('/catalogue/trims') });
  const [f, setF] = useState({ name: '', email: '', phone: '', trim_id: '', color: '', source: 'walk_in', referral_code: '', consent_data: false });
  const trim = trims.data?.find((x) => String(x.id) === String(f.trim_id));
  const submit = async (e) => { e.preventDefault(); const r = await run(() => api.post('/leads', { ...f, trim_id: f.trim_id ? Number(f.trim_id) : undefined, color: f.color || undefined, referral_code: f.referral_code || undefined })); if (r) onDone(r.id); };
  return <Modal title={t('deal.new_walkin')} onClose={onClose}><form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
    <Field label={t('form.name')}><Input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field><Field label={t('form.phone')}><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
    <div className="sm:col-span-2"><Field label={t('form.email')}><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field></div>
    <div className="sm:col-span-2"><Field label={t('acc.car')}><Select value={f.trim_id} onChange={(e) => setF({ ...f, trim_id: e.target.value, color: '' })}><option value="">—</option>{trims.data?.map((x) => <option key={x.id} value={x.id}>{x.brand} {x.model} {x.name}</option>)}</Select></Field></div>
    <Field label={t('deal.color')}><Select value={f.color} onChange={(e) => setF({ ...f, color: e.target.value })}><option value="">—</option>{trim?.colors.map((c) => <option key={c} value={c}>{t(`color.${c}`, c)}</option>)}</Select></Field>
    <Field label={t('acc.source')}><Select value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })}><option value="walk_in">{t('source.walk_in')}</option><option value="referral">{t('source.referral')}</option></Select></Field>
    <Field label={t('form.referral_code')}><Input value={f.referral_code} onChange={(e) => setF({ ...f, referral_code: e.target.value.toUpperCase() })} /></Field>
    <label className="flex items-start gap-2 text-xs sm:col-span-2"><input type="checkbox" required checked={f.consent_data} onChange={(e) => setF({ ...f, consent_data: e.target.checked })} className="mt-0.5" />{t('deal.consent_confirm')}</label>
    <div className="sm:col-span-2"><button className="btn-primary" disabled={busy || (!f.email && !f.phone)}>{t('common.save')}</button></div></form></Modal>;
}

// UX: one highlighted "next step" for the person looking at the deal, so a new consultant never has to learn the order of the flow
export function NextStep({ d, role, canSell, canPay, onQuote, onPay, onContract }) {
  const { t } = useTranslation(); const stage = d.stage; const delivery = ['delivery_coordinator', 'sales_manager', 'general_manager'].includes(role);
  let step = null;
  if (stage === 'lead' && canSell) step = { key: 'quote', text: t('next.quote'), label: t('deal.create_quotation'), go: onQuote };
  else if (stage === 'quoted' && d.quotation?.expired && canSell) step = { key: 'requote', text: t('next.requote'), label: t('deal.create_quotation'), go: onQuote };
  else if (stage === 'quoted' && canPay) step = { key: 'deposit', text: t('next.deposit'), label: t('deal.record_payment'), go: onPay };
  else if (stage === 'reserved' && canSell && !d.contract) step = { key: 'contract', text: t('next.contract'), label: t('deal.create_contract'), go: onContract };
  else if (stage === 'reserved' && d.contract?.status === 'pending_signature') step = { key: 'sign', text: t('next.sign'), label: null };
  else if (stage === 'contract_signed' && canPay && d.financials?.balance_usd > 0) step = { key: 'balance', text: t('next.balance', { amount: usd2(d.financials.balance_usd) }), label: t('deal.record_payment'), go: onPay };
  else if (['contract_signed', 'paid'].includes(stage) && delivery) step = { key: 'delivery', text: t('next.delivery'), to: `/staff/delivery/${d.id}`, label: t('staff.delivery') };
  else if (stage === 'contract_signed' || stage === 'paid') step = { key: 'wait', text: t('next.wait_delivery'), label: null };
  else if (stage === 'delivered') step = { key: 'done', text: t('next.done'), label: null, tone: 'ok' };
  else if (stage === 'lost') step = { key: 'lost', text: t('next.lost'), label: null, tone: 'muted' };
  if (!step) return null;
  const ok = step.tone === 'ok'; const muted = step.tone === 'muted';
  return <div role="status" data-testid="next-step" className={`flex flex-wrap items-center justify-between gap-3 rounded-xl p-4 ring-1 ${ok ? 'bg-emerald-50 ring-emerald-200' : muted ? 'bg-slate-50 ring-slate-200' : 'bg-brand-50 ring-brand-200'}`}>
    <div><div className="text-xs font-bold uppercase tracking-wide text-brand-700">{ok ? '✓' : '→'} {t('next.title')}</div><div className="font-semibold">{step.text}</div></div>
    {step.go && <button className="btn-primary" onClick={step.go}>{step.label}</button>}{step.to && <Link className="btn-primary" to={step.to}>{step.label}</Link>}</div>;
}
function Section({ title, children, actions }) { return <section className="card space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold">{title}</h3><div className="flex flex-wrap gap-2">{actions}</div></div>{children}</section>; }

export function DealDetail() {
  const { id } = useParams(); const { t } = useTranslation(); const { user } = useAuth(); const qc = useQueryClient(); const [run, busy] = useAction(); const nav = useNavigate();
  const q = useQuery({ queryKey: ['deal', id], queryFn: () => api.get(`/deals/${id}`) });
  const consultants = useQuery({ queryKey: ['consultants'], enabled: user.role === 'sales_manager', queryFn: () => api.get('/staff/consultants') });
  const refresh = () => { qc.invalidateQueries({ queryKey: ['deal', id] }); qc.invalidateQueries({ queryKey: ['deals'] }); };
  const act = (fn, msg) => async (...a) => { const r = await run(() => fn(...a), msg); if (r !== undefined) refresh(); return r; };
  const [modal, setModal] = useState(null); const [form, setForm] = useState({});
  const role = user.role; const canSell = ['sales_consultant', 'sales_manager'].includes(role); const isSM = role === 'sales_manager'; const canPay = ['accountant', 'sales_consultant', 'sales_manager'].includes(role);
  return <Loading q={q}>{(d) => { const quote = d.quotation; const stage = d.stage; const f = d.financials;
    return (
      <div className="space-y-4">
        <PageTitle actions={<Link className="btn-secondary" to="/staff/deals">← {t('staff.deals')}</Link>}>{t('deal.title')} #{d.id}</PageTitle>
        <div className="card grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div><div className="label">{t('form.name')}</div><div className="font-semibold">{d.contact.name}</div><div className="text-xs text-slate-500">{d.contact.email} {d.contact.phone}</div></div>
          <div><div className="label">{t('acc.car')}</div><div className="font-semibold">{d.car_label}</div><div className="text-xs text-slate-500">{d.color || '-'}{d.car?.vin ? ` · ${d.car.vin}` : ''}</div></div>
          <div><div className="label">{t('acc.stage')}</div><StatusBadge value={stage} />{d.waiting_for_car && <Badge tone="amber">{t('deal.waiting')}</Badge>}{d.lost_reason && <div className="text-xs text-red-700">{d.lost_reason}</div>}</div>
          <div><div className="label">{t('deal.consultant')}</div>{isSM && consultants.data ? <Select value={d.consultant?.id || ''} onChange={act((e) => api.post(`/deals/${id}/assign`, { consultant_id: Number(e.target.value) }), t('common.saved'))}>{consultants.data.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select> : <div className="font-semibold">{d.consultant?.name || '-'}</div>}
            <div className="mt-1 text-xs text-slate-500">{t('acc.source')}: {t(`source.${d.source}`, d.source)}{d.referral ? ` · ${t('deal.referred_by')} ${d.referral.referral_code}` : ''}</div></div>
        </div>
        <NextStep d={d} role={role} canSell={canSell} canPay={canPay} onQuote={() => { setForm({ color: d.color || '', accessory_ids: [] }); setModal('quote'); }}
          onPay={() => { setForm({ kind: stage === 'quoted' ? 'deposit' : 'payment', currency: 'USD', method: 'cash', amount: '', reference: '' }); setModal('pay'); }}
          onContract={() => { setForm({ deposit_rule: 'partial_refund', partial_percent: 50 }); setModal('contract'); }} />
        {d.notes && <Notice>{d.notes}</Notice>}

        {canSell && ['lead', 'quoted'].includes(stage) && <Section title={t('deal.quotation')} actions={<button className="btn-primary btn-sm" onClick={() => { setForm({ color: d.color || '', accessory_ids: [] }); setModal('quote'); }}>{quote ? t('deal.new_quotation') : t('deal.create_quotation')}</button>}><QuoteView q={quote} d={d} refresh={refresh} editable /></Section>}
        {(!canSell || !['lead', 'quoted'].includes(stage)) && quote && <Section title={t('deal.quotation')}><QuoteView q={quote} d={d} refresh={refresh} /></Section>}

        {stage !== 'lead' && stage !== 'lost' && <Section title={t('deal.money')} actions={<>{canPay && stage !== 'delivered' && <button className="btn-primary btn-sm" onClick={() => { setForm({ kind: stage === 'quoted' ? 'deposit' : 'payment', currency: 'USD', method: 'cash', amount: '', reference: '' }); setModal('pay'); }}>{t('deal.record_payment')}</button>}</>}>
          <div className="grid gap-2 text-sm sm:grid-cols-3"><div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-500">{t('acc.total')}</div><b>{usd2(f.total_usd)}</b></div><div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-500">{t('acc.paid')}</div><b>{usd2(f.paid_usd)}</b></div><div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-500">{t('acc.balance')}</div><b>{usd2(f.balance_usd)}</b></div></div>
          {d.price_locked_until && <p className="text-xs text-slate-500">{t('acc.price_locked', { date: dmy(d.price_locked_until) })}</p>}
          <Table rows={d.payments} cols={[{ label: t('acc.receipt'), render: (r) => r.receipt_number || '-' }, { label: t('acc.kind'), render: (r) => t(`pay.${r.kind}`, r.kind) }, { label: t('acc.amount'), render: (r) => `${r.amount.toLocaleString()} ${r.currency}` }, { label: 'USD', render: (r) => usd2(r.amount_usd) }, { label: t('pay.method'), render: (r) => t(`method.${r.method}`, r.method) }, { label: t('acc.status'), render: (r) => <StatusBadge value={r.status} /> }, { label: t('acc.date'), render: (r) => dmy(r.created_at) },
            { label: '', render: (r) => r.receipt_number ? <button className="btn-secondary btn-sm" onClick={() => api.open(`/payments/${r.id}/receipt.pdf`)}>PDF</button> : null }]} /></Section>}

        {stage === 'reserved' && canSell && !d.contract && <Section title={t('deal.contract')} actions={<button className="btn-primary btn-sm" onClick={() => { setForm({ deposit_rule: 'partial_refund', partial_percent: 50 }); setModal('contract'); }}>{t('deal.create_contract')}</button>}><p className="text-sm text-slate-600">{t('deal.contract_hint')}</p></Section>}
        {d.contract && <Section title={`${t('deal.contract')} ${d.contract.number}`} actions={<button className="btn-secondary btn-sm" onClick={() => api.open(`/contracts/${d.contract.id}/pdf`)}>PDF</button>}>
          <div className="grid gap-2 text-sm sm:grid-cols-4"><div><span className="label">{t('acc.total')}</span>{usd2(d.contract.total_usd)}</div><div><span className="label">{t('deal.vat')}</span>{usd2(d.contract.vat_amount)}</div><div><span className="label">{t('deal.stamp')}</span>{usd2(d.contract.stamp_duty_usd)}</div><div><span className="label">{t('deal.deposit_rule')}</span>{t(`rule.${d.contract.deposit_rule}`)}{d.contract.partial_percent ? ` (${d.contract.partial_percent}%)` : ''}</div></div>
          {d.contract.status === 'pending_signature' ? (canSell && <div className="space-y-2 rounded-lg bg-amber-50 p-3"><p className="text-sm">{t('deal.paper_sign')}</p><div className="grid items-end gap-2 sm:grid-cols-[1fr_auto]"><FileInput accept=".pdf,.png,.jpg,.jpeg" onFile={(file) => setForm({ ...form, signed: file })} label={t('deal.signed_copy')} /><button className="btn-primary btn-sm" disabled={busy || !form.signed} onClick={act(() => api.upload(`/contracts/${d.contract.id}/signed-copy`, form.signed), t('acc.signed'))}>{t('deal.attach_signed')}</button></div><p className="text-xs text-slate-600">{t('deal.online_sign_hint')}</p></div>)
            : <Badge tone="green">{t('acc.signed')} {dmy(d.contract.signed_at, true)} · {d.contract.signed_method === 'online' ? t('deal.signed_online') : t('deal.signed_paper')}</Badge>}</Section>}

        {stage !== 'lost' && stage !== 'lead' && canSell && <LoanSection d={d} act={act} />}
        {canPay && ['contract_signed', 'paid', 'delivered'].includes(stage) && <InvoiceSection d={d} act={act} />}

        {d.exceptions.length > 0 && <Section title={t('staff.exceptions')}><Table rows={d.exceptions} cols={[{ label: t('deal.description'), render: (r) => r.description }, { label: t('acc.amount'), render: (r) => usd2(r.price_usd) }, { label: t('acc.status'), render: (r) => <StatusBadge value={r.status} /> }, { label: t('deal.reason'), render: (r) => r.decision_reason || '-' }]} /></Section>}

        <Section title={t('deal.history')}><ol className="space-y-1 text-sm">{d.history.map((h) => <li key={h.id} className="flex flex-wrap gap-x-2"><span className="text-slate-500">{dmy(h.at, true)}</span><span>{h.from_stage ? `${t(`status.${h.from_stage}`)} → ` : ''}<b>{t(`status.${h.to_stage}`)}</b></span><span className="text-slate-500">{h.user_name || t('deal.system')}{h.reason ? ` — ${h.reason}` : ''}</span></li>)}</ol></Section>

        <div className="flex flex-wrap gap-2">
          {canSell && !['delivered', 'lost', 'paid', 'contract_signed'].includes(stage) && <button className="btn-danger" onClick={() => { setForm({ reason: '' }); setModal('lost'); }}>{t('deal.mark_lost')}</button>}
          {isSM && ['reserved', 'contract_signed'].includes(stage) && <button className="btn-danger" onClick={() => { setForm({ reason: '', decision: 'partial_refund' }); setModal('cancel'); }}>{t('deal.cancel_deal')}</button>}
          {['delivery_coordinator', 'sales_manager', 'general_manager'].includes(role) && ['contract_signed', 'paid', 'delivered'].includes(stage) && <Link className="btn-secondary" to={`/staff/delivery/${d.id}`}>{t('staff.delivery')}</Link>}
        </div>

        {modal === 'quote' && <Modal title={t('deal.create_quotation')} onClose={() => setModal(null)}><QuoteForm d={d} form={form} setForm={setForm} onSubmit={async () => { const r = await run(() => api.post(`/deals/${id}/quotation`, { color: form.color || undefined, accessory_ids: form.accessory_ids, extra_items: form.extra?.description ? [{ description: form.extra.description, price_usd: Number(form.extra.price_usd) }] : [] }), t('common.saved')); if (r) { setModal(null); refresh(); } }} busy={busy} /></Modal>}
        {modal === 'pay' && <Modal title={t('deal.record_payment')} onClose={() => setModal(null)}><PayForm d={d} form={form} setForm={setForm} busy={busy} onSubmit={async () => { const r = await run(() => api.post('/payments', { deal_id: d.id, ...form, amount: Number(form.amount), car_id: form.car_id || undefined }), t('common.saved')); if (r) { setModal(null); refresh(); } }} /></Modal>}
        {modal === 'contract' && <Modal title={t('deal.create_contract')} onClose={() => setModal(null)}><form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); const r = await run(() => api.post(`/deals/${id}/contract`, { deposit_rule: form.deposit_rule, partial_percent: form.deposit_rule === 'partial_refund' ? Number(form.partial_percent) : undefined }), t('common.saved')); if (r) { setModal(null); refresh(); } }}>
          <Field label={t('deal.deposit_rule')}><Select value={form.deposit_rule} onChange={(e) => setForm({ ...form, deposit_rule: e.target.value })}>{['full_refund', 'partial_refund', 'forfeit'].map((x) => <option key={x} value={x}>{t(`rule.${x}`)}</option>)}</Select></Field>
          {form.deposit_rule === 'partial_refund' && <Field label={t('deal.partial_percent')}><Input type="number" min="1" max="99" value={form.partial_percent} onChange={(e) => setForm({ ...form, partial_percent: e.target.value })} /></Field>}
          <button className="btn-primary" disabled={busy}>{t('deal.create_contract')}</button></form></Modal>}
        {modal === 'lost' && <Modal title={t('deal.mark_lost')} onClose={() => setModal(null)}><form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); const r = await run(() => api.post(`/deals/${id}/lost`, { reason: form.reason }), t('common.saved')); if (r) { setModal(null); refresh(); } }}><Field label={t('deal.reason')}><Textarea required value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></Field><button className="btn-danger" disabled={busy}>{t('deal.mark_lost')}</button></form></Modal>}
        {modal === 'cancel' && <Modal title={t('deal.cancel_deal')} onClose={() => setModal(null)}><form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); const r = await run(() => api.post(`/deals/${id}/cancel`, { reason: form.reason, ...(d.contract ? {} : { decision: form.decision, partial_percent: Number(form.partial_percent || 50) }) }), t('common.saved')); if (r) { setModal(null); refresh(); } }}>
          <Notice tone="warn">{d.contract ? t('deal.cancel_rule', { rule: t(`rule.${d.contract.deposit_rule}`) }) : t('deal.cancel_no_contract')}</Notice>
          {!d.contract && <Field label={t('deal.deposit_rule')}><Select value={form.decision} onChange={(e) => setForm({ ...form, decision: e.target.value })}>{['full_refund', 'partial_refund', 'forfeit'].map((x) => <option key={x} value={x}>{t(`rule.${x}`)}</option>)}</Select></Field>}
          <Field label={t('deal.reason')}><Textarea required value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></Field><button className="btn-danger" disabled={busy}>{t('deal.cancel_deal')}</button></form></Modal>}
      </div>); }}</Loading>;
}
function QuoteView({ q, d, refresh, editable }) {
  const { t } = useTranslation(); const [run, busy] = useAction(); const acc = useQuery({ queryKey: ['accessories'], enabled: !!editable, queryFn: () => api.get('/catalogue/accessories') }); const st = useQuery({ queryKey: ['settings'], queryFn: () => api.get('/settings') }); const [sel, setSel] = useState(''); const [extra, setExtra] = useState({ description: '', price_usd: '' });
  if (!q) return <p className="text-sm text-slate-500">{t('deal.no_quotation')}</p>;
  return <div className="space-y-3 text-sm">
    <div className="flex flex-wrap items-center gap-2"><b>{q.number}</b>{q.expired ? <Badge tone="red">{t('deal.expired')}</Badge> : <Badge tone="green">{t('deal.valid_until', { date: dmy(q.valid_until) })}</Badge>}</div>
    <table className="min-w-full"><tbody className="divide-y"><tr><td className="py-1">{d.car_label} {q.color ? `(${q.color})` : ''}</td><td className="py-1 text-end">{usd2(q.price_usd)}</td></tr>
      {q.items.map((i) => <tr key={i.id}><td className="py-1">{i.description} {i.status !== 'approved' && <StatusBadge value={i.status} />}</td><td className="py-1 text-end">{usd2(i.price_usd)}</td></tr>)}
      <tr><td className="py-1 text-slate-500">{t('deal.vat_included', { rate: q.vat_rate })}</td><td className="py-1 text-end text-slate-500">{usd2(q.vat_amount)}</td></tr>
      <tr className="font-bold"><td className="py-1">{t('acc.total')}</td><td className="py-1 text-end">{usd2(q.total_usd)} <span className="block text-xs font-normal text-slate-500">≈ {st.data ? lbp(Math.round(q.total_usd * Number(st.data.exchange_rate))) : '…'}</span></td></tr></tbody></table>
    <p className="text-xs text-slate-500">{t('deal.price_fixed_note')}</p>
    {editable && !q.expired && <div className="grid gap-3 border-t pt-3 md:grid-cols-2">
      <div className="flex gap-2"><Select value={sel} onChange={(e) => setSel(e.target.value)} aria-label={t('deal.add_accessory')}><option value="">{t('deal.add_accessory')}</option>{acc.data?.map((a) => <option key={a.id} value={a.id}>{a.name_en} — {usd(a.price_usd)}</option>)}</Select><button className="btn-secondary btn-sm" disabled={!sel || busy} onClick={async () => { if (await run(() => api.post(`/quotations/${q.id}/items`, { accessory_id: Number(sel) }), t('common.saved'))) { setSel(''); refresh(); } }}>{t('common.add')}</button></div>
      <div className="flex gap-2"><Input placeholder={t('deal.extra_item')} value={extra.description} onChange={(e) => setExtra({ ...extra, description: e.target.value })} /><Input className="max-w-[7rem]" type="number" min="1" placeholder="USD" value={extra.price_usd} onChange={(e) => setExtra({ ...extra, price_usd: e.target.value })} /><button className="btn-secondary btn-sm" disabled={!extra.description || !extra.price_usd || busy} onClick={async () => { if (await run(() => api.post(`/quotations/${q.id}/items`, { description: extra.description, price_usd: Number(extra.price_usd) }), t('deal.exception_sent'))) { setExtra({ description: '', price_usd: '' }); refresh(); } }}>{t('deal.request_approval')}</button></div></div>}
  </div>;
}
function QuoteForm({ d, form, setForm, onSubmit, busy }) {
  const { t } = useTranslation(); const trim = useQuery({ queryKey: ['trim', String(d.trim_id)], enabled: !!d.trim_id, queryFn: () => api.get(`/catalogue/trims/${d.trim_id}`) }); const acc = useQuery({ queryKey: ['accessories'], queryFn: () => api.get('/catalogue/accessories') });
  const toggle = (id) => setForm({ ...form, accessory_ids: form.accessory_ids.includes(id) ? form.accessory_ids.filter((x) => x !== id) : [...form.accessory_ids, id] });
  return <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }} className="space-y-3">
    {!d.trim_id ? <Notice tone="warn">{t('deal.choose_model_first')}</Notice> : <>
      <div className="rounded-lg bg-slate-50 p-3 text-sm"><b>{d.car_label}</b>{trim.data && <div className="mt-1">{t('deal.catalogue_price')}: <b>{usd(trim.data.price_usd)}</b> <span className="text-xs text-slate-500">({t('deal.cannot_edit_price')})</span></div>}</div>
      <Field label={t('deal.color')}><Select value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })}><option value="">—</option>{trim.data?.colors.map((c) => <option key={c} value={c}>{t(`color.${c}`, c)}</option>)}</Select></Field>
      <div><span className="label">{t('deal.accessories')}</span><div className="grid gap-1">{acc.data?.map((a) => <label key={a.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.accessory_ids.includes(a.id)} onChange={() => toggle(a.id)} />{a.name_en} <span className="text-slate-500">{usd(a.price_usd)}</span></label>)}</div></div>
      <button className="btn-primary" disabled={busy}>{t('deal.create_quotation')}</button></>}</form>;
}
function PayForm({ d, form, setForm, onSubmit, busy }) {
  const { t } = useTranslation(); const set = (k) => (e) => setForm({ ...form, [k]: e.target.value }); const waitingDeposit = form.kind === 'deposit';
  return <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }} className="grid gap-3 sm:grid-cols-2">
    <Field label={t('acc.kind')}><Select value={form.kind} onChange={set('kind')} disabled={d.stage === 'quoted'}><option value="deposit">{t('pay.deposit')}</option><option value="payment">{t('pay.payment')}</option></Select></Field>
    <Field label={t('pay.method')}><Select value={form.method} onChange={set('method')}>{['cash', 'bank_transfer', 'cheque', 'card'].map((m) => <option key={m} value={m}>{t(`method.${m}`)}</option>)}</Select></Field>
    <Field label={t('acc.amount')}><Input type="number" min="0.01" step="0.01" required value={form.amount} onChange={set('amount')} /></Field>
    <Field label={t('pay.currency')}><Select value={form.currency} onChange={set('currency')}><option>USD</option><option>LBP</option></Select></Field>
    <div className="sm:col-span-2"><Field label={t('pay.reference')}><Input value={form.reference} onChange={set('reference')} /></Field></div>
    {waitingDeposit && <Notice>{t('pay.deposit_note')}</Notice>}
    <div className="sm:col-span-2"><button className="btn-primary" disabled={busy}>{t('common.save')}</button></div></form>;
}
function LoanSection({ d, act }) {
  const { t } = useTranslation(); const [bank, setBank] = useState('');
  return <Section title={t('deal.loan')}>
    {d.loan ? <div className="flex flex-wrap items-center gap-2 text-sm"><b>{d.loan.bank}</b><StatusBadge value={d.loan.status} />
      <button className="btn-secondary btn-sm" onClick={() => api.open(`/loans/${d.loan.id}/pdf`)}>{t('deal.loan_pdf')}</button>
      {d.loan.status === 'submitted' && <><button className="btn-primary btn-sm" onClick={act(() => api.patch(`/loans/${d.loan.id}`, { status: 'approved' }), t('common.saved'))}>{t('deal.loan_approved')}</button><button className="btn-secondary btn-sm" onClick={act(() => api.patch(`/loans/${d.loan.id}`, { status: 'rejected' }), t('common.saved'))}>{t('deal.loan_rejected')}</button></>}
      {['submitted', 'approved'].includes(d.loan.status) && <button className="btn-secondary btn-sm" onClick={act(() => api.patch(`/loans/${d.loan.id}`, { status: 'withdrawn' }), t('common.saved'))}>{t('deal.loan_withdraw')}</button>}</div> : null}
    {(!d.loan || ['rejected', 'withdrawn'].includes(d.loan.status)) && <div className="flex gap-2"><Input placeholder={t('deal.partner_bank')} value={bank} onChange={(e) => setBank(e.target.value)} /><button className="btn-secondary" disabled={!bank} onClick={act(() => api.post(`/deals/${d.id}/loan`, { bank }), t('common.saved'))}>{t('deal.request_loan')}</button></div>}
  </Section>;
}
function InvoiceSection({ d, act }) {
  const { t } = useTranslation(); const inv = useQuery({ queryKey: ['invoice', d.id], queryFn: () => api.get(`/deals/${d.id}/invoice`), retry: false });
  const qc = useQueryClient();
  return <Section title={t('staff.invoices')}>{inv.data ? <div className="flex flex-wrap items-center gap-3 text-sm"><b>{inv.data.number}</b><span>{usd2(inv.data.total_usd)} ({t('deal.vat')} {usd2(inv.data.vat_amount)})</span><button className="btn-secondary btn-sm" onClick={() => api.open(`/invoices/${inv.data.id}/pdf`)}>PDF</button></div>
    : <button className="btn-primary btn-sm w-fit" onClick={act(async () => { await api.post(`/deals/${d.id}/invoice`); qc.invalidateQueries({ queryKey: ['invoice', d.id] }); }, t('common.saved'))}>{t('deal.issue_invoice')}</button>}</Section>;
}
