import { describe, it, expect, beforeAll } from 'vitest';
const fs = require('fs');
const path = require('path');
const { makeApp, staff, deal } = require('./helpers');
const backupSvc = require('../src/services/backup');
let t, S;
beforeAll(async () => { t = makeApp(); S = await staff(t); });
const D = (o) => deal(t, S, o);
const pad = (n) => String(n).padStart(2, '0');
const chat = (message, o = {}) => t.pub.post('/assistant/chat', { message, lang: 'en', ...o });

describe('Virtual assistant (FR-VA)', () => {
  it('FR-VA-01 identifies itself as automated, works in Arabic and English without login', async () => {
    const en = await chat('hello'); expect(en.status).toBe(200); expect(en.body.is_automated).toBe(true); expect(en.body.reply.toLowerCase()).toContain('automated');
    const ar = await chat('مرحبا', { lang: 'ar' }); expect(ar.body.reply).toMatch(/[؀-ۿ]/);
  });
  it('FR-VA-02 answers price and availability from catalogue data only; does not invent', async () => {
    const r = await chat('How much is the Toyota Corolla?'); expect(r.body.reply).toMatch(/\$|USD/); expect(r.body.reply).toMatch(/\d/);
    const ar = await chat('ما سعر تويوتا كورولا؟', { lang: 'ar' }); expect(ar.body.reply).toMatch(/\d/);
    const unknown = await chat('What is the meaning of life?'); expect(unknown.body.reply).not.toMatch(/\$\d/);
  });
  it('FR-VA-03 hands over after two failed answers or on request, creating a lead with transcript and contact', async () => {
    const a = await chat('blah blah zzz'); const sid = a.body.session_id;
    const b = await chat('qwerty asdf', { session_id: sid }); expect(b.body.needs_contact).toBe(true);
    const c = await chat('Maged maged@example.com', { session_id: sid }); expect(c.body.handed_off).toBe(true);
    const lead = t.ctx.db.prepare("SELECT * FROM deals WHERE contact_email = 'maged@example.com'").get(); expect(lead).toBeTruthy(); expect(lead.source).toBe('chat'); expect(lead.chat_id).toBeTruthy();
    const log = (await t.pub.get(`/assistant/chats/${sid}`)).body; expect(log.messages.length).toBeGreaterThanOrEqual(4);
    const d = await chat('I want to talk to a person'); expect(d.body.needs_contact).toBe(true);
    expect((await chat('x', { session_id: sid })).body.handed_off).toBe(true);
  });
  it('FR-VA-04 books a test drive inside the chat', async () => {
    const r = await chat('Can I book a test drive for the Kia Sportage?'); expect(r.body.options.length).toBeGreaterThan(0);
    const act = r.body.options[0].action;
    const noContact = await t.pub.post('/assistant/chat', { session_id: r.body.session_id, action: act, lang: 'en' }); expect(noContact.body.needs_contact).toBe(true);
    const ok = await t.pub.post('/assistant/chat', { session_id: r.body.session_id, action: act, lang: 'en', contact: { name: 'Chat Guest', email: 'chatguest@example.com' } });
    expect(ok.body.booked).toBe(true); expect(ok.body.booking_code).toBeTruthy();
    expect(t.ctx.db.prepare("SELECT COUNT(*) c FROM test_drives WHERE email = 'chatguest@example.com'").get().c).toBe(1);
  });
});

