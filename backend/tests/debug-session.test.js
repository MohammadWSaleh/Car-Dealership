import { describe, it, expect, beforeAll } from 'vitest';
const { makeApp, staff, deal } = require('./helpers');
let t, S;
beforeAll(async () => { t = makeApp(); S = await staff(t); });

describe('Debugging session regressions', () => {
  it('hostile field types are rejected with 400, never 500', async () => {
    const d = await deal(t, S, {}); const id = d.id || d;
    for (const bad of [{ notes: { x: 1 } }, { notes: [1] }, { notes: true }]) {
      const r = await S.mgr.put(`/deals/${id}`, bad); expect(r.status).toBe(400); expect(r.body.error.code).toBe('invalid_input');
    }
    const lost = await S.mgr.post(`/deals/${id}/lost`, { reason: { x: 1 } }); expect(lost.status).toBe(400);
    const pw = await S.admin.post('/admin/users/1/reset-password', { password: { x: 1 } }); expect(pw.status).toBe(400);
    const lead = await S.cust.post('/leads', { message: { x: 1 } }); expect(lead.status).toBeLessThan(500);
  });
  it('trade-in: unknown trim is 404; anonymous quick estimates are not stored', async () => {
    const body = { segment: 'sedan', brand: 'Toyota', model: 'Corolla', year: 2019, mileage_km: 80000, condition: 'good' };
    const bad = await t.pub.post('/tradein/estimate', { ...body, trim_id: 99999, name: 'A', phone: '+96170000000' });
    expect([404, 400]).toContain(bad.status);
    const before = t.ctx.db.prepare('SELECT COUNT(*) n FROM trade_ins').get().n;
    const r = await t.pub.post('/tradein/estimate', body);
    expect(r.status).toBe(201); expect(r.body.id).toBeNull(); expect(r.body.est_low).toBeGreaterThan(0);
    expect(t.ctx.db.prepare('SELECT COUNT(*) n FROM trade_ins').get().n).toBe(before);
  });
  it('forged and malformed tokens are 401', async () => {
    for (const tok of ['', 'abc', 'a.b.c', 'Bearer x']) {
      const r = await t.api.get('/api/deals').set('Authorization', `Bearer ${tok}`); expect(r.status).toBe(401);
    }
  });
  it('a customer cannot read another customer’s deals (IDOR)', async () => {
    const other = await t.login('customer2@fsm.lb'); const O = t.as(other);
    await deal(t, S, {});
    const cid = t.ctx.db.prepare("SELECT id FROM users WHERE email = 'customer@fsm.lb'").get().id;
    const rows = t.ctx.db.prepare('SELECT id FROM deals WHERE customer_id = ?').all(cid);
    for (const row of rows) {
      for (const p of [`/deals/${row.id}`, `/deals/${row.id}/tracker`, `/deals/${row.id}/quotation`, `/me/deals/${row.id}/timeline`]) {
        const r = await O.get(p); expect([403, 404]).toContain(r.status);
      }
    }
  });
  it('general manager has read-only access to delivery', async () => {
    const d = await deal(t, S, { upTo: 'contract_signed' });
    expect((await S.gm.get('/delivery/deals')).status).toBe(200);
    expect((await S.gm.get(`/delivery/deals/${d.id}`)).status).toBe(200);
    expect((await S.gm.put(`/delivery/deals/${d.id}/inspection/exterior`, { passed: true })).status).toBe(403);
  });
});
