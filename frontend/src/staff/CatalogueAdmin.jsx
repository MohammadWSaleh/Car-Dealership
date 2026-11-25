import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../api.js';
import { Badge, Field, Input, Loading, Modal, PageTitle, Select, Table, Textarea, useAction } from '../components/ui.jsx';
import { dmy, usd } from '../utils.js';
import { FileInput } from '../components/ui.jsx';

const FUELS = ['petrol', 'hybrid', 'plug_in_hybrid', 'electric'];
export function CatalogueAdmin() {
  const { t } = useTranslation(); const [tab, setTab] = useState('trims');
  return <div><PageTitle>{t('staff.catalogue')}</PageTitle>
    <div className="mb-4 flex flex-wrap gap-2" role="tablist">{['trims', 'accessories', 'promotions', 'commercial'].map((k) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'} onClick={() => setTab(k)}>{t(`cat_admin.${k}`)}</button>)}</div>
    {tab === 'trims' && <Trims />}{tab === 'accessories' && <Accessories />}{tab === 'promotions' && <Promotions />}{tab === 'commercial' && <Commercial />}</div>;
}
function Trims() {
  const { t } = useTranslation(); const qc = useQueryClient(); const [run, busy] = useAction(); const q = useQuery({ queryKey: ['trims', ''], queryFn: () => api.get('/catalogue/trims') });
  const [price, setPrice] = useState(null); const [hist, setHist] = useState(null); const [photos, setPhotos] = useState(null); const [adding, setAdding] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ['trims'] });
  return <div><div className="mb-3"><button className="btn-primary btn-sm" onClick={() => setAdding(true)}>{t('cat_admin.add_trim')}</button></div>
    <div className="card p-0 sm:p-0"><Loading q={q}>{(rows) => <Table rows={rows} cols={[{ label: t('acc.car'), render: (r) => `${r.brand} ${r.model} ${r.name}` }, { label: t('catalogue.fuel'), render: (r) => t(`fuel.${r.fuel_type}`) }, { label: t('cat_admin.price'), render: (r) => <b>{usd(r.price_usd)}</b> },
      { label: '', render: (r) => <div className="flex gap-1"><button className="btn-secondary btn-sm" onClick={() => setPhotos(r)}>{t('cat_admin.photos')}</button><button className="btn-secondary btn-sm" onClick={() => setPrice({ ...r, new_price: r.price_usd })}>{t('cat_admin.change_price')}</button><button className="btn-secondary btn-sm" onClick={async () => setHist({ trim: r, rows: await api.get(`/catalogue/trims/${r.id}/price-history`) })}>{t('cat_admin.history')}</button></div> }]} />}</Loading></div>
    {price && <Modal title={`${price.brand} ${price.model} ${price.name}`} onClose={() => setPrice(null)}><form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); if (await run(() => api.put(`/catalogue/trims/${price.id}/price`, { price_usd: Number(price.new_price) }), t('common.saved'))) { setPrice(null); refresh(); } }}><Field label={t('cat_admin.price')} hint={t('cat_admin.price_hint')}><Input type="number" min="1" required value={price.new_price} onChange={(e) => setPrice({ ...price, new_price: e.target.value })} /></Field><button className="btn-primary" disabled={busy}>{t('common.save')}</button></form></Modal>}
    {hist && <Modal title={t('cat_admin.history')} onClose={() => setHist(null)}><Table rows={hist.rows} cols={[{ label: t('acc.date'), render: (r) => dmy(r.changed_at, true) }, { label: t('cat_admin.old'), render: (r) => (r.old_price == null ? '-' : usd(r.old_price)) }, { label: t('cat_admin.new'), render: (r) => usd(r.new_price) }, { label: t('cat_admin.by'), render: (r) => r.changed_by_name || '-' }]} /></Modal>}
    {photos && <Photos trim={photos} onClose={() => { setPhotos(null); refresh(); }} />}
    {adding && <AddTrim onClose={() => setAdding(false)} onDone={() => { setAdding(false); refresh(); }} />}</div>;
}
function Photos({ trim, onClose }) {
  const { t } = useTranslation(); const qc = useQueryClient(); const [run, busy] = useAction(); const [file, setFile] = useState(null); const [color, setColor] = useState('');
  const q = useQuery({ queryKey: ['trim', String(trim.id)], queryFn: () => api.get(`/catalogue/trims/${trim.id}`) });
  const refresh = () => { qc.invalidateQueries({ queryKey: ['trim'] }); qc.invalidateQueries({ queryKey: ['trims'] }); };
  return <Modal title={`${trim.brand} ${trim.model} ${trim.name} - ${t('cat_admin.photos')}`} onClose={onClose} wide>
    <Loading q={q}>{(x) => <div className="space-y-4">
      {x.images.length === 0 ? <p className="text-sm text-slate-500">{t('cat_admin.no_photos')}</p> : <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{x.images.map((im) => <div key={im.id} className="space-y-1"><img src={im.url} alt="" className="aspect-[3/2] w-full rounded-lg object-cover ring-1 ring-slate-200" /><div className="flex items-center justify-between text-xs"><span>{im.color ? t(`color.${im.color}`, im.color) : '-'}</span><button className="font-semibold text-red-600" disabled={busy} onClick={async () => { if (await run(() => api.del(`/catalogue/trims/${trim.id}/images/${im.id}`))) refresh(); }}>{t('common.delete')}</button></div></div>)}</div>}
      <div className="grid items-end gap-3 sm:grid-cols-[1fr_10rem_auto]"><Field label={t('cat_admin.photo_file')}><FileInput accept=".jpg,.jpeg,.png,.webp" onFile={setFile} label={t('cat_admin.photo_file')} /></Field>
        <Field label={t('gallery.colour')}><Select value={color} onChange={(e) => setColor(e.target.value)}><option value="">-</option>{x.colors.map((c) => <option key={c} value={c}>{t(`color.${c}`, c)}</option>)}</Select></Field>
        <button className="btn-primary" disabled={busy || !file} onClick={async () => { if (await run(() => api.upload(`/catalogue/trims/${trim.id}/images`, file, { color }), t('cat_admin.photo_added'))) { setFile(null); refresh(); } }}>{t('cat_admin.upload')}</button></div>
      <p className="text-xs text-slate-500">{t('cat_admin.photo_hint')}</p></div>}</Loading></Modal>;
}
function AddTrim({ onClose, onDone }) {
  const { t } = useTranslation(); const [run, busy] = useAction(); const [f, setF] = useState({ brand: '', model: '', name: '', body_type: 'sedan', fuel_type: 'petrol', price_usd: '', colors: 'White,Black,Silver', l_per_100km: '', kwh_per_100km: '', range_km: '', battery_kwh: '', description_en: '', description_ar: '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value }); const num = (v) => (v === '' ? undefined : Number(v));
  return <Modal title={t('cat_admin.add_trim')} onClose={onClose} wide><form className="grid gap-3 sm:grid-cols-2" onSubmit={async (e) => { e.preventDefault(); if (await run(() => api.post('/catalogue/trims', { ...f, price_usd: Number(f.price_usd), colors: f.colors.split(',').map((x) => x.trim()).filter(Boolean), l_per_100km: num(f.l_per_100km), kwh_per_100km: num(f.kwh_per_100km), range_km: num(f.range_km), battery_kwh: num(f.battery_kwh) }), t('common.saved'))) onDone(); }}>
    <Field label="Brand"><Input required value={f.brand} onChange={set('brand')} /></Field><Field label="Model"><Input required value={f.model} onChange={set('model')} /></Field><Field label="Trim"><Input required value={f.name} onChange={set('name')} /></Field>
    <Field label={t('catalogue.body')}><Select value={f.body_type} onChange={set('body_type')}>{['sedan', 'suv', 'hatchback', 'pickup', 'coupe'].map((b) => <option key={b} value={b}>{t(`body.${b}`, b)}</option>)}</Select></Field>
    <Field label={t('catalogue.fuel')}><Select value={f.fuel_type} onChange={set('fuel_type')}>{FUELS.map((x) => <option key={x} value={x}>{t(`fuel.${x}`)}</option>)}</Select></Field><Field label={t('cat_admin.price')}><Input type="number" min="1" required value={f.price_usd} onChange={set('price_usd')} /></Field>
    <Field label={t('cat_admin.colors')}><Input value={f.colors} onChange={set('colors')} /></Field><Field label={t('spec.l_per_100km')}><Input type="number" step="0.1" value={f.l_per_100km} onChange={set('l_per_100km')} /></Field>
    <Field label={t('spec.kwh_per_100km')}><Input type="number" step="0.1" value={f.kwh_per_100km} onChange={set('kwh_per_100km')} /></Field><Field label={t('spec.range_km')}><Input type="number" value={f.range_km} onChange={set('range_km')} /></Field><Field label={t('spec.battery_kwh')}><Input type="number" step="0.1" value={f.battery_kwh} onChange={set('battery_kwh')} /></Field>
    <div className="sm:col-span-2"><Field label="Description (EN)"><Textarea value={f.description_en} onChange={set('description_en')} /></Field></div><div className="sm:col-span-2"><Field label="الوصف (AR)"><Textarea dir="rtl" value={f.description_ar} onChange={set('description_ar')} /></Field></div>
    <div className="sm:col-span-2"><button className="btn-primary" disabled={busy}>{t('common.save')}</button></div></form></Modal>;
}
function Accessories() {
  const { t } = useTranslation(); const qc = useQueryClient(); const [run, busy] = useAction(); const q = useQuery({ queryKey: ['accessories'], queryFn: () => api.get('/catalogue/accessories') }); const [n, setN] = useState({ name_en: '', name_ar: '', price_usd: '' }); const [edit, setEdit] = useState({});
  const refresh = () => qc.invalidateQueries({ queryKey: ['accessories'] });
  return <div className="space-y-4"><form className="card grid gap-3 sm:grid-cols-4" onSubmit={async (e) => { e.preventDefault(); if (await run(() => api.post('/catalogue/accessories', { ...n, price_usd: Number(n.price_usd) }), t('common.saved'))) { setN({ name_en: '', name_ar: '', price_usd: '' }); refresh(); } }}>
    <Input required placeholder="Name (EN)" value={n.name_en} onChange={(e) => setN({ ...n, name_en: e.target.value })} aria-label="Name EN" /><Input dir="rtl" placeholder="الاسم (AR)" value={n.name_ar} onChange={(e) => setN({ ...n, name_ar: e.target.value })} aria-label="Name AR" /><Input type="number" min="0" required placeholder="USD" value={n.price_usd} onChange={(e) => setN({ ...n, price_usd: e.target.value })} aria-label="USD" /><button className="btn-primary" disabled={busy}>{t('common.add')}</button></form>
    <div className="card p-0 sm:p-0"><Loading q={q}>{(rows) => <Table rows={rows} cols={[{ label: 'EN', render: (r) => r.name_en }, { label: 'AR', render: (r) => r.name_ar || '-' }, { label: 'USD', render: (r) => <Input className="w-28" type="number" min="0" defaultValue={r.price_usd} onChange={(e) => setEdit({ ...edit, [r.id]: e.target.value })} aria-label="USD" /> }, { label: '', render: (r) => <button className="btn-secondary btn-sm" disabled={busy || edit[r.id] == null} onClick={async () => { if (await run(() => api.put(`/catalogue/accessories/${r.id}`, { price_usd: Number(edit[r.id]) }), t('common.saved'))) refresh(); }}>{t('common.save')}</button> }]} />}</Loading></div></div>;
}
function Promotions() {
  const { t } = useTranslation(); const qc = useQueryClient(); const [run, busy] = useAction(); const q = useQuery({ queryKey: ['promos-all'], queryFn: () => api.get('/catalogue/promotions-all') }); const trims = useQuery({ queryKey: ['trims', ''], queryFn: () => api.get('/catalogue/trims') });
  const [f, setF] = useState({ title_en: '', title_ar: '', description_en: '', trim_id: '', promo_price_usd: '', starts_on: '', ends_on: '' }); const set = (k) => (e) => setF({ ...f, [k]: e.target.value }); const refresh = () => { qc.invalidateQueries({ queryKey: ['promos-all'] }); qc.invalidateQueries({ queryKey: ['promos'] }); qc.invalidateQueries({ queryKey: ['trims'] }); };
  return <div className="space-y-4"><form className="card grid gap-3 sm:grid-cols-2" onSubmit={async (e) => { e.preventDefault(); if (await run(() => api.post('/catalogue/promotions', { ...f, trim_id: f.trim_id ? Number(f.trim_id) : undefined, promo_price_usd: f.promo_price_usd ? Number(f.promo_price_usd) : undefined, starts_on: f.starts_on || undefined, ends_on: f.ends_on || undefined }), t('common.saved'))) { setF({ title_en: '', title_ar: '', description_en: '', trim_id: '', promo_price_usd: '', starts_on: '', ends_on: '' }); refresh(); } }}>
    <Field label="Title (EN)"><Input required value={f.title_en} onChange={set('title_en')} /></Field><Field label="العنوان (AR)"><Input dir="rtl" value={f.title_ar} onChange={set('title_ar')} /></Field>
    <div className="sm:col-span-2"><Field label="Description (EN)"><Input value={f.description_en} onChange={set('description_en')} /></Field></div>
    <Field label={t('acc.car')}><Select value={f.trim_id} onChange={set('trim_id')}><option value="">—</option>{trims.data?.map((x) => <option key={x.id} value={x.id}>{x.brand} {x.model} {x.name}</option>)}</Select></Field><Field label={t('cat_admin.promo_price')}><Input type="number" min="1" value={f.promo_price_usd} onChange={set('promo_price_usd')} /></Field>
    <Field label={t('cat_admin.starts')}><Input type="date" value={f.starts_on} onChange={set('starts_on')} /></Field><Field label={t('cat_admin.ends')}><Input type="date" value={f.ends_on} onChange={set('ends_on')} /></Field>
    <div className="sm:col-span-2"><button className="btn-primary" disabled={busy}>{t('cat_admin.publish')}</button></div></form>
    <div className="card p-0 sm:p-0"><Loading q={q}>{(rows) => <Table rows={rows} cols={[{ label: t('cat_admin.title'), render: (r) => r.title_en }, { label: t('cat_admin.promo_price'), render: (r) => (r.promo_price_usd ? usd(r.promo_price_usd) : '-') }, { label: t('cat_admin.period'), render: (r) => `${r.starts_on ? dmy(r.starts_on) : '…'} → ${r.ends_on ? dmy(r.ends_on) : '…'}` }, { label: t('acc.status'), render: (r) => (r.active ? <Badge tone="green">{t('status.active')}</Badge> : <Badge>{t('status.ended')}</Badge>) }, { label: '', render: (r) => r.active ? <button className="btn-secondary btn-sm" onClick={async () => { if (await run(() => api.del(`/catalogue/promotions/${r.id}`), t('common.saved'))) refresh(); }}>{t('cat_admin.end')}</button> : null }]} />}</Loading></div></div>;
}
function Commercial() {
  const { t } = useTranslation(); const [run, busy] = useAction(); const q = useQuery({ queryKey: ['settings'], queryFn: () => api.get('/settings') }); const [v, setV] = useState({});
  const keys = ['default_interest', 'finder_term_months', 'finder_down_percent', 'fuel_price_usd_per_l', 'electricity_usd_per_kwh', 'referral_credit_usd'];
  return <Loading q={q}>{(s) => <form className="card grid max-w-xl gap-3" onSubmit={async (e) => { e.preventDefault(); await run(() => api.put('/settings/commercial', Object.fromEntries(keys.map((k) => [k, Number(v[k] ?? s[k])]))), t('common.saved')); }}>
    {keys.map((k) => <Field key={k} label={t(`settings.${k}`)}><Input type="number" step="0.01" min="0" value={v[k] ?? s[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} /></Field>)}<button className="btn-primary w-fit" disabled={busy}>{t('common.save')}</button></form>}</Loading>;
}