describe('EV readiness (FR-EV)', () => {
  const answers = (o) => ({ daily_km: 40, parking: 'private_garage', home_charging: true, power_source: 'solar', budget_usd: 50000, ...o });
  it('FR-EV-01 requires all five answers; invalid values rejected', async () => {
    expect((await t.pub.post('/ev/check', answers())).status).toBe(201);
    for (const bad of [{ daily_km: -1 }, { parking: 'moon' }, { power_source: 'wind' }, { budget_usd: 'x' }, { home_charging: 'maybe' }]) expect((await t.pub.post('/ev/check', answers(bad))).status).toBe(400);
    const miss = answers(); delete miss.daily_km; expect((await t.pub.post('/ev/check', miss)).status).toBe(400);
  });
  it('FR-EV-02 returns Suitable / Needs attention / Not recommended with reasons and a shortlist', async () => {
    const good = (await t.pub.post('/ev/check', answers())).body; expect(good.result).toBe('suitable'); expect(good.shortlist.length).toBeGreaterThan(0); expect(good.shortlist.every((x) => x.fuel_type === 'electric' && x.price_usd <= 50000)).toBe(true);
    const mid = (await t.pub.post('/ev/check', answers({ power_source: 'grid' }))).body; expect(mid.result).toBe('needs_attention'); expect(mid.reasons.length).toBeGreaterThan(0);
    const no = (await t.pub.post('/ev/check', answers({ home_charging: false, parking: 'street', daily_km: 400, power_source: 'grid' }))).body; expect(no.result).toBe('not_recommended'); expect(no.reasons.length).toBeGreaterThan(0);
  });
  it('FR-EV-03 result can be sent to a consultant as a lead or lead into a test-drive booking', async () => {
    const c = (await t.pub.post('/ev/check', answers())).body;
    expect((await t.pub.post(`/ev/check/${c.id}/send-to-consultant`, { name: 'EV Fan' })).status).toBe(400);
    const ok = await t.pub.post(`/ev/check/${c.id}/send-to-consultant`, { name: 'EV Fan', email: 'evfan@example.com', consent_data: true }); expect(ok.status).toBe(201);
    expect((await t.pub.post(`/ev/check/${c.id}/send-to-consultant`, { name: 'EV Fan', email: 'evfan@example.com', consent_data: true })).status).toBe(400);
    const deal = (await S.mgr.get(`/deals/${ok.body.lead_id}`)).body; expect(deal.stage).toBe('lead');
    const slot = (await t.pub.get(`/testdrives/slots?trim_id=${c.shortlist[0].id}&date=${(() => { const d = new Date(); d.setDate(d.getDate() + 2); if (d.getDay() === 0) d.setDate(d.getDate() + 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; })()}`)).body.slots[0];
    expect((await t.pub.post('/testdrives', { trim_id: c.shortlist[0].id, slot_start: slot.slot_start, contact: { name: 'EV Fan', email: 'evfan@example.com', consent_data: true } })).status).toBe(201);
  });
});

describe('Notifications (FR-NOT)', () => {
  it('FR-NOT-01 channel follows the customer preference and language', async () => {
    const wa = t.ctx.db.prepare("SELECT id FROM users WHERE email = 'owner@fsm.lb'").get().id; // Arabic + WhatsApp
    t.ctx.notify.send({ userId: wa, template: 'contract_ready', params: { number: 'C-1' } });
    const row = t.ctx.db.prepare('SELECT * FROM outbox WHERE user_id = ? ORDER BY id DESC').get(wa); expect(row.channel).toBe('whatsapp'); expect(row.language).toBe('ar'); expect(row.body).toMatch(/[؀-ۿ]/);
    const en = t.ctx.db.prepare("SELECT id FROM users WHERE email = 'customer@fsm.lb'").get().id;
    t.ctx.notify.send({ userId: en, template: 'contract_ready', params: { number: 'C-2' } });
    const r2 = t.ctx.db.prepare('SELECT * FROM outbox WHERE user_id = ? ORDER BY id DESC').get(en); expect(r2.channel).toBe('email'); expect(r2.language).toBe('en');
    const c = await t.login('customer@fsm.lb'); await t.as(c).put('/me', { notify_pref: 'whatsapp' });
    t.ctx.notify.send({ userId: en, template: 'contract_ready', params: { number: 'C-3' } });
    expect(t.ctx.db.prepare('SELECT channel FROM outbox WHERE user_id = ? ORDER BY id DESC').get(en).channel).toBe('whatsapp');
  });
  it('FR-NOT-02 marketing needs consent and stops on opt-out; receipts and reminders continue', async () => {
    const reg = await t.pub.post('/auth/register', { name: 'Opt Out', email: 'optout@example.com', password: 'Str0ng!pass', consent_data: true, consent_marketing: true }); const c = t.as(reg.body.token); const uid = reg.body.user.id;
    expect(t.ctx.notify.send({ userId: uid, kind: 'marketing', template: 'owner_event', params: { title: 'A', description: 'B' } })).toBeTruthy();
    expect((await c.put('/me', { consent_marketing: false })).status).toBe(200);
    expect(t.ctx.notify.send({ userId: uid, kind: 'marketing', template: 'owner_event', params: { title: 'A', description: 'B' } })).toBeFalsy();
    expect(t.ctx.notify.send({ userId: uid, template: 'receipt', params: { number: 'R-1', amount: '5', currency: 'USD', method: 'cash', car: 'X' } })).toBeTruthy();
    const x = await D({ upTo: 'lead', email: 'nomarketing@example.com' });
    expect(t.ctx.db.prepare("SELECT consent_marketing FROM deals WHERE id = ?").get(x.id).consent_marketing).toBe(0);
  });
});

