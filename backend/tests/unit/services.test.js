import { describe, it, expect, beforeAll, afterEach } from 'vitest';
// UNIT TESTS: settings validation, auth service, notification templates, document encryption, PDF builders.
const Database = require('better-sqlite3');
const crypto = require('crypto');
const { makeApp } = require('../helpers');
const settingsService = require('../../src/services/settings');
const notifyService = require('../../src/services/notify');
const pdf = require('../../src/services/pdf');
const clock = require('../../src/clock');

let t; beforeAll(() => { t = makeApp(); });

describe('NFR-MNT-01 settings validation', () => {
  it('accepts valid changes and rejects out-of-range values', () => {
    const s = t.ctx.settings;
    expect(s.setMany({ vat_rate: '11' }, null).vat_rate).toBe('11');
    for (const bad of [{ vat_rate: '-1' }, { vat_rate: '101' }, { vat_rate: 'abc' }, { exchange_rate: '0' }, { open_time: '25:00' }, { slot_minutes: '4' }, { slot_minutes: '241' }, { open_days: '0,8' }, { delivery_slots: '10:00,xx' }]) expect(() => s.setMany(bad, null), JSON.stringify(bad)).toThrow();
  });
  it('rejects unknown keys', () => expect(() => t.ctx.settings.setMany({ nope: 1 }, null)).toThrow(/Unknown setting/));
  it('a failed batch changes nothing (all-or-nothing)', () => { const before = t.ctx.settings.get('vat_rate'); expect(() => t.ctx.settings.setMany({ vat_rate: '12', open_time: 'bad' }, null)).toThrow(); expect(t.ctx.settings.get('vat_rate')).toBe(before); });
  it('exchange rate changes are written to the history', () => { const n = t.ctx.db.prepare('SELECT COUNT(*) c FROM exchange_rate_history').get().c; t.ctx.settings.setMany({ exchange_rate: '90000' }, null); expect(t.ctx.db.prepare('SELECT COUNT(*) c FROM exchange_rate_history').get().c).toBe(n + 1); expect(t.ctx.settings.lbp(10)).toBe(900000); t.ctx.settings.setMany({ exchange_rate: '89500' }, null); });
  it('defaults are created on an empty database', () => { const db = new Database(':memory:'); db.exec('CREATE TABLE settings(key TEXT PRIMARY KEY, value TEXT, updated_at TEXT, updated_by INTEGER); CREATE TABLE exchange_rate_history(id INTEGER PRIMARY KEY, rate REAL, changed_at TEXT, changed_by INTEGER);'); const s = settingsService(db); s.ensureDefaults(); expect(s.get('vat_rate')).toBe('11'); expect(s.num('exchange_rate')).toBe(89500); });
});

describe('NFR-SEC-02/03 auth service', () => {
  it('passwords are salted bcrypt hashes, never the plain text', () => { const a = t.ctx.auth.hash('Secret123!'); const b = t.ctx.auth.hash('Secret123!'); expect(a).not.toContain('Secret'); expect(a).not.toBe(b); expect(t.ctx.auth.verify('Secret123!', a)).toBe(true); expect(t.ctx.auth.verify('secret123!', a)).toBe(false); });
  it('staff tokens last 15 minutes and customer tokens 8 hours', () => {
    const jwt = require('jsonwebtoken'); const dur = (role) => { const p = jwt.decode(t.ctx.auth.sign({ id: 1, role })); return p.exp - p.iat; };
    expect(dur('sales_consultant')).toBe(15 * 60); expect(dur('administrator')).toBe(15 * 60); expect(dur('customer')).toBe(8 * 3600);
  });
  it('isStaff separates customers from employees', () => { expect(t.ctx.auth.isStaff('customer')).toBe(false); expect(t.ctx.auth.isStaff('accountant')).toBe(true); });
  it('publicUser never exposes the password hash', () => { const u = t.ctx.db.prepare("SELECT * FROM users WHERE email = 'customer@fsm.lb'").get(); expect(Object.keys(t.ctx.auth.publicUser(u))).not.toContain('password_hash'); });
});

