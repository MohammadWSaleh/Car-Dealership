import { describe, it, expect, beforeAll, afterEach } from 'vitest';
// UNIT TESTS: helpers (util.js), clock, formats.
const u = require('../../src/util');
const clock = require('../../src/clock');

describe('util: validation helpers', () => {
  it('isEmail accepts normal and rejects malformed addresses', () => {
    for (const ok of ['a@b.co', 'karim.s@fsm.lb']) expect(u.isEmail(ok)).toBe(true);
    for (const bad of ['', 'a@b', '@b.co', 'a b@c.de', null, 42]) expect(u.isEmail(bad)).toBe(false);
  });
  it('normPhone strips spaces and punctuation but keeps the plus', () => { expect(u.normPhone('+961 (3) 123-456')).toBe('+9613123456'); expect(u.normPhone('')).toBe(''); expect(u.normPhone(null)).toBe(''); });
  it('required lists every missing field', () => { try { u.required({ a: 1, b: '' }, ['a', 'b', 'c']); throw new Error('no'); } catch (e) { expect(e.status).toBe(400); expect(e.extra.fields).toEqual(['b', 'c']); } });
  it('required accepts 0 and false', () => expect(() => u.required({ a: 0, b: false }, ['a', 'b'])).not.toThrow());
  it('round2 rounds half up to cents', () => { expect(u.round2(1.005)).toBe(1.01); expect(u.round2(2.345)).toBe(2.35); expect(u.round2(-0.004)).toBe(-0); });
  it('randomCode has the requested length and avoids look-alike characters', () => { for (let i = 0; i < 200; i++) expect(u.randomCode(8)).toMatch(/^[A-HJKMNP-Z2-9]{8}$/); });
  it('randomCode values are not repeated in 1000 draws', () => expect(new Set(Array.from({ length: 1000 }, () => u.randomCode(8))).size).toBe(1000));
  it('HttpError helpers carry status and code', () => { expect(u.forbidden().status).toBe(403); expect(u.notFound('Car').message).toBe('Car not found'); expect(u.conflict('x', 'y').status).toBe(409); expect(u.bad('c', 'm').code).toBe('c'); });
  it('parseJson falls back on invalid input', () => { expect(u.parseJson('{"a":1}', null)).toEqual({ a: 1 }); expect(u.parseJson('{bad', [])).toEqual([]); });
});
describe('NFR-LOC-01 formats', () => {
  it('dates are dd/mm/yyyy', () => { expect(u.dmy('2026-03-07T10:00:00')).toBe('07/03/2026'); expect(u.dmy('2026-12-20 09:30')).toBe('20/12/2026'); expect(u.dmy('nonsense')).toBe('nonsense'); });
  it('USD has symbol, thousands separator and two decimals', () => expect(u.usd(34900)).toBe('$34,900.00'));
  it('LBP is rounded to whole pounds with separators', () => expect(u.lbpFmt(3123550000.4)).toBe('LBP 3,123,550,000'));
  it('slot strings round-trip', () => { const d = u.parseSlot('2026-12-20 09:30'); expect(u.slotStr(d)).toBe('2026-12-20 09:30'); expect(u.parseSlot('2026-12-20')).toBeNull(); expect(u.parseSlot('x')).toBeNull(); });
  it('ymd and pad', () => { expect(u.ymd(new Date(2026, 0, 5))).toBe('2026-01-05'); expect(u.pad(7, 3)).toBe('007'); });
});
describe('injectable clock', () => {
  afterEach(() => clock.set(null));
  it('returns the real time by default', () => expect(Math.abs(clock.now() - Date.now())).toBeLessThan(1000));
  it('can be fixed to a date and released', () => { clock.set('2027-01-01T00:00:00Z'); expect(clock.iso()).toBe('2027-01-01T00:00:00.000Z'); clock.set(null); expect(clock.now().getFullYear()).toBeGreaterThanOrEqual(2026); });
});
