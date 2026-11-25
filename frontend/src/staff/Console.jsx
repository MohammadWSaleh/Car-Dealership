import { Suspense, lazy } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
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
export default function Console() {
  const { t } = useTranslation(); const { user, loading } = useAuth();
  if (loading) return null; if (!user) return <Navigate to="/login?next=/staff" replace />; if (!isStaff(user)) return <Navigate to="/account" replace />;
  const items = NAV.filter((n) => n.roles.includes(user.role));
  const link = ({ isActive }) => `block whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium ${isActive ? 'bg-brand-600 text-white' : 'text-slate-700 hover:bg-slate-100'}`;
  return (
    <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-[13rem_minmax(0,1fr)]">
      <aside className="min-w-0"><div className="mb-3 rounded-lg bg-brand-50 p-3 text-xs"><div className="font-bold">{user.name}</div><div className="text-slate-600">{t(`role.${user.role}`)}</div></div>
        <nav className="flex gap-1 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible" aria-label="Staff">{items.map((n) => <NavLink key={n.key} to={`/staff/${n.to}`} end={n.end} className={link}>{t(`staff.${n.key}`)}</NavLink>)}</nav></aside>
      <section className="min-w-0">
        <Routes>
          <Route index element={<Dashboard />} /><Route path="deals" element={<DealsPage />} /><Route path="deals/:id" element={<DealDetail />} />
          <Route path="testdrives" element={<TestDrivesStaff />} /><Route path="exceptions" element={<ExceptionsPage />} /><Route path="tradeins" element={<TradeInsStaff />} />
          <Route path="payments" element={<PaymentsPage />} /><Route path="invoices" element={<InvoicesPage />} />
          <Route path="catalogue" element={<CatalogueAdmin />} /><Route path="inventory" element={<InventoryPage />} />
          <Route path="delivery" element={<DeliveryPage />} /><Route path="delivery/:id" element={<DeliveryDetail />} />
          <Route path="owners-circle" element={<OwnersAdmin />} /><Route path="reports" element={<Suspense fallback={<Spinner />}><ReportsPage /></Suspense>} />
          <Route path="users" element={<UsersPage />} /><Route path="settings" element={<SettingsPage />} /><Route path="audit" element={<AuditPage />} />
          <Route path="data-requests" element={<DataRequestsPage />} /><Route path="outbox" element={<OutboxPage />} /><Route path="backups" element={<BackupsPage />} />
        </Routes>
      </section>
    </div>
  );
}
