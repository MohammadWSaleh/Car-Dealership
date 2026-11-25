import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Input, Loading, PageTitle, Select, StatusBadge, Table, useAction } from '../components/ui.jsx';
import { dmy, usd2 } from '../utils.js';

// FR-DEAL-04: price exceptions (extra items) approved or rejected by the Sales Manager with a reason
export function ExceptionsPage() {
  const { t } = useTranslation(); const { user } = useAuth(); const qc = useQueryClient(); const [run, busy] = useAction(); const [status, setStatus] = useState('pending'); const [reason, setReason] = useState({});
  const q = useQuery({ queryKey: ['exceptions', status], queryFn: () => api.get(`/exceptions${status ? `?status=${status}` : ''}`) });
  const decide = async (id, decision) => { if (await run(() => api.post(`/exceptions/${id}/decide`, { decision, reason: reason[id] || '' }), t('common.saved'))) qc.invalidateQueries({ queryKey: ['exceptions'] }); };
  return <div><PageTitle>{t('staff.exceptions')}</PageTitle>
    <div className="mb-4 max-w-xs"><Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label={t('acc.status')}><option value="pending">{t('status.pending')}</option><option value="approved">{t('status.approved')}</option><option value="rejected">{t('status.rejected')}</option><option value="">{t('common.all')}</option></Select></div>
    <div className="card p-0 sm:p-0"><Loading q={q}>{(rows) => <Table rows={rows} cols={[{ label: t('deal.title'), render: (r) => <Link className="text-brand-700 underline" to={`/staff/deals/${r.deal_id}`}>#{r.deal_id} {r.contact_name}</Link> }, { label: t('deal.description'), render: (r) => r.description }, { label: t('acc.amount'), render: (r) => usd2(r.price_usd) }, { label: t('deal.requested_by'), render: (r) => r.requested_by_name }, { label: t('acc.date'), render: (r) => dmy(r.created_at) }, { label: t('acc.status'), render: (r) => <StatusBadge value={r.status} /> },
      { label: '', render: (r) => r.status === 'pending' && user.role === 'sales_manager' ? <div className="flex gap-1"><Input className="w-40" placeholder={t('deal.reason')} value={reason[r.id] || ''} onChange={(e) => setReason({ ...reason, [r.id]: e.target.value })} aria-label={t('deal.reason')} /><button className="btn-primary btn-sm" disabled={busy} onClick={() => decide(r.id, 'approved')}>{t('common.approve')}</button><button className="btn-danger btn-sm" disabled={busy || !reason[r.id]} onClick={() => decide(r.id, 'rejected')}>{t('common.reject')}</button></div> : (r.decision_reason || '') }]} />}</Loading></div></div>;
}
