import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../api.js';
import CarImage from '../components/CarImage.jsx';
import { useCompare } from '../components/compare.jsx';
import { Loading, Notice } from '../components/ui.jsx';
import { Availability } from './Catalogue.jsx';
import { SpecRows } from './TrimDetail.jsx';
import { usd, lbp } from '../utils.js';

export default function Compare() {
  const { t } = useTranslation(); const cmp = useCompare();
  const q = useQuery({ queryKey: ['compare', cmp.ids.join(',')], enabled: cmp.ids.length > 0, queryFn: () => api.get(`/catalogue/compare?ids=${cmp.ids.join(',')}`) });
  if (!cmp.ids.length) return <div className="space-y-3"><h1 className="text-2xl font-bold">{t('nav.compare')}</h1><Notice>{t('compare.empty')}</Notice><Link className="btn-primary" to="/cars">{t('home.browse')}</Link></div>;
  return <div><div className="mb-4 flex items-center justify-between"><h1 className="text-2xl font-bold">{t('nav.compare')}</h1><button className="btn-secondary btn-sm" onClick={cmp.clear}>{t('common.reset')}</button></div>
    <Loading q={q}>{(list) => { const labels = [...new Set(list.flatMap((x) => SpecRows({ trim: x }).map(([k]) => k)))];
      return <div className="overflow-x-auto"><table className="min-w-full bg-white text-sm ring-1 ring-slate-200">
        <thead><tr><th className="th w-40" />{list.map((x) => <th key={x.id} className="p-3 text-start align-top"><CarImage trim={x} className="mb-2 aspect-[2/1] w-full rounded-lg" /><Link to={`/cars/${x.id}`} className="font-bold hover:text-brand-700">{x.brand} {x.model}</Link><div className="text-xs font-normal text-slate-500">{x.name}</div><button className="mt-1 text-xs text-red-600" onClick={() => cmp.toggle(x.id)}>{t('common.remove')}</button></th>)}</tr></thead>
        <tbody className="divide-y">
          <tr><td className="td font-semibold">{t('compare.price')}</td>{list.map((x) => <td key={x.id} className="td"><b>{usd(x.price_usd)}</b><div className="text-xs text-slate-500">≈ {lbp(x.price_lbp)}</div></td>)}</tr>
          <tr><td className="td font-semibold">{t('catalogue.fuel')}</td>{list.map((x) => <td key={x.id} className="td">{t(`fuel.${x.fuel_type}`)}</td>)}</tr>
          <tr><td className="td font-semibold">{t('compare.availability')}</td>{list.map((x) => <td key={x.id} className="td"><Availability a={x.availability} /></td>)}</tr>
          {labels.map((l) => <tr key={l}><td className="td font-semibold">{l}</td>{list.map((x) => <td key={x.id} className="td">{SpecRows({ trim: x }).find(([k]) => k === l)?.[1] ?? '-'}</td>)}</tr>)}
        </tbody></table></div>; }}</Loading></div>;
}
