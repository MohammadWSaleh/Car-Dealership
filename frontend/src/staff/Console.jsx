import { Suspense, lazy } from 'react';
import { Icon } from '../components/Icon.jsx';
import { Link, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth.jsx';
import { isStaff } from '../utils.js';
import { Spinner } from '../components/ui.jsx';
import { DealDetail, DealsPage } from './Deals.jsx';
import { Dashboard } from './Dashboard.jsx';
import { TestDrivesStaff } from './TestDrivesStaff.jsx';
import { InvoicesPage, PaymentsPage } from './Money.jsx';
import { CatalogueAdmin } from './CatalogueAdmin.jsx';
import { InventoryPage } from './Inventory.jsx';
import { DeliveryDetail, DeliveryPage } from './Delivery.jsx';
import { OwnersAdmin } from './OwnersAdmin.jsx';
import { TradeInsStaff } from './TradeInsStaff.jsx';
const ReportsPage = lazy(() => import('./Reports.jsx').then((m) => ({ default: m.ReportsPage })));
import { AuditPage, BackupsPage, DataRequestsPage, OutboxPage, SettingsPage, UsersPage } from './Admin.jsx';
import { ExceptionsPage } from './Exceptions.jsx';

// FR-ADM-01 / Table 21: what each role sees. The server enforces the same rules; this only hides what a role cannot use.
const NAV = [
  { to: '', key: 'dashboard', roles: ['sales_consultant', 'sales_manager', 'general_manager', 'accountant', 'delivery_coordinator', 'administrator'], end: true },
  { to: 'deals', key: 'deals', roles: ['sales_consultant', 'sales_manager', 'general_manager'] },
  { to: 'testdrives', key: 'testdrives', roles: ['sales_consultant', 'sales_manager'] },
  { to: 'tradeins', key: 'tradeins', roles: ['sales_consultant', 'sales_manager'] },
  { to: 'exceptions', key: 'exceptions', roles: ['sales_consultant', 'sales_manager'] },
  { to: 'payments', key: 'payments', roles: ['accountant', 'sales_manager', 'general_manager', 'sales_consultant'] },
  { to: 'invoices', key: 'invoices', roles: ['accountant', 'sales_manager', 'general_manager'] },
  { to: 'catalogue', key: 'catalogue', roles: ['sales_manager'] },
  { to: 'inventory', key: 'inventory', roles: ['sales_manager', 'general_manager'] },
  { to: 'delivery', key: 'delivery', roles: ['delivery_coordinator', 'sales_manager', 'general_manager'] },
  { to: 'owners-circle', key: 'owners', roles: ['sales_manager', 'general_manager'] },
  { to: 'reports', key: 'reports', roles: ['general_manager', 'sales_manager'] },
  { to: 'users', key: 'users', roles: ['administrator'] },
  { to: 'settings', key: 'settings', roles: ['administrator', 'sales_manager'] },
  { to: 'audit', key: 'audit', roles: ['administrator'] },
  { to: 'data-requests', key: 'data_requests', roles: ['administrator'] },
  { to: 'outbox', key: 'outbox', roles: ['administrator', 'sales_manager'] },
  { to: 'backups', key: 'backups', roles: ['administrator'] },
];
const GROUPS = [['grp_sales', ['dashboard', 'deals', 'testdrives', 'tradeins', 'exceptions']], ['grp_money', ['payments', 'invoices']], ['grp_stock', ['catalogue', 'inventory', 'delivery']], ['grp_growth', ['owners', 'reports']], ['grp_admin', ['users', 'settings', 'audit', 'data_requests', 'outbox', 'backups']]];
const initials = (n = '') => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
export default function Console() {
  const { t } = useTranslation(); const { user, loading } = useAuth(); const loc = useLocation();
  if (loading) return null; if (!user) return <Navigate to="/login?next=/staff" replace />; if (!isStaff(user)) return <Navigate to="/account" replace />;
  const items = NAV.filter((n) => n.roles.includes(user.role));
  const seg = loc.pathname.replace(/^\/staff\/?/, '').split('/')[0];
  const allowed = !seg || items.some((n) => n.to === seg);
  const link = ({ isActive }) => `side-link ${isActive ? 'side-link-on' : ''}`;
  const groups = GROUPS.map(([g, keys]) => [g, items.filter((n) => keys.includes(n.key))]).filter(([, list]) => list.length);
  return (
    <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-[13rem_minmax(0,1fr)]">
      <aside className="min-w-0 lg:sticky lg:top-24 lg:self-start">
        <div className="rounded-2xl bg-night-900 p-3 text-white shadow-pop ring-1 ring-white/5">
          <div className="mb-3 flex items-center gap-3 rounded-xl bg-white/5 p-3"><span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-400/20 text-sm font-bold text-sky-200 ring-1 ring-sky-300/30">{initials(user.name)}</span><div className="min-w-0"><div className="truncate text-sm font-semibold">{user.name}</div><div className="truncate text-xs text-slate-400">{t(`role.${user.role}`)}</div></div></div>
          <nav className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:gap-0 lg:overflow-visible lg:pb-0" aria-label="Staff">
            {groups.map(([g, list], gi) => <div key={g} className="flex gap-1 lg:block">
              <div className={`hidden px-3 pb-1 text-xs font-semibold text-slate-400 lg:block ${gi ? 'pt-4' : 'pt-1'}`}>{t(`staff.${g}`)}</div>
              {list.map((n) => <NavLink key={n.key} to={`/staff/${n.to}`} end={n.end} className={link}><Icon name={n.key} className="shrink-0 opacity-80" />{t(`staff.${n.key}`)}</NavLink>)}</div>)}
          </nav></div></aside>
      <section className="min-w-0">
        {!allowed ? <div role="alert" className="card p-6 text-center"><p className="mb-3 font-semibold">{t('staff.no_access')}</p><Link className="btn-primary" to="/staff">{t('staff.no_access_back')}</Link></div> : <Routes>
          <Route index element={<Dashboard />} /><Route path="deals" element={<DealsPage />} /><Route path="deals/:id" element={<DealDetail />} />
          <Route path="testdrives" element={<TestDrivesStaff />} /><Route path="exceptions" element={<ExceptionsPage />} /><Route path="tradeins" element={<TradeInsStaff />} />
          <Route path="payments" element={<PaymentsPage />} /><Route path="invoices" element={<InvoicesPage />} />
          <Route path="catalogue" element={<CatalogueAdmin />} /><Route path="inventory" element={<InventoryPage />} />
          <Route path="delivery" element={<DeliveryPage />} /><Route path="delivery/:id" element={<DeliveryDetail />} />
          <Route path="owners-circle" element={<OwnersAdmin />} /><Route path="reports" element={<Suspense fallback={<Spinner />}><ReportsPage /></Suspense>} />
          <Route path="users" element={<UsersPage />} /><Route path="settings" element={<SettingsPage />} /><Route path="audit" element={<AuditPage />} />
          <Route path="data-requests" element={<DataRequestsPage />} /><Route path="outbox" element={<OutboxPage />} /><Route path="backups" element={<BackupsPage />} />
        </Routes>}
      </section>
    </div>
  );
}