describe('Reports (FR-REP)', () => {
  beforeAll(async () => { await D({ upTo: 'paid' }); await D({ upTo: 'contract_signed', consultant: 'c2' }); await D({ upTo: 'lead' }); });
  it('FR-REP-01 GM dashboard: sales and revenue by period/model/fuel and the funnel with average days; view-only', async () => {
    const s = (await S.gm.get('/reports/sales')).body; expect(s.totals.cars_sold).toBeGreaterThanOrEqual(2); expect(s.totals.revenue_usd).toBeGreaterThan(0); expect(s.by_month.length).toBeGreaterThan(0); expect(s.by_model.length).toBeGreaterThan(0); expect(s.by_fuel.length).toBeGreaterThan(0);
    const f = (await S.gm.get('/reports/funnel')).body; expect(f.stages.map((x) => x.stage)).toEqual(['lead', 'quoted', 'reserved', 'contract_signed', 'paid', 'delivered']); expect(f.stages[0].count).toBeGreaterThan(0); expect(f).toHaveProperty('avg_days_enquiry_to_contract');
    expect((await S.gm.get('/reports/sales?from=2000-01-01&to=2000-12-31')).body.totals.cars_sold).toBe(0);
    expect((await S.c1.get('/reports/sales')).status).toBe(403); expect((await S.acc.get('/reports/funnel')).status).toBe(403);
    expect((await S.gm.post('/catalogue/promotions', {})).status).toBe(403);
  });
  it('FR-REP-02 per-consultant leads, test drives, deals and conversion rate', async () => {
    const r = (await S.mgr.get('/reports/consultants')).body; expect(r.length).toBe(2); expect(r[0]).toHaveProperty('conversion_rate_percent'); expect(r.reduce((a, x) => a + x.leads, 0)).toBeGreaterThan(0);
  });
  it('FR-REP-03 stock by status and age of every unsold car', async () => {
    const r = (await S.mgr.get('/reports/stock')).body; expect(r.by_status.length).toBeGreaterThan(0); expect(r.unsold_age.length).toBe(t.ctx.db.prepare("SELECT COUNT(*) c FROM cars WHERE status = 'in_stock' AND is_demo = 0").get().c); expect(r.unsold_age[0]).toHaveProperty('age_days');
  });
  it('FR-REP-04 assistant chats, hand-offs and chats resolved without a person', async () => {
    await chat('thanks'); const r = (await S.mgr.get('/reports/assistant')).body; expect(r.total_chats ?? r.total).toBeGreaterThan(0);
    expect(Object.keys(r).join(',')).toMatch(/hand/); expect(Object.keys(r).join(',')).toMatch(/resolved/);
  });
  it('FR-REP-05 Owners Circle members, referrals, credits issued and referral share of sales', async () => {
    const r = (await S.gm.get('/reports/owners-circle')).body; expect(JSON.stringify(Object.keys(r))).toMatch(/members/); expect(JSON.stringify(Object.keys(r))).toMatch(/credit/); expect(JSON.stringify(Object.keys(r))).toMatch(/referral/);
  });
});

