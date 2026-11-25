import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from '../../i18n/index.js';
import en from '../../i18n/en.js';
import ar from '../../i18n/ar.js';
import { dmy, usd } from '../../utils.js';
import { StatusBadge } from '../../components/ui.jsx';

const flat = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (typeof v === 'object' ? flat(v, `${p}${k}.`) : [`${p}${k}`]));
describe('NFR-LOC-01 formats', () => {
  it('shows dates as dd/mm/yyyy', () => expect(dmy('2026-03-07T10:00:00Z')).toMatch(/^07\/03\/2026$/));
  it('shows prices in USD', () => expect(usd(34900)).toContain('34,900'));
});
describe('FR-ACC-05 languages', () => {
  it('Arabic covers every English key', () => expect(flat(en).filter((k) => !flat(ar).includes(k))).toEqual([]));
  it('switching to Arabic sets right-to-left direction', async () => { await i18n.changeLanguage('ar'); expect(document.documentElement.dir).toBe('rtl'); await i18n.changeLanguage('en'); expect(document.documentElement.dir).toBe('ltr'); });
  it('status badges are translated', async () => {
    await i18n.changeLanguage('ar'); render(<I18nextProvider i18n={i18n}><StatusBadge value="paid" /></I18nextProvider>);
    expect(screen.getByText(ar.status.paid)).toBeTruthy(); await i18n.changeLanguage('en');
  });
});
