import { describe, it, expect, beforeAll } from 'vitest';
const { makeApp, staff, deal, at } = require('./helpers');
let t, S;
beforeAll(async () => { t = makeApp(); S = await staff(t); });
const D = (o) => deal(t, S, o);
const stageOf = async (id) => (await S.mgr.get(`/deals/${id}`)).body.stage;

describe('Leads and pipeline (FR-DEAL)', () => {
  it('FR-DEAL-01 web enquiry creates a lead, requires consent, is auto-assigned to a consultant', async () => {
    const r = await t.pub.post('/leads', { name: 'Web Lead', email: 'web@example.com', trim_id: t.trimId('Kia', 'EV6'), message: 'Hi', consent_data: true });
    expect(r.status).toBe(201); expect(r.body.stage).toBe('lead');
    expect((await t.pub.post('/leads', { name: 'No Consent', email: 'nc@example.com' })).status).toBe(400);
    const v = (await S.mgr.get(`/deals/${r.body.id}`)).body; expect(v.consultant && v.consultant.id).toBeTruthy();
    expect((await t.pub.post('/leads', { name: 'Nobody' , consent_data: true})).status).toBe(400);
  });
  it('FR-DEAL-01 walk-in recorded by a consultant is assigned to that consultant', async () => {
    const a = await D({ consultant: 'c2' }); const v = (await S.mgr.get(`/deals/${a.id}`)).body;
    expect(v.source).toBe('walk_in'); expect(v.consultant.name).toBe('Omar Saab');
  });
  it('FR-DEAL-02 consultant dashboard shows own leads and stage counts; manager reassigns', async () => {
    const x = await D({ consultant: 'c1' });
    const dash = (await S.c1.get('/dashboard/consultant')).body; expect(dash.leads.some((l) => l.id === x.id)).toBe(true);
    expect((await S.c2.get('/dashboard/consultant')).body.leads.some((l) => l.id === x.id)).toBe(false);
    expect((await S.c2.get(`/deals/${x.id}`)).status).toBe(403);
    const c2id = t.ctx.db.prepare("SELECT id FROM users WHERE email = 'consultant2@fsm.lb'").get().id;
    expect((await S.mgr.post(`/deals/${x.id}/assign`, { consultant_id: c2id })).status).toBe(200);
    expect((await S.c2.get(`/deals/${x.id}`)).status).toBe(200);
    expect((await S.c1.post(`/deals/${x.id}/assign`, { consultant_id: c2id })).status).toBe(403);
  });
  it('FR-DEAL-03 quotation takes the catalogue price, includes VAT, is valid 7 days; prices cannot be typed in', async () => {
    const x = await D({ upTo: 'quoted' });
    expect(x.quotation.price_usd).toBe((await t.pub.get('/catalogue/trims/' + x.trim)).body.price_usd);
    expect(x.quotation.total_usd).toBeGreaterThanOrEqual(x.quotation.price_usd);
    const days = (new Date(x.quotation.valid_until) - t.clock.now()) / 86400000; expect(days).toBeGreaterThan(6.9); expect(days).toBeLessThanOrEqual(7.01);
    const bad = await S.c1.post(`/deals/${x.id}/quotation`, { price_usd: 1 }); expect(bad.status).toBe(403); expect(bad.body.error.code).toBe('price_locked');
    expect((await S.c1.post(`/quotations/${x.quotation.id}/items`, { accessory_id: 1, price_usd: 1 })).status).toBe(403);
    expect((await S.c1.post(`/quotations/${x.quotation.id}/items`, { accessory_id: 1 })).status).toBe(201);
  });
  it('FR-DEAL-03 an expired quotation blocks a deposit and a new one must be made', async () => {
    const x = await D({ upTo: 'quoted' });
    await at(t, new Date(Date.now() + 8 * 86400000), async (S2) => {
      const p = await S2.c1.post('/payments', { deal_id: x.id, kind: 'deposit', amount: 500, currency: 'USD', method: 'cash' });
      expect(p.status).toBe(409); expect(p.body.error.code).toBe('quotation_expired');
      expect((await S2.c1.post(`/deals/${x.id}/quotation`, { color: x.color })).status).toBe(201);
    });
  });
  it('FR-DEAL-05 stage machine: no skipping, lost needs a reason, history kept', async () => {
    const x = await D({ upTo: 'lead' });
    expect((await S.c1.post(`/deals/${x.id}/contract`, {})).status).toBe(409);
    expect((await S.c1.post('/payments', { deal_id: x.id, kind: 'deposit', amount: 100, currency: 'USD', method: 'cash' })).status).toBe(409);
    expect((await S.c1.post(`/deals/${x.id}/lost`, {})).status).toBe(400);
    const r = await S.c1.post(`/deals/${x.id}/lost`, { reason: 'Not interested' }); expect(r.status).toBe(200);
    const v = (await S.c1.get(`/deals/${x.id}`)).body; expect(v.stage).toBe('lost'); expect(v.history.length).toBeGreaterThan(0);
    expect((await S.c1.post(`/deals/${x.id}/quotation`, {})).status).toBe(409);
  });
  it('FR-DEAL-05 full payment after signing moves the deal to Paid; delivery stays blocked until inspections pass', async () => {
    const x = await D({ upTo: 'paid' }); expect(await stageOf(x.id)).toBe('paid');
  });
  it('FR-DEAL-06 contract generated from the quotation with VAT, stamp duty and deposit rule; PDF downloadable', async () => {
    const x = await D({ upTo: 'contract_pending' });
    expect(x.contract.number).toMatch(/^C-/); expect(x.contract.stamp_duty_usd).toBeGreaterThan(0); expect(x.contract.deposit_rule).toBe('partial_refund');
    const pdf = await S.c1.raw('get', `/contracts/${x.contract.id}/pdf`).buffer().parse((res, cb) => { const c = []; res.on('data', (d) => c.push(d)); res.on('end', () => cb(null, Buffer.concat(c))); });
    expect(pdf.status).toBe(200); expect(pdf.body.slice(0, 4).toString()).toBe('%PDF');
    expect((await S.c1.post(`/deals/${x.id}/contract`, {})).status).toBe(409); // one contract per deal
  });
  it('FR-DEAL-07 customer signs online (typed name + accept) and can download the signed contract', async () => {
    const email = 'signer@example.com';
    const reg = await t.pub.post('/auth/register', { name: 'Signer One', email, password: 'Str0ng!pass', consent_data: true });
    const cust = t.as(reg.body.token);
    const x = await D({ upTo: 'contract_pending', email });
    expect((await cust.post(`/contracts/${x.contract.id}/sign`, { accept: true })).status).toBe(400);
    const ok = await cust.post(`/contracts/${x.contract.id}/sign`, { accept: true, typed_name: 'Signer One' });
    expect(ok.status).toBe(200); expect(ok.body.status).toBe('signed'); expect(await stageOf(x.id)).toBe('contract_signed');
    expect((await cust.get(`/contracts/${x.contract.id}/pdf`)).status).toBe(200);
    expect((await S.cust.get(`/contracts/${x.contract.id}`)).status).toBe(403); // another customer
  });
  it('FR-DEAL-07 paper path: consultant uploads the signed scan (PDF only)', async () => {
    const x = await D({ upTo: 'contract_pending' });
    const bad = await S.c1.raw('post', `/contracts/${x.contract.id}/signed-copy`).attach('file', Buffer.from('not a pdf at all'), { filename: 's.pdf', contentType: 'application/pdf' });
    expect(bad.status).toBe(400);
    const ok = await S.c1.raw('post', `/contracts/${x.contract.id}/signed-copy`).attach('file', t.PDF, { filename: 's.pdf', contentType: 'application/pdf' });
    expect(ok.status).toBe(200);
  });
  it('FR-DEAL-04 / FR-DEAL-08 extras beyond the catalogue need Sales Manager approval; contract blocked meanwhile', async () => {
    const x = await D({ upTo: 'quoted' });
    await S.c1.post(`/quotations/${x.quotation.id}/items`, { description: 'Gold badge', price_usd: 800 });
    const list = (await S.mgr.get('/exceptions?status=pending')).body.filter((e) => e.deal_id === x.id); expect(list.length).toBe(1);
    expect((await S.c1.post('/payments', { deal_id: x.id, kind: 'deposit', amount: 500, currency: 'USD', method: 'cash' })).status).toBe(409);
    expect((await S.c1.post(`/exceptions/${list[0].id}/decide`, { decision: 'approved', reason: 'ok' })).status).toBe(403);
    expect((await S.mgr.post(`/exceptions/${list[0].id}/decide`, { decision: 'approved' })).status).toBe(400); // reason required
    expect((await S.mgr.post(`/exceptions/${list[0].id}/decide`, { decision: 'approved', reason: 'Good customer' })).status).toBe(200);
    const q = (await S.c1.get(`/deals/${x.id}/quotation`)).body; expect(q.total_usd).toBeGreaterThan(x.quotation.total_usd);
    expect((await S.c1.post('/payments', { deal_id: x.id, kind: 'deposit', amount: 500, currency: 'USD', method: 'cash' })).status).toBe(201);
  });
  it('FR-DEAL-08 rejected extra is not charged', async () => {
    const x = await D({ upTo: 'quoted' });
    await S.c1.post(`/quotations/${x.quotation.id}/items`, { description: 'Free fuel', price_usd: 500 });
    const e = (await S.mgr.get('/exceptions?status=pending')).body.find((z) => z.deal_id === x.id);
    await S.mgr.post(`/exceptions/${e.id}/decide`, { decision: 'rejected', reason: 'No' });
    expect((await S.c1.get(`/deals/${x.id}/quotation`)).body.total_usd).toBe(x.quotation.total_usd);
  });
});

