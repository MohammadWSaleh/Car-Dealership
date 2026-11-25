// COMPONENT TESTS for the demo features: charts, QR pass, check-in, order tracker.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nextProvider } from 'react-i18next';
import i18n from '../../i18n/index.js';
import { ToastProvider } from '../../components/ui.jsx';
import { CheckIn, LineChart, QrPass, Tracker } from '../../components/Features.jsx';
import { api } from '../../api.js';

const wrap = (ui) => render(<I18nextProvider i18n={i18n}><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><ToastProvider>{ui}</ToastProvider></MemoryRouter></QueryClientProvider></I18nextProvider>);
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('F2/F3 LineChart', () => {
  it('draws one path per series and an accessible label', () => {
    const { container } = render(<LineChart label="Cost" labels={['Y0', 'Y1', 'Y2']} series={[{ name: 'a', color: '#fff', values: [10, 20, 30] }, { name: 'b', color: '#000', dashed: true, values: [30, 35, 40] }]} />);
    expect(screen.getByRole('img', { name: 'Cost' })).toBeTruthy(); expect(container.querySelectorAll('path').length).toBe(2);
  });
  it('a single price point shows a dot and no line', () => {
    const { container } = render(<LineChart label="Price" labels={['today']} series={[{ name: 'p', color: '#fff', values: [30000] }]} />);
    expect(container.querySelectorAll('path').length).toBe(0); expect(container.querySelectorAll('circle').length).toBe(1);
  });
});
describe('F5 QR pass', () => {
  it('shows the booking code and a QR image', async () => {
    wrap(<QrPass code="ABC123" />); expect(screen.getByText('ABC123')).toBeTruthy();
    await waitFor(() => expect(screen.getByRole('img').getAttribute('src')).toMatch(/^data:image\/png/));
  });
});
describe('F5 staff check-in', () => {
  it('sends the typed code and confirms the customer', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ already_checked_in: false, booking: { name: 'Karim' } });
    wrap(<CheckIn />); fireEvent.change(screen.getByLabelText('Booking code'), { target: { value: 'abc123' } }); fireEvent.click(screen.getByText('Check in'));
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/Karim is checked in/));
    expect(post).toHaveBeenCalledWith('/testdrives/check-in', { code: 'ABC123' });
  });
  it('says so when the customer was already checked in', async () => {
    vi.spyOn(api, 'post').mockResolvedValue({ already_checked_in: true, booking: { name: 'Karim' } });
    wrap(<CheckIn />); fireEvent.change(screen.getByLabelText('Booking code'), { target: { value: 'X1' } }); fireEvent.click(screen.getByText('Check in'));
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/already checked in/));
  });
});
describe('F6 order tracker', () => {
  const steps = ['lead', 'quoted', 'reserved', 'contract_signed', 'paid', 'ready', 'delivered'].map((key, i) => ({ key, done: i < 4, current: i === 4, at: i < 4 ? '2026-03-01 10:00' : null }));
  it('shows the estimated date, the current step and the delivery-day lists', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ deal_id: 1, stage: 'paid', lost: false, steps, eta: { date: '2026-03-20', basis: 'in_stock' }, booking: null, readiness: { inspection: { passed: 1, total: 3 }, documents: { ready: 3, total: 3 } } });
    const { container } = wrap(<Tracker dealId={1} />);
    await waitFor(() => expect(screen.getByText('20/03/2026')).toBeTruthy());
    expect(container.querySelector('[aria-current="step"]').textContent).toMatch(/Paid/);
    expect(screen.getByText(/Inspection 1\/3/)).toBeTruthy(); expect(screen.getByText(/Proof of payment/)).toBeTruthy();
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBeTruthy();
  });
  it('shows nothing for a lost deal', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ deal_id: 2, stage: 'lost', lost: true, steps: [], eta: null, booking: null, readiness: { inspection: { passed: 0, total: 0 }, documents: { ready: 0, total: 0 } } });
    const { container } = wrap(<Tracker dealId={2} />); await waitFor(() => expect(container.querySelector('[role="progressbar"]')).toBeNull());
  });
});
