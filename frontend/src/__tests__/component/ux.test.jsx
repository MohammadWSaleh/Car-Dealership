// COMPONENT TESTS: UX enhancements (gallery and colour swatches, deal board, next-step banner).
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';
import i18n from '../../i18n/index.js';
import Gallery from '../../components/Gallery.jsx';
import { Board, NextStep } from '../../staff/Deals.jsx';
import { Attention } from '../../staff/Dashboard.jsx';
import { NextStepCard } from '../../pages/Account.jsx';
import { Table } from '../../components/ui.jsx';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const wrap = (ui) => render(<I18nextProvider i18n={i18n}><MemoryRouter>{ui}</MemoryRouter></I18nextProvider>);
const trim = { id: 1, brand: 'Kia', model: 'Sportage', name: 'GT', body_type: 'suv', fuel_type: 'petrol', colors: ['White', 'Red'], images: [] };

describe('Gallery', () => {
  it('has one swatch per colour and switches the chosen colour', () => {
    wrap(<Gallery trim={trim} />);
    const sw = screen.getAllByRole('radio'); expect(sw).toHaveLength(2); expect(sw[0].getAttribute('aria-checked')).toBe('true');
    fireEvent.click(sw[1]); expect(sw[1].getAttribute('aria-checked')).toBe('true'); expect(sw[0].getAttribute('aria-checked')).toBe('false');
  });
  it('shows the photo tagged with the chosen colour', () => {
    const t = { ...trim, images: [{ id: 5, color: 'White', url: '/p/white.png' }, { id: 6, color: 'Red', url: '/p/red.png' }] };
    wrap(<Gallery trim={t} />); expect(document.querySelector('img.object-cover').getAttribute('src')).toBe('/p/white.png');
    fireEvent.click(screen.getAllByRole('radio')[1]); expect(document.querySelector('img.object-cover').getAttribute('src')).toBe('/p/red.png');
  });
});
describe('Board', () => {
  const rows = [{ id: 1, stage: 'lead', contact_name: 'Ana', car_label: 'Kia', updated_at: '2026-01-01 10:00' }, { id: 2, stage: 'reserved', contact_name: 'Ben', car_label: 'BYD', total_usd: 100, balance_usd: 60, updated_at: '2026-01-01 10:00' }, { id: 3, stage: 'lost', contact_name: 'Cy', car_label: 'MG', updated_at: '2026-01-01 10:00' }];
  it('puts every deal in the column of its stage, hides lost deals, and opens a deal on click', () => {
    const open = vi.fn(); wrap(<Board rows={rows} onOpen={open} />);
    expect(document.querySelectorAll('[data-testid=board] section')).toHaveLength(6);
    expect(screen.getByText('Ana')).toBeTruthy(); expect(screen.queryByText('Cy')).toBeNull(); expect(screen.getByText(/1 lost deal/)).toBeTruthy();
    fireEvent.click(screen.getByText('Ben')); expect(open).toHaveBeenCalledWith(2);
  });
});
describe('NextStep', () => {
  const base = { role: 'sales_consultant', canSell: true, canPay: true, onQuote: vi.fn(), onPay: vi.fn(), onContract: vi.fn() };
  it('guides a consultant through the flow', () => {
    const onQuote = vi.fn(); const { unmount } = wrap(<NextStep {...base} onQuote={onQuote} d={{ id: 1, stage: 'lead' }} />);
    fireEvent.click(screen.getByRole('button')); expect(onQuote).toHaveBeenCalled(); unmount();
    const onContract = vi.fn(); const r2 = wrap(<NextStep {...base} onContract={onContract} d={{ id: 1, stage: 'reserved', contract: null }} />);
    expect(screen.getByText(/Create the purchase contract/)).toBeTruthy(); fireEvent.click(screen.getByRole('button')); expect(onContract).toHaveBeenCalled(); r2.unmount();
    wrap(<NextStep {...base} d={{ id: 1, stage: 'contract_signed', financials: { balance_usd: 500 } }} />); expect(screen.getByText(/Balance: \$500/)).toBeTruthy();
  });
  it('asks for a new quotation when the old one expired, and offers no action when the deal is finished', () => {
    const { unmount } = wrap(<NextStep {...base} d={{ id: 1, stage: 'quoted', quotation: { expired: true } }} />); expect(screen.getByText(/expired/)).toBeTruthy(); unmount();
    wrap(<NextStep {...base} d={{ id: 1, stage: 'delivered' }} />); expect(screen.queryByRole('button')).toBeNull(); expect(screen.getByText(/delivered/)).toBeTruthy();
  });
  it('sends the delivery coordinator to the delivery page', () => {
    wrap(<NextStep role="delivery_coordinator" canSell={false} canPay={false} d={{ id: 9, stage: 'paid' }} />); expect(screen.getByRole('link').getAttribute('href')).toBe('/staff/delivery/9');
  });
});

