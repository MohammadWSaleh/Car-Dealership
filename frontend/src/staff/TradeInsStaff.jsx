import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../api.js';
import { Field, Input, Loading, Modal, PageTitle, Table, useAction } from '../components/ui.jsx';
import { OfferBadge } from '../pages/TradeIn.jsx';
import { dmy, usd } from '../utils.js';

// F4 (staff): confirm a trade-in offer; the customer is notified and the offer stays valid for the staff-set number of days
export function TradeInsStaff() {
  const { t } = useTranslation(); const qc = useQueryClient(); const [run, busy] = useAction(); const [sel, setSel] = useState(null); const [offer, setOffer] = useState('');
  const q = useQuery({ queryKey: ['tradeins'], queryFn: () => api.get('/tradein') });
  const send = async () => { const r = await run(() => api.post(`/tradein/${sel.id}/offer`, { offer_usd: Number(offer) }), t('tradein.offer_sent')); if (r) { setSel(null); qc.invalidateQueries({ queryKey: ['tradeins'] }); } };
  return <div><PageTitle>{t('staff.tradeins')}</PageTitle>
    <div className="card p-0 sm:p-0"><Loading q={q}>{(rows) => <Table rows={rows} cols={[
      { label: t('acc.date'), render: (r) => dmy(r.created_at) }, { label: t('form.name'), render: (r) => <div>{r.name}<div className="text-xs text-slate-600">{r.phone || r.email}</div></div> },
      { label: t('tradein.vehicle'), render: (r) => <div>{[r.brand, r.model, r.year].filter(Boolean).join(' ') || `${r.segment} ${r.year}`}<div className="text-xs text-slate-600">{r.mileage_km} km · {t(`tradein.cond_${r.condition}`)}</div></div> },
      { label: t('tradein.range'), render: (r) => `${usd(r.est_low)} – ${usd(r.est_high)}` }, { label: t('acc.status'), render: (r) => <OfferBadge r={r} /> },
      { label: '', render: (r) => <button className="btn-secondary btn-sm" onClick={() => { setSel(r); setOffer(r.offer_usd || Math.round((r.est_low + r.est_high) / 2)); }}>{t('tradein.set_offer')}</button> }]} />}</Loading></div>
    {sel && <Modal title={t('tradein.set_offer')} onClose={() => setSel(null)}><div className="space-y-3">
      <p className="text-sm text-slate-600">{t('tradein.range')}: {usd(sel.est_low)} – {usd(sel.est_high)}</p>
      <Field label={t('tradein.offer_usd')}><Input type="number" min="1" value={offer} onChange={(e) => setOffer(e.target.value)} /></Field>
      <button className="btn-primary" disabled={busy || !offer} onClick={send}>{t('tradein.send_offer')}</button></div></Modal>}</div>;
}
