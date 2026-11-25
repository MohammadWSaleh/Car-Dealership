// COMPONENT TESTS: forms and screens with the API mocked.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nextProvider } from 'react-i18next';
import i18n from '../../i18n/index.js';
import { ToastProvider } from '../../components/ui.jsx';
import { CompareProvider } from '../../components/compare.jsx';

const auth = { user: null, loading: false, login: vi.fn(), register: vi.fn(), logout: vi.fn(), setLanguage: vi.fn(), setUser: vi.fn(), refresh: vi.fn() };
vi.mock('../../auth.jsx', () => ({ useAuth: () => auth, AuthProvider: ({ children }) => children }));
const get = vi.fn(); const post = vi.fn();
vi.mock('../../api.js', () => ({ api: { get: (...a) => get(...a), post: (...a) => post(...a), put: vi.fn(), patch: vi.fn(), del: vi.fn(), upload: vi.fn(), open: vi.fn() }, getToken: () => null, setToken: () => {}, setUnauthorizedHandler: () => {}, ApiError: class extends Error {} }));
const { Login, Register } = await import('../../pages/Auth.jsx');
const Console = (await import('../../staff/Console.jsx')).default;
const ChatWidget = (await import('../../components/ChatWidget.jsx')).default;
const EVCheck = (await import('../../pages/EVCheck.jsx')).default;

const mount = (ui, path = '/') => render(<I18nextProvider i18n={i18n}><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={[path]}><ToastProvider><CompareProvider>
  <Routes><Route path="/login" element={<div>LOGIN PAGE</div>} /><Route path="/account" element={<div>ACCOUNT PAGE</div>} /><Route path="/staff/*" element={ui} /><Route path="*" element={ui} /></Routes></CompareProvider></ToastProvider></MemoryRouter></QueryClientProvider></I18nextProvider>);
beforeEach(() => { vi.clearAllMocks(); auth.user = null; get.mockResolvedValue([]); });