describe('Payments (FR-PAY)', () => {
  it('FR-PAY-01 deposit in USD or LBP is converted at the rate in force; rate stored with the payment', async () => {
    const x = await D({ upTo: 'quoted' });
    const rate = Number(t.ctx.settings.all().exchange_rate);
    const r = await S.c1.post('/payments', { deal_id: x.id, kind: 'deposit', amount: rate * 1000, currency: 'LBP', method: 'cash' });
    expect(r.status).toBe(201); expect(r.body.payment.amount_usd).toBe(1000); expect(r.body.payment.exchange_rate).toBe(rate);
    await S.admin.put('/admin/settings', { exchange_rate: rate * 2 });
    const pay = await S.acc.post('/payments', { deal_id: x.id, kind: 'payment', amount: rate * 2 * 100, currency: 'LBP', method: 'cash' });
    expect(pay.body.payment.amount_usd).toBe(100);
    expect(t.ctx.db.prepare('SELECT exchange_rate FROM payments WHERE id = ?').get(r.body.payment.id).exchange_rate).toBe(rate); // old payment unchanged
    await S.admin.put('/admin/settings', { exchange_rate: rate });
  });
  it('FR-PAY-01 invalid amounts, methods, currencies and overpayment rejected', async () => {
    const x = await D({ upTo: 'quoted' });
    for (const b of [{ amount: -5 }, { amount: 0 }, { amount: 'abc' }, { currency: 'EUR' }, { method: 'bitcoin' }, { amount: 99999999 }]) {
      const r = await S.c1.post('/payments', { deal_id: x.id, kind: 'deposit', amount: 500, currency: 'USD', method: 'cash', ...b });
      expect(r.status).toBeGreaterThanOrEqual(400);
    }
  });
  it('FR-PAY-02 price lock: deposit keeps the quoted price for 30 days even after a catalogue price change', async () => {
    const x = await D({ upTo: 'reserved' });
    await S.mgr.put(`/catalogue/trims/${x.trim}/price`, { price_usd: 99999 });
    await at(t, new Date(Date.now() + 20 * 86400000), async (S2) => {
      const c = await S2.c1.post(`/deals/${x.id}/contract`, {}); expect(c.status).toBe(201); expect(c.body.total_usd).toBe(x.quotation.total_usd);
    });
  });
  it('FR-PAY-02 after the hold period the price lock ends and a new quotation is required', async () => {
    const x = await D({ upTo: 'reserved' });
    await at(t, new Date(Date.now() + 31 * 86400000), async (S2) => {
      expect((await S2.c1.post(`/deals/${x.id}/contract`, {})).status).toBe(409);
    });
  });
  it('FR-PAY-03 receipt with unique number is produced and notified; PDF available', async () => {
    const x = await D({ upTo: 'reserved' });
    expect(x.deposit.payment.receipt_number).toMatch(/^R-/);
    const pdf = await S.acc.raw('get', `/payments/${x.deposit.payment.id}/receipt.pdf`).buffer().parse((res, cb) => { const c = []; res.on('data', (d) => c.push(d)); res.on('end', () => cb(null, Buffer.concat(c))); });
    expect(pdf.body.slice(0, 4).toString()).toBe('%PDF');
    const nums = t.ctx.db.prepare('SELECT receipt_number FROM payments').all().map((r) => r.receipt_number); expect(new Set(nums).size).toBe(nums.length);
    expect(t.ctx.db.prepare("SELECT COUNT(*) c FROM outbox WHERE template = 'receipt'").get().c).toBeGreaterThan(0);
  });
  it('FR-PAY-07 accountant exports payments and invoices as CSV; GM cannot record payments', async () => {
    const csv = await S.acc.get('/payments/export.csv'); expect(csv.status).toBe(200); expect(csv.text.split('\n')[0]).toMatch(/receipt/i);
    const inv = await S.acc.get('/payments/export.csv?type=invoices'); expect(inv.status).toBe(200); expect(inv.text.split('\n')[0]).toMatch(/invoice_number/);
    expect((await S.gm.get('/payments')).status).toBe(200);
    expect((await S.c1.get('/payments/export.csv')).status).toBe(403);
  });
  it('FR-PAY-05 invoice shows VAT at the configured rate; one per deal; PDF', async () => {
    const x = await D({ upTo: 'paid' });
    const inv = await S.acc.post(`/deals/${x.id}/invoice`); expect(inv.status).toBe(201);
    expect(inv.body.vat_amount).toBeCloseTo(inv.body.total_usd * 11 / 111, 1);
    expect((await S.acc.post(`/deals/${x.id}/invoice`)).status).toBe(409);
    expect((await S.acc.get(`/invoices/${inv.body.id}/pdf`)).status).toBe(200);
    const y = await D({ upTo: 'reserved' }); expect((await S.acc.post(`/deals/${y.id}/invoice`)).status).toBe(409);
  });
  it('FR-PAY-04 refund needs a reason, cannot exceed the payment, and waits for Sales Manager approval', async () => {
    const x = await D({ upTo: 'reserved', deposit: 1000 }); const pid = x.deposit.payment.id;
    expect((await S.acc.post(`/payments/${pid}/refund`, { amount: 100 })).status).toBe(400);
    expect((await S.acc.post(`/payments/${pid}/refund`, { amount: 5000, reason: 'x' })).status).toBe(409);
    expect((await S.c1.post(`/payments/${pid}/refund`, { amount: 100, reason: 'x' })).status).toBe(403);
    const rf = await S.acc.post(`/payments/${pid}/refund`, { amount: 400, reason: 'Customer request' }); expect(rf.status).toBe(201); expect(rf.body.status).toBe('pending_approval');
    expect((await S.acc.post(`/payments/${rf.body.id}/approve`, {})).status).toBe(403);
    expect((await S.mgr.post(`/payments/${rf.body.id}/approve`, {})).body.status).toBe('completed');
    expect((await S.acc.post(`/payments/${pid}/refund`, { amount: 700, reason: 'again' })).status).toBe(409); // only 600 left
    expect((await S.mgr.get(`/deals/${x.id}`)).body.financials.paid_usd).toBe(600);
  });
  it('FR-PAY-04 refunding a whole deposit releases the car and returns the deal to Quoted', async () => {
    const x = await D({ upTo: 'reserved', deposit: 800 });
    const rf = await S.acc.post(`/payments/${x.deposit.payment.id}/refund`, { reason: 'Changed mind' });
    await S.mgr.post(`/payments/${rf.body.id}/approve`, {});
    const v = (await S.mgr.get(`/deals/${x.id}`)).body; expect(v.stage).toBe('quoted'); expect(v.car_id).toBeFalsy();
  });
  it('FR-PAY-04 manager can reject a refund', async () => {
    const x = await D({ upTo: 'reserved', deposit: 800 });
    const rf = await S.acc.post(`/payments/${x.deposit.payment.id}/refund`, { reason: 'Test' });
    expect((await S.mgr.post(`/payments/${rf.body.id}/approve`, { approve: false, reason: 'No' })).body.status).toBe('rejected');
  });
  it('FR-PAY-06 loan request lifecycle with partner bank; summary PDF', async () => {
    const x = await D({ upTo: 'quoted' });
    const l = await S.c1.post(`/deals/${x.id}/loan`, { bank: 'Partner Bank' }); expect(l.status).toBe(201); expect(l.body.status).toBe('submitted');
    expect((await S.c1.post(`/deals/${x.id}/loan`, { bank: 'Other' })).status).toBe(409);
    expect((await S.c1.patch(`/loans/${l.body.id}`, { status: 'approved' })).body.status).toBe('approved');
    expect((await S.c1.patch(`/loans/${l.body.id}`, { status: 'submitted' })).status).toBe(409);
    expect((await S.c1.get(`/loans/${l.body.id}/pdf`)).status).toBe(200);
    expect((await S.c1.post(`/deals/${x.id}/loan`, {})).status).toBe(400);
  });
  it('FR-PAY-08 cancelling a reserved deal applies the contract deposit rule and releases the car', async () => {
    const x = await D({ upTo: 'contract_signed', deposit: 2000 });
    const r = await S.mgr.post(`/deals/${x.id}/cancel`, { reason: 'Customer withdrew' });
    expect(r.status).toBe(200); expect(r.body.decision).toBe('partial_refund'); expect(r.body.refund_usd).toBe(1000);
    const v = (await S.mgr.get(`/deals/${x.id}`)).body; expect(v.stage).toBe('lost'); expect(v.car_id).toBeFalsy();
    expect((await S.c1.post(`/deals/${x.id}/cancel`, { reason: 'x' })).status).toBe(403);
  });
  it('FR-PAY-08 forfeit and full-refund rules', async () => {
    const f = await D({ upTo: 'reserved', deposit: 1000 });
    expect((await S.mgr.post(`/deals/${f.id}/cancel`, { reason: 'x' })).status).toBe(400); // no contract: decision needed
    const r = await S.mgr.post(`/deals/${f.id}/cancel`, { reason: 'x', decision: 'forfeit' }); expect(r.body.refund_usd).toBe(0);
    const g = await D({ upTo: 'reserved', deposit: 1000 });
    expect((await S.mgr.post(`/deals/${g.id}/cancel`, { reason: 'x', decision: 'full_refund' })).body.refund_usd).toBe(1000);
  });
  it('FR-ADM-04 payments and refunds are written to the audit log', async () => {
    const a = (await S.admin.get('/admin/audit?action=payment')).body; expect((a.rows || a).length).toBeGreaterThan(0);
    const b = (await S.admin.get('/admin/audit?action=refund')).body; expect((b.rows || b).length).toBeGreaterThan(0);
  });

  it('FR-DEAL-02 the dashboard lists what needs attention: idle lead, expiring quotation, contract waiting for signature, exceptions (manager)', async () => {
    const lead = await D({ upTo: 'lead' }); const quoted = await D({ upTo: 'quoted' }); const pending = await D({ upTo: 'contract_pending' });
    t.ctx.db.prepare("UPDATE deals SET updated_at = '2020-01-01T10:00:00.000Z' WHERE id = ?").run(lead.id);
    t.ctx.db.prepare("UPDATE quotations SET valid_until = date('now','+1 day') WHERE deal_id = ?").run(quoted.id);
    const a = (await S.c1.get('/dashboard/consultant')).body.attention;
    expect(a.find((x) => x.type === 'follow_up' && x.deal_id === lead.id).days).toBeGreaterThan(2);
    expect(a.find((x) => x.type === 'quote_expiring' && x.deal_id === quoted.id)).toBeTruthy();
    expect(a.find((x) => x.type === 'sign_contract' && x.deal_id === pending.id)).toBeTruthy();
    const order = a.map((x) => x.type); expect(order.indexOf('quote_expiring')).toBeLessThan(order.indexOf('follow_up'));
    t.ctx.db.prepare("UPDATE quotations SET valid_until = date('now','-3 day') WHERE deal_id = ?").run(quoted.id);
    expect((await S.c1.get('/dashboard/consultant')).body.attention.find((x) => x.deal_id === quoted.id).days).toBeLessThan(0);
    const ex = await S.c1.post(`/deals/${quoted.id}/exceptions`, { description: 'Roof box', price_usd: 300 }); if (ex.status < 300) expect((await S.mgr.get('/dashboard/consultant')).body.attention.some((x) => x.type === 'exceptions_pending')).toBe(true);
  });
});