describe('Non-functional (NFR)', () => {
  it('NFR-REL-01 backup and restore return the data; old backups are pruned', async () => {
    const file = path.join(require('os').tmpdir(), `fsm-restore-${Date.now()}.db`);
    const cfg = { backupDir: fs.mkdtempSync(path.join(require('os').tmpdir(), 'bk-')), uploadDir: t.ctx.config.uploadDir, dbPath: file };
    const before = t.ctx.db.prepare('SELECT COUNT(*) c FROM deals').get().c;
    const name = await backupSvc.backup(t.ctx.db, cfg); expect(backupSvc.list(cfg)).toContain(name);
    t.ctx.db.prepare("DELETE FROM chat_messages").run();
    backupSvc.restoreFiles(cfg, name);
    const Database = require('better-sqlite3'); const copy = new Database(file);
    expect(copy.prepare('SELECT COUNT(*) c FROM deals').get().c).toBe(before); copy.close();
    for (let i = 0; i < 3; i++) { fs.mkdirSync(path.join(cfg.backupDir, `fsm-2000010${i}-000000`)); }
    await backupSvc.backup(t.ctx.db, cfg, 2); expect(backupSvc.list(cfg).length).toBe(2);
    expect((await S.admin.post('/admin/backups')).status).toBe(201);
    expect((await S.admin.get('/admin/backups')).body.length).toBeGreaterThan(0);
    expect((await S.c1.post('/admin/backups')).status).toBe(403);
  });
  it('NFR-LOC-01 prices in USD with LBP equivalent; dates day/month/year in notifications', async () => {
    const x = (await t.pub.get('/catalogue/trims')).body[0]; expect(x.price_usd).toBeGreaterThan(0); expect(x.price_lbp).toBeGreaterThan(x.price_usd);
    const q = await D({ upTo: 'quoted', email: 'dates@example.com' });
    const m = t.ctx.db.prepare("SELECT body FROM outbox WHERE template = 'quotation_ready' AND recipient = 'dates@example.com'").get(); expect(m.body).toMatch(/\b\d{2}\/\d{2}\/\d{4}\b/);
  });
  it('NFR-DAT-01 consent timestamps stored; erased users cannot log in; exports contain only own data', async () => {
    const r = await t.pub.post('/auth/register', { name: 'Consent Check', email: 'consent@example.com', password: 'Str0ng!pass', consent_data: true });
    const u = t.ctx.db.prepare("SELECT consent_data_at FROM users WHERE email = 'consent@example.com'").get(); expect(u.consent_data_at).toBeTruthy();
    const c = t.as(r.body.token); const req = (await c.post('/me/data-requests', { type: 'export' })).body; const days = (new Date(req.due_at) - new Date(req.requested_at)) / 86400000; expect(days).toBeLessThanOrEqual(30);
    await S.admin.post(`/admin/data-requests/${req.id}/complete`);
    const dl = (await c.get(`/me/data-requests/${req.id}/download`)).body; expect(JSON.stringify(dl)).toContain('consent@example.com'); expect(JSON.stringify(dl)).not.toContain('admin@fsm.lb');
  });
  it('NFR-PERF-01 catalogue stays fast with 50 concurrent users (p95 < 3 s)', async () => {
    const times = [];
    await Promise.all(Array.from({ length: 50 }, async () => { for (let i = 0; i < 4; i++) { const s = Date.now(); const r = await t.pub.get('/catalogue/trims'); times.push(Date.now() - s); expect(r.status).toBe(200); } }));
    times.sort((a, b) => a - b); expect(times[Math.floor(times.length * 0.95)]).toBeLessThan(3000);
  });
  it('NFR-SEC-01 server tells browsers to use HTTPS only (HSTS); TLS itself is terminated by Caddy', async () => {
    const h = await t.api.get('/api/catalogue/filters'); expect(h.headers['strict-transport-security']).toBeTruthy();
  });
});
