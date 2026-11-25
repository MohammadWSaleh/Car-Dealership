import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Field, Input, Loading, Modal, PageTitle, Select, StatusBadge, Table, Textarea, useAction } from '../components/ui.jsx';
import { dmy, usd2 } from '../utils.js';

export function PaymentsPage() {
  const { t } = useTranslation(); const { user } = useAuth(); const qc = useQueryClient(); const [run, busy] = useAction();
  const [f, setF] = useState({ kind: '', status: '' }); const [refund, setRefund] = useState(null); const [form, setForm] = useState({}); const [rej, setRej] = useState({});
  const qs = Object.entries(f).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join('&');
  const q = useQuery({ queryKey: ['payments', qs], queryFn: () => api.get(`/payments${qs ? `?${qs}` : ''}`) });
  const refresh = () => qc.invalidateQueries({ queryKey: ['payments'] });
  const canExport = ['accountant', 'sales_manager'].includes(user.role);
  const doRefund = async (e) => { e.preventDefault(); if (await run(() => api.post(`/payments/${refund.id}/refund`, { amount: Number(form.amount), reason: form.reason }), t('pay.refund_sent'))) { setRefund(null); refresh(); } };
  const approve = async (id, ok) => { if (await run(() => api.post(`/payments/${id}/approve`, ok ? {} : { approve: false, reason: rej[id] || '' }), t('common.saved'))) refresh(); };
  return <div><PageTitle actions={canExport && <><button className="btn-secondary" onClick={() => api.open('/payments/export.csv?type=payments')}>{t('pay.export_payments')}</button><button className="btn-secondary" onClick={() => api.open('/payments/export.csv?type=invoices')}>{t('pay.export_invoices')}</button></>}>{t('staff.payments')}</PageTitle>
    <div className="mb-4 grid gap-3 sm:grid-cols-3"><Select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} aria-label={t('acc.kind')}><option value="">{t('common.all')}</option>{['deposit', 'payment', 'refund'].map((k) => <option key={k} value={k}>{t(`pay.${k}`)}</option>)}</Select>
      <Select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} aria-label={t('acc.status')}><option value="">{t('common.all')}</option>{['completed', 'pending_approval', 'rejected'].map((k) => <option key={k} value={k}>{t(`status.${k}`)}</option>)}</Select></div>
    <div className="card p-0 sm:p-0"><Loading q={q}>{(rows) => <Table rows={rows} cols={[{ label: t('acc.receipt'), render: (r) => r.receipt_number || '-' }, { label: t('deal.title'), render: (r) => <Link className="text-brand-700 underline" to={`/staff/deals/${r.deal_id}`}>#{r.deal_id} {r.contact_name}</Link> }, { label: t('acc.kind'), render: (r) => t(`pay.${r.kind}`, r.kind) }, { label: t('acc.amount'), render: (r) => `${Number(r.amount).toLocaleString()} ${r.currency}` }, { label: 'USD', render: (r) => usd2(r.amount_usd) }, { label: t('acc.status'), render: (r) => <StatusBadge value={r.status} /> }, { label: t('acc.date'), render: (r) => dmy(r.created_at) },
      { label: '', render: (r) => <div className="flex flex-wrap gap-1">
        {r.receipt_number && <button className="btn-secondary btn-sm" onClick={() => api.open(`/payments/${r.id}/receipt.pdf`)}>PDF</button>}
        {user.role === 'accountant' && r.kind !== 'refund' && r.status === 'completed' && <button className="btn-secondary btn-sm" onClick={() => { setRefund(r); setForm({ amount: r.amount, reason: '' }); }}>{t('pay.refund')}</button>}
        {user.role === 'sales_manager' && r.kind === 'refund' && r.status === 'pending_approval' && <><button className="btn-primary btn-sm" disabled={busy} onClick={() => approve(r.id, true)}>{t('common.approve')}</button><Input className="w-32" placeholder={t('deal.reason')} value={rej[r.id] || ''} onChange={(e) => setRej({ ...rej, [r.id]: e.target.value })} aria-label={t('deal.reason')} /><button className="btn-danger btn-sm" disabled={busy || !rej[r.id]} onClick={() => approve(r.id, false)}>{t('common.reject')}</button></>}</div> }]} />}</Loading></div>
    {refund && <Modal title={t('pay.refund')} onClose={() => setRefund(null)}><form onSubmit={doRefund} className="space-y-3"><Field label={`${t('acc.amount')} (${refund.currency})`}><Input type="number" step="0.01" min="0.01" max={refund.amount} required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field><Field label={t('deal.reason')}><Textarea required value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></Field><p className="text-xs text-slate-500">{t('pay.refund_note')}</p><button className="btn-primary" disabled={busy}>{t('pay.refund')}</button></form></Modal>}</div>;
}
export function InvoicesPage() {
  const { t } = useTranslation(); const q = useQuery({ queryKey: ['invoices'], queryFn: () => api.get('/invoices') });
  return <div><PageTitle>{t('staff.invoices')}</PageTitle><div className="card p-0 sm:p-0"><Loading q={q}>{(rows) => <Table rows={rows} cols={[{ label: '#', render: (r) => r.number }, { label: t('deal.title'), render: (r) => <Link className="text-brand-700 underline" to={`/staff/deals/${r.deal_id}`}>#{r.deal_id} {r.contact_name}</Link> }, { label: t('inv.net'), render: (r) => usd2(r.net_usd) }, { label: t('deal.vat'), render: (r) => `${usd2(r.vat_amount)} (${r.vat_rate}%)` }, { label: t('acc.total'), render: (r) => usd2(r.total_usd) }, { label: t('acc.date'), render: (r) => dmy(r.created_at) }, { label: '', render: (r) => <button className="btn-secondary btn-sm" onClick={() => api.open(`/invoices/${r.id}/pdf`)}>PDF</button> }]} />}</Loading></div></div>;
}
