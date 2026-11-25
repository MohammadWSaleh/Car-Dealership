import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Field, Input, Notice, Textarea, useAction } from './ui.jsx';

// FR-DEAL-01: an enquiry from the website form becomes a lead; FR-OC-03: an optional referral code
export default function EnquiryForm({ trimId, referral = '' }) {
  const { t, i18n } = useTranslation(); const { user } = useAuth(); const [run, busy] = useAction(); const [done, setDone] = useState(false);
  const [f, setF] = useState({ name: '', email: '', phone: '', message: '', referral_code: referral, consent_data: false, consent_marketing: false });
  if (done) return <Notice tone="ok">{t('enquiry.sent')}</Notice>;
  const submit = async (e) => { e.preventDefault(); const r = await run(() => api.post('/leads', { ...f, trim_id: trimId, language: i18n.language, referral_code: f.referral_code || undefined })); if (r) setDone(true); };
  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
      {!user && <>
        <Field label={t('form.name')}><Input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label={t('form.phone')}><Input type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <div className="sm:col-span-2"><Field label={t('form.email')}><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field></div></>}
      <div className="sm:col-span-2"><Field label={t('form.message')}><Textarea value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} /></Field></div>
      <Field label={t('form.referral_code')} hint={t('form.referral_hint')}><Input value={f.referral_code} onChange={(e) => setF({ ...f, referral_code: e.target.value.toUpperCase() })} /></Field>
      {!user && <><label className="flex items-start gap-2 text-xs sm:col-span-2"><input type="checkbox" required checked={f.consent_data} onChange={(e) => setF({ ...f, consent_data: e.target.checked })} className="mt-0.5" />{t('consent.data')}</label>
        <label className="flex items-start gap-2 text-xs sm:col-span-2"><input type="checkbox" checked={f.consent_marketing} onChange={(e) => setF({ ...f, consent_marketing: e.target.checked })} className="mt-0.5" />{t('consent.marketing')}</label></>}
      <div className="sm:col-span-2"><button className="btn-primary" disabled={busy || (!user && !f.email && !f.phone)}>{t('enquiry.send')}</button></div>
    </form>
  );
}
