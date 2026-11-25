import { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth.jsx';
import { Field, Input, Notice, useAction } from '../components/ui.jsx';
import { Streaks } from '../components/Reveal.jsx';
import { Logo } from '../components/Logo.jsx';
import { LangSwitch } from '../components/Layout.jsx';

function AuthShell({ children, title, lead }) {
  const { t } = useTranslation();
  return <div className="theme-dark min-h-screen lg:grid lg:grid-cols-2">
    <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:start-2 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-black">{t('a11y.skip')}</a>
    <aside className="relative hidden overflow-hidden bg-black lg:block"><Streaks />
      <div className="relative z-10 flex h-full flex-col justify-between p-12">
        <Link to="/home" className="text-2xl" aria-label={t('brand.name')}><Logo size={46} /></Link>
        <div><h2 className="display max-w-md text-5xl text-white">{t('brand.slogan')}</h2><p className="mt-4 max-w-md text-slate-300">{t('auth.hero_lead')}</p>
          <ul className="mt-8 space-y-3 text-sm text-slate-200">{['fixed', 'lang', 'drive'].map((k) => <li key={k} className="flex items-center gap-3"><span className="grid h-6 w-6 place-items-center rounded-full bg-emerald-500/20 text-emerald-300">✓</span>{t(`auth.perk_${k}`)}</li>)}</ul></div>
        <p className="text-xs text-slate-400">© {new Date().getFullYear()} {t('brand.name')}</p>
      </div></aside>
    <main id="main" className="relative flex min-h-screen flex-col px-5 py-6 sm:px-10">
      <div className="flex items-center justify-between"><Link to="/home" className="text-lg lg:invisible" aria-label={t('brand.name')}><Logo size={34} /></Link><div className="flex gap-2"><LangSwitch /></div></div>
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-8"><div className="reveal reveal-up reveal-in"><h1 className="display text-3xl text-white sm:text-4xl">{title}</h1><p className="mt-2 text-slate-300">{lead}</p></div>
        <div className="mt-8">{children}</div></div>
    </main></div>;
}
function Password({ label, value, onChange, autoComplete, minLength, hint }) {
  const { t } = useTranslation(); const [show, setShow] = useState(false);
  return <Field label={label} hint={hint}><div className="relative"><Input type={show ? 'text' : 'password'} required minLength={minLength} autoComplete={autoComplete} value={value} onChange={onChange} className="pe-16" />
    <button type="button" onClick={() => setShow(!show)} aria-pressed={show} className="absolute end-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-xs font-semibold text-slate-300 hover:text-white">{show ? t('auth.hide') : t('auth.show')}</button></div></Field>;
}
export function Login({ landing = false }) {
  const { t } = useTranslation(); const { login, user } = useAuth(); const nav = useNavigate(); const [p] = useSearchParams(); const [, busy] = useAction();
  const [f, setF] = useState({ email: '', password: '' }); const [err, setErr] = useState(null); const [wait, setWait] = useState(false);
  if (user) return <Navigate to={p.get('next') || '/home'} replace />;
  const submit = async (e) => { e.preventDefault(); setErr(null); setWait(true); try { await login(f.email, f.password); nav(p.get('next') || '/home'); } catch (x) { setErr(x); } finally { setWait(false); } };
  return <AuthShell title={t('auth.welcome')} lead={t('auth.welcome_lead')}>
    <form onSubmit={submit} className="space-y-4">
      {err && <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{err.code === 'account_locked' ? t('auth.locked') : err.code === 'account_disabled' ? t('auth.disabled') : t('auth.invalid')}</div>}
      <Field label={t('form.email')}><Input type="email" required autoComplete="username" autoFocus value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
      <Password label={t('form.password')} autoComplete="current-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
      <button className="btn-primary w-full py-3 text-base" disabled={busy || wait}>{wait ? t('auth.signing_in') : t('nav.login')}</button>
      <div className="relative py-2 text-center text-xs text-slate-400"><span className="relative z-10 bg-[#111] px-3">{t('auth.or')}</span><span className="absolute inset-x-0 top-1/2 h-px bg-white/10" /></div>
      <Link to="/home" className="btn-outline w-full py-3">{t('auth.guest')}</Link>
      <p className="text-center text-sm text-slate-300">{t('auth.no_account')} <Link className="font-semibold text-sky-300 underline-offset-4 hover:underline" to="/register">{t('nav.register')}</Link></p>
    </form></AuthShell>;
}
export function Register() {
  const { t, i18n } = useTranslation(); const { register } = useAuth(); const nav = useNavigate();
  const [f, setF] = useState({ name: '', email: '', phone: '', password: '', consent_data: false, consent_marketing: false }); const [err, setErr] = useState(null);
  const submit = async (e) => { e.preventDefault(); setErr(null); try { await register({ ...f, language: i18n.language }); nav('/home'); } catch (x) { setErr(x); } };
  return <AuthShell title={t('auth.join')} lead={t('auth.join_lead')}><form onSubmit={submit} className="space-y-4">
    {err && <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{err.message}</div>}
    <Field label={t('form.name')}><Input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
    <Field label={t('form.email')}><Input type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
    <Field label={t('form.phone')}><Input type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
    <Password label={t('form.password')} hint={t('auth.password_hint')} minLength={8} autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
    <label className="flex items-start gap-2 text-sm"><input type="checkbox" required checked={f.consent_data} onChange={(e) => setF({ ...f, consent_data: e.target.checked })} className="mt-1" />{t('consent.data')}</label>
    <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={f.consent_marketing} onChange={(e) => setF({ ...f, consent_marketing: e.target.checked })} className="mt-1" />{t('consent.marketing')}</label>
    <button className="btn-primary w-full py-3 text-base">{t('nav.register')}</button>
    <p className="text-center text-sm text-slate-300">{t('auth.have_account')} <Link className="font-semibold text-sky-300 underline-offset-4 hover:underline" to="/login">{t('nav.login')}</Link></p></form></AuthShell>;
}
