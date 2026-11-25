import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../api.js';
import CarImage from '../components/CarImage.jsx';
import { useCompare } from '../components/compare.jsx';
import { Badge, Field, Input, Loading, Price, Select } from '../components/ui.jsx';
import { dmy, monthlyPayment, usd } from '../utils.js';

export function Availability({ a }) {
  const { t } = useTranslation(); if (!a) return null;
  if (a.status === 'in_stock') return <Badge tone="green">{t('avail.in_stock', { count: a.count })}</Badge>;
  if (a.status === 'in_transit') return <Badge tone="amber">{t('avail.in_transit', { date: dmy(a.expected_arrival) })}</Badge>;
  return <Badge>{t('avail.order_only')}</Badge>;
}
export function TrimCard({ trim, monthly, dim }) {
  const { t } = useTranslation(); const cmp = useCompare(); const on = cmp.ids.includes(trim.id);
  return (
    <div className={`card flex flex-col p-0 transition-opacity sm:p-0 ${dim ? 'opacity-70' : ''}`}>
      <Link to={`/cars/${trim.id}`}><CarImage trim={trim} className="aspect-[2/1] w-full rounded-t-xl" /></Link>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div><Link to={`/cars/${trim.id}`} className="font-bold hover:text-brand-700">{trim.brand} {trim.model}</Link><div className="text-sm text-slate-500">{trim.name} · {t(`fuel.${trim.fuel_type}`)}</div></div>
        <div className="flex flex-wrap items-center gap-2"><Price usd={trim.price_usd} lbp={trim.price_lbp} />{trim.promotion && <Badge tone="red">{t('catalogue.offer')}</Badge>}</div>
        {monthly != null && <div className="text-sm font-semibold text-brand-700">{t('catalogue.per_month', { amount: usd(monthly) })}</div>}
        <div className="text-[11px] font-semibold text-emerald-700">✓ {t('catalogue.fixed_note')}</div>
        <Availability a={trim.availability} />
        <label className="mt-auto flex items-center gap-2 pt-2 text-xs"><input type="checkbox" checked={on} disabled={!on && cmp.full} onChange={() => cmp.toggle(trim.id)} />{t('catalogue.compare')}</label>
      </div>
    </div>
  );
}
const KEYS = ['brand', 'body_type', 'fuel_type', 'min_price', 'max_price', 'sort'];
export default function Catalogue() {
  const { t } = useTranslation(); const [sp, setSp] = useSearchParams(); // filters live in the address so Back works and a result can be shared
  const f = Object.fromEntries(KEYS.map((k) => [k, sp.get(k) || '']));
  const filters = useQuery({ queryKey: ['filters'], queryFn: () => api.get('/catalogue/filters') });
  const qs = Object.entries(f).filter(([, v]) => v !== '').map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  const trims = useQuery({ queryKey: ['trims', qs], queryFn: () => api.get(`/catalogue/trims${qs ? `?${qs}` : ''}`) });
  const setVal = (k, v) => { const n = new URLSearchParams(sp); if (v === '' || v == null) n.delete(k); else n.set(k, v); setSp(n, { replace: true }); };
  const set = (k) => (e) => setVal(k, e.target.value);
  const lo = Math.floor((filters.data?.min_price || 0) / 1000) * 1000; const hi = Math.ceil((filters.data?.max_price || 100000) / 1000) * 1000;
  const cfg = useQuery({ queryKey: ['finder-config'], queryFn: () => api.get('/catalogue/finder-config') });
  const monthlyOf = (x) => (cfg.data ? monthlyPayment(x.price_usd, cfg.data.down_percent, cfg.data.term_months, cfg.data.rate_percent) : null);
  const budget = cfg.data ? Number(sp.get('monthly')) || 0 : 0; const MAXM = 2500;
  const active = KEYS.filter((k) => k !== 'sort' && f[k]);
  return (
    <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
      <aside className="card h-fit space-y-3" aria-label={t('catalogue.filters')}>
        <h2 className="font-bold">{t('catalogue.filters')}</h2>
        <Field label={t('catalogue.brand')}><Select value={f.brand} onChange={set('brand')}><option value="">{t('common.all')}</option>{filters.data?.brands.map((b) => <option key={b}>{b}</option>)}</Select></Field>
        <Field label={t('catalogue.body')}><Select value={f.body_type} onChange={set('body_type')}><option value="">{t('common.all')}</option>{filters.data?.body_types.map((b) => <option key={b} value={b}>{t(`body.${b}`)}</option>)}</Select></Field>
        <Field label={t('catalogue.fuel')}><Select value={f.fuel_type} onChange={set('fuel_type')}><option value="">{t('common.all')}</option>{filters.data?.fuel_types.map((b) => <option key={b} value={b}>{t(`fuel.${b}`)}</option>)}</Select></Field>
        <Field label={`${t('catalogue.budget')}: ${f.max_price ? usd(f.max_price) : t('catalogue.any')}`}><input type="range" className="w-full accent-brand-600" min={lo} max={hi} step="1000" value={f.max_price || hi} onChange={(e) => setVal('max_price', Number(e.target.value) >= hi ? '' : e.target.value)} aria-label={t('catalogue.budget')} /></Field>
        <div className="grid grid-cols-2 gap-2"><Field label={t('catalogue.min_price')}><Input type="number" min="0" value={f.min_price} onChange={set('min_price')} /></Field><Field label={t('catalogue.max_price')}><Input type="number" min="0" value={f.max_price} onChange={set('max_price')} /></Field></div>
        <button className="btn-secondary btn-sm w-full" onClick={() => setSp({}, { replace: true })}>{t('common.reset')}</button>
      </aside>
      <section>
        <div className="card mb-4 border-brand-200 bg-gradient-to-r from-brand-50 to-white">
          <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="font-bold">{t('catalogue.finder_title')}</h2><span className="text-2xl font-extrabold text-brand-700">{budget ? `${usd(budget)}/mo` : t('catalogue.finder_any')}</span></div>
          <input type="range" className="mt-2 w-full accent-brand-600" min="100" max={MAXM} step="50" value={budget || MAXM} onChange={(e) => setVal('monthly', Number(e.target.value) >= MAXM ? '' : e.target.value)} aria-label={t('catalogue.finder_title')} />
          <div className="mt-1 flex flex-wrap justify-between gap-2 text-xs text-slate-600"><span>{cfg.data && t('catalogue.finder_terms', { term: cfg.data.term_months, down: cfg.data.down_percent, rate: cfg.data.rate_percent })}</span>
            {budget > 0 && trims.data && <span className="font-semibold text-emerald-700">{t('catalogue.fits', { count: trims.data.filter((x) => monthlyOf(x) <= budget).length })} · <button type="button" className="underline" onClick={() => setVal('monthly', '')}>{t('catalogue.finder_clear')}</button></span>}
            {!budget && <span>{t('catalogue.finder_hint')}</span>}</div>
        </div>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-bold">{t('nav.cars')}{trims.data && <span className="ms-2 text-base font-normal text-slate-500">({t('catalogue.count', { count: trims.data.length })})</span>}</h1>
          <label className="flex items-center gap-2 whitespace-nowrap text-sm">{t('catalogue.sort')}<Select value={f.sort} onChange={set('sort')}><option value="">{t('catalogue.sort_default')}</option><option value="price_asc">{t('catalogue.sort_low')}</option><option value="price_desc">{t('catalogue.sort_high')}</option></Select></label></div>
        {active.length > 0 && <div className="mb-3 flex flex-wrap gap-2">{active.map((k) => <button key={k} className="chip" onClick={() => setVal(k, '')}>{k === 'fuel_type' ? t(`fuel.${f[k]}`) : k === 'body_type' ? t(`body.${f[k]}`) : k.includes('price') ? usd(f[k]) : f[k]} ✕</button>)}</div>}
        <Loading q={trims}>{(list) => { const m = (x) => monthlyOf(x); const fit = budget ? list.filter((x) => m(x) <= budget).sort((a, b) => m(b) - m(a)) : list; const over = budget ? list.filter((x) => m(x) > budget).sort((a, b) => m(a) - m(b)) : [];
          return list.length ? <><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{fit.map((x) => <TrimCard key={x.id} trim={x} monthly={m(x)} />)}</div>
            {over.length > 0 && <><h3 className="mb-3 mt-6 text-sm font-bold text-slate-600">{t('catalogue.over_budget')}</h3><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{over.map((x) => <TrimCard key={x.id} trim={x} monthly={m(x)} dim />)}</div></>}</> : <p className="card text-center text-slate-500">{t('catalogue.no_results')}</p>; }}</Loading></section>
    </div>
  );
}
