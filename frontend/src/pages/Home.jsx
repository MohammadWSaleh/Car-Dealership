import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../api.js';
import { Loading } from '../components/ui.jsx';
import { Reveal, Streaks } from '../components/Reveal.jsx';
import { TrimCard } from './Catalogue.jsx';
import { dmy, usd } from '../utils.js';

function Finder() {
  const { t } = useTranslation(); const nav = useNavigate(); const [budget, setBudget] = useState(''); const [fuel, setFuel] = useState(''); const [body, setBody] = useState('');
  const go = (e) => { e.preventDefault(); const p = new URLSearchParams(); if (budget) p.set('max_price', budget); if (fuel) p.set('fuel_type', fuel); if (body) p.set('body_type', body); nav(`/cars${p.toString() ? `?${p}` : ''}`); };
  const quick = [['budget', { max_price: 25000 }], ['mid', { max_price: 40000 }], ['ev', { fuel_type: 'electric' }], ['hybrid', { fuel_type: 'hybrid' }], ['family', { body_type: 'suv' }]];
  return <section className="card space-y-4" aria-labelledby="finder-title"><div><h2 id="finder-title" className="text-xl font-bold">{t('home.find_title')}</h2><p className="text-sm text-slate-600">{t('home.find_lead')}</p></div>
    <form onSubmit={go} className="grid gap-3 sm:grid-cols-4"><label className="text-sm font-semibold">{t('home.find_budget')}<select className="input mt-1" value={budget} onChange={(e) => setBudget(e.target.value)}><option value="">{t('catalogue.any')}</option>{[25000, 35000, 45000, 60000].map((v) => <option key={v} value={v}>{t('home.up_to', { price: usd(v) })}</option>)}</select></label>
      <label className="text-sm font-semibold">{t('catalogue.fuel')}<select className="input mt-1" value={fuel} onChange={(e) => setFuel(e.target.value)}><option value="">{t('common.all')}</option>{['petrol', 'hybrid', 'plug_in_hybrid', 'electric'].map((v) => <option key={v} value={v}>{t(`fuel.${v}`)}</option>)}</select></label>
      <label className="text-sm font-semibold">{t('catalogue.body')}<select className="input mt-1" value={body} onChange={(e) => setBody(e.target.value)}><option value="">{t('common.all')}</option>{['sedan', 'suv', 'hatchback', 'pickup', 'coupe'].map((v) => <option key={v} value={v}>{t(`body.${v}`, v)}</option>)}</select></label>
      <div className="flex items-end"><button className="btn-primary w-full">{t('home.find_go')}</button></div></form>
    <div className="flex flex-wrap gap-2">{quick.map(([k, q]) => <Link key={k} className="chip" to={`/cars?${new URLSearchParams(q)}`}>{t(`home.quick_${k}`)}</Link>)}</div></section>;
}
export default function Home() {
  const { t } = useTranslation();
  const promos = useQuery({ queryKey: ['promos'], queryFn: () => api.get('/catalogue/promotions') });
  const trims = useQuery({ queryKey: ['trims', ''], queryFn: () => api.get('/catalogue/trims') });
  const go = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  return (
    <div>
      <section className="relative flex min-h-[100svh] items-center overflow-hidden bg-black"><Streaks /><div className="hero-floor" aria-hidden="true" /><img src="/hero-car.webp" alt="" aria-hidden="true" className="hero-car" width="1270" height="585" fetchpriority="high" />
        <div className="relative z-10 mx-auto w-full max-w-7xl px-4 pt-20">
          <h1 className="hero-in display mt-4 max-w-3xl text-5xl text-white sm:text-7xl" style={{ animationDelay: '250ms' }}>{t('brand.slogan')}</h1>
          <p className="hero-in mt-6 max-w-xl text-lg text-slate-300" style={{ animationDelay: '450ms' }}>{t('home.lead')}</p>
          <div className="hero-in mt-10 flex flex-wrap gap-4" style={{ animationDelay: '650ms' }}><Link to="/cars" className="btn-outline px-8 py-3 text-sm uppercase tracking-widest">{t('home.discover')}</Link><button type="button" className="btn-ghost px-4 py-3 text-sm" onClick={() => go('finder')}>{t('home.find_short')} ↓</button></div>
        </div>
        <button type="button" onClick={() => go('finder')} aria-label={t('home.scroll')} className="scroll-cue absolute bottom-6 start-1/2 z-10 -translate-x-1/2"><span /></button>
      </section>
      <div className="mx-auto max-w-7xl space-y-20 px-4 py-16">
        <Reveal><div id="finder" className="scroll-mt-24"><Finder /></div></Reveal>
        <section className="grid gap-5 sm:grid-cols-3">
          {['fixed', 'stock', 'owners'].map((k, i) => <Reveal key={k} from={i === 0 ? 'left' : i === 2 ? 'right' : 'up'} delay={i * 100}><div className="card card-hover h-full"><div className="mb-3 h-1 w-10 rounded bg-brand-500" /><h3 className="font-bold">{t(`home.pt_${k}_title`)}</h3><p className="mt-1 text-sm text-slate-600">{t(`home.pt_${k}_text`)}</p></div></Reveal>)}
        </section>
      <Loading q={promos}>{(list) => list.length > 0 && <Reveal><section><h2 className="display mb-5 text-3xl">{t('home.offers')}</h2><div className="grid gap-4 md:grid-cols-2">{list.map((p) => <Link key={p.id} to={`/cars/${p.trim_id}`} className="card card-hover block"><div className="text-sm font-bold text-brand-700">{p.title}</div><p className="text-sm text-slate-600">{p.description}</p><p className="mt-1 text-xs text-slate-500">{t('home.until')} {dmy(p.ends_on)}</p></Link>)}</div></section></Reveal>}</Loading>
        <Reveal><section><div className="mb-5 flex items-end justify-between"><h2 className="display text-3xl">{t('home.popular')}</h2><Link className="link-arrow text-sm font-semibold" to="/cars">{t('home.see_all')} <span aria-hidden="true">→</span></Link></div>
          <Loading q={trims}>{(list) => <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{list.slice(0, 6).map((x, i) => <Reveal key={x.id} delay={(i % 3) * 90}><TrimCard trim={x} /></Reveal>)}</div>}</Loading></section></Reveal>
        <Reveal><section className="cta-band"><h2 className="display text-3xl text-white sm:text-4xl">{t('home.cta_title')}</h2><p className="mt-2 max-w-xl text-slate-200">{t('home.cta_text')}</p><Link to="/cars" className="btn-outline mt-6 px-8 py-3 uppercase tracking-widest">{t('home.discover')}</Link></section></Reveal>
      </div>
    </div>
  );
}