describe('Table (sort, search, empty)', () => {
  const rows = Array.from({ length: 10 }, (_, i) => ({ n: `Car ${String.fromCharCode(74 - i)}`, p: (i + 1) * 100 }));
  const cols = [{ label: 'Name', render: (r) => r.n }, { label: 'Price', render: (r) => r.p }];
  it('sorts by clicking a header and filters with the search box', () => {
    wrap(<Table rows={rows} cols={cols} />);
    const first = () => document.querySelector('tbody tr td').textContent;
    fireEvent.click(screen.getByRole('button', { name: /Name/ })); expect(first()).toBe('Car A');
    fireEvent.click(screen.getByRole('button', { name: /Name/ })); expect(first()).toBe('Car J');
    fireEvent.change(document.querySelector('input[type=search]'), { target: { value: 'car c' } });
    expect(document.querySelectorAll('tbody tr')).toHaveLength(1);
  });
  it('shows a friendly empty message', () => { wrap(<Table rows={[]} cols={cols} />); expect(screen.getByText('None')).toBeTruthy(); });
});
describe('Attention panel', () => {
  it('lists what needs the consultant, most urgent first, with links', () => {
    wrap(<Attention items={[{ type: 'quote_expiring', deal_id: 4, name: 'Ana', days: 1 }, { type: 'follow_up', deal_id: 5, name: 'Ben' }]} />);
    const links = screen.getAllByRole('link'); expect(links).toHaveLength(2); expect(links[0].getAttribute('href')).toBe('/staff/deals/4');
  });
  it('says all is clear when there is nothing to do', () => { wrap(<Attention items={[]} />); expect(screen.getByTestId('attention').textContent).toMatch(/✓/); });
});
describe('Customer next-step card', () => {
  const qc = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
  it('asks the customer to sign when a contract is waiting, and opens the chat from the contact button', async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ stage: 'reserved', steps: [{ key: 'reserved', done: true }, { key: 'contract_signed', done: false }], delivery_slot: null }), text: async () => '' }));
    const o = { orders: [{ id: 3, car: 'BYD Seal', stage: 'reserved' }], contracts: [{ id: 1, deal_id: 3, status: 'pending_signature' }] };
    render(<I18nextProvider i18n={i18n}><QueryClientProvider client={qc()}><MemoryRouter><NextStepCard o={o} /></MemoryRouter></QueryClientProvider></I18nextProvider>);
    expect(screen.getByText(/BYD Seal/)).toBeTruthy(); expect(screen.getByText(/sign your contract/i)).toBeTruthy();
    const heard = vi.fn(); window.addEventListener('fsm:open-chat', heard); fireEvent.click(screen.getByRole('button', { name: /Contact us/ })); expect(heard).toHaveBeenCalled();
    expect(await screen.findByRole('progressbar')).toBeTruthy();
  });
  it('shows nothing when there is no open order', () => {
    const { container } = render(<I18nextProvider i18n={i18n}><QueryClientProvider client={qc()}><MemoryRouter><NextStepCard o={{ orders: [], contracts: [] }} /></MemoryRouter></QueryClientProvider></I18nextProvider>);
    expect(container.textContent).toBe('');
  });
});
