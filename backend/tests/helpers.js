const request = require('supertest');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createApp } = require('../src/app');
const { seedBase, PASSWORD } = require('../src/seed');
const clock = require('../src/clock');

// SYSTEM TEST MODE: when SYSTEM_URL is set the very same tests run over real HTTP against a separately started server process
// (own SQLite file, own clock). The test process keeps a second handle on that database file only to prepare/inspect fixtures.
const REMOTE = process.env.SYSTEM_URL || null;
function syncPost(pathname, body) { // synchronous call so tests can keep using clock.set(...) as a plain function
  const r = require('child_process').spawnSync(process.execPath, ['-e',
    "fetch(process.argv[1],{method:'POST',headers:{'content-type':'application/json'},body:process.argv[2]}).then(r=>r.text()).then(t=>{process.stdout.write(t)}).catch(e=>{console.error(e);process.exit(1)})",
    REMOTE + pathname, JSON.stringify(body || {})], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error('system hook failed: ' + r.stderr);
  return JSON.parse(r.stdout || '{}');
}
const testClock = REMOTE ? {
  set: (d) => { clock.set(d); syncPost('/api/_test/clock', { now: d ? new Date(d).toISOString() : null }); },
  now: () => clock.now(), iso: () => clock.iso(),
} : clock;

function makeApp() {
  const uploadDir = REMOTE ? process.env.SYSTEM_UPLOAD : fs.mkdtempSync(path.join(os.tmpdir(), 'fsm-up-'));
  const backupDir = REMOTE ? process.env.SYSTEM_BACKUP : fs.mkdtempSync(path.join(os.tmpdir(), 'fsm-bk-'));
  const { app, ctx } = createApp({ dbPath: REMOTE ? process.env.SYSTEM_DB : ':memory:', rateLimit: false, config: { uploadDir, backupDir } });
  const base = seedBase(ctx);
  const api = request(REMOTE || app);
  const tokens = {};
  async function login(email, password = PASSWORD) {
    const r = await api.post('/api/auth/login').send({ email, password });
    if (r.status !== 200) throw new Error(`login ${email}: ${r.status} ${JSON.stringify(r.body)}`);
    tokens[email] = r.body.token; return r.body.token;
  }
  const as = (token) => ({
    get: (u) => api.get('/api' + u).set('Authorization', `Bearer ${token}`),
    post: (u, b) => api.post('/api' + u).set('Authorization', `Bearer ${token}`).send(b || {}),
    put: (u, b) => api.put('/api' + u).set('Authorization', `Bearer ${token}`).send(b || {}),
    patch: (u, b) => api.patch('/api' + u).set('Authorization', `Bearer ${token}`).send(b || {}),
    del: (u) => api.delete('/api' + u).set('Authorization', `Bearer ${token}`),
    raw: (m, u) => api[m]('/api' + u).set('Authorization', `Bearer ${token}`),
  });
  const pub = { get: (u) => api.get('/api' + u), post: (u, b) => api.post('/api' + u).send(b || {}) };
  const trimId = (brand, model) => ctx.db.prepare('SELECT id FROM trims WHERE brand = ? AND model = ?').get(brand, model).id;
  const stockColor = (trim) => ctx.db.prepare("SELECT color FROM cars WHERE trim_id = ? AND status = 'in_stock' AND is_demo = 0 ORDER BY id").get(trim).color;
  const PDF = Buffer.from('%PDF-1.4\n% test\n%%EOF');
  return { app, ctx, api, base, login, as, pub, tokens, trimId, stockColor, PDF, clock: testClock, PASSWORD };
}
async function staff(t) {
  const out = {};
  for (const [k, e] of Object.entries({ admin: 'admin@fsm.lb', mgr: 'manager@fsm.lb', c1: 'consultant1@fsm.lb', c2: 'consultant2@fsm.lb', gm: 'gm@fsm.lb', acc: 'accountant@fsm.lb', del: 'delivery@fsm.lb', cust: 'customer@fsm.lb' })) out[k] = t.as(await t.login(e));
  return out;
}
// A deal taken as far as needed
async function deal(t, S, { trim, upTo = 'lead', color, referral_code, email = `c${Math.random().toString(36).slice(2, 8)}@example.com`, deposit = 1000, consultant = 'c1' } = {}) {
  trim = trim || t.ctx.db.prepare("SELECT trim_id id FROM cars WHERE status = 'in_stock' AND is_demo = 0 GROUP BY trim_id ORDER BY COUNT(*) DESC, trim_id LIMIT 1").get().id;
  color = color || t.stockColor(trim);
  const c = S[consultant];
  const lead = await c.post('/leads', { name: 'Test Buyer', email, phone: '+96171000000', trim_id: trim, color, consent_data: true, source: 'walk_in', referral_code });
  if (lead.status !== 201 && lead.status !== 200) throw new Error('lead ' + JSON.stringify(lead.body));
  const id = lead.body.id; const out = { id, email, trim, color };
  if (upTo === 'lead') return out;
  const q = await c.post(`/deals/${id}/quotation`, { color, accessory_ids: [] });
  if (q.status >= 400) throw new Error('quotation ' + JSON.stringify(q.body));
  out.quotation = q.body; if (upTo === 'quoted') return out;
  const p = await c.post('/payments', { deal_id: id, kind: 'deposit', amount: deposit, currency: 'USD', method: 'cash' });
  if (p.status >= 400) throw new Error('deposit ' + JSON.stringify(p.body));
  out.deposit = p.body; if (upTo === 'reserved') return out;
  const ct = await c.post(`/deals/${id}/contract`, { deposit_rule: 'partial_refund', partial_percent: 50 });
  if (ct.status >= 400) throw new Error('contract ' + JSON.stringify(ct.body));
  out.contract = ct.body; if (upTo === 'contract_pending') return out;
  const sc = await c.raw('post', `/contracts/${ct.body.id}/signed-copy`).attach('file', t.PDF, { filename: 's.pdf', contentType: 'application/pdf' });
  if (sc.status >= 400) throw new Error('signed ' + JSON.stringify(sc.body)); if (upTo === 'contract_signed') return out;
  const d = (await c.get(`/deals/${id}`)).body;
  const pay = await S.acc.post('/payments', { deal_id: id, kind: 'payment', amount: d.financials.balance_usd, currency: 'USD', method: 'bank_transfer' });
  if (pay.status >= 400) throw new Error('pay ' + JSON.stringify(pay.body));
  return out;
}
// run fn with the clock moved; staff sessions are re-created at that time and the clock is always restored
async function at(t, date, fn) {
  t.clock.set(date);
  try { return await fn(await staff(t)); } finally { t.clock.set(null); }
}
module.exports = { makeApp, staff, deal, at, PASSWORD };
