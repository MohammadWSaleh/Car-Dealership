import { describe, it, expect, beforeAll } from 'vitest';
const { makeApp, staff, deal } = require('./helpers');
const calc = require('../src/services/calc');
let t, S;
beforeAll(async () => { t = makeApp(); S = await staff(t); });
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

describe('F2 EV savings calculator', () => {
  it('compares an electric car with a petrol car over five years using staff-set prices', async () => {
    const ev = t.trimId('Kia', 'EV6');
    const r = await t.pub.get(`/catalogue/ev-savings?trim_id=${ev}&daily_km=50`);
    expect(r.status).toBe(200); expect(r.body.series.length).toBe(6);
    expect(r.body.series[0].ev_total).toBe(r.body.ev.price_usd);
    expect(r.body.yearly_saving).toBeCloseTo(r.body.yearly_petrol - r.body.yearly_ev, 1);
    const before = r.body.yearly_ev;
    await S.mgr.put('/settings/commercial', { electricity_usd_per_kwh: 0.4 });
    expect((await t.pub.get(`/catalogue/ev-savings?trim_id=${ev}&daily_km=50`)).body.yearly_ev).toBeGreaterThan(before);
    await S.mgr.put('/settings/commercial', { electricity_usd_per_kwh: 0.2 });
  });
  it('rejects petrol cars, bad distances and a non-petrol comparison trim', async () => {
    expect((await t.pub.get(`/catalogue/ev-savings?trim_id=${t.trimId('Nissan', 'Sunny')}`)).status).toBe(400);
    expect((await t.pub.get(`/catalogue/ev-savings?trim_id=${t.trimId('Kia', 'EV6')}&daily_km=0`)).status).toBe(400);
    expect((await t.pub.get(`/catalogue/ev-savings?trim_id=${t.trimId('Kia', 'EV6')}&petrol_trim_id=${t.trimId('Kia', 'EV6')}`)).status).toBe(400);
  });
  it('break-even is 0 when the electric car is not dearer, null when it never pays back', () => {
    const ev = { fuel_type: 'electric', kwh_per_100km: 15 }; const p = { fuel_type: 'petrol', l_per_100km: 8 };
    expect(calc.evSavings({ ev, evPrice: 20000, petrol: p, petrolPrice: 25000, km: 15000, years: 5, fuelPrice: 1, elecPrice: 0.2 }).break_even_years).toBe(0);
    expect(calc.evSavings({ ev, evPrice: 40000, petrol: p, petrolPrice: 20000, km: 15000, years: 5, fuelPrice: 1, elecPrice: 5 }).break_even_years).toBeNull();
  });
});

describe('F3 price trend', () => {
  it('is public, follows price changes and reports the lock period', async () => {
    const id = t.trimId('Toyota', 'Corolla');
    const a = (await t.pub.get(`/catalogue/trims/${id}/price-trend`)).body;
    expect(a.points.length).toBeGreaterThan(0); expect(a.lock_days).toBe(7);
    const cur = a.list_price_usd;
    expect((await S.mgr.put(`/catalogue/trims/${id}/price`, { price_usd: cur - 500 })).status).toBe(200);
    const b = (await t.pub.get(`/catalogue/trims/${id}/price-trend`)).body;
    expect(b.points[b.points.length - 1].price).toBe(cur - 500); expect(b.lowest_usd).toBeLessThanOrEqual(cur - 500);
    expect((await t.pub.get('/catalogue/trims/99999/price-trend')).status).toBe(404);
  });
});

describe('F4 trade-in estimate', () => {
  const body = { segment: 'sedan', brand: 'Honda', model: 'Civic', year: new Date().getFullYear() - 5, mileage_km: 75000, condition: 'good' };
  it('gives a range from the formula; older, worn or poor cars are worth less', async () => {
    const a = await t.pub.post('/tradein/estimate', body); expect(a.status).toBe(201);
    expect(a.body.est_low).toBeGreaterThan(0); expect(a.body.est_high).toBeGreaterThan(a.body.est_low); expect(a.body.status).toBe('estimated');
    const worse = (await t.pub.post('/tradein/estimate', { ...body, mileage_km: 200000, condition: 'poor' })).body;
    expect(worse.est_high).toBeLessThan(a.body.est_low);
  });
  it('validates input', async () => {
    expect((await t.pub.post('/tradein/estimate', { ...body, segment: 'tank' })).status).toBe(400);
    expect((await t.pub.post('/tradein/estimate', { ...body, year: 1950 })).status).toBe(400);
    expect((await t.pub.post('/tradein/estimate', { ...body, condition: 'meh' })).status).toBe(400);
    expect((await t.pub.post('/tradein/estimate', { ...body, send_to_consultant: true })).status).toBe(400); // needs name, contact, consent
  });
  it('a request becomes a lead; a consultant confirms an offer that is valid for the staff-set days and expires', async () => {
    const r = await t.pub.post('/tradein/estimate', { ...body, send_to_consultant: true, name: 'Trade Guest', email: 'trade@example.com', consent_data: true });
    expect(r.status).toBe(201); expect(r.body.status).toBe('requested');
    expect((await t.pub.post(`/tradein/${r.body.id}/offer`, { offer_usd: 9000 })).status).toBe(401);
    expect((await S.c1.post(`/tradein/${r.body.id}/offer`, { offer_usd: -5 })).status).toBe(400);
    const o = await S.c1.post(`/tradein/${r.body.id}/offer`, { offer_usd: 9000 });
    expect(o.status).toBe(200); expect(o.body.status).toBe('offered');
    const days = (new Date(o.body.offer_valid_until) - new Date()) / 86400000; expect(days).toBeGreaterThan(6.9); expect(days).toBeLessThan(7.1);
    expect(t.ctx.db.prepare("SELECT COUNT(*) c FROM outbox WHERE template = 'tradein_offer' AND recipient = 'trade@example.com'").get().c).toBe(1);
    t.ctx.db.prepare('UPDATE trade_ins SET offer_valid_until = ? WHERE id = ?').run(new Date(Date.now() - 86400000).toISOString(), r.body.id); // the week has passed
    expect((await S.c1.get('/tradein')).body.find((x) => x.id === r.body.id).status).toBe('expired');
  });
  it('an estimate nobody asked a consultant about cannot get an offer', async () => {
    const anon = (await t.pub.post('/tradein/estimate', body)).body;
    expect(anon.id).toBeNull(); // quick anonymous estimates are never stored
    const e = (await S.cust.post('/tradein/estimate', body)).body;
    expect((await S.c1.post(`/tradein/${e.id}/offer`, { offer_usd: 5000 })).status).toBe(400);
  });
});

