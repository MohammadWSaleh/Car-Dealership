import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth.jsx';
import { useCompare } from './compare.jsx';
import ChatWidget from './ChatWidget.jsx';
import { Logo } from './Logo.jsx';
import { arabicDigits, isStaff } from '../utils.js';

export function LangSwitch() {
  const { i18n } = useTranslation(); const { setLanguage } = useAuth(); const next = i18n.language === 'ar' ? 'en' : 'ar';
  const [, bump] = useState(0);
  const toggleDigits = () => { try { localStorage.setItem('fsm_digits', arabicDigits() ? 'latin' : 'ar'); } catch { /* ignore */ } bump((x) => x + 1); window.location.reload(); };
  return <>
    <button className="btn-secondary btn-sm" onClick={() => setLanguage(next)} aria-label="Language">{next === 'ar' ? 'العربية' : 'English'}</button>
    {i18n.language === 'ar' && <button className="btn-secondary btn-sm" onClick={toggleDigits} aria-pressed={arabicDigits()} title="الأرقام">{arabicDigits() ? '123' : '١٢٣'}</button>}
  </>;
}
export default function Layout() {
  const { t } = useTranslation(); const { user, logout } = useAuth(); const { ids } = useCompare(); const { pathname } = useLocation();
  const [open, setOpen] = useState(false); const [scrolled, setScrolled] = useState(false);
  const light = pathname.startsWith('/staff') || pathname.startsWith('/account');
  const overHero = pathname === '/home' && !scrolled;
  useEffect(() => { setOpen(false); window.scrollTo(0, 0); }, [pathname]);
  useEffect(() => { const on = () => setScrolled(window.scrollY > 40); on(); window.addEventListener('scroll', on, { passive: true }); return () => window.removeEventListener('scroll', on); }, []);
  const link = ({ isActive }) => light
    ? `rounded-lg px-3 py-2 text-sm font-medium ${isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-700 hover:bg-slate-100'}`
    : `navlink ${isActive ? 'navlink-on' : ''}`;
  const items = [['/home', t('nav.home'), 'home'], ['/cars', t('nav.cars')], ['/compare', t('nav.compare')], ['/ev-check', t('nav.ev_check')], ['/trade-in', t('nav.trade_in')], ['/test-drive/manage', t('nav.my_booking')]];
  const nav = (cls) => items.map(([to, label]) => <NavLink key={to} to={to} end={to === '/home'} className={cls}>{label}{to === '/compare' && ids.length > 0 && <span className="ms-1 rounded-full bg-brand-600 px-1.5 text-xs text-white">{ids.length}</span>}</NavLink>);
  const account = user ? <>
    <Link className={light ? 'btn-secondary btn-sm' : 'btn-outline btn-sm'} to={isStaff(user) ? '/staff' : '/account'}>{isStaff(user) ? t('nav.console') : t('nav.account')}</Link>
    <button className={light ? 'btn-secondary btn-sm' : 'btn-outline btn-sm'} onClick={logout}>{t('nav.logout')}</button></>
    : <><Link className={light ? 'btn-secondary btn-sm' : 'btn-outline btn-sm'} to="/login">{t('nav.login')}</Link><Link className="btn-primary btn-sm" to="/register">{t('nav.register')}</Link></>;
  return (
    <div className={`flex min-h-screen flex-col overflow-x-clip ${light ? '' : 'theme-dark'}`}>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:start-2 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-black focus:shadow-lg">{t('a11y.skip')}</a>
      <header className={`fixed inset-x-0 top-0 z-40 transition-all duration-300 ${light ? 'border-b bg-white/95 backdrop-blur' : overHero ? 'bg-gradient-to-b from-black/70 to-transparent' : 'border-b border-white/10 bg-black/85 backdrop-blur'}`}>
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
          <Link to="/home" className="me-4 text-lg" aria-label={t('brand.name')}><Logo tone={light ? 'dark' : 'light'} size={34} /></Link>
          <nav className="hidden items-center gap-1 md:flex" aria-label="Main">{nav(link)}</nav>
          <div className="ms-auto flex items-center gap-2"><div className="hidden items-center gap-2 md:flex"><LangSwitch />{account}</div>
            <button className={`md:hidden ${light ? 'btn-secondary' : 'btn-outline'} btn-sm`} aria-expanded={open} aria-controls="mobile-menu" aria-label={t('nav.menu')} onClick={() => setOpen(!open)}><span aria-hidden="true">{open ? '✕' : '☰'}</span></button></div>
        </div>
        {open && <div id="mobile-menu" className={`md:hidden ${light ? 'bg-white' : 'bg-black/95'} menu-in px-4 pb-6 pt-2`}><nav className="flex flex-col gap-1" aria-label="Mobile">{nav(light ? link : () => 'navlink navlink-big')}</nav><div className="mt-4 flex flex-wrap gap-2"><LangSwitch />{account}</div></div>}
      </header>
      <main id="main" tabIndex={-1} className={`mx-auto w-full flex-1 outline-none ${pathname === '/home' ? '' : 'max-w-7xl px-4 pb-6 pt-24'}`}><Outlet /></main>
      <footer className={light ? 'border-t bg-white' : 'border-t border-white/10 bg-black'}>
        {!light && <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 text-sm sm:grid-cols-3">
          <div><Logo tone="light" size={40} className="text-xl" /><p className="mt-3 text-slate-400">{t('brand.slogan')}</p></div>
          <div><h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-400">{t('footer.explore')}</h2><ul className="space-y-2">{items.slice(1).map(([to, label]) => <li key={to}><Link className="footer-link" to={to}>{label}</Link></li>)}</ul></div>
          <div><h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-400">{t('footer.visit')}</h2><p className="text-slate-300">{t('footer.address')}</p><p className="mt-1 text-slate-300">{t('footer.hours')}</p></div></div>}
        <div className={`mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-xs ${light ? 'text-slate-500' : 'border-t border-white/10 text-slate-400'}`}>
          <span>© {new Date().getFullYear()} {t('brand.name')} · {t('brand.slogan')}</span><span>{t('footer.note')}</span></div></footer>
      <ChatWidget />
    </div>
  );
}
