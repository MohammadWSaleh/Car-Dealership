import { describe, it, expect, beforeAll } from 'vitest';
const { makeApp, staff } = require('./helpers');
let t, S;
beforeAll(async () => { t = makeApp(); S = await staff(t); });
const reg = (o = {}) => t.pub.post('/auth/register', { name: 'New User', email: 'new@example.com', password: 'Str0ng!pass', consent_data: true, ...o });

describe('Accounts (FR-ACC)', () => {
  it('FR-ACC-01 visitor registers with email and password; duplicates rejected', async () => {
    const r = await reg(); expect(r.status).toBe(201); expect(r.body.token).toBeTruthy();
    expect((await reg()).status).toBe(409);
  });
  it('FR-ACC-02 consent to data processing is required, marketing is separate and optional', async () => {
    expect((await reg({ email: 'a@example.com', consent_data: false })).status).toBe(400);
    const r = await reg({ email: 'b@example.com', consent_marketing: true });
    expect(r.body.user.consent_marketing).toBeTruthy();
    const r2 = await reg({ email: 'c@example.com' });
    expect(r2.body.user.consent_marketing).toBeFalsy();
  });
  it('FR-ACC-03 customer edits profile and sees overview', async () => {
    const u = await t.login('customer@fsm.lb'); const c = t.as(u);
    expect((await c.put('/me', { name: 'Karim N.', phone: '+96171222333' })).status).toBe(200);
    const o = await c.get('/me/overview'); expect(o.status).toBe(200);
    for (const k of ['enquiries', 'appointments', 'deposits', 'contracts', 'orders']) expect(o.body).toHaveProperty(k);
  });
  it('FR-ACC-04 customer requests data copy and erasure; admin completes', async () => {
    const r = await reg({ email: 'gone@example.com' }); const c = t.as(r.body.token);
    const e = await c.post('/me/data-requests', { type: 'export' }); expect(e.status).toBe(201);
    const er = await c.post('/me/data-requests', { type: 'erasure' }); expect(er.status).toBe(201);
    const list = await S.admin.get('/admin/data-requests'); expect(list.body.length).toBeGreaterThanOrEqual(2);
    expect((await S.admin.post(`/admin/data-requests/${e.body.id}/complete`)).status).toBe(200);
    const dl = await c.get(`/me/data-requests/${e.body.id}/download`); expect(dl.status).toBe(200);
    expect((await S.admin.post(`/admin/data-requests/${er.body.id}/complete`)).status).toBe(200);
    const after = t.ctx.db.prepare('SELECT * FROM users WHERE email = ?').get('gone@example.com');
    expect(after).toBeUndefined();
  });
  it('FR-ACC-05 language choice is remembered', async () => {
    const c = t.as(await t.login('customer2@fsm.lb'));
    await c.put('/me', { language: 'ar' });
    expect((await c.get('/auth/me')).body.user.language).toBe('ar');
    await c.put('/me', { language: 'en' });
    expect((await c.get('/auth/me')).body.user.language).toBe('en');
    expect((await c.put('/me', { language: 'fr' })).status).toBe(400);
  });
  it('NFR-SEC-02 weak passwords rejected; hashes are salted', async () => {
    expect((await reg({ email: 'w@example.com', password: 'short' })).status).toBe(400);
    const h = t.ctx.db.prepare('SELECT password_hash FROM users WHERE email IN (?, ?) ORDER BY id').all('admin@fsm.lb', 'manager@fsm.lb');
    expect(h[0].password_hash).not.toBe(h[1].password_hash); expect(h[0].password_hash).toMatch(/^\$2/);
  });
  it('NFR-SEC-03 (lockout) account locks for 15 minutes after 5 failed logins', async () => {
    for (let i = 0; i < 4; i++) expect((await t.pub.post('/auth/login', { email: 'gm@fsm.lb', password: 'wrong-pass' })).status).toBe(401);
    expect((await t.pub.post('/auth/login', { email: 'gm@fsm.lb', password: 'wrong-pass' })).status).toBe(423);
    expect((await t.pub.post('/auth/login', { email: 'gm@fsm.lb', password: t.PASSWORD })).status).toBe(423);
    t.clock.set(new Date(Date.now() + 16 * 60000));
    expect((await t.pub.post('/auth/login', { email: 'gm@fsm.lb', password: t.PASSWORD })).status).toBe(200);
    t.clock.set(null);
  });
  it('NFR-SEC-03 (session) staff session ends after 15 minutes of inactivity and renews while active', async () => {
    const tok = await t.login('delivery@fsm.lb');
    const r1 = await t.api.get('/api/auth/me').set('Authorization', `Bearer ${tok}`);
    expect(r1.headers['x-refresh-token']).toBeTruthy();
    t.clock.set(new Date(Date.now() + 16 * 60000));
    expect((await t.api.get('/api/auth/me').set('Authorization', `Bearer ${tok}`)).status).toBe(401);
    t.clock.set(null);
  });
  it('NFR-SEC-05 (OWASP checks) protected endpoints reject missing or tampered tokens; SQL injection text is inert', async () => {
    expect((await t.pub.get('/me/overview')).status).toBe(401);
    expect((await t.api.get('/api/me/overview').set('Authorization', 'Bearer x.y.z')).status).toBe(401);
    const inj = await t.pub.post('/auth/login', { email: "' OR 1=1 --", password: 'x' }); expect(inj.status).toBe(401);
    expect((await t.pub.get("/catalogue/trims?brand=Toyota' OR '1'='1")).body).toEqual([]);
    const h = await t.api.get('/api/catalogue/filters'); expect(h.headers['x-powered-by']).toBeUndefined(); expect(h.headers['x-content-type-options']).toBe('nosniff');
  });
  it('FR-ADM-01 roles: customer cannot reach staff or admin endpoints; customer sees only own deals', async () => {
    expect((await S.cust.get('/admin/users')).status).toBe(403);
    expect((await S.cust.get('/inventory/cars')).status).toBe(403);
    expect((await S.c1.get('/admin/users')).status).toBe(403);
    expect((await S.gm.post('/payments', { deal_id: 1, kind: 'deposit', amount: 1, currency: 'USD', method: 'cash' })).status).toBe(403);
  });
  it('FR-ADM-02 admin creates, edits, deactivates users; deactivated cannot log in', async () => {
    const c = await S.admin.post('/admin/users', { name: 'Temp Staff', email: 'temp@fsm.lb', role: 'sales_consultant', password: 'Temp!Pass123' });
    expect(c.status).toBe(201);
    expect((await t.pub.post('/auth/login', { email: 'temp@fsm.lb', password: 'Temp!Pass123' })).status).toBe(200);
    expect((await S.admin.put(`/admin/users/${c.body.id}`, { role: 'accountant' })).status).toBe(200);
    expect((await S.admin.post(`/admin/users/${c.body.id}/deactivate`)).status).toBe(200);
    expect((await t.pub.post('/auth/login', { email: 'temp@fsm.lb', password: 'Temp!Pass123' })).status).toBe(403);
    expect((await S.admin.post(`/admin/users/${c.body.id}/activate`)).status).toBe(200);
    expect((await S.admin.post(`/admin/users/${c.body.id}/reset-password`, { password: 'Another!Pass1' })).status).toBe(200);
  });
  it('FR-ADM-03 / NFR-MNT-01 settings changeable without code; exchange-rate history kept', async () => {
    const before = (await S.admin.get('/settings')).body;
    expect(before).toHaveProperty('vat_rate');
    const r = await S.admin.put('/admin/settings', { exchange_rate: 95000, vat_rate: 11 });
    expect(r.status).toBe(200);
    const h = await S.admin.get('/admin/exchange-rate-history'); expect(h.body.length).toBeGreaterThanOrEqual(1);
    expect((await S.admin.put('/admin/settings', { vat_rate: -5 })).status).toBe(400);
    expect((await S.cust.put('/admin/settings', { vat_rate: 5 })).status).toBe(403);
  });
  it('FR-ADM-04 audit log records events and cannot be altered', async () => {
    const a = await S.admin.get('/admin/audit'); expect(a.status).toBe(200);
    const rows = a.body.rows || a.body; expect(rows.length).toBeGreaterThan(0);
    expect(() => t.ctx.db.prepare('UPDATE audit_log SET action = ? WHERE id = 1').run('x')).toThrow();
    expect(() => t.ctx.db.prepare('DELETE FROM audit_log WHERE id = 1').run()).toThrow();
  });
});
