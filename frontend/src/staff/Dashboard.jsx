import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Loading, Notice, PageTitle, Stat, StatusBadge, Table, Badge } from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';
import { dmy } from '../utils.js';

export function Dashboard() {
  const { t } = useTranslation(); const { user } = useAuth(); const r = user.role;
  const dealRole = ['sales_consultant', 'sales_manager'].includes(r);
  return <div className="space-y-6"><PageTitle>{t('staff.welcome', { name: user.name })}</PageTitle>
    {dealRole && <DealsDash />}
    {['sales_manager', 'general_manager'].includes(r) && <Alerts />}
    {r === 'general_manager' && <Notice>{t('staff.dash_gm')} <Link className="font-semibold underline" to="/staff/reports">{t('staff.reports')}</Link></Notice>}
    {r === 'accountant' && <Notice>{t('staff.dash_accountant')} <Link className="font-semibold underline" to="/staff/payments">{t('staff.payments')}</Link></Notice>}
    {r === 'delivery_coordinator' && <Notice>{t('staff.dash_delivery')} <Link className="font-semibold underline" to="/staff/delivery">{t('staff.delivery')}</Link></Notice>}
    {r === 'administrator' && <AdminDash />}
    <QuickLinks role={r} />
  </div>;
}
function DealsDash() {
  const { t } = useTranslation(); const q = useQuery({ queryKey: ['dash'], queryFn: () => api.get('/dashboard/consultant') });
  return <Loading q={q}>{(d) => <>
    <Attention items={d.attention || []} />
    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">{['lead', 'quoted', 'reserved', 'contract_signed', 'paid'].map((s) => <Stat key={s} label={t(`status.${s}`)} value={d.stage_counts[s] || 0} tone={{ lead: 'slate', quoted: 'blue', reserved: 'amber', contract_signed: 'violet', paid: 'green' }[s]} />)}</div>
    <section className="card"><h2 className="mb-2 font-bold">{t('staff.appointments_today')} ({dmy(d.date)})</h2>
      <Table rows={d.appointments_today} empty={t('staff.none_today')} cols={[{ label: t('td.time'), render: (r) => r.slot_start.slice(11, 16) }, { label: t('form.name'), render: (r) => r.name }, { label: t('form.phone'), render: (r) => r.phone }, { label: t('acc.car'), render: (r) => r.car }, { label: t('td.license'), render: (r) => (r.license_verified ? '✓' : '—') }]} /></section>
    <section className="card"><h2 className="mb-2 font-bold">{t('staff.my_leads')}</h2>
      <Table rows={d.leads} empty={t('staff.none')} onRow={(r) => (window.location.href = `/staff/deals/${r.id}`)} cols={[{ label: '#', render: (r) => r.id }, { label: t('form.name'), render: (r) => r.contact_name }, { label: t('acc.car'), render: (r) => r.car_label }, { label: t('acc.stage'), render: (r) => <StatusBadge value={r.stage} /> }, { label: t('acc.date'), render: (r) => dmy(r.updated_at) }]} /></section></>}</Loading>;
}
// UX: the first thing a consultant or manager sees is what is waiting for them, most urgent first
export function Attention({ items }) {
  const { t } = useTranslation();
  const text = (a) => (a.type === 'exceptions_pending' ? t('attn.exceptions_pending', { count: a.count }) : a.type === 'quote_expiring' ? (a.days < 0 ? t('attn.quote_expired', { name: a.name, days: -a.days }) : t('attn.quote_expiring', { name: a.name, count: a.days })) : t(`attn.${a.type}`, { name: a.name, car: a.car, days: a.days, time: a.time }));
  const link = (a) => (a.type === 'exceptions_pending' ? '/staff/exceptions' : a.deal_id ? `/staff/deals/${a.deal_id}` : '/staff/testdrives');
  const urgent = (a) => ['quote_expiring', 'license_missing'].includes(a.type);
  return <section className="card" aria-labelledby="attn-title" data-testid="attention"><h2 id="attn-title" className="mb-2 font-bold">{t('attn.title')}</h2>
    {items.length === 0 ? <p className="text-sm text-emerald-700">✓ {t('attn.none')}</p> : <ul className="divide-y">{items.slice(0, 8).map((a, i) => <li key={i}><Link to={link(a)} className="flex items-center justify-between gap-3 py-2 text-sm hover:bg-slate-50"><span className="flex items-center gap-2"><span className={`h-2 w-2 shrink-0 rounded-full ${urgent(a) ? 'bg-red-500' : 'bg-amber-400'}`} aria-hidden="true" /><span>{text(a)}</span></span><span className="shrink-0 text-xs font-semibold text-brand-700">{t('attn.open')} →</span></Link></li>)}</ul>}
    {items.length > 8 && <p className="mt-2 text-xs text-slate-500">{t('attn.more', { count: items.length - 8 })}</p>}</section>;
}
function Alerts() {
  const { t } = useTranslation(); const q = useQuery({ queryKey: ['alerts'], queryFn: () => api.get('/inventory/alerts') });
  return <Loading q={q}>{(a) => (a.low_stock.length || a.unsold_too_long.length) ? <section className="card space-y-2"><h2 className="font-bold">{t('staff.stock_alerts')}</h2>
    {a.low_stock.map((x) => <Notice key={x.trim_id} tone="warn">{t('staff.low_stock', { car: x.car, count: x.in_stock, threshold: x.threshold })}</Notice>)}
    {a.unsold_too_long.map((x) => <Notice key={x.car_id || x.vin} tone="warn">{t('staff.unsold', { car: x.car, vin: x.vin, days: x.days_unsold })}</Notice>)}</section> : null}</Loading>;
}

