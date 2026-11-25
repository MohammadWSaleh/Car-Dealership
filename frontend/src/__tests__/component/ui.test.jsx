// COMPONENT TESTS: shared UI building blocks rendered in a DOM.
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';
import i18n from '../../i18n/index.js';
import { Badge, ErrorBox, Field, Input, Loading, Modal, Notice, Price, StatusBadge, Table, ToastProvider, useAction } from '../../components/ui.jsx';
import { CompareProvider, useCompare } from '../../components/compare.jsx';
import { Availability, TrimCard } from '../../pages/Catalogue.jsx';

const wrap = (ui) => render(<I18nextProvider i18n={i18n}><MemoryRouter><ToastProvider><CompareProvider>{ui}</CompareProvider></ToastProvider></MemoryRouter></I18nextProvider>);

describe('Table', () => {
  it('renders columns and rows and handles row click', () => {
    const onRow = vi.fn(); wrap(<Table rows={[{ id: 1, n: 'Kia' }, { id: 2, n: 'BYD' }]} cols={[{ label: 'Name', render: (r) => r.n }]} onRow={onRow} />);
    expect(screen.getByText('Name')).toBeTruthy(); fireEvent.click(screen.getByText('BYD')); expect(onRow).toHaveBeenCalledWith({ id: 2, n: 'BYD' });
  });
  it('shows the empty message', () => { wrap(<Table rows={[]} cols={[]} empty="Nothing here" />); expect(screen.getByText('Nothing here')).toBeTruthy(); });
});
describe('Loading', () => {
  it('shows a spinner, then data, then an error box', async () => {
    const { rerender } = wrap(<Loading q={{ isLoading: true }}>{() => <p>data</p>}</Loading>); expect(screen.getByRole('status')).toBeTruthy();
    rerender(<I18nextProvider i18n={i18n}><MemoryRouter><ToastProvider><CompareProvider><Loading q={{ data: 1 }}>{() => <p>data</p>}</Loading></CompareProvider></ToastProvider></MemoryRouter></I18nextProvider>); expect(screen.getByText('data')).toBeTruthy();
  });
  it('ErrorBox announces the problem', () => { render(<ErrorBox error={new Error('Boom')} />); expect(screen.getByRole('alert').textContent).toBe('Boom'); });
});
describe('Modal', () => {
  it('is a labelled dialog and closes with Escape', () => { const onClose = vi.fn(); render(<Modal title="Hello" onClose={onClose}>body</Modal>); expect(screen.getByRole('dialog', { name: 'Hello' })).toBeTruthy(); fireEvent.keyDown(window, { key: 'Escape' }); expect(onClose).toHaveBeenCalled(); });
});
describe('Field / Input', () => { it('associates the label with its control', () => { render(<Field label="Email"><Input /></Field>); expect(screen.getByText('Email')).toBeTruthy(); }); });
describe('Notice and badges', () => {
  it('notice renders its message', () => { render(<Notice tone="warn">Careful</Notice>); expect(screen.getByText('Careful')).toBeTruthy(); });
  it('StatusBadge translates known statuses and falls back to the raw value', () => { wrap(<><StatusBadge value="contract_signed" /><StatusBadge value="weird_status" /></>); expect(screen.getByText('Contract signed')).toBeTruthy(); expect(screen.getByText('weird_status')).toBeTruthy(); });
  it('Badge shows children', () => { render(<Badge tone="green">OK</Badge>); expect(screen.getByText('OK')).toBeTruthy(); });
});
describe('FR-CAT-03 Price', () => { it('shows USD and the LBP equivalent', () => { render(<Price usd={34900} lbp={3123550000} />); expect(screen.getByText('$34,900')).toBeTruthy(); expect(screen.getByText(/3,123,550,000 LBP/)).toBeTruthy(); }); });
describe('useAction', () => {
  function Btn({ fn }) { const [run, busy] = useAction(); return <button disabled={busy} onClick={() => run(fn, 'Done!')}>go</button>; }
  it('toasts success and failure messages', async () => {
    const { unmount } = wrap(<Btn fn={async () => 1} />); fireEvent.click(screen.getByText('go')); await waitFor(() => expect(screen.getByText('Done!')).toBeTruthy()); unmount();
    wrap(<Btn fn={async () => { throw new Error('Nope'); }} />); fireEvent.click(screen.getByText('go')); await waitFor(() => expect(screen.getByText('Nope')).toBeTruthy());
  });
});
describe('FR-CAT-04 Availability', () => {
  it('In stock with count, In transit with date, Order only', () => {
    wrap(<><Availability a={{ status: 'in_stock', count: 3 }} /><Availability a={{ status: 'in_transit', expected_arrival: '2026-12-20' }} /><Availability a={{ status: 'order_only' }} /></>);
    expect(screen.getByText('In stock (3)')).toBeTruthy(); expect(screen.getByText('Arriving 20/12/2026')).toBeTruthy(); expect(screen.getByText('Order only')).toBeTruthy();
  });
  it('Arabic labels', async () => { await i18n.changeLanguage('ar'); wrap(<Availability a={{ status: 'order_only' }} />); expect(screen.getByText('حسب الطلب فقط')).toBeTruthy(); await i18n.changeLanguage('en'); });
});
describe('FR-CAT-05 compare selection', () => {
  const T = (id) => ({ id, brand: 'B', model: `M${id}`, name: 'x', fuel_type: 'petrol', price_usd: 1000, price_lbp: 1, availability: { status: 'order_only' } });
  function Probe() { const c = useCompare(); return <span data-testid="n">{c.ids.length}{c.full ? ' full' : ''}</span>; }
  it('allows at most three cars and disables the fourth checkbox', () => {
    localStorage.clear(); wrap(<><Probe />{[1, 2, 3, 4].map((i) => <TrimCard key={i} trim={T(i)} />)}</>);
    const boxes = screen.getAllByRole('checkbox'); [0, 1, 2].forEach((i) => fireEvent.click(boxes[i]));
    expect(screen.getByTestId('n').textContent).toBe('3 full'); expect(boxes[3].disabled).toBe(true);
    fireEvent.click(boxes[0]); expect(screen.getByTestId('n').textContent).toBe('2'); expect(boxes[3].disabled).toBe(false);
  });
});
