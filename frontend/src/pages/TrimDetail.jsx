import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../api.js';
import Gallery from '../components/Gallery.jsx';
import BookTestDrive from '../components/BookTestDrive.jsx';
import EnquiryForm from '../components/EnquiryForm.jsx';
import { useCompare } from '../components/compare.jsx';
import { Badge, ErrorBox, Field, Input, Loading, Notice, Price, Select, Spinner } from '../components/ui.jsx';
import { Availability } from './Catalogue.jsx';
import { lbp, num, usd, usd2 } from '../utils.js';

function Installment({ trim }) {
  const { t } = useTranslation(); const [down, setDown] = useState(Math.round(trim.price_usd * 0.2)); const [term, setTerm] = useState(48);
  const q = useQuery({ queryKey: ['inst', trim.id, down, term], queryFn: () => api.get(`/catalogue/installment?trim_id=${trim.id}&down_payment=${down || 0}&term_months=${term}`), retry: false });
  return (<div className="space-y-3"><div className="grid gap-3 sm:grid-cols-2">
    <Field label={t('inst.down')}><Input type="number" min="0" value={down} onChange={(e) => setDown(e.target.value)} /></Field>
    <Field label={t('inst.term')}><Select value={term} onChange={(e) => setTerm(Number(e.target.value))}>{[12, 24, 36, 48, 60, 72, 84].map((m) => <option key={m} value={m}>{m}</option>)}</Select></Field></div>
    {q.isLoading ? <Spinner /> : q.error ? <ErrorBox error={q.error} /> : <div className="rounded-lg bg-brand-50 p-4"><div className="text-xs text-slate-600">{t('inst.monthly')}</div><div className="text-2xl font-extrabold text-brand-700">{usd2(q.data.monthly_usd)}</div>
      <div className="mt-1 text-xs text-slate-600">{t('inst.rate', { rate: q.data.yearly_rate_percent })} · {t('inst.total')}: {usd(q.data.total_payable_usd)}</div></div>}
    <p className="text-xs text-slate-500">{t('inst.note')}</p></div>);
}
function RunningCost({ trim }) {
  const { t } = useTranslation(); const [km, setKm] = useState(15000); const [pid, setPid] = useState('');
  const all = useQuery({ queryKey: ['trims', 'petrol'], queryFn: () => api.get('/catalogue/trims?fuel_type=petrol') });
  const petrol = pid || all.data?.[0]?.id;
  const q = useQuery({ queryKey: ['run', trim.id, petrol, km], enabled: !!petrol, queryFn: () => api.get(`/catalogue/running-cost?trim_id=${trim.id}&petrol_trim_id=${petrol}&km_per_year=${km || 0}`), retry: false });
  return (<div className="space-y-3"><div className="grid gap-3 sm:grid-cols-2">
    <Field label={t('run.km')}><Input type="number" min="1" value={km} onChange={(e) => setKm(e.target.value)} /></Field>
    <Field label={t('run.petrol')}><Select value={petrol || ''} onChange={(e) => setPid(e.target.value)}>{all.data?.map((x) => <option key={x.id} value={x.id}>{x.brand} {x.model} {x.name}</option>)}</Select></Field></div>
    {q.error ? <ErrorBox error={q.error} /> : q.data && <div className="grid gap-2 sm:grid-cols-3">
      <div className="rounded-lg bg-slate-100 p-3"><div className="text-xs">{t('run.alt')}</div><div className="font-bold">{usd(q.data.alternative.yearly_cost_usd)}</div></div>
      <div className="rounded-lg bg-slate-100 p-3"><div className="text-xs">{t('run.pet')}</div><div className="font-bold">{usd(q.data.petrol.yearly_cost_usd)}</div></div>
      <div className="rounded-lg bg-emerald-50 p-3"><div className="text-xs">{t('run.saving')}</div><div className="font-bold text-emerald-700">{usd(q.data.yearly_saving_usd)}</div></div></div>}
    {trim.fuel_type === 'plug_in_hybrid' && <p className="text-xs text-slate-500">{t('run.phev_note')}</p>}</div>);
}
const SPEC_KEYS = ['engine', 'power_hp', 'transmission', 'drivetrain', 'seats', 'trunk_l', 'warranty_years'];
export function SpecRows({ trim }) {
  const { t } = useTranslation();
  const rows = [...SPEC_KEYS.filter((k) => trim.specs?.[k] != null).map((k) => [t(`spec.${k}`), String(trim.specs[k])]),
    ...(trim.range_km ? [[t('spec.range_km'), `${num(trim.range_km)} km`]] : []), ...(trim.battery_kwh ? [[t('spec.battery_kwh'), `${trim.battery_kwh} kWh`]] : []),
    ...(trim.l_per_100km ? [[t('spec.l_per_100km'), `${trim.l_per_100km} L`]] : []), ...(trim.kwh_per_100km ? [[t('spec.kwh_per_100km'), `${trim.kwh_per_100km} kWh`]] : [])];
  return rows;
}
export default function TrimDetail() {
  const { id } = useParams(); const { t } = useTranslation(); const cmp = useCompare();
  const q = useQuery({ queryKey: ['trim', id], queryFn: () => api.get(`/catalogue/trims/${id}`) });
  return <Loading q={q}>{(x) => (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <Gallery key={x.id} trim={x} />
        <div className="space-y-3">
          <div><h1 className="text-3xl font-extrabold">{x.brand} {x.model}</h1><p className="text-slate-600">{x.name} · {t(`fuel.${x.fuel_type}`)} · {t(`body.${x.body_type}`)}</p></div>
          <p>{x.description}</p>
          <div className="card space-y-2"><Price usd={x.price_usd} lbp={x.price_lbp} big />
            {x.promotion && <div><Badge tone="red">{t('catalogue.offer')}</Badge> <span className="ms-1 text-sm text-slate-500 line-through">{usd(x.list_price_usd)}</span></div>}
            <p className="text-xs font-semibold text-emerald-700">{t('detail.fixed')}</p>
            <div className="grid gap-2 text-xs sm:grid-cols-2"><div><b>{t('detail.includes')}</b><ul className="list-disc ps-4">{x.price_includes.map((i) => <li key={i}>{i}</li>)}</ul></div><div><b>{t('detail.excludes')}</b><ul className="list-disc ps-4">{x.price_excludes.map((i) => <li key={i}>{i}</li>)}</ul></div></div>
            <div><Availability a={x.availability} /></div></div>
          <button className={cmp.ids.includes(x.id) ? 'btn-secondary' : 'btn-primary'} onClick={() => cmp.toggle(x.id)} disabled={!cmp.ids.includes(x.id) && cmp.full}>{cmp.ids.includes(x.id) ? t('detail.remove_compare') : t('detail.add_compare')}</button>
        </div></div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card"><h2 className="mb-3 font-bold">{t('detail.specs')}</h2><dl className="divide-y text-sm">{SpecRows({ trim: x }).map(([k, v]) => <div key={k} className="flex justify-between py-2"><dt className="text-slate-500">{k}</dt><dd className="font-semibold">{v}</dd></div>)}</dl></div>
        <div className="card"><h2 className="mb-3 font-bold">{t('detail.installment')}</h2><Installment trim={x} /></div>
        {x.fuel_type !== 'petrol' && <div className="card"><h2 className="mb-3 font-bold">{t('detail.running')}</h2><RunningCost trim={x} /></div>}
        <div className="card"><h2 className="mb-3 font-bold">{t('detail.test_drive')}</h2><BookTestDrive trim={x} /></div>
        <div className="card lg:col-span-2"><h2 className="mb-3 font-bold">{t('detail.enquiry')}</h2><EnquiryForm trimId={x.id} /></div>
      </div></div>)}</Loading>;
}
