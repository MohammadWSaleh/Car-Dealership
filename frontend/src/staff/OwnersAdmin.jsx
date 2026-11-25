import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Badge, Field, Input, Loading, PageTitle, Select, Table, Textarea, useAction } from '../components/ui.jsx';
import { dmy, usd } from '../utils.js';

// FR-OC-04 (events / early access), FR-OC-05 (referral credit amount), members overview
export function OwnersAdmin() {
  const { t } = useTranslation(); const { user } = useAuth(); const sm = user.role === 'sales_manager'; const qc = useQueryClient(); const [run, busy] = useAction();
  const members = useQuery({ queryKey: ['oc-members'], queryFn: () => api.get('/owners-circle/members') }); const events = useQuery({ queryKey: ['oc-events'], queryFn: () => api.get('/owners-circle/events') }); const settings = useQuery({ queryKey: ['settings'], queryFn: () => api.get('/settings') }); const trims = useQuery({ queryKey: ['trims', ''], queryFn: () => api.get('/catalogue/trims') });
  const [f, setF] = useState({ kind: 'event', title_en: '', title_ar: '', description_en: '', description_ar: '', trim_id: '', starts_on: '' }); const set = (k) => (e) => setF({ ...f, [k]: e.target.value }); const [credit, setCredit] = useState('');
  return <div className="space-y-6"><PageTitle>{t('staff.owners')}</PageTitle>
    {sm && <section className="card grid gap-4 md:grid-cols-2">
      <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); const r = await run(() => api.post('/owners-circle/events', { ...f, trim_id: f.trim_id ? Number(f.trim_id) : undefined, starts_on: f.starts_on || undefined }), t('oc.published')); if (r) { setF({ ...f, title_en: '', title_ar: '', description_en: '', description_ar: '' }); qc.invalidateQueries({ queryKey: ['oc-events'] }); } }}>
        <h2 className="font-bold">{t('oc.publish')}</h2>
        <Select value={f.kind} onChange={set('kind')} aria-label={t('acc.kind')}><option value="event">{t('oc.event')}</option><option value="early_access">{t('oc.early_access')}</option></Select>
        <Input required placeholder="Title (EN)" value={f.title_en} onChange={set('title_en')} aria-label="Title EN" /><Input dir="rtl" placeholder="العنوان (AR)" value={f.title_ar} onChange={set('title_ar')} aria-label="Title AR" />
        <Textarea placeholder="Description (EN)" value={f.description_en} onChange={set('description_en')} aria-label="Description EN" /><Textarea dir="rtl" placeholder="الوصف (AR)" value={f.description_ar} onChange={set('description_ar')} aria-label="Description AR" />
        {f.kind === 'early_access' && <Select value={f.trim_id} onChange={set('trim_id')} aria-label={t('acc.car')}><option value="">{t('acc.car')}</option>{trims.data?.map((x) => <option key={x.id} value={x.id}>{x.brand} {x.model} {x.name}</option>)}</Select>}
        <Input type="date" value={f.starts_on} onChange={set('starts_on')} aria-label={t('cat_admin.starts')} /><button className="btn-primary" disabled={busy}>{t('cat_admin.publish')}</button></form>
      <div className="space-y-3"><h2 className="font-bold">{t('settings.referral_credit_usd')}</h2><Loading q={settings}>{(s) => <form className="flex items-end gap-2" onSubmit={async (e) => { e.preventDefault(); if (await run(() => api.put('/owners-circle/referral-credit', { amount: Number(credit || s.referral_credit_usd) }), t('common.saved'))) qc.invalidateQueries({ queryKey: ['settings'] }); }}><Field label="USD"><Input type="number" min="0" value={credit || s.referral_credit_usd} onChange={(e) => setCredit(e.target.value)} /></Field><button className="btn-primary" disabled={busy}>{t('common.save')}</button></form>}</Loading></div></section>}
    <section><h2 className="mb-2 font-bold">{t('oc.events')}</h2><div className="card p-0 sm:p-0"><Loading q={events}>{(rows) => <Table rows={rows} empty={t('staff.none')} cols={[{ label: t('acc.kind'), render: (r) => <Badge tone={r.kind === 'event' ? 'blue' : 'green'}>{t(`oc.${r.kind}`)}</Badge> }, { label: t('cat_admin.title'), render: (r) => r.title_en }, { label: t('acc.date'), render: (r) => (r.starts_on ? dmy(r.starts_on) : '-') }]} />}</Loading></div></section>
    <section><h2 className="mb-2 font-bold">{t('oc.members')}</h2><div className="card p-0 sm:p-0"><Loading q={members}>{(rows) => <Table rows={rows} cols={[{ label: t('oc.card'), render: (r) => r.card_number }, { label: t('form.name'), render: (r) => r.name }, { label: t('oc.tier'), render: (r) => <Badge tone={r.tier === 'Ambassador' ? 'green' : 'slate'}>{r.tier}</Badge> }, { label: t('oc.credit'), render: (r) => usd(r.credit_balance) }, { label: t('oc.credited_refs'), render: (r) => r.credited_referrals }, { label: t('form.referral_code'), render: (r) => r.referral_code }]} />}</Loading></div></section></div>;
}
