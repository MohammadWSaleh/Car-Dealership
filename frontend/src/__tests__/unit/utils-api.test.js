// UNIT TESTS: formatting helpers and the API client (fetch is stubbed).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n/index.js';
import { cx, dmy, errMsg, isStaff, lbp, num, usd, usd2, ymd } from '../../utils.js';
import { ApiError, api, getToken, setToken, setUnauthorizedHandler } from '../../api.js';

describe('NFR-LOC-01 formatting', () => {
  it('USD whole dollars and cents', () => { expect(usd(34900)).toBe('$34,900'); expect(usd2(1234.5)).toBe('$1,234.50'); expect(usd(null)).toBe('-'); });
  it('LBP is rounded and labelled', () => expect(lbp(3123550000.4)).toBe('3,123,550,000 LBP'));
  it('Arabic locale changes digit grouping, English restores it', async () => { await i18n.changeLanguage('ar'); expect(num(1234567)).not.toBe('1,234,567'); await i18n.changeLanguage('en'); expect(num(1234567)).toBe('1,234,567'); });
  it('dates are dd/mm/yyyy, with optional time', () => { expect(dmy('2026-12-20 09:30')).toBe('20/12/2026'); expect(dmy('2026-12-20 09:30', true)).toBe('20/12/2026 09:30'); expect(dmy(null)).toBe('-'); expect(dmy('bad')).toBe('bad'); });
  it('ymd pads month and day', () => expect(ymd(new Date(2026, 0, 5))).toBe('2026-01-05'));
});
describe('small helpers', () => {
  it('cx drops falsy classes', () => expect(cx('a', false, null, 'b')).toBe('a b'));
  it('isStaff is true for employees only', () => { expect(isStaff({ role: 'customer' })).toBe(false); expect(isStaff(null)).toBe(false); for (const r of ['sales_consultant', 'sales_manager', 'general_manager', 'accountant', 'delivery_coordinator', 'administrator']) expect(isStaff({ role: r })).toBe(true); });
  it('errMsg has a safe fallback', () => { expect(errMsg(new Error('x'))).toBe('x'); expect(errMsg(null)).toBe('Something went wrong. Please try again.'); });
  it('errMsg turns known error codes into friendly text, in both languages', async () => { const i18n = (await import('../../i18n/index.js')).default; const e = { code: 'slot_taken', message: 'Slot taken' }; await i18n.changeLanguage('en'); expect(errMsg(e)).toMatch(/booked by someone else/); expect(errMsg({ status: 0 })).toMatch(/Cannot reach the server/); await i18n.changeLanguage('ar'); expect(errMsg(e)).not.toBe('Slot taken'); await i18n.changeLanguage('en'); });
  it('Arabic digits option converts numbers only when reading Arabic', async () => { const i18n = (await import('../../i18n/index.js')).default; const { dmy: d2 } = await import('../../utils.js'); localStorage.setItem('fsm_digits', 'ar'); await i18n.changeLanguage('en'); expect(d2('2026-01-05')).toBe('05/01/2026'); await i18n.changeLanguage('ar'); expect(d2('2026-01-05')).toBe('٠٥/٠١/٢٠٢٦'); localStorage.removeItem('fsm_digits'); expect(d2('2026-01-05')).toBe('05/01/2026'); await i18n.changeLanguage('en'); });
});
describe('API client', () => {
  const reply = (status, body, headers = {}) => ({ ok: status < 400, status, headers: { get: (k) => ({ 'content-type': 'application/json', ...headers })[k] ?? null }, json: async () => body, text: async () => JSON.stringify(body) });
  beforeEach(() => { localStorage.clear(); });
  afterEach(() => vi.unstubAllGlobals());
  it('sends the bearer token and JSON body', async () => {
    setToken('abc'); const f = vi.fn().mockResolvedValue(reply(200, { ok: 1 })); vi.stubGlobal('fetch', f);
    await api.post('/x', { a: 1 }); const [url, opt] = f.mock.calls[0];
    expect(url).toBe('/api/x'); expect(opt.headers.Authorization).toBe('Bearer abc'); expect(opt.body).toBe('{"a":1}'); expect(opt.method).toBe('POST');
  });
  it('NFR-SEC-03 stores the renewed staff token from X-Refresh-Token', async () => {
    setToken('old'); vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(200, {}, { 'X-Refresh-Token': 'new' }))); await api.get('/me'); expect(getToken()).toBe('new');
  });
  it('turns error responses into ApiError with code and message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(409, { error: { code: 'duplicate_vin', message: 'Exists' } })));
    await expect(api.get('/x')).rejects.toMatchObject({ status: 409, code: 'duplicate_vin', message: 'Exists' }); await expect(api.get('/x')).rejects.toBeInstanceOf(ApiError);
  });
  it('NFR-SEC-03 an expired session logs the user out', async () => {
    setToken('t'); const out = vi.fn(); setUnauthorizedHandler(out); vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(401, { error: { code: 'session_expired', message: 'x' } })));
    await expect(api.get('/me')).rejects.toBeTruthy(); expect(out).toHaveBeenCalled();
  });
  it('a wrong password (401 without a session) does not trigger logout', async () => {
    const out = vi.fn(); setUnauthorizedHandler(out); vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(401, { error: { code: 'invalid_credentials', message: 'x' } })));
    await expect(api.post('/auth/login', {})).rejects.toBeTruthy(); expect(out).not.toHaveBeenCalled();
  });
  it('uploads use multipart form data and skip empty fields', async () => {
    const f = vi.fn().mockResolvedValue(reply(200, {})); vi.stubGlobal('fetch', f); await api.upload('/u', new File(['x'], 'a.pdf'), { keys: 2, notes: undefined });
    const body = f.mock.calls[0][1].body; expect(body instanceof FormData).toBe(true); expect(body.get('keys')).toBe('2'); expect(body.has('notes')).toBe(false); expect(body.get('file').name).toBe('a.pdf');
  });
});