describe('F5 QR test-drive check-in', () => {
  const guest = { name: 'QR Guest', email: 'qr@example.com', phone: '+96170000009', consent_data: true };
  function todaySlot() { const d = new Date(); if (d.getDay() === 0) d.setDate(d.getDate() + 1); return { day: ymd(d), slot: `${ymd(d)} 17:00` }; }
  it('staff check a customer in by code, once, only on the day, only for active bookings', async () => {
    const { day, slot } = todaySlot(); t.clock.set(new Date(`${day}T08:00:00`)); const S2 = await staff(t); // sessions are re-created at the moved clock so the test does not depend on the time of day
    try {
    const td = (await t.pub.post('/testdrives', { trim_id: t.trimId('BYD', 'Seal'), slot_start: slot, contact: guest })).body;
    expect((await t.pub.post('/testdrives/check-in', { code: td.code })).status).toBe(401);
    const a = await S2.c1.post('/testdrives/check-in', { code: td.code.toLowerCase() });
    expect(a.status).toBe(200); expect(a.body.already_checked_in).toBe(false); expect(a.body.booking.checked_in_at).toBeTruthy();
    expect((await S2.c1.post('/testdrives/check-in', { code: td.code })).body.already_checked_in).toBe(true);
    expect((await S2.c1.post('/testdrives/check-in', { code: 'NOPE00' })).status).toBe(404);
    } finally { t.clock.set(null); }
  });
  it('rejects a booking for another day and a cancelled booking', async () => {
    const d = new Date(); d.setDate(d.getDate() + 10); if (d.getDay() === 0) d.setDate(d.getDate() + 1);
    const td = (await t.pub.post('/testdrives', { trim_id: t.trimId('Kia', 'Sportage'), slot_start: `${ymd(d)} 10:00`, contact: { ...guest, email: 'qr2@example.com' } })).body;
    expect((await S.c1.post('/testdrives/check-in', { code: td.code })).status).toBe(409);
    await t.pub.post(`/testdrives/${td.id}/cancel`, { code: td.code, email: 'qr2@example.com' });
    expect((await S.c1.post('/testdrives/check-in', { code: td.code })).status).toBe(409);
  });
});

describe('F6 smart order tracker', () => {
  it('shows steps, an estimated delivery date and delivery-day readiness; customers see only their own deal', async () => {
    const x = await deal(t, S, { upTo: 'paid' });
    const r = await S.c1.get(`/deals/${x.id}/tracker`); expect(r.status).toBe(200);
    expect(r.body.steps.map((s) => s.key)).toEqual(['lead', 'quoted', 'reserved', 'contract_signed', 'paid', 'ready', 'delivered']);
    expect(r.body.steps.find((s) => s.key === 'paid').current).toBe(true);
    expect(r.body.steps.find((s) => s.key === 'reserved').done).toBe(true);
    expect(r.body.eta.date).toMatch(/^\d{4}-\d{2}-\d{2}$/); expect(r.body.readiness.inspection.total).toBeGreaterThan(0);
    expect((await t.pub.get(`/deals/${x.id}/tracker`)).status).toBe(401);
  });
  it('one notification per stage, with the estimated delivery date', async () => {
    const x = await deal(t, S, { upTo: 'reserved' });
    const n = t.ctx.db.prepare("SELECT body FROM outbox WHERE template = 'order_stage' AND recipient = ?").all(x.email);
    expect(n.length).toBe(1); expect(n[0].body).toMatch(/\b\d{2}\/\d{2}\/\d{4}\b/);
  });
  it('estimate rules: booked slot wins, stock adds preparation days, in-transit starts from arrival, unordered adds the order lead time', () => {
    const now = new Date('2026-03-01T10:00:00'); const base = { now, stockDays: 3, orderDays: 45 };
    expect(calc.deliveryEta({ ...base, bookingSlot: '2026-03-20 10:00' })).toEqual({ date: '2026-03-20', basis: 'booked' });
    expect(calc.deliveryEta({ ...base, carStatus: 'in_stock' })).toEqual({ date: '2026-03-04', basis: 'in_stock' });
    expect(calc.deliveryEta({ ...base, carStatus: 'in_transit', arrivalDate: '2026-03-10' })).toEqual({ date: '2026-03-13', basis: 'in_transit' });
    expect(calc.deliveryEta({ ...base })).toEqual({ date: '2026-04-15', basis: 'order' });
  });
});
