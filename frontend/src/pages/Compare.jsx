import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../api.js';
import CarImage from '../components/CarImage.jsx';
import { useCompare } from '../components/compare.jsx';
import { Loading, Notice } from '../components/ui.jsx';
import { Availability } from './Catalogue.jsx';
import { SpecRows } from './TrimDetail.jsx';
import { usd, lbp, monthlyPayment } from '../utils.js';

export default function Compare() {
  const { t } = useTranslation(); const cmp = useCompare();
  const q = useQuery({ queryKey: ['compare', cmp.ids.join(',')], enabled: cmp.ids.length > 0, queryFn: () => api.get(`/catalogue/compare?ids=${cmp.ids.join(',')}`) });
  const cfg = useQuery({ queryKey: ['finder-config'], queryFn: () => api.get('/catalogue/finder-config') });
  if (!cmp.ids.length) return <div className="space-y-5"><h1 className="page-title">{t('nav.compare')}</h1>
    <div className="card text-center"><div className="mx-auto grid max-w-3xl gap-3 sm:grid-cols-3" aria-hidden="true">{[0, 1, 2].map((i) => <div key={i} className="grid aspect-[16/10] place-items-center rounded-xl border-2 border-dashed border-slate-300 text-sm font-semibold text-slate-500">+ {t('compare.slot')}</div>)}</div>
      <p className="mx-auto mt-5 max-w-lg text-sm text-slate-600">{t('compare.hint')}</p><Link className="btn-primary mt-4" to="/cars">{t('home.browse')}</Link></div></div>;
  const mo = (x) => (cfg.data ? monthlyPayment(x.price_usd, cfg.data.down_percent, cfg.data.term_months, cfg.data.rate_percent) : null);
  return <div><div className="mb-4 flex items-center justify-between"><h1 className="page-title">{t('nav.compare')}</h1><button className="btn-secondary btn-sm" onClick={cmp.clear}>{t('common.reset')}</button></div>
    <Loading q={q}>{(list) => { const labels = [...new Set(list.flatMap((x) => SpecRows({ trim: x }).map(([k]) => k)))];
      const Row = ({ label, children }) => <tr className="odd:bg-slate-50/60"><th scope="row" className="td sticky start-0 z-[1] w-40 bg-inherit text-start font-semibold text-slate-600">{label}</th>{list.map((x) => <td key={x.id} className="td">{children(x)}</td>)}</tr>;
      return <div className="tbl-wrap overflow-x-auto"><table className="min-w-full text-sm">
        <thead><tr><th className="th w-40" />{list.map((x) => <th key={x.id} className="min-w-[14rem] p-3 text-start align-top"><div className="overflow-hidden rounded-lg"><CarImage trim={x} className="aspect-[16/10] w-full" /></div><Link to={`/cars/${x.id}`} className="mt-2 block font-bold hover:text-brand-700">{x.brand} {x.model}</Link><div className="text-xs font-normal text-slate-500">{x.name}</div><button type="button" className="mt-1 text-xs font-semibold text-red-600 hover:underline" onClick={() => cmp.toggle(x.id)}>{t('compare.remove')}</button></th>)}</tr></thead>
        <tbody className="divide-y divide-slate-100">
          <Row label={t('compare.price')}>{(x) => <><b className="text-base">{usd(x.price_usd)}</b><div className="text-xs text-slate-500">≈ {lbp(x.price_lbp)}</div></>}</Row>
          <Row label={t('compare.monthly')}>{(x) => (mo(x) != null ? <span className="font-semibold text-brand-700">≈ {usd(mo(x))}/mo</span> : '-')}</Row>
          <Row label={t('catalogue.fuel')}>{(x) => t(`fuel.${x.fuel_type}`)}</Row>
          <Row label={t('catalogue.body')}>{(x) => t(`body.${x.body_type}`, x.body_type)}</Row>
          <Row label={t('compare.availability')}>{(x) => <Availability a={x.availability} />}</Row>
          {labels.map((l) => <Row key={l} label={l}>{(x) => SpecRows({ trim: x }).find(([k]) => k === l)?.[1] ?? '-'}</Row>)}
        </tbody></table></div>; }}</Loading></div>;
}
