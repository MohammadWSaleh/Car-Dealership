import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Badge, Field, FileInput, Input, Loading, Notice, PageTitle, Select, StatusBadge, Table, useAction } from '../components/ui.jsx';
import { dmy } from '../utils.js';

export function InventoryPage() {
  const { t } = useTranslation(); const { user } = useAuth(); const sm = user.role === 'sales_manager'; const [tab, setTab] = useState('cars');
  return <div><PageTitle>{t('staff.inventory')}</PageTitle>
    <div className="mb-4 flex flex-wrap gap-2" role="tablist">{['cars', ...(sm ? ['waiting', 'import'] : []), 'alerts'].map((k) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'} onClick={() => setTab(k)}>{t(`inv.${k}`)}</button>)}</div>
    {tab === 'cars' && <Cars sm={sm} />}{tab === 'waiting' && <Waiting />}{tab === 'import' && <Import />}{tab === 'alerts' && <AlertsTab />}</div>;
}
function Cars({ sm }) {
  const { t } = useTranslation(); const qc = useQueryClient(); const [run, busy] = useAction(); const [status, setStatus] = useState(''); const [vin, setVin] = useState('');
  const q = useQuery({ queryKey: ['cars', status, vin], queryFn: () => api.get(`/inventory/cars?${status ? `status=${status}&` : ''}${vin ? `q=${encodeURIComponent(vin)}` : ''}`) });
  const trims = useQuery({ queryKey: ['trims', ''], queryFn: () => api.get('/catalogue/trims') }); const [n, setN] = useState({ vin: '', trim_id: '', color: '', status: 'in_stock', arrival_date: '' }); const refresh = () => qc.invalidateQueries({ queryKey: ['cars'] });
  const trim = trims.data?.find((x) => String(x.id) === String(n.trim_id));
  return <div className="space-y-4">
    {sm && <form className="card grid gap-3 sm:grid-cols-3 lg:grid-cols-6" onSubmit={async (e) => { e.preventDefault(); if (await run(() => api.post('/inventory/cars', { ...n, trim_id: Number(n.trim_id), color: n.color || undefined, arrival_date: n.status === 'in_transit' ? n.arrival_date : undefined }), t('common.saved'))) { setN({ ...n, vin: '' }); refresh(); } }}>
      <Input required placeholder="VIN" value={n.vin} onChange={(e) => setN({ ...n, vin: e.target.value.toUpperCase() })} aria-label="VIN" /><Select required value={n.trim_id} onChange={(e) => setN({ ...n, trim_id: e.target.value, color: '' })} aria-label={t('acc.car')}><option value="">{t('acc.car')}</option>{trims.data?.map((x) => <option key={x.id} value={x.id}>{x.brand} {x.model} {x.name}</option>)}</Select>
      <Select value={n.color} onChange={(e) => setN({ ...n, color: e.target.value })} aria-label={t('deal.color')}><option value="">{t('deal.color')}</option>{trim?.colors.map((c) => <option key={c} value={c}>{t(`color.${c}`, c)}</option>)}</Select>
      <Select value={n.status} onChange={(e) => setN({ ...n, status: e.target.value })} aria-label={t('acc.status')}><option value="in_stock">{t('status.in_stock')}</option><option value="in_transit">{t('status.in_transit')}</option></Select>
      {n.status === 'in_transit' ? <Input type="date" required value={n.arrival_date} onChange={(e) => setN({ ...n, arrival_date: e.target.value })} aria-label={t('inv.arrival')} /> : <span />}<button className="btn-primary" disabled={busy}>{t('common.add')}</button></form>}
    <div className="grid gap-3 sm:grid-cols-3"><Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label={t('acc.status')}><option value="">{t('common.all')}</option>{['in_transit', 'in_stock', 'reserved', 'sold', 'delivered'].map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}</Select><Input placeholder="VIN" value={vin} onChange={(e) => setVin(e.target.value)} aria-label="VIN" /></div>
    <div className="card p-0 sm:p-0"><Loading q={q}>{(rows) => <Table rows={rows} cols={[{ label: 'VIN', render: (r) => <span className="font-mono text-xs">{r.vin}</span> }, { label: t('acc.car'), render: (r) => <div>{r.car}{r.is_demo && <Badge tone="blue">{t('inv.demo')}</Badge>}</div> }, { label: t('deal.color'), render: (r) => t(`color.${r.color}`, r.color || '-') }, { label: t('acc.status'), render: (r) => <StatusBadge value={r.status} /> }, { label: t('inv.arrival'), render: (r) => (r.arrival_date ? dmy(r.arrival_date) : '-') }, { label: t('inv.age'), render: (r) => (r.age_days != null ? `${r.age_days} d` : '-') }, { label: t('deal.title'), render: (r) => (r.deal_id ? <Link className="text-brand-700 underline" to={`/staff/deals/${r.deal_id}`}>#{r.deal_id} {r.deal_contact}</Link> : '-') },
      { label: '', render: (r) => sm && r.status === 'in_transit' ? <button className="btn-primary btn-sm" disabled={busy} onClick={async () => { if (await run(() => api.post(`/inventory/cars/${r.id}/arrive`), t('inv.arrived'))) refresh(); }}>{t('inv.mark_arrived')}</button> : null }]} />}</Loading></div></div>;
}
function Waiting() {
  const { t } = useTranslation(); const q = useQuery({ queryKey: ['waiting'], queryFn: () => api.get('/inventory/waiting') });
  return <div className="space-y-3"><Notice>{t('inv.fifo_note')}</Notice><div className="card p-0 sm:p-0"><Loading q={q}>{(rows) => <Table rows={rows} empty={t('staff.none')} cols={[{ label: '#', render: (r) => <Link className="text-brand-700 underline" to={`/staff/deals/${r.id}`}>{r.id}</Link> }, { label: t('form.name'), render: (r) => r.contact_name }, { label: t('acc.car'), render: (r) => r.car }, { label: t('deal.color'), render: (r) => t(`color.${r.color}`, r.color || '-') }, { label: t('inv.deposit_at'), render: (r) => dmy(r.deposit_at, true) }]} />}</Loading></div></div>;
}
function Import() {
  const { t } = useTranslation(); const [run, busy] = useAction(); const qc = useQueryClient(); const [type, setType] = useState('stock'); const [file, setFile] = useState(null); const [res, setRes] = useState(null);
  return <div className="card max-w-2xl space-y-3"><Notice>{t(`inv.csv_hint_${type}`)}</Notice>
    <Field label={t('inv.csv_type')}><Select value={type} onChange={(e) => { setType(e.target.value); setRes(null); }}>{['prices', 'stock', 'shipments'].map((x) => <option key={x} value={x}>{t(`inv.type_${x}`)}</option>)}</Select></Field>
    <Field label="CSV"><FileInput accept=".csv" onFile={setFile} label="CSV" /></Field>
    <button className="btn-primary w-fit" disabled={busy || !file} onClick={async () => { const r = await run(() => api.upload(`/inventory/import?type=${type}`, file), t('inv.import_done')); if (r) { setRes(r); qc.invalidateQueries(); } }}>{t('inv.import')}</button>
    {res && <div className="space-y-2 text-sm"><Notice tone={res.errors?.length ? 'warn' : 'ok'}>{t('inv.import_result', { imported: res.imported ?? 0, rejected: res.errors?.length ?? 0 })}</Notice>{res.errors?.length > 0 && <ul className="list-disc ps-5 text-red-700">{res.errors.map((e, i) => <li key={i}>{e.row ? `${t('inv.row')} ${e.row}: ` : ''}{e.message || e.error || JSON.stringify(e)}</li>)}</ul>}</div>}</div>;
}
function AlertsTab() {
  const { t } = useTranslation(); const q = useQuery({ queryKey: ['alerts'], queryFn: () => api.get('/inventory/alerts') });
  return <Loading q={q}>{(a) => <div className="space-y-3">{!a.low_stock.length && !a.unsold_too_long.length && <Notice tone="ok">{t('inv.no_alerts')}</Notice>}
    {a.low_stock.map((x) => <Notice key={x.trim_id} tone="warn">{t('staff.low_stock', { car: x.car, count: x.in_stock, threshold: x.threshold })}</Notice>)}
    {a.unsold_too_long.map((x) => <Notice key={x.vin} tone="warn">{t('staff.unsold', { car: x.car, vin: x.vin, days: x.days_unsold })}</Notice>)}</div>}</Loading>;
}