describe('FR-NOT-01/02 notification templates', () => {
  const params = { car: 'Kia EV6', slot: '20/12/2026 10:00', code: 'ABC123', number: 'Q-1', total: 100, valid_until: '27/12/2026', amount: 100, currency: 'USD', method: 'cash', amount_usd: 100, reason: 'r', card: 'FSM-1', balance: 5, title: 'Spring event', description: 'Details', type: 'export', due: '20/12/2026', message: 'Low stock', name: 'Karim', source: 'web_form', status: 'approved', stage: 'your car is reserved', stage_ar: 'تم حجز سيارتك', eta: '20/12/2026', offer: 9000, vehicle: 'Honda Civic 2021' };
  it('every template renders in English and Arabic with no missing values', () => {
    const n = notifyService({ db: t.ctx.db });
    for (const tpl of n.templates) for (const language of ['en', 'ar']) {
      const row = n.send({ to: { email: 'x@y.lb', language, consent_marketing: 1 }, template: tpl, params, kind: tpl === 'owner_event' ? 'marketing' : 'transactional' });
      expect(row, `${tpl}/${language}`).toBeTruthy(); expect(row.body).not.toMatch(/undefined|NaN|\[object/); expect(row.subject.length).toBeGreaterThan(2); expect(row.language).toBe(language);
    }
    expect(n.templates.length).toBeGreaterThanOrEqual(15);
  });
  it('Arabic messages contain Arabic script', () => { const r = notifyService({ db: t.ctx.db }).send({ to: { email: 'x@y.lb', language: 'ar' }, template: 'booking_confirmation', params }); expect(r.body).toMatch(/[؀-ۿ]/); });
  it('marketing without consent is not sent; transactional is', () => {
    const n = notifyService({ db: t.ctx.db });
    expect(n.send({ to: { email: 'x@y.lb', consent_marketing: 0 }, template: 'owner_event', params, kind: 'marketing' })).toBeNull();
    expect(n.send({ to: { email: 'x@y.lb', consent_marketing: 0 }, template: 'receipt', params })).toBeTruthy();
  });
  it('chooses WhatsApp only when preferred and a phone exists; falls back to email', () => {
    const n = notifyService({ db: t.ctx.db });
    expect(n.send({ to: { email: 'a@b.lb', phone: '+9613', notify_pref: 'whatsapp' }, template: 'receipt', params }).channel).toBe('whatsapp');
    expect(n.send({ to: { email: 'a@b.lb', notify_pref: 'whatsapp' }, template: 'receipt', params }).channel).toBe('email');
    expect(n.send({ to: { phone: '+9613' }, template: 'receipt', params }).channel).toBe('whatsapp');
  });
  it('no recipient address means nothing is queued', () => expect(notifyService({ db: t.ctx.db }).send({ to: {}, template: 'receipt', params })).toBeNull());
  it('unknown templates fail loudly', () => expect(() => notifyService({ db: t.ctx.db }).send({ to: { email: 'a@b.lb' }, template: 'nope' })).toThrow());
});

describe('NFR-SEC-04 document encryption', () => {
  it('stored files are encrypted, round-trip, and tampering is detected', () => {
    const fs = require('fs'); const path = require('path'); const user = t.ctx.db.prepare("SELECT * FROM users WHERE email = 'customer@fsm.lb'").get();
    const doc = t.ctx.docs.store({ buffer: t.PDF, originalname: 'l.pdf' }, { kind: 'identity', ownerUserId: user.id });
    const row = t.ctx.db.prepare('SELECT * FROM documents WHERE id = ?').get(doc.id); const file = path.join(t.ctx.config.uploadDir, row.path);
    const blob = fs.readFileSync(file); expect(blob.includes(Buffer.from('%PDF'))).toBe(false);
    expect(t.ctx.docs.read(user, doc.id).buffer.equals(t.PDF)).toBe(true);
    blob[blob.length - 1] ^= 0xff; fs.writeFileSync(file, blob); expect(() => t.ctx.docs.read(user, doc.id)).toThrow();
  });
  it('only PDF, PNG and JPEG content is accepted, whatever the file name says', () => {
    const user = t.ctx.db.prepare("SELECT * FROM users WHERE email = 'customer@fsm.lb'").get();
    expect(() => t.ctx.docs.store({ buffer: Buffer.from('MZ\x90\x00 exe'), originalname: 'nice.pdf' }, { kind: 'identity', ownerUserId: user.id })).toThrow(/PDF, PNG or JPEG/);
    expect(() => t.ctx.docs.store({ buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]), originalname: 'a.png' }, { kind: 'identity', ownerUserId: user.id })).not.toThrow();
    expect(() => t.ctx.docs.store({ buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0]), originalname: 'a.jpg' }, { kind: 'identity', ownerUserId: user.id })).not.toThrow();
    expect(() => t.ctx.docs.store(null, { kind: 'identity' })).toThrow(/required/);
  });
  it('another customer cannot read the document', () => {
    const o = t.ctx.db.prepare("SELECT * FROM users WHERE email = 'customer@fsm.lb'").get(); const other = t.ctx.db.prepare("SELECT * FROM users WHERE email = 'customer2@fsm.lb'").get();
    const doc = t.ctx.docs.store({ buffer: t.PDF, originalname: 'l.pdf' }, { kind: 'identity', ownerUserId: o.id });
    expect(() => t.ctx.docs.read(other, doc.id)).toThrow(/access/);
  });
});

describe('FR-PAY-03 / FR-DEAL-05 / FR-DEL-05 PDF documents', () => {
  it('receipt PDF is a real PDF', async () => {
    const buf = await pdf.receiptPdf({ payment: { receipt_number: 'R-1', kind: 'deposit', amount: 1000, currency: 'USD', amount_usd: 1000, exchange_rate: 89500, method: 'cash', created_at: clock.iso() }, deal: { contact_name: 'Karim', id: 1 }, car_name: 'Kia EV6', staff_name: 'Layla', balance_usd: 5000 });
    expect(buf.slice(0, 5).toString()).toBe('%PDF-'); expect(buf.length).toBeGreaterThan(1000);
  });
});