const QUICK = { administrator: [['users', 'users'], ['settings', 'settings'], ['audit', 'audit'], ['data-requests', 'data_requests'], ['outbox', 'outbox'], ['backups', 'backups']], general_manager: [['reports', 'reports'], ['deals', 'deals'], ['inventory', 'inventory'], ['owners-circle', 'owners']], accountant: [['payments', 'payments'], ['invoices', 'invoices']], delivery_coordinator: [['delivery', 'delivery']], sales_manager: [['deals', 'deals'], ['testdrives', 'testdrives'], ['inventory', 'inventory'], ['reports', 'reports']], sales_consultant: [['deals', 'deals'], ['testdrives', 'testdrives'], ['tradeins', 'tradeins']] };
function QuickLinks({ role }) {
  const { t } = useTranslation(); const items = QUICK[role] || [];
  if (!items.length) return null;
  return <section aria-label={t('admin.dash_quick')}><h2 className="mb-2 text-sm font-bold text-slate-700">{t('admin.dash_quick')}</h2>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">{items.map(([to, key]) => <Link key={to} to={`/staff/${to}`} className="card card-hover flex items-center gap-3 !p-3 text-sm font-semibold hover:ring-brand-500"><span className="grid h-8 w-8 place-items-center rounded-lg bg-slate-100 text-slate-600"><Icon name={key} /></span>{t(`staff.${key}`)}</Link>)}</div></section>;
}
// Operational overview for the administrator: counts, latest backup, recent activity
function AdminDash() {
  const { t } = useTranslation();
  const users = useQuery({ queryKey: ['users', '', ''], queryFn: () => api.get('/admin/users?') });
  const reqs = useQuery({ queryKey: ['data-requests'], queryFn: () => api.get('/admin/data-requests') });
  const outbox = useQuery({ queryKey: ['outbox', ''], queryFn: () => api.get('/admin/outbox') });
  const backups = useQuery({ queryKey: ['backups'], queryFn: () => api.get('/admin/backups') });
  const audit = useQuery({ queryKey: ['audit', 'dash'], queryFn: () => api.get('/admin/audit?limit=8') });
  const open = (reqs.data || []).filter((x) => x.status === 'open').length; const last = backups.data?.[0];
  return <div className="space-y-6">
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Stat label={t('admin.dash_users')} value={users.data ? users.data.filter((u) => u.active).length : '–'} tone="blue" />
      <Stat label={t('admin.dash_requests')} value={reqs.data ? open : '–'} tone={open ? 'amber' : 'green'} />
      <Stat label={t('admin.dash_messages')} value={outbox.data ? outbox.data.length : '–'} tone="violet" />
      <Stat label={t('admin.dash_backup')} value={last ? dmy(last.created_at) : t('admin.dash_none_backup')} tone="green" />
    </div>
    <section className="card !p-0"><div className="flex items-center justify-between p-4 pb-2"><h2 className="font-bold">{t('admin.dash_recent')}</h2><Link className="text-sm font-semibold text-brand-700 hover:underline" to="/staff/audit">{t('admin.view_all')} →</Link></div>
      <Loading q={audit}>{(rows) => <Table rows={rows} empty={t('staff.none')} cols={[{ label: t('acc.date'), render: (r) => dmy(r.at, true) }, { label: t('admin.user'), render: (r) => r.user_name || '-' }, { label: t('admin.action'), render: (r) => <span className="font-mono text-xs">{r.action}</span> }, { label: t('admin.entity'), render: (r) => `${r.entity} ${r.entity_id ?? ''}` }]} />}</Loading></section>
  </div>;
}
