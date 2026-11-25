import { describe, it, expect, beforeAll } from 'vitest';
const { makeApp, staff } = require('./helpers');
let t, S;
beforeAll(async () => { t = makeApp(); S = await staff(t); });
const pad = (n) => String(n).padStart(2, '0');
function slotAt(daysAhead, hhmm) { // next open (non-Sunday) day at least daysAhead away
  const d = new Date(); d.setDate(d.getDate() + daysAhead); if (d.getDay() === 0) d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${hhmm}`;
}
const guest = (o = {}) => ({ name: 'Guest One', email: 'guest1@example.com', phone: '+96170000001', consent_data: true, ...o });

describe('Test drives (FR-TD)', () => {
  it('FR-TD-01 books a free slot, rejects taken, past, off-hours slots; no double booking per car', async () => {
    const trim = t.trimId('Kia', 'EV6'); const slot = slotAt(3, '10:00');
    const a = await t.pub.post('/testdrives', { trim_id: trim, slot_start: slot, contact: guest() }); expect(a.status).toBe(201);
    const b = await t.pub.post('/testdrives', { trim_id: trim, slot_start: slot, contact: guest({ email: 'guest2@example.com' }) });
    expect(b.status).toBe(409); // only one demo car of this trim
    expect((await t.pub.post('/testdrives', { trim_id: trim, slot_start: slotAt(3, '07:00'), contact: guest() })).status).toBe(400);
    expect((await t.pub.post('/testdrives', { trim_id: trim, slot_start: '2020-01-01 10:00', contact: guest() })).status).toBe(400);
    const sl = await t.pub.get(`/testdrives/slots?trim_id=${trim}&date=${slot.slice(0, 10)}`);
    expect(sl.body.slots.find((s) => s.slot_start === slot)).toBeUndefined();
  });
  it('FR-TD-01 concurrent bookings of the same slot: exactly one wins', async () => {
    const trim = t.trimId('Toyota', 'Corolla'); const slot = slotAt(4, '11:00');
    const rs = await Promise.all([1, 2, 3, 4, 5].map((i) => t.pub.post('/testdrives', { trim_id: trim, slot_start: slot, contact: guest({ email: `race${i}@example.com` }) })));
    expect(rs.filter((r) => r.status === 201).length).toBe(1);
  });
  it('FR-TD-01 guest needs contact details and consent', async () => {
    const trim = t.trimId('Nissan', 'Sunny');
    expect((await t.pub.post('/testdrives', { trim_id: trim, slot_start: slotAt(5, '09:00'), contact: { name: 'No Contact', consent_data: true } })).status).toBe(400);
    expect((await t.pub.post('/testdrives', { trim_id: trim, slot_start: slotAt(5, '09:00'), contact: guest({ consent_data: false }) })).status).toBe(400);
  });
  it('FR-TD-02 / NFR-SEC-04 license upload, type check, consultant verification, encrypted storage, role-restricted access', async () => {
    const trim = t.trimId('MG', 'ZS EV'); const slot = slotAt(5, '12:00');
    const td = (await t.pub.post('/testdrives', { trim_id: trim, slot_start: slot, contact: guest({ email: 'lic@example.com' }) })).body;
    expect((await t.api.post(`/api/testdrives/${td.id}/license`).field('code', td.code).field('email', 'lic@example.com').attach('file', Buffer.from('MZ not a pdf'), { filename: 'x.pdf', contentType: 'application/pdf' })).status).toBe(400);
    expect((await t.api.post(`/api/testdrives/${td.id}/license`).field('code', td.code).field('email', 'lic@example.com').attach('file', t.PDF, { filename: 'l.pdf', contentType: 'application/pdf' })).status).toBe(201);
    expect((await t.api.post(`/api/testdrives/${td.id}/license`).attach('file', t.PDF, { filename: 'l.pdf', contentType: 'application/pdf' })).status).toBe(403);
    const v = await S.c1.post(`/testdrives/${td.id}/verify-license`); expect(v.body.license_verified).toBe(true);
    const doc = t.ctx.db.prepare("SELECT * FROM documents WHERE kind = 'license'").get();
    const raw = require('fs').readFileSync(require('path').join(t.ctx.config.uploadDir, doc.stored_name || doc.path || doc.file_name));
    expect(raw.slice(0, 4).toString()).not.toBe('%PDF'); // encrypted at rest (NFR-SEC-05)
    expect((await S.c1.get(`/documents/${doc.id}`)).status).toBe(200);
    expect((await S.acc.get(`/documents/${doc.id}`)).status).toBe(403);
  });
  it('FR-TD-03 reschedule and cancel by code+email; cannot touch someone else\'s booking', async () => {
    const trim = t.trimId('Hyundai', 'Tucson'); const slot = slotAt(6, '14:00'); const slot2 = slotAt(6, '15:00');
    const td = (await t.pub.post('/testdrives', { trim_id: trim, slot_start: slot, contact: guest({ email: 'move@example.com' }) })).body;
    expect((await t.pub.post(`/testdrives/${td.id}/reschedule`, { slot_start: slot2 })).status).toBe(403);
    const r = await t.pub.post(`/testdrives/${td.id}/reschedule`, { slot_start: slot2, code: td.code, email: 'move@example.com' });
    expect(r.status).toBe(200); expect(r.body.slot_start).toBe(slot2);
    expect((await t.pub.get(`/testdrives/lookup?code=${td.code}&email=move@example.com`)).status).toBe(200);
    expect((await t.pub.get(`/testdrives/lookup?code=${td.code}&email=other@example.com`)).status).toBe(404);
    const c = await t.pub.post(`/testdrives/${td.id}/cancel`, { code: td.code, email: 'move@example.com' }); expect(c.body.status).toBe('cancelled');
    // slot is free again
    expect((await t.pub.post('/testdrives', { trim_id: trim, slot_start: slot2, contact: guest({ email: 'again@example.com' }) })).status).toBe(201);
  });
  it('FR-TD-03 cannot cancel after the slot has started', async () => {
    const trim = t.trimId('Kia', 'Sportage'); const slot = slotAt(7, '10:00');
    const td = (await t.pub.post('/testdrives', { trim_id: trim, slot_start: slot, contact: guest({ email: 'late@example.com' }) })).body;
    t.clock.set(new Date(slot.replace(' ', 'T') + ':00')); t.clock.set(new Date(new Date(slot.replace(' ', 'T') + ':00').getTime() + 60000));
    expect((await t.pub.post(`/testdrives/${td.id}/cancel`, { code: td.code, email: 'late@example.com' })).status).toBe(409);
    t.clock.set(null);
  });
  it('FR-TD-04 confirmation sent in the customer\'s language and a reminder the day before', async () => {
    const trim = t.trimId('BYD', 'Seal'); const slot = slotAt(2, '10:00');
    const td = (await t.pub.post('/testdrives', { trim_id: trim, slot_start: slot, language: 'ar', contact: guest({ email: 'ar@example.com' }) })).body;
    const conf = t.ctx.db.prepare("SELECT * FROM outbox WHERE template = 'booking_confirmation' AND recipient LIKE ?").get('%ar@example.com%');
    expect(conf).toBeTruthy(); expect(conf.language).toBe('ar'); expect(conf.body).toContain(td.code);
    const dayBefore = new Date(slot.replace(' ', 'T') + ':00'); dayBefore.setDate(dayBefore.getDate() - 1); dayBefore.setHours(9);
    t.clock.set(dayBefore); t.ctx.jobs.testdriveReminders(); t.clock.set(null);
    expect(t.ctx.db.prepare("SELECT COUNT(*) c FROM outbox WHERE template = 'booking_reminder' AND recipient LIKE ?").get('%ar@example.com%').c).toBe(1);
  });
  it('FR-TD-05 checklist: licence must be verified; electric cars need battery >= 80%', async () => {
    const trim = t.trimId('Volkswagen', 'ID.4'); const slot = slotAt(8, '10:00');
    const td = (await t.pub.post('/testdrives', { trim_id: trim, slot_start: slot, contact: guest({ email: 'chk@example.com' }) })).body;
    expect((await S.c1.put(`/testdrives/${td.id}/checklist`, { complete: true, battery_percent: 90 })).status).toBe(409);
    await t.api.post(`/api/testdrives/${td.id}/license`).field('code', td.code).field('email', 'chk@example.com').attach('file', t.PDF, { filename: 'l.pdf', contentType: 'application/pdf' });
    await S.c1.post(`/testdrives/${td.id}/verify-license`);
    expect((await S.c1.put(`/testdrives/${td.id}/checklist`, { complete: true, battery_percent: 79 })).status).toBe(409);
    const ok = await S.c1.put(`/testdrives/${td.id}/checklist`, { complete: true, battery_percent: 80, feedback: 'Liked it' });
    expect(ok.body.status).toBe('completed'); expect(ok.body.feedback).toBe('Liked it');
    expect((await S.acc.put(`/testdrives/${td.id}/checklist`, {})).status).toBe(403);
  });
  it('FR-TD-01 a booking links to a lead so the consultant follows up', async () => {
    const n = t.ctx.db.prepare("SELECT COUNT(*) c FROM deals WHERE source = 'test_drive'").get().c; expect(n).toBeGreaterThan(0);
  });
});
