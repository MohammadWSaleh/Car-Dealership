import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Badge, Field, FileInput, Input, Loading, Notice, PageTitle, StatusBadge, Table, Textarea, useAction } from '../components/ui.jsx';
import { dmy, usd2 } from '../utils.js';

export function DeliveryPage() {
  const { t } = useTranslation(); const nav = useNavigate(); const q = useQuery({ queryKey: ['delivery'], queryFn: () => api.get('/delivery/deals') });
  return <div><PageTitle>{t('staff.delivery')}</PageTitle><div className="card p-0 sm:p-0"><Loading q={q}>{(rows) => <Table rows={rows} empty={t('staff.none')} onRow={(r) => nav(`/staff/delivery/${r.id}`)} cols={[{ label: '#', render: (r) => r.id }, { label: t('form.name'), render: (r) => r.contact_name }, { label: t('acc.car'), render: (r) => <div>{r.car_label}<div className="text-xs text-slate-500">{r.car?.vin || (r.waiting_for_car ? t('deal.waiting') : '')}</div></div> }, { label: t('del.inspection'), render: (r) => `${r.inspection_passed}/${r.inspection_total}` }, { label: t('acc.balance'), render: (r) => (r.fully_paid || r.loan_approved ? <Badge tone="green">{r.loan_approved && !r.fully_paid ? t('del.loan_ok') : t('del.paid')}</Badge> : usd2(r.balance_usd)) }, { label: t('del.slot'), render: (r) => (r.delivery_slot ? dmy(r.delivery_slot, true) : '-') }, { label: t('acc.status'), render: (r) => (r.ready_to_deliver ? <Badge tone="green">{t('del.ready')}</Badge> : <Badge tone="amber">{t('del.not_ready')}</Badge>) }]} />}</Loading></div></div>;
}
// FR-DEL-02..06: inspection checklist, registration documents, handover form and signed copy
export function DeliveryDetail() {
  const { id } = useParams(); const { t } = useTranslation(); const { user } = useAuth(); const qc = useQueryClient(); const [run, busy] = useAction(); const coord = user.role === 'delivery_coordinator';
  const q = useQuery({ queryKey: ['delivery', id], queryFn: () => api.get(`/delivery/deals/${id}`) }); const [h, setH] = useState({ keys_count: 2, notes: '', file: null });
  const refresh = () => { qc.invalidateQueries({ queryKey: ['delivery'] }); qc.invalidateQueries({ queryKey: ['deals'] }); };
  const setInsp = async (k, passed) => { if (await run(() => api.put(`/delivery/deals/${id}/inspection/${k}`, { passed }))) refresh(); };
  const setReg = async (k, ready) => { if (await run(() => api.put(`/delivery/deals/${id}/registration/${k}`, { ready }))) refresh(); };
  const hand = async () => { const fd = new FormData(); fd.append('file', h.file); fd.append('keys_count', h.keys_count); fd.append('notes', h.notes); if (await run(() => api.upload(`/delivery/deals/${id}/handover`, h.file, { keys_count: h.keys_count, notes: h.notes }), t('del.delivered_ok'))) refresh(); };
  return <Loading q={q}>{(d) => <div className="space-y-4">
    <PageTitle actions={<Link className="btn-secondary" to="/staff/delivery">← {t('staff.delivery')}</Link>}>{t('staff.delivery')} #{d.id} — {d.contact.name}</PageTitle>
    <div className="card grid gap-3 sm:grid-cols-4"><div><span className="label">{t('acc.car')}</span>{d.car_label}</div><div><span className="label">VIN</span>{d.car?.vin || '-'}</div><div><span className="label">{t('acc.stage')}</span><StatusBadge value={d.stage} /></div><div><span className="label">{t('acc.balance')}</span>{usd2(d.financials.balance_usd)}{d.loan_approved && <Badge tone="green">{t('del.loan_ok')}</Badge>}</div></div>
    {d.blockers.length > 0 && <Notice tone="warn"><b>{t('del.blocked')}</b><ul className="list-disc ps-5">{d.blockers.map((b) => <li key={b}>{t(`del.blocker.${b}`, b)}</li>)}</ul></Notice>}
    <section className="card"><h3 className="mb-2 font-bold">{t('del.inspection')}</h3><ul className="divide-y">{d.inspection.map((i) => <li key={i.item_key} className="flex items-center justify-between gap-2 py-2 text-sm"><span>{i.label}</span>{coord && d.stage !== 'delivered' ? <label className="flex items-center gap-2"><input type="checkbox" checked={i.passed} disabled={busy} onChange={(e) => setInsp(i.item_key, e.target.checked)} />{t('del.passed')}</label> : (i.passed ? <Badge tone="green">{t('del.passed')}</Badge> : <Badge tone="amber">{t('del.pending')}</Badge>)}</li>)}</ul></section>
    <section className="card"><h3 className="mb-2 font-bold">{t('del.registration')}</h3><ul className="divide-y">{d.registration.map((i) => <li key={i.doc_key} className="flex items-center justify-between gap-2 py-2 text-sm"><span>{t(`reg.${i.doc_key}`, i.doc_key)}</span>{coord && d.stage !== 'delivered' ? <label className="flex items-center gap-2"><input type="checkbox" checked={i.ready} disabled={busy} onChange={(e) => setReg(i.doc_key, e.target.checked)} />{t('del.ready')}</label> : (i.ready ? <Badge tone="green">{t('del.ready')}</Badge> : <Badge tone="amber">{t('del.pending')}</Badge>)}</li>)}</ul></section>
    <section className="card space-y-3"><h3 className="font-bold">{t('del.handover')}</h3>
      {d.accessories.length > 0 && <p className="text-sm">{t('del.accessories')}: {d.accessories.join(', ')}</p>}
      <button className="btn-secondary w-fit" onClick={() => api.open(`/delivery/deals/${id}/handover-form.pdf`)}>{t('del.handover_form')}</button>
      {d.handover ? <Notice tone="ok">{t('del.delivered_on', { date: dmy(d.handover.completed_at, true), keys: d.handover.keys_count })}</Notice>
        : coord && <div className="grid gap-3 sm:grid-cols-2"><Field label={t('del.keys')}><Input type="number" min="1" value={h.keys_count} onChange={(e) => setH({ ...h, keys_count: e.target.value })} /></Field><Field label={t('del.signed_form')}><FileInput onFile={(file) => setH({ ...h, file })} label={t('del.signed_form')} /></Field><div className="sm:col-span-2"><Field label={t('del.notes')}><Textarea value={h.notes} onChange={(e) => setH({ ...h, notes: e.target.value })} /></Field></div><div className="sm:col-span-2"><button className="btn-primary" disabled={busy || !h.file || d.blockers.length > 0} onClick={hand}>{t('del.complete')}</button></div></div>}</section>
  </div>}</Loading>;
}