describe('FR-ACC-03 Login', () => {
  it('submits the entered credentials', async () => {
    auth.login.mockResolvedValue({ role: 'customer' }); mount(<Login />);
    fireEvent.change(document.querySelector('input[type=email]'), { target: { value: 'a@b.lb' } }); fireEvent.change(document.querySelector('input[type=password]'), { target: { value: 'pw123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' })); await waitFor(() => expect(auth.login).toHaveBeenCalledWith('a@b.lb', 'pw123456'));
  });
  it('shows a clear message for a wrong password and for a locked account', async () => {
    const { unmount } = mount(<Login />); auth.login.mockRejectedValueOnce(Object.assign(new Error('x'), { code: 'invalid_credentials' }));
    fireEvent.change(document.querySelector('input[type=email]'), { target: { value: 'a@b.lb' } }); fireEvent.change(document.querySelector('input[type=password]'), { target: { value: 'bad' } }); fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Wrong email or password.'); unmount();
    mount(<Login />); auth.login.mockRejectedValueOnce(Object.assign(new Error('x'), { code: 'account_locked' }));
    fireEvent.change(document.querySelector('input[type=email]'), { target: { value: 'a@b.lb' } }); fireEvent.change(document.querySelector('input[type=password]'), { target: { value: 'bad' } }); fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/15 minutes/);
  });
});
describe('FR-ACC-01/02 Register', () => {
  it('data-processing consent is required, marketing consent is optional and separate', () => {
    mount(<Register />); const boxes = screen.getAllByRole('checkbox'); expect(boxes[0].required).toBe(true); expect(boxes[1].required).toBe(false);
    expect(document.querySelector('input[type=password]').minLength).toBe(8);
  });
  it('sends the chosen language with the registration', async () => {
    auth.register.mockResolvedValue({}); mount(<Register />);
    const [name] = screen.getAllByRole('textbox'); fireEvent.change(name, { target: { value: 'Rami' } }); fireEvent.change(document.querySelector('input[type=email]'), { target: { value: 'r@x.lb' } }); fireEvent.change(document.querySelector('input[type=password]'), { target: { value: 'Str0ng!pass' } }); fireEvent.click(screen.getAllByRole('checkbox')[0]);
    fireEvent.submit(document.querySelector('form')); await waitFor(() => expect(auth.register).toHaveBeenCalled()); expect(auth.register.mock.calls[0][0]).toMatchObject({ name: 'Rami', language: 'en', consent_data: true, consent_marketing: false });
  });
});
describe('FR-ADM-01 staff console access', () => {
  const menu = (role) => { auth.user = { role, name: 'X' }; mount(<Console />, '/staff'); return screen.getAllByRole('link', { name: /.+/ }).map((a) => a.textContent); };
  it('anonymous visitors are sent to the login page', () => { mount(<Console />, '/staff'); expect(screen.getByText('LOGIN PAGE')).toBeTruthy(); });
  it('customers are sent to their account', () => { auth.user = { role: 'customer', name: 'K' }; mount(<Console />, '/staff'); expect(screen.getByText('ACCOUNT PAGE')).toBeTruthy(); });
  it.each([
    ['sales_consultant', ['Deals', 'Test drives'], ['Users', 'Catalogue', 'Backups']],
    ['sales_manager', ['Deals', 'Catalogue', 'Inventory', 'Reports', 'Price exceptions'], ['Users', 'Backups']],
    ['accountant', ['Payments', 'Invoices'], ['Deals', 'Catalogue', 'Delivery']],
    ['delivery_coordinator', ['Delivery'], ['Payments', 'Deals', 'Reports']],
    ['general_manager', ['Reports', 'Deals', 'Inventory', 'Payments'], ['Catalogue', 'Users', 'Backups']],
    ['administrator', ['Users', 'Audit log', 'Backups', 'Data requests'], ['Deals', 'Payments', 'Catalogue']],
  ])('%s sees the right menu', (role, has, hasNot) => {
    const items = menu(role); has.forEach((h) => expect(items, `${role} should see ${h}`).toContain(h)); hasNot.forEach((h) => expect(items, `${role} must not see ${h}`).not.toContain(h));
  });
});
describe('direct links to pages a role cannot use', () => {
  it('shows a no-access screen and makes no data requests', () => {
    auth.user = { role: 'sales_consultant', name: 'C' }; mount(<Console />, '/staff/users');
    expect(screen.getByRole('alert').textContent).toMatch(/does not have access/); expect(get).not.toHaveBeenCalledWith(expect.stringContaining('/admin/users'));
  });
  it('still opens pages the role may use', () => { auth.user = { role: 'sales_manager', name: 'M' }; mount(<Console />, '/staff/deals'); expect(screen.queryByRole('alert')).toBeNull(); });
});
describe('FR-VA assistant widget', () => {
  it('opens, greets, and sends the customer message with the current language', async () => {
    post.mockResolvedValue({ session_id: 's1', reply: 'Hello! How can I help?', options: [] }); mount(<ChatWidget />);
    fireEvent.click(screen.getByRole('button', { name: 'Ask Full Stack Motors' })); expect(await screen.findByText('Hello! How can I help?')).toBeTruthy();
    expect(post.mock.calls[0][0]).toBe('/assistant/chat'); expect(post.mock.calls[0][1]).toMatchObject({ lang: 'en', message: 'hello' });
    expect(screen.getByText(/Automated assistant/)).toBeTruthy();
  });
});
describe('FR-EV-01 EV check form', () => {
  it('posts the answers and shows the result with reasons', async () => {
    get.mockResolvedValue([]); post.mockResolvedValue({ id: 1, result: 'needs_attention', reasons: [{ key: 'grid_only', text: 'Grid power only.' }], shortlist: [] }); mount(<EVCheck />);
    const nums = document.querySelectorAll('input[type=number]'); fireEvent.change(nums[0], { target: { value: '60' } }); fireEvent.change(nums[1], { target: { value: '50000' } });
    fireEvent.submit(document.querySelector('form')); expect(await screen.findByText('Needs attention')).toBeTruthy(); expect(screen.getByText('Grid power only.')).toBeTruthy();
    expect(post.mock.calls[0][1]).toMatchObject({ daily_km: 60, budget_usd: 50000 });
  });
});
