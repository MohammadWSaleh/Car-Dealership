import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth.jsx';
import { useCompare } from './compare.jsx';
import ChatWidget from './ChatWidget.jsx';
import { Logo } from './Logo.jsx';
import Dropdown from './Dropdown.jsx';
import { arabicDigits, isStaff } from '../utils.js';

const Globe = () => <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.6 2.7 3.9 5.7 3.9 9s-1.3 6.3-3.9 9c-2.6-2.7-3.9-5.7-3.9-9S9.4 5.7 12 3z" /></svg>;
export function LangSwitch({ up }) {
  const { t, i18n } = useTranslation(); const { setLanguage } = useAuth(); const ar = i18n.language === 'ar';
  const toggleDigits = () => { try { localStorage.setItem('fsm_digits', arabicDigits() ? 'latin' : 'ar'); } catch { /* ignore */ } window.location.reload(); };
  const items = [{ label: 'English', active: !ar, onClick: () => setLanguage('en'), hint: !ar && <span aria-hidden="true">✓</span> }, { label: 'العربية', active: ar, onClick: () => setLanguage('ar'), hint: ar && <span aria-hidden="true">✓</span> }];
  if (ar) items.push({ divider: true }, { label: arabicDigits() ? 'Latin 123' : 'أرقام عربية ١٢٣', onClick: toggleDigits });
  return <Dropdown label={ar ? 'العربية' : 'English'} icon={<Globe />} items={items} menuLabel={t('nav.language')} up={up} />;
}
const initials = (n = '') => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
export default function Layout() {
  const { t } = useTranslation(); const { user, logout } = useAuth(); const { ids } = useCompare(); const { pathname } = useLocation();
  const [open, setOpen] = useState(false); const [scrolled, setScrolled] = useState(false);
  const overHero = pathname === '/home' && !scrolled;
  useEffect(() => { setOpen(false); window.scrollTo(0, 0); }, [pathname]);
  useEffect(() => { const on = () => setScrolled(window.scrollY > 40); on(); window.addEventListener('scroll', on, { passive: true }); return () => window.removeEventListener('scroll', on); }, []);
  const link = ({ isActive }) => `navlink ${isActive ? 'navlink-on' : ''}`; // one header style on every page
  const items = [['/home', t('nav.home'), 'home'], ['/cars', t('nav.cars')], ['/compare', t('nav.compare')], ['/ev-check', t('nav.ev_check')], ['/trade-in', t('nav.trade_in')], ['/test-drive/manage', t('nav.my_booking')]];
  const badge = (to) => to === '/compare' && ids.length > 0 && <span className="ms-1 rounded-full bg-brand-600 px-1.5 text-xs text-white">{ids.length}</span>;
  const nav = (cls) => items.map(([to, label]) => <NavLink key={to} to={to} end={to === '/home'} className={cls}>{label}{badge(to)}</NavLink>);
  const TOOLS = ['/compare', '/ev-check', '/trade-in']; const toolItems = items.filter(([to]) => TOOLS.includes(to));
  const desktopNav = <>{items.filter(([to]) => !TOOLS.includes(to) && to !== '/test-drive/manage').map(([to, label]) => <NavLink key={to} to={to} end={to === '/home'} className={link}>{label}</NavLink>)}
    <Dropdown align="start" className={`navlink nav-trigger ${TOOLS.some((x) => pathname.startsWith(x)) ? 'navlink-on' : ''}`} label={<>{t('nav.tools')}{ids.length > 0 && <span className="ms-1 rounded-full bg-brand-600 px-1.5 text-xs text-white">{ids.length}</span>}</>} menuLabel={t('nav.tools')} items={toolItems.map(([to, label]) => ({ to, label, active: pathname.startsWith(to), hint: badge(to) }))} />
    <NavLink to="/test-drive/manage" className={link}>{t('nav.my_booking')}</NavLink></>;
  const account = user ? <Dropdown className="btn-outline btn-sm !py-1 !ps-1.5" menuLabel={t('nav.account')} label={<><span className="avatar-sm" aria-hidden="true">{initials(user.name)}</span><span className="max-w-[8rem] truncate">{user.name?.split(' ')[0]}</span></>}
    items={[{ to: isStaff(user) ? '/staff' : '/account', label: isStaff(user) ? t('nav.console') : t('nav.account') }, { divider: true }, { label: t('nav.logout'), danger: true, onClick: logout }]} />
    : <><Link className={'btn-outline btn-sm'} to="/login">{t('nav.login')}</Link><Link className="btn-primary btn-sm" to="/register">{t('nav.register')}</Link></>;
  return (
    <div className={`flex min-h-screen flex-col overflow-x-clip ${pathname.startsWith('/staff') ? '' : 'theme-dark'}`}>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:start-2 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-black focus:shadow-lg">{t('a11y.skip')}</a>
      <header className={`fixed inset-x-0 top-0 z-40 transition-all duration-300 ${overHero ? 'bg-gradient-to-b from-black/70 to-transparent' : 'border-b border-white/10 bg-night-900/95 backdrop-blur'}`}>
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
          <Link to="/home" className="me-4 shrink-0 text-lg" aria-label={t('brand.name')}><Logo tone="light" size={34} /></Link>
          <nav className="hidden items-center gap-0.5 lg:flex" aria-label="Main">{desktopNav}</nav>
          <div className="ms-auto flex items-center gap-2"><div className="hidden items-center gap-2 lg:flex"><LangSwitch />{account}</div>
            <button className="btn-outline btn-sm lg:hidden" aria-expanded={open} aria-controls="mobile-menu" aria-label={t('nav.menu')} onClick={() => setOpen(!open)}><span aria-hidden="true">{open ? '✕' : '☰'}</span></button></div>
        </div>
        {open && <div id="mobile-menu" className={`lg:hidden bg-night-900/98 menu-in px-4 pb-6 pt-2`}><nav className="flex flex-col gap-1" aria-label="Mobile">{nav(() => 'navlink navlink-big')}</nav><div className="mt-4 flex flex-wrap gap-2"><LangSwitch />{account}</div></div>}
      </header>
      <main id="main" tabIndex={-1} className={`mx-auto w-full flex-1 outline-none ${pathname === '/home' ? '' : 'max-w-7xl px-4 pb-6 pt-24'}`}><Outlet /></main>
      <footer className="border-t border-white/10 bg-night-900 text-slate-300">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 text-sm sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1.2fr]">
          <div><Logo tone="light" size={40} className="text-xl" /><p className="mt-3 max-w-xs text-slate-400">{t('brand.slogan')}</p><Link to="/cars" className="btn-outline btn-sm mt-5">{t('home.browse')}</Link></div>
          <div><h2 className="mb-3 text-sm font-semibold text-white">{t('footer.explore')}</h2><ul className="space-y-2">{[items[1], items[2]].map(([to, label]) => <li key={to}><Link className="footer-link" to={to}>{label}</Link></li>)}<li><Link className="footer-link" to="/register">{t('nav.register')}</Link></li></ul></div>
          <div><h2 className="mb-3 text-sm font-semibold text-white">{t('footer.services')}</h2><ul className="space-y-2">{[items[3], items[4], items[5]].map(([to, label]) => <li key={to}><Link className="footer-link" to={to}>{label}</Link></li>)}</ul></div>
          <div><h2 className="mb-3 text-sm font-semibold text-white">{t('footer.visit')}</h2><address className="space-y-1 not-italic text-slate-300"><p>{t('footer.address')}</p><p>{t('footer.hours')}</p></address></div></div>
        <div className="border-t border-white/10"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4 text-xs text-slate-400">
          <div className="flex items-center gap-3"><LangSwitch up /><span>© {new Date().getFullYear()} {t('brand.name')}</span></div><span className="order-last w-full sm:order-none sm:w-auto sm:pe-44">{t('footer.note')}</span></div></div></footer>
      <ChatWidget />
    </div>
  );
}
