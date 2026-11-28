import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useTranslation } from 'react-i18next';
import { api } from '../api.js';
import { Field, Input, Loading, PageTitle, Stat, Table } from '../components/ui.jsx';
import { usd } from '../utils.js';

const C = ['#1d4ed8', '#0f766e', '#b45309', '#7c3aed', '#be123c', '#475569'];
const TICK = { fill: '#475569', fontSize: 12 };
const TIP = { contentStyle: { borderRadius: 8, border: '1px solid #e2e8f0' } };
const Box = ({ title, children }) => <section className="card"><h2 className="mb-3 font-bold">{title}</h2>{children}</section>;
// FR-REP-01..05: sales, funnel, consultant performance, stock, assistant, Owners Circle
export function ReportsPage() {
  const { t } = useTranslation(); const [range, setRange] = useState({ from: '', to: '' });
  const qs = `?${range.from ? `from=${range.from}&` : ''}${range.to ? `to=${range.to}` : ''}`;
  const sales = useQuery({ queryKey: ['rep-sales', qs], queryFn: () => api.get(`/reports/sales${qs}`) }); const funnel = useQuery({ queryKey: ['rep-funnel', qs], queryFn: () => api.get(`/reports/funnel${qs}`) });
  const cons = useQuery({ queryKey: ['rep-cons'], queryFn: () => api.get('/reports/consultants') }); const stock = useQuery({ queryKey: ['rep-stock'], queryFn: () => api.get('/reports/stock') });
  const asst = useQuery({ queryKey: ['rep-asst'], queryFn: () => api.get('/reports/assistant') }); const oc = useQuery({ queryKey: ['rep-oc'], queryFn: () => api.get('/reports/owners-circle') });
  return <div className="space-y-6"><PageTitle>{t('staff.reports')}</PageTitle>
    <div className="flex flex-wrap gap-3"><Field label={t('rep.from')}><Input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} /></Field><Field label={t('rep.to')}><Input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} /></Field></div>
    <Loading q={sales}>{(s) => <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3"><Stat label={t('rep.cars_sold')} value={s.totals.cars_sold} /><Stat label={t('rep.revenue')} value={usd(s.totals.revenue_usd)} /><Stat label={t('rep.delivered')} value={s.delivered} /></div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Box title={t('rep.by_month')}><div className="h-64" dir="ltr"><ResponsiveContainer><BarChart data={s.by_month}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="label" tick={TICK} stroke="#94a3b8" /><YAxis allowDecimals={false} tick={TICK} stroke="#94a3b8" /><Tooltip {...TIP} /><Bar dataKey="cars_sold" name={t('rep.cars_sold')} fill={C[0]} /></BarChart></ResponsiveContainer></div></Box>
        <Box title={t('rep.by_fuel')}><div className="h-64" dir="ltr"><ResponsiveContainer><PieChart><Pie data={s.by_fuel.map((x) => ({ ...x, name: t(`fuel.${x.label}`, x.label) }))} dataKey="cars_sold" nameKey="name" stroke="#fff" label={{ fill: '#334155', fontSize: 12 }}>{s.by_fuel.map((_, i) => <Cell key={i} fill={C[i % C.length]} />)}</Pie><Tooltip {...TIP} /></PieChart></ResponsiveContainer></div></Box></div>
      <Box title={t('rep.by_model')}><Table rows={s.by_model} empty={t('staff.none')} cols={[{ label: t('acc.car'), render: (r) => r.label }, { label: t('rep.cars_sold'), render: (r) => r.cars_sold }, { label: t('rep.revenue'), render: (r) => usd(r.revenue_usd) }]} /></Box></>}</Loading>
    <Loading q={funnel}>{(f) => <Box title={t('rep.funnel')}><div className="h-64" dir="ltr"><ResponsiveContainer><BarChart data={f.stages.map((x) => ({ ...x, name: t(`status.${x.stage}`) }))} layout="vertical"><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis type="number" allowDecimals={false} tick={TICK} stroke="#94a3b8" /><YAxis type="category" dataKey="name" width={110} tick={TICK} stroke="#94a3b8" /><Tooltip {...TIP} /><Bar dataKey="count" fill={C[1]} /></BarChart></ResponsiveContainer></div>
      <p className="mt-2 text-sm text-slate-600">{t('rep.lost')}: <b>{f.lost}</b> · {t('rep.lead_to_delivery')}: <b>{f.lead_to_delivery_percent}%</b> · {t('rep.avg_days')}: <b>{f.avg_days_enquiry_to_contract ?? '-'}</b></p></Box>}</Loading>
    <Loading q={cons}>{(rows) => <Box title={t('rep.consultants')}><Table rows={rows} cols={[{ label: t('form.name'), render: (r) => r.name }, { label: t('rep.leads'), render: (r) => r.leads }, { label: t('rep.test_drives'), render: (r) => r.test_drives }, { label: t('rep.deals'), render: (r) => r.deals }, { label: t('rep.contracts'), render: (r) => r.contracts_signed }, { label: t('rep.conversion'), render: (r) => `${r.conversion_rate_percent}%` }]} /></Box>}</Loading>
    <Loading q={stock}>{(s) => <Box title={t('rep.stock')}><Table rows={s.by_trim} cols={[{ label: t('acc.car'), render: (r) => r.car }, ...['in_transit', 'in_stock', 'reserved', 'sold', 'delivered'].map((k) => ({ label: t(`status.${k}`), render: (r) => r[k] || 0 }))]} />
      <h3 className="mb-1 mt-4 text-sm font-bold">{t('rep.unsold_age')}</h3><Table rows={s.unsold_age} empty={t('staff.none')} cols={[{ label: 'VIN', render: (r) => <span className="font-mono text-xs">{r.vin}</span> }, { label: t('acc.car'), render: (r) => r.car }, { label: t('inv.age'), render: (r) => `${r.age_days ?? '-'} d` }]} /></Box>}</Loading>
    <div className="grid gap-4 lg:grid-cols-2">
      <Loading q={asst}>{(a) => <Box title={t('rep.assistant')}><div className="grid grid-cols-2 gap-3"><Stat label={t('rep.chats')} value={a.total_chats} /><Stat label={t('rep.handed_off')} value={a.handed_off} /><Stat label={t('rep.resolved')} value={a.resolved_without_person} /><Stat label={t('rep.resolved_pct')} value={`${a.resolved_without_person_percent}%`} /></div></Box>}</Loading>
      <Loading q={oc}>{(o) => <Box title={t('rep.owners')}><div className="grid grid-cols-2 gap-3"><Stat label={t('oc.members')} value={o.members} /><Stat label={t('rep.ambassadors')} value={o.ambassadors} /><Stat label={t('rep.referrals')} value={`${o.referrals_credited}/${o.referrals_total}`} /><Stat label={t('rep.referral_sales')} value={`${o.sales_from_referrals_percent}%`} /><Stat label={t('rep.credits_issued')} value={usd(o.credits_issued_usd)} /><Stat label={t('rep.credits_used')} value={usd(o.credits_used_usd)} /></div></Box>}</Loading></div></div>;
}
