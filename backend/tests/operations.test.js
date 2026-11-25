import { describe, it, expect, beforeAll } from 'vitest';
const fs = require('fs');
const path = require('path');
const { makeApp, staff, deal, at } = require('./helpers');
let t, S;
beforeAll(async () => { t = makeApp(); S = await staff(t); });
const D = (o) => deal(t, S, o);
const pad = (n) => String(n).padStart(2, '0');
const futureDay = (n) => { const d = new Date(); d.setDate(d.getDate() + n); while (d.getDay() === 0) d.setDate(d.getDate() + 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const pdfAttach = (req) => req.attach('file', t.PDF, { filename: 'f.pdf', contentType: 'application/pdf' });

describe('Inventory (FR-INV)', () => {
  it('FR-INV-01 one record per VIN with trim, colour and status; duplicates and bad VINs rejected', async () => {
    const trim = t.trimId('Kia', 'Sportage');
    const ok = await S.mgr.post('/inventory/cars', { vin: 'FSMUNTX0000000001', trim_id: trim, color: 'Blue', status: 'in_stock' }); expect(ok.status).toBe(201);
    expect((await S.mgr.post('/inventory/cars', { vin: 'FSMUNTX0000000001', trim_id: trim, status: 'in_stock' })).status).toBe(409);
    expect((await S.mgr.post('/inventory/cars', { vin: 'BAD', trim_id: trim, status: 'in_stock' })).status).toBe(400);
    expect((await S.mgr.post('/inventory/cars', { vin: 'FSMUNTX0000000002', trim_id: trim, status: 'in_transit' })).status).toBe(400); // arrival date needed
    expect((await S.c1.post('/inventory/cars', { vin: 'FSMUNTX0000000003', trim_id: trim, status: 'in_stock' })).status).toBe(403);
    const list = (await S.mgr.get('/inventory/cars?q=FSMUNTX0000000001')).body; expect(list.length).toBe(1);
  });
  it('FR-INV-02 CSV import of prices, stock and shipments; each rejected row reported with its reason', async () => {
    const csv = (txt) => Buffer.from(txt);
    const post = (type, txt) => t.api.post(`/api/inventory/import?type=${type}`).set('Authorization', `Bearer ${S.mgr.token || ''}`);
    const mgrTok = await t.login('manager@fsm.lb');
    const imp = (type, txt) => t.api.post(`/api/inventory/import?type=${type}`).set('Authorization', `Bearer ${mgrTok}`).attach('file', csv(txt), { filename: 'f.csv', contentType: 'text/csv' });
    const p = await imp('prices', 'brand,model,trim,price_usd\nToyota,Corolla,1.6 Comfort,25500\nToyota,Corolla,Nope,100\nKia,Sportage,2.0 GT-Line,abc\n');
    expect(p.status).toBe(200); expect(p.body.imported).toBe(1); expect(p.body.rejected.map((r) => r.reason).sort()).toEqual(['invalid_price', 'unknown_trim']); expect(p.body.rejected[0].row).toBeGreaterThan(1);
    expect(t.ctx.db.prepare("SELECT price_usd FROM trims WHERE name = '1.6 Comfort'").get().price_usd).toBe(25500);
    const s = await imp('stock', 'vin,brand,model,trim,color,status\nFSMCSV00000000001,Nissan,Sunny,1.6 SV,White,in_stock\nFSMCSV00000000001,Nissan,Sunny,1.6 SV,White,in_stock\nBAD,Nissan,Sunny,1.6 SV,White,in_stock\n');
    expect(s.body.imported).toBe(1); expect(s.body.rejected.map((r) => r.reason).sort()).toEqual(['duplicate_vin', 'invalid_vin']);
    const sh = await imp('shipments', 'vin,brand,model,trim,color,arrival_date\nFSMCSV00000000002,Nissan,Sunny,1.6 SV,White,2027-02-01\nFSMCSV00000000003,Nissan,Sunny,1.6 SV,White,tomorrow\n');
    expect(sh.body.imported).toBe(1); expect(sh.body.rejected[0].reason).toBe('invalid_arrival_date');
    expect((await imp('stock', 'vin,brand\nX,Y\n')).status).toBe(400); // missing columns
    expect((await t.api.post('/api/inventory/import?type=prices').set('Authorization', `Bearer ${await t.login('consultant1@fsm.lb')}`).attach('file', csv('a\n'), { filename: 'f.csv' })).status).toBe(403);
  });
  it('FR-INV-03 a deposit reserves the car exclusively; two simultaneous deposits for the last car: one wins', async () => {
    const nt = await S.mgr.post('/catalogue/trims', { brand: 'Race', model: 'Car', name: 'One', body_type: 'sedan', fuel_type: 'petrol', price_usd: 15000, specs: {}, colors: ['White'], description_en: 'x', description_ar: 'س' });
    await S.mgr.post('/inventory/cars', { vin: 'FSMRACE0000000001', trim_id: nt.body.id, color: 'White', status: 'in_stock' });
    const a = await D({ trim: nt.body.id, upTo: 'quoted', color: 'White' }); const b = await D({ trim: nt.body.id, upTo: 'quoted', color: 'White' });
    const rs = await Promise.all([a, b].map((x) => S.c1.post('/payments', { deal_id: x.id, kind: 'deposit', amount: 500, currency: 'USD', method: 'cash' })));
    // both deposits are accepted (the second waits for the next car) but the physical car belongs to one deal only
    const owners = t.ctx.db.prepare("SELECT COUNT(*) c FROM deals WHERE car_id = (SELECT id FROM cars WHERE vin = 'FSMRACE0000000001')").get().c;
    expect(owners).toBe(1);
    expect(rs.map((r) => r.status)).toEqual([201, 201]);
    expect(rs.filter((r) => r.body.car_allocated).length).toBe(1);
    expect(() => t.ctx.db.prepare("UPDATE deals SET car_id = (SELECT id FROM cars WHERE vin = 'FSMRACE0000000001') WHERE id IN (?, ?)").run(a.id, b.id)).toThrow(); // unique index
  });
  it('FR-INV-03 explicit car choice refuses a car that is already reserved', async () => {
    const trim = t.trimId('Nissan', 'Sunny'); const cars = t.ctx.db.prepare("SELECT id FROM cars WHERE trim_id = ? AND status = 'in_stock' AND is_demo = 0 ORDER BY id").all(trim);
    const a = await D({ trim, upTo: 'quoted' }); const b = await D({ trim, upTo: 'quoted' });
    expect((await S.c1.post('/payments', { deal_id: a.id, kind: 'deposit', amount: 300, currency: 'USD', method: 'cash', car_id: cars[0].id })).status).toBe(201);
    const r = await S.c1.post('/payments', { deal_id: b.id, kind: 'deposit', amount: 300, currency: 'USD', method: 'cash', car_id: cars[0].id });
    expect(r.status).toBe(409); expect(r.body.error.code).toBe('car_already_reserved');
  });
  it('FR-INV-04 deposit on an in-transit car waits; the first matching car on arrival is allocated (first deposit first)', async () => {
    const nt = await S.mgr.post('/catalogue/trims', { brand: 'Wait', model: 'Car', name: 'One', body_type: 'suv', fuel_type: 'petrol', price_usd: 22000, specs: {}, colors: ['White'], description_en: 'x', description_ar: 'س' });
    const car = (await S.mgr.post('/inventory/cars', { vin: 'FSMWTNG0000000001', trim_id: nt.body.id, color: 'White', status: 'in_transit', arrival_date: '2027-03-01' })).body;
    const a = await D({ trim: nt.body.id, upTo: 'reserved', color: 'White', email: 'w1@example.com' }); const b = await D({ trim: nt.body.id, upTo: 'reserved', color: 'White', email: 'w2@example.com' });
    expect((await S.mgr.get(`/deals/${a.id}`)).body.waiting_for_car).toBe(true);
    expect((await S.mgr.get('/inventory/waiting')).body.length).toBeGreaterThanOrEqual(2);
    expect((await S.mgr.post(`/inventory/cars/${car.id}/arrive`)).body.status).toBe('reserved');
    expect((await S.mgr.get(`/deals/${a.id}`)).body.car).toBeTruthy(); expect((await S.mgr.get(`/deals/${b.id}`)).body.waiting_for_car).toBe(true);
    expect((await S.mgr.post(`/inventory/cars/${car.id}/arrive`)).status).toBe(409);
  });
  it('FR-INV-05 marking a deal Lost releases its car back to stock', async () => {
    const x = await D({ upTo: 'reserved' }); const carId = t.ctx.db.prepare('SELECT car_id FROM deals WHERE id = ?').get(x.id).car_id;
    expect(t.ctx.db.prepare('SELECT status FROM cars WHERE id = ?').get(carId).status).toBe('reserved');
    expect((await S.mgr.post(`/deals/${x.id}/lost`, { reason: 'Changed mind' })).status).toBe(200);
    expect(t.ctx.db.prepare('SELECT status FROM cars WHERE id = ?').get(carId).status).toBe('in_stock');
  });
  it('FR-INV-06 alerts for low stock and cars unsold too long; notification sent to the Sales Manager; thresholds are settings', async () => {
    const a = (await S.mgr.get('/inventory/alerts')).body; expect(a.low_stock.length).toBeGreaterThan(0); expect(a.unsold_too_long.length).toBeGreaterThan(0);
    await S.admin.put('/admin/settings', { stock_threshold: 100, unsold_days: 400 });
    const b = (await S.mgr.get('/inventory/alerts')).body; expect(b.low_stock.length).toBeGreaterThanOrEqual(15); expect(b.unsold_too_long.length).toBe(0);
    const before = t.ctx.db.prepare("SELECT COUNT(*) c FROM outbox WHERE template = 'stock_alert'").get().c;
    t.ctx.jobs.stockAlerts(); expect(t.ctx.db.prepare("SELECT COUNT(*) c FROM outbox WHERE template = 'stock_alert'").get().c).toBeGreaterThan(before);
    await S.admin.put('/admin/settings', { stock_threshold: 2, unsold_days: 90 });
    expect((await S.c1.get('/inventory/alerts')).status).toBe(403);
  });
});

describe('Delivery (FR-DEL)', () => {
  const passAll = async (id) => { for (const k of ['exterior', 'interior', 'mechanical', 'tires', 'electronics', 'keys_manuals']) await S.del.put(`/delivery/deals/${id}/inspection/${k}`, { passed: true }); };
  const handover = (id, keys = '2') => pdfAttach(t.api.post(`/api/delivery/deals/${id}/handover`).set('Authorization', `Bearer ${t.tokens['delivery@fsm.lb']}`).field('keys_count', keys));
  it('FR-DEL-01 every signed deal gets an inspection checklist for the Delivery Coordinator', async () => {
    const x = await D({ upTo: 'contract_signed' });
    const v = (await S.del.get(`/delivery/deals/${x.id}`)).body; expect(v.inspection.length).toBe(6);
    expect((await S.del.get('/delivery/deals')).body.some((d) => d.id === x.id)).toBe(true);
    const y = await D({ upTo: 'reserved' }); expect((await S.del.get(`/delivery/deals/${y.id}`)).status).toBe(409); // no signed contract yet
    expect((await S.c1.put(`/delivery/deals/${x.id}/inspection/exterior`, { passed: true })).status).toBe(403);
  });
  it('FR-DEL-02 delivery blocked until all items pass and payment or an approved loan exists', async () => {
    const x = await D({ upTo: 'contract_signed' });
    let r = await handover(x.id); expect(r.status).toBe(409); expect(r.body.error.details.reasons).toEqual(expect.arrayContaining(['inspection_incomplete', 'payment_or_loan_missing']));
    await passAll(x.id); r = await handover(x.id); expect(r.status).toBe(409); expect(r.body.error.details.reasons).toEqual(['payment_or_loan_missing']);
    const loan = await S.c1.post(`/deals/${x.id}/loan`, { bank: 'Partner Bank' }); await S.c1.patch(`/loans/${loan.body.id}`, { status: 'approved' });
    r = await handover(x.id); expect(r.status).toBe(201); expect(r.body.stage).toBe('delivered');
  });
  it('FR-DEL-02 a failed inspection item blocks delivery even when paid', async () => {
    const x = await D({ upTo: 'paid' }); await passAll(x.id);
    await S.del.put(`/delivery/deals/${x.id}/inspection/tires`, { passed: false, notes: 'Scratched rim' });
    expect((await handover(x.id)).status).toBe(409);
  });
  it('FR-DEL-03 customer picks an available delivery slot; confirmation and reminder sent; slot cannot be double-booked', async () => {
    const email = 'slot@example.com'; const reg = await t.pub.post('/auth/register', { name: 'Slot Cust', email, password: 'Str0ng!pass', consent_data: true }); const cust = t.as(reg.body.token);
    const x = await D({ upTo: 'contract_signed', email }); const day = futureDay(3);
    const slots = (await cust.get(`/me/deals/${x.id}/delivery-slots?date=${day}`)).body.slots; expect(slots.length).toBeGreaterThan(0);
    const pick = slots[0].slot_start;
    expect((await cust.post(`/me/deals/${x.id}/delivery-slot`, { slot_start: pick })).status).toBeLessThan(300);
    expect(t.ctx.db.prepare("SELECT COUNT(*) c FROM outbox WHERE template = 'delivery_confirmation' AND recipient = ?").get(email).c).toBe(1);
    const other = await D({ upTo: 'contract_signed', email: 'slot2@example.com' }); const reg2 = await t.pub.post('/auth/register', { name: 'Slot Two', email: 'slot2@example.com', password: 'Str0ng!pass', consent_data: true });
    expect((await t.as(reg2.body.token).post(`/me/deals/${other.id}/delivery-slot`, { slot_start: pick })).status).toBe(409);
    const dayBefore = new Date(pick.replace(' ', 'T') + ':00'); dayBefore.setDate(dayBefore.getDate() - 1); dayBefore.setHours(9);
    await at(t, dayBefore, async () => { t.ctx.jobs.deliveryReminders(); });
    expect(t.ctx.db.prepare("SELECT COUNT(*) c FROM outbox WHERE template = 'delivery_reminder' AND recipient = ?").get(email).c).toBe(1);
    expect((await cust.post(`/me/deals/${other.id}/delivery-slot`, { slot_start: pick })).status).toBe(403);
  });
  it('FR-DEL-04 registration documents listed and marked ready by the coordinator', async () => {
    const x = await D({ upTo: 'contract_signed' });
    const v = (await S.del.get(`/delivery/deals/${x.id}`)).body; expect(v.registration.map((r) => r.doc_key || r.key)).toEqual(expect.arrayContaining(['invoice', 'identity_copy', 'insurance']));
    expect((await S.del.put(`/delivery/deals/${x.id}/registration/insurance`, { ready: true })).status).toBe(200);
    expect((await S.del.get(`/delivery/deals/${x.id}`)).body.registration.find((r) => (r.doc_key || r.key) === 'insurance').ready).toBeTruthy();
  });
  it('FR-DEL-05 handover form PDF, signed copy stored, deal Delivered, Owners Circle membership starts, car marked delivered', async () => {
    const x = await D({ upTo: 'paid', email: 'handover@example.com' }); await passAll(x.id);
    const form = await S.del.raw('get', `/delivery/deals/${x.id}/handover-form.pdf`).buffer().parse((res, cb) => { const c = []; res.on('data', (d) => c.push(d)); res.on('end', () => cb(null, Buffer.concat(c))); });
    expect(form.body.slice(0, 4).toString()).toBe('%PDF');
    expect((await handover(x.id, '0')).status).toBe(400);
    expect((await t.api.post(`/api/delivery/deals/${x.id}/handover`).set('Authorization', `Bearer ${t.tokens['delivery@fsm.lb']}`).field('keys_count', '2')).status).toBe(400); // signed form required
    const r = await handover(x.id); expect(r.status).toBe(201); expect(r.body.membership.card_number).toBeTruthy();
    const d = t.ctx.db.prepare('SELECT * FROM deals WHERE id = ?').get(x.id); expect(d.stage).toBe('delivered');
    expect(t.ctx.db.prepare('SELECT status FROM cars WHERE id = ?').get(d.car_id).status).toBe('delivered');
    expect((await handover(x.id)).status).toBe(409);
  });
  it('FR-DEL-06 customer timeline: Reserved, Contract signed, Paid, Car ready, Delivered', async () => {
    const email = 'timeline@example.com'; const reg = await t.pub.post('/auth/register', { name: 'Time Line', email, password: 'Str0ng!pass', consent_data: true }); const cust = t.as(reg.body.token);
    const x = await D({ upTo: 'paid', email });
    let tl = (await cust.get(`/me/deals/${x.id}/timeline`)).body; expect(tl.steps.map((s) => s.key)).toEqual(['reserved', 'contract_signed', 'paid', 'car_ready', 'delivered']);
    expect(tl.steps.filter((s) => s.done).map((s) => s.key)).toEqual(['reserved', 'contract_signed', 'paid']);
    await passAll(x.id); tl = (await cust.get(`/me/deals/${x.id}/timeline`)).body; expect(tl.steps.find((s) => s.key === 'car_ready').done).toBe(true);
    await handover(x.id); tl = (await cust.get(`/me/deals/${x.id}/timeline`)).body; expect(tl.steps.every((s) => s.done)).toBe(true);
    expect((await S.cust.get(`/me/deals/${x.id}/timeline`)).status).toBe(403);
  });
});

describe('Owners Circle (FR-OC)', () => {
  let ref; // referrer
  const deliver = async (id) => { for (const k of ['exterior', 'interior', 'mechanical', 'tires', 'electronics', 'keys_manuals']) await S.del.put(`/delivery/deals/${id}/inspection/${k}`, { passed: true }); await pdfAttach(t.api.post(`/api/delivery/deals/${id}/handover`).set('Authorization', `Bearer ${t.tokens['delivery@fsm.lb']}`).field('keys_count', '2')); };
  beforeAll(async () => {
    const email = 'ref@example.com'; const reg = await t.pub.post('/auth/register', { name: 'Referrer One', email, password: 'Str0ng!pass', consent_data: true, consent_marketing: true });
    const x = await D({ upTo: 'paid', email }); await deliver(x.id); ref = t.as(reg.body.token);
  });
  it('FR-OC-01 / FR-OC-02 membership and digital card created on delivery with a unique referral code and link', async () => {
    const m = (await ref.get('/me/owners-circle')).body; expect(m.card_number).toBeTruthy(); expect(m.referral_code).toMatch(/^[A-Z0-9]{6,}$/); expect(m.referral_link).toContain(m.referral_code); expect(m.tier).toBe('Member');
    const codes = t.ctx.db.prepare('SELECT referral_code FROM memberships').all().map((r) => r.referral_code); expect(new Set(codes).size).toBe(codes.length);
    expect((await S.cust.get('/me/owners-circle')).status).toBe(404); // not a member yet
  });
  it('FR-OC-03 referral code links a new lead before contract signing; self-referral and unknown codes rejected', async () => {
    const m = (await ref.get('/me/owners-circle')).body;
    const ok = await S.c1.post('/leads', { name: 'Friend', email: 'friend@example.com', consent_data: true, referral_code: m.referral_code, trim_id: t.trimId('Nissan', 'Sunny') }); expect(ok.status).toBe(201);
    expect((await S.mgr.get(`/deals/${ok.body.id}`)).body.source).toBe('referral');
    const self = await S.c1.post('/leads', { name: 'Referrer One', email: 'ref@example.com', consent_data: true, referral_code: m.referral_code }); expect(self.status).toBe(400); expect(self.body.error.code).toBe('self_referral');
    expect((await S.c1.post('/leads', { name: 'X', email: 'x@example.com', consent_data: true, referral_code: 'NOPE1234' })).status).toBe(400);
    const late = await D({ upTo: 'contract_signed' }); expect((await S.c1.post(`/deals/${late.id}/referral`, { code: m.referral_code })).status).toBe(400);
  });
  it('FR-OC-04 credit added to the referrer when the referred deal is Delivered, using the amount set by the Sales Manager', async () => {
    expect((await S.mgr.put('/owners-circle/referral-credit', { amount: 250 })).body.referral_credit_usd).toBe(250);
    const m = (await ref.get('/me/owners-circle')).body; const before = m.credit_balance;
    const f = await D({ upTo: 'paid', email: 'friend2@example.com', referral_code: m.referral_code });
    expect((await ref.get('/me/owners-circle')).body.credit_balance).toBe(before);
    await deliver(f.id);
    const after = (await ref.get('/me/owners-circle')).body; expect(after.credit_balance).toBe(before + 250); expect(after.credited_referrals).toBe(1);
    expect((await S.c1.put('/owners-circle/referral-credit', { amount: 1 })).status).toBe(403);
  });
  it('FR-OC-05 member uses the credit on an open deal; cannot overspend; Ambassador tier after three credited referrals', async () => {
    const bal = (await ref.get('/me/owners-circle')).body.credit_balance;
    const email = 'ref@example.com'; const x = await D({ upTo: 'reserved', email });
    expect((await ref.post('/me/owners-circle/apply-credit', { deal_id: x.id, amount: bal + 1 })).status).toBe(409);
    expect((await ref.post('/me/owners-circle/apply-credit', { deal_id: x.id, amount: 100 })).status).toBe(201);
    expect((await ref.get('/me/owners-circle')).body.credit_balance).toBe(bal - 100);
    expect((await S.mgr.get(`/deals/${x.id}`)).body.financials.paid_usd).toBeGreaterThanOrEqual(100);
    const m = (await ref.get('/me/owners-circle')).body;
    for (let i = 0; i < 2; i++) { const f = await D({ upTo: 'paid', email: `chain${i}@example.com`, referral_code: m.referral_code }); await deliver(f.id); }
    const fin = (await ref.get('/me/owners-circle')).body; expect(fin.credited_referrals).toBe(3); expect(fin.tier).toBe('Ambassador'); expect(fin.referrals_to_ambassador).toBe(0);
  });
  it('FR-OC-06 Sales Manager publishes an event or early-access offer; members see it; only consenting members are messaged', async () => {
    const r = await S.mgr.post('/owners-circle/events', { kind: 'event', title_en: 'Owners day', title_ar: 'يوم المالكين', description_en: 'Join us', starts_on: futureDay(10) });
    expect(r.status).toBe(201); expect(r.body.notified_members).toBeGreaterThanOrEqual(1);
    expect((await ref.get('/me/owners-circle/events')).body.some((e) => e.title === 'Owners day')).toBe(true);
    expect((await S.c1.post('/owners-circle/events', { kind: 'event', title_en: 'x' })).status).toBe(403);
    expect((await S.mgr.post('/owners-circle/events', { kind: 'party', title_en: 'x' })).status).toBe(400);
  });
});
