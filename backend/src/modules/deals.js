const express = require('express');
const calc = require('../services/calc');
const clock = require('../clock');
const pdf = require('../services/pdf');
const { bad, conflict, notFound, forbidden, required, isEmail, round2, dmy, ymd, parseJson } = require('../util');

// FR-DEAL-01..08 : leads, quotations, exceptions, stages, contracts
const TERMS = [
  '1. The price in this contract is fixed and final. It includes the vehicle, import charges and VAT.',
  '2. Registration fees, insurance and any optional item not listed here are paid separately.',
  '3. The dealership delivers the vehicle after full payment (or an approved bank loan) and a successful pre-delivery inspection.',
  '4. After a deposit, the agreed price is held for the period stated in this contract.',
  '5. If the buyer cancels, the deposit rule stated in this contract applies.',
  '6. Personal data are processed as described in the privacy notice. This contract is governed by Lebanese law.',
].join('\n');

module.exports = function deals(ctx) {
  const { db, auth, audit, notify, settings, core, docs } = ctx;
  const r = express.Router();
  const STAFF_DEALS = auth.requireRole('sales_consultant', 'sales_manager');
  const VIEWERS = ['sales_consultant', 'sales_manager', 'general_manager', 'accountant', 'delivery_coordinator'];

  const staffCanEdit = (u, d) => u.role === 'sales_manager' || (u.role === 'sales_consultant' && d.consultant_id === u.id);
  function canView(u, d) {
    if (!u) return false;
    if (u.role === 'customer') return d.customer_id === u.id;
    if (u.role === 'sales_manager' || u.role === 'general_manager') return true;
    if (u.role === 'sales_consultant') return d.consultant_id === u.id;
    if (['accountant', 'delivery_coordinator'].includes(u.role)) return ['reserved', 'contract_signed', 'paid', 'delivered'].includes(d.stage);
    return false;
  }
  const dealFor = (req, id, mode = 'view') => {
    const d = core.dealOr404(id);
    if (mode === 'edit' ? !staffCanEdit(req.user, d) : !canView(req.user, d)) throw forbidden();
    return d;
  };
  const priceKeys = ['price', 'price_usd', 'total', 'total_usd', 'unit_price'];

  function quotationView(q) {
    if (!q) return null;
    const t = core.quotationTotals(q);
    return { ...q, ...t, expired: new Date(q.valid_until) < clock.now() };
  }
  function contractView(c) {
    if (!c) return null;
    const doc = db.prepare("SELECT id FROM documents WHERE deal_id = ? AND kind = 'signed_contract' ORDER BY id DESC LIMIT 1").get(c.deal_id);
    return { ...c, signed_copy_document_id: doc ? doc.id : null };
  }
  function dealView(d, user) {
    const staff = user.role !== 'customer';
    const trim = core.getTrim(d.trim_id);
    const car = d.car_id ? db.prepare('SELECT id,vin,color,status FROM cars WHERE id = ?').get(d.car_id) : null;
    const contract = db.prepare("SELECT * FROM contracts WHERE deal_id = ? AND status != 'void' ORDER BY id DESC LIMIT 1").get(d.id);
    const loan = db.prepare('SELECT * FROM loans WHERE deal_id = ? ORDER BY id DESC LIMIT 1').get(d.id);
    const payments = db.prepare(`SELECT p.id,p.kind,p.amount,p.currency,p.exchange_rate,p.amount_usd,p.method,p.reference,p.receipt_number,p.status,p.reason,p.linked_payment_id,p.created_at,u.name received_by_name
      FROM payments p LEFT JOIN users u ON u.id = p.received_by WHERE p.deal_id = ? ORDER BY p.id`).all(d.id);
    const fin = core.financials(d.id);
    const base = {
      id: d.id, stage: d.stage, source: d.source, color: d.color, created_at: d.created_at, car_label: core.trimLabel(trim), trim_id: d.trim_id,
      fuel_type: trim && trim.fuel_type, car: car ? { color: car.color, status: car.status, ...(staff ? { id: car.id, vin: car.vin } : {}) } : null, waiting_for_car: !d.car_id && ['reserved', 'contract_signed', 'paid'].includes(d.stage),
      quotation: quotationView(core.latestQuotation(d.id)), contract: contractView(contract), payments, financials: fin, price_locked_until: d.price_locked_until,
      loan: loan || null, contact: { name: d.contact_name, email: d.contact_email, phone: d.contact_phone },
    };
    if (!staff) return base;
    const hist = db.prepare('SELECT h.*, u.name user_name FROM deal_history h LEFT JOIN users u ON u.id = h.user_id WHERE deal_id = ? ORDER BY h.id').all(d.id);
    const cons = d.consultant_id ? db.prepare('SELECT id,name FROM users WHERE id = ?').get(d.consultant_id) : null;
    const ref = db.prepare('SELECT r.status, m.referral_code FROM referrals r JOIN memberships m ON m.id = r.referrer_membership_id WHERE r.deal_id = ?').get(d.id);
    return { ...base, notes: d.notes, lost_reason: d.lost_reason, consultant: cons, history: hist, referral: ref || null, customer_id: d.customer_id,
      exceptions: db.prepare('SELECT * FROM exceptions WHERE deal_id = ? ORDER BY id DESC').all(d.id), language: d.language };
  }

  // ---------- leads (FR-DEAL-01) ----------
  r.post('/leads', (req, res) => {
    const b = req.body || {}; const u = req.user;
    const staff = u && ['sales_consultant', 'sales_manager'].includes(u.role);
    let name, email, phone, lang, customerId = null, source = 'web_form';
    if (u && u.role === 'customer') { name = u.name; email = u.email; phone = u.phone; lang = u.language; customerId = u.id; }
    else {
      required(b, ['name']);
      for (const k of ['name', 'email', 'phone', 'language', 'color', 'message', 'notes', 'referral_code']) if (b[k] != null && typeof b[k] !== 'string') throw bad('invalid_input', `${k} must be text`);
      if (!b.email && !b.phone) throw bad('contact_required', 'An email address or phone number is required');
      if (b.email && !isEmail(b.email)) throw bad('invalid_email', 'Invalid email address');
      if (b.consent_data !== true) throw bad('consent_required', 'Consent to data processing is required');
      name = String(b.name).trim(); email = b.email ? b.email.toLowerCase() : null; phone = b.phone || null; lang = b.language === 'ar' ? 'ar' : 'en';
    }
    if (staff) source = ['walk_in', 'referral'].includes(b.source) ? b.source : 'walk_in';
    if (b.trim_id && !core.getTrim(b.trim_id)) throw notFound('Trim');
    const deal = core.createDeal({ customer_id: customerId, name, email, phone, language: lang, source, trim_id: b.trim_id || null, color: b.color || null,
      notes: b.message || b.notes || null, consent_marketing: !customerId && b.consent_marketing === true, referral_code: b.referral_code, strict_referral: true,
      consultant_id: staff && u.role === 'sales_consultant' ? u.id : undefined, user_id: u && u.id });
    res.status(201).json({ id: deal.id, source: deal.source, stage: deal.stage });
  });

  r.get('/deals', auth.requireRole(...VIEWERS), (req, res) => {
    const where = []; const args = [];
    const u = req.user;
    if (u.role === 'sales_consultant') { where.push('d.consultant_id = ?'); args.push(u.id); }
    if (['accountant', 'delivery_coordinator'].includes(u.role)) where.push("d.stage IN ('reserved','contract_signed','paid','delivered')");
    if (req.query.stage) { where.push('d.stage = ?'); args.push(req.query.stage); }
    if (req.query.q) { where.push('(d.contact_name LIKE ? OR d.contact_email LIKE ? OR d.contact_phone LIKE ?)'); args.push(`%${req.query.q}%`, `%${req.query.q}%`, `%${req.query.q}%`); }
    if (req.query.consultant_id && u.role !== 'sales_consultant') { where.push('d.consultant_id = ?'); args.push(req.query.consultant_id); }
    const rows = db.prepare(`SELECT d.*, c.name consultant_name FROM deals d LEFT JOIN users c ON c.id = d.consultant_id ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY d.updated_at DESC LIMIT 500`).all(...args);
    res.json(rows.map((d) => ({ id: d.id, contact_name: d.contact_name, contact_phone: d.contact_phone, contact_email: d.contact_email, source: d.source, stage: d.stage, car_label: core.trimLabel(core.getTrim(d.trim_id)),
      consultant_name: d.consultant_name, created_at: d.created_at, updated_at: d.updated_at, waiting_for_car: !d.car_id && ['reserved', 'contract_signed', 'paid'].includes(d.stage), ...core.financials(d.id) })));
  });
  // F6: smart order tracker (steps with dates, estimated delivery, delivery-day readiness)
  r.get('/deals/:id/tracker', auth.requireRole(), (req, res) => {
    const d = dealFor(req, req.params.id);
    const hist = db.prepare('SELECT to_stage, MIN(at) at FROM deal_history WHERE deal_id = ? GROUP BY to_stage').all(d.id);
    const at = Object.fromEntries(hist.map((h) => [h.to_stage, h.at]));
    const car = d.car_id ? db.prepare('SELECT status, arrival_date FROM cars WHERE id = ?').get(d.car_id) : null;
    const bk = db.prepare("SELECT slot_start FROM delivery_bookings WHERE deal_id = ? AND status = 'booked'").get(d.id);
    const insp = db.prepare('SELECT COUNT(*) total, COALESCE(SUM(passed),0) passed FROM inspection_items WHERE deal_id = ?').get(d.id);
    const regs = db.prepare('SELECT COUNT(*) total, COALESCE(SUM(ready),0) ready FROM registration_docs WHERE deal_id = ?').get(d.id);
    const order = ['lead', 'quoted', 'reserved', 'contract_signed', 'paid', 'ready', 'delivered'];
    const prepared = insp.total > 0 && insp.passed === insp.total && regs.ready === regs.total;
    let idx = order.indexOf(d.stage);
    if (d.stage === 'paid' && prepared) idx = order.indexOf('ready');
    const lost = d.stage === 'lost';
    const steps = order.map((k, i) => ({ key: k, done: !lost && i < idx || (!lost && d.stage === 'delivered'), current: !lost && i === idx && d.stage !== 'delivered', at: (k === 'ready' ? null : at[k]) || (k === 'lead' ? d.created_at : null) }));
    const eta = d.stage === 'delivered' || lost ? null : calc.deliveryEta({ now: clock.now(), bookingSlot: bk && bk.slot_start, carStatus: car && car.status, arrivalDate: car && car.arrival_date,
      stockDays: settings.num('eta_stock_days'), orderDays: settings.num('eta_order_days') });
    res.json({ deal_id: d.id, stage: d.stage, lost, car: d.trim_id ? core.trimLabel(core.getTrim(d.trim_id)) : null, steps, eta,
      booking: bk ? { slot_start: bk.slot_start } : null, readiness: { inspection: { passed: insp.passed, total: insp.total }, documents: { ready: regs.ready, total: regs.total } } });
  });
  r.get('/deals/:id', auth.requireRole(), (req, res) => res.json(dealView(dealFor(req, req.params.id), req.user)));
  r.put('/deals/:id', STAFF_DEALS, (req, res) => {
    const d = dealFor(req, req.params.id, 'edit'); const b = req.body || {};
    if (!['lead', 'quoted'].includes(d.stage)) throw conflict('deal_locked', 'This deal can no longer be edited');
    for (const k of ['contact_name', 'contact_phone', 'contact_email', 'color', 'notes']) if (b[k] != null && typeof b[k] !== 'string') throw bad('invalid_input', `${k} must be text`);
    if (b.trim_id && !core.getTrim(b.trim_id)) throw notFound('Trim');
    db.prepare('UPDATE deals SET contact_name=?, contact_phone=?, contact_email=?, trim_id=?, color=?, notes=?, updated_at=? WHERE id=?')
      .run(b.contact_name ?? d.contact_name, b.contact_phone ?? d.contact_phone, b.contact_email ?? d.contact_email, b.trim_id ?? d.trim_id, b.color ?? d.color, b.notes ?? d.notes, clock.iso(), d.id);
    res.json(dealView(core.getDeal(d.id), req.user));
  });
  r.post('/deals/:id/assign', auth.requireRole('sales_manager'), (req, res) => {
    const d = core.dealOr404(req.params.id);
    const c = db.prepare("SELECT id FROM users WHERE id = ? AND role = 'sales_consultant' AND active = 1").get((req.body || {}).consultant_id);
    if (!c) throw bad('invalid_consultant', 'Choose an active sales consultant');
    db.prepare('UPDATE deals SET consultant_id = ?, updated_at = ? WHERE id = ?').run(c.id, clock.iso(), d.id);
    res.json({ ok: true });
  });
  r.post('/deals/:id/lost', STAFF_DEALS, (req, res) => {
    const d = dealFor(req, req.params.id, 'edit');
    const reason = (req.body || {}).reason; if (reason != null && typeof reason !== 'string') throw bad('invalid_input', 'reason must be text');
    core.moveStage(d.id, 'lost', req.user.id, reason);
    res.json(dealView(core.getDeal(d.id), req.user));
  });
  r.post('/deals/:id/referral', auth.requireRole('customer', 'sales_consultant', 'sales_manager'), (req, res) => {
    const d = req.user.role === 'customer' ? dealFor(req, req.params.id) : dealFor(req, req.params.id, 'edit');
    core.linkReferral(d.id, (req.body || {}).code);
    res.json({ ok: true });
  });

  // ---------- quotations (FR-DEAL-03, FR-DEAL-04, FR-CAT-08) ----------
  function addItems(q, deal, userId, { accessory_ids = [], extra_items = [] }) {
    const insItem = db.prepare('INSERT INTO quotation_items(quotation_id,accessory_id,description,price_usd,status,exception_id) VALUES(?,?,?,?,?,?)');
    for (const aid of accessory_ids) {
      const a = db.prepare('SELECT * FROM accessories WHERE id = ? AND active = 1').get(aid);
      if (!a) throw notFound('Accessory');
      insItem.run(q.id, a.id, a.name_en, a.price_usd, 'approved', null); // catalogue price only
    }
    for (const x of extra_items) {
      if (!x || !String(x.description || '').trim() || !(Number(x.price_usd) > 0)) throw bad('invalid_item', 'An extra item needs a description and a positive price');
      const ex = db.prepare('INSERT INTO exceptions(deal_id,quotation_id,description,price_usd,status,requested_by,created_at) VALUES(?,?,?,?,?,?,?)').run(deal.id, q.id, x.description, +x.price_usd, 'pending', userId, clock.iso()).lastInsertRowid;
      insItem.run(q.id, null, x.description, +x.price_usd, 'pending', ex); // waits for the Sales Manager (FR-DEAL-04)
    }
  }
  r.post('/deals/:id/quotation', STAFF_DEALS, (req, res) => {
    const d = dealFor(req, req.params.id, 'edit'); const b = req.body || {};
    for (const k of priceKeys) if (k in b) throw forbidden('price_locked', 'Prices come from the catalogue and cannot be changed on a quotation');
    if (!['lead', 'quoted'].includes(d.stage)) throw conflict('invalid_stage', 'A quotation can only be created before a deposit');
    const trimId = b.trim_id || d.trim_id; if (!trimId) throw bad('trim_required', 'Choose a model');
    const trim = core.getTrim(trimId); if (!trim || !trim.active) throw notFound('Trim');
    const colors = parseJson(trim.colors, []);
    const color = b.color || d.color || null;
    if (color && colors.length && !colors.includes(color)) throw bad('invalid_color', 'This colour is not offered for the model');
    const validUntil = new Date(clock.now().getTime() + settings.num('quotation_days') * 86400000).toISOString();
    const result = db.transaction(() => {
      const info = db.prepare('INSERT INTO quotations(number,deal_id,trim_id,color,price_usd,vat_rate,valid_until,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?)')
        .run(core.yearNumber('Q', 'quotation'), d.id, trimId, color, core.effectivePrice(trim), settings.num('vat_rate'), validUntil, req.user.id, clock.iso());
      const q = db.prepare('SELECT * FROM quotations WHERE id = ?').get(info.lastInsertRowid);
      addItems(q, d, req.user.id, { accessory_ids: b.accessory_ids || [], extra_items: b.extra_items || [] });
      db.prepare('UPDATE deals SET trim_id = ?, color = ?, price_locked_until = ?, updated_at = ? WHERE id = ?').run(trimId, color, validUntil, clock.iso(), d.id);
      if (d.stage === 'lead') core.moveStage(d.id, 'quoted', req.user.id, 'quotation created');
      return q;
    })();
    const qv = quotationView(result);
    notify.send({ ...core.dealRecipient(core.getDeal(d.id)), template: 'quotation_ready', params: { number: qv.number, car: core.trimLabel(trim), total: qv.total_usd, valid_until: dmy(qv.valid_until) } });
    res.status(201).json(qv);
  });
  r.get('/deals/:id/quotation', auth.requireRole(), (req, res) => {
    const d = dealFor(req, req.params.id);
    const q = core.latestQuotation(d.id); if (!q) throw notFound('Quotation');
    res.json(quotationView(q));
  });
  r.put('/quotations/:id', STAFF_DEALS, (req, res) => {
    const q = db.prepare('SELECT * FROM quotations WHERE id = ?').get(req.params.id); if (!q) throw notFound('Quotation');
    dealFor(req, q.deal_id, 'edit');
    for (const k of priceKeys) if (k in (req.body || {})) throw forbidden('price_locked', 'Prices come from the catalogue and cannot be changed on a quotation'); // FR-CAT-08
    throw bad('nothing_to_change', 'Add accessories through the items endpoint');
  });
  r.post('/quotations/:id/items', STAFF_DEALS, (req, res) => {
    const q = db.prepare('SELECT * FROM quotations WHERE id = ?').get(req.params.id); if (!q) throw notFound('Quotation');
    const d = dealFor(req, q.deal_id, 'edit'); const b = req.body || {};
    if (new Date(q.valid_until) < clock.now()) throw conflict('quotation_expired', 'This quotation has expired; create a new one');
    if (!['lead', 'quoted'].includes(d.stage)) throw conflict('invalid_stage', 'This quotation can no longer be changed');
    if (b.accessory_id) {
      const a = db.prepare('SELECT * FROM accessories WHERE id = ? AND active = 1').get(b.accessory_id); if (!a) throw notFound('Accessory');
      if (b.price_usd !== undefined && Number(b.price_usd) !== a.price_usd) throw forbidden('price_locked', 'Accessories are added at the catalogue price only');
      addItems(q, d, req.user.id, { accessory_ids: [a.id] });
    } else addItems(q, d, req.user.id, { extra_items: [{ description: b.description, price_usd: b.price_usd }] });
    res.status(201).json(quotationView(q));
  });

  // ---------- exceptions (FR-DEAL-08) ----------
  r.get('/exceptions', STAFF_DEALS, (req, res) => {
    const where = []; const args = [];
    if (req.query.status) { where.push('e.status = ?'); args.push(req.query.status); }
    if (req.user.role === 'sales_consultant') { where.push('e.requested_by = ?'); args.push(req.user.id); }
    res.json(db.prepare(`SELECT e.*, d.contact_name, u.name requested_by_name FROM exceptions e JOIN deals d ON d.id = e.deal_id LEFT JOIN users u ON u.id = e.requested_by
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY e.id DESC`).all(...args));
  });
  r.post('/exceptions/:id/decide', auth.requireRole('sales_manager'), (req, res) => {
    const e = db.prepare('SELECT * FROM exceptions WHERE id = ?').get(req.params.id); if (!e) throw notFound('Exception');
    const { decision, reason } = req.body || {};
    if (!['approved', 'rejected'].includes(decision)) throw bad('invalid_decision', 'Decision must be approved or rejected');
    if (!String(reason || '').trim()) throw bad('reason_required', 'A reason is required'); // the decision and its reason are recorded
    if (e.status !== 'pending') throw conflict('already_decided', 'This request was already decided');
    db.transaction(() => {
      db.prepare('UPDATE exceptions SET status = ?, decided_by = ?, decision_reason = ?, decided_at = ? WHERE id = ?').run(decision, req.user.id, reason, clock.iso(), e.id);
      db.prepare('UPDATE quotation_items SET status = ? WHERE exception_id = ?').run(decision, e.id);
      audit(req.user.id, `exception_${decision}`, 'exception', e.id, { reason, deal: e.deal_id });
    })();
    if (e.requested_by) notify.send({ userId: e.requested_by, template: 'exception_decided', params: { description: e.description, status: decision, reason } });
    res.json(db.prepare('SELECT * FROM exceptions WHERE id = ?').get(e.id));
  });

  // ---------- contracts (FR-DEAL-06, FR-DEAL-07) ----------
  r.post('/deals/:id/contract', STAFF_DEALS, (req, res) => {
    const d = dealFor(req, req.params.id, 'edit'); const b = req.body || {};
    if (d.stage !== 'reserved') throw conflict('invalid_stage', 'A contract can be created once a deposit has reserved the car');
    if (db.prepare("SELECT 1 FROM contracts WHERE deal_id = ? AND status != 'void'").get(d.id)) throw conflict('contract_exists', 'This deal already has a contract');
    const q = core.latestQuotation(d.id); if (!q) throw conflict('no_quotation', 'Create a quotation first');
    // the price stays valid until the quotation expires, or for the deposit hold period after a deposit (FR-DEAL-03, FR-PAY-02)
    if (!d.price_locked_until || new Date(d.price_locked_until) < clock.now()) throw conflict('price_expired', 'The quoted price is no longer valid; create a new quotation');
    if (core.quotationTotals(q).items.some((i) => i.status === 'pending')) throw conflict('pending_exception', 'An exception request is still waiting for the Sales Manager');
    const rule = b.deposit_rule || 'partial_refund';
    if (!['full_refund', 'partial_refund', 'forfeit'].includes(rule)) throw bad('invalid_deposit_rule', 'Invalid deposit rule');
    let pct = null;
    if (rule === 'partial_refund') { pct = b.partial_percent === undefined ? 50 : Number(b.partial_percent); if (!(pct > 0 && pct < 100)) throw bad('invalid_percent', 'Partial refund percent must be between 1 and 99'); }
    const t = core.quotationTotals(q);
    const stamp = calc.stampDuty(t.total_usd, settings.num('stamp_duty_percent'));
    const info = db.prepare(`INSERT INTO contracts(number,deal_id,quotation_id,total_usd,vat_amount,stamp_duty_usd,hold_days,deposit_rule,partial_percent,terms,status,created_by,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,'pending_signature',?,?)`).run(core.yearNumber('C', 'contract'), d.id, q.id, t.total_usd, t.vat_amount, stamp, settings.num('hold_days'), rule, pct, TERMS, req.user.id, clock.iso());
    const c = db.prepare('SELECT * FROM contracts WHERE id = ?').get(info.lastInsertRowid);
    notify.send({ ...core.dealRecipient(d), template: 'contract_ready', params: { number: c.number } });
    res.status(201).json(contractView(c));
  });
  const contractFor = (req, id) => {
    const c = db.prepare('SELECT * FROM contracts WHERE id = ?').get(id); if (!c) throw notFound('Contract');
    dealFor(req, c.deal_id); // same access as the deal (customers: own only)
    return c;
  };
  r.get('/contracts/:id', auth.requireRole(), (req, res) => res.json(contractView(contractFor(req, req.params.id))));
  r.get('/contracts/:id/pdf', auth.requireRole(), async (req, res) => {
    const c = contractFor(req, req.params.id); const d = core.getDeal(c.deal_id);
    const q = db.prepare('SELECT * FROM quotations WHERE id = ?').get(c.quotation_id);
    const trim = core.getTrim(q.trim_id);
    const rule = c.deposit_rule === 'full_refund' ? 'the deposit is refunded in full' : c.deposit_rule === 'partial_refund' ? `${c.partial_percent}% of the deposit is refunded` : 'the deposit is not refunded';
    const buf = await pdf.contractPdf({ contract: c, deal: d, quotation: q, trim, car: d.car_id ? db.prepare('SELECT * FROM cars WHERE id = ?').get(d.car_id) : null,
      items: core.quotationTotals(q).items.filter((i) => i.status === 'approved'), vat_rate: q.vat_rate, stamp_percent: settings.get('stamp_duty_percent'), total_lbp: settings.lbp(c.total_usd),
      consultant: (db.prepare('SELECT name FROM users WHERE id = ?').get(d.consultant_id) || {}).name || '-', deposit_rule_text: rule });
    res.type('application/pdf').set('Content-Disposition', `inline; filename="${c.number}.pdf"`).send(buf);
  });
  function afterSigned(c, userId) {
    db.prepare("UPDATE contracts SET status = 'signed' WHERE id = ?").run(c.id);
    core.moveStage(c.deal_id, 'contract_signed', userId, `contract ${c.number} signed`);
    ctx.syncPaid(c.deal_id, userId);
  }
  r.post('/contracts/:id/sign', auth.requireRole('customer'), (req, res) => {
    const c = contractFor(req, req.params.id); const b = req.body || {};
    if (c.status !== 'pending_signature') throw conflict('not_signable', 'This contract is not waiting for a signature');
    if (b.accept !== true || !String(b.typed_name || '').trim()) throw bad('signature_required', 'Type your full name and accept the terms to sign');
    db.prepare("UPDATE contracts SET signed_at = ?, signed_method = 'online', signed_name = ? WHERE id = ?").run(clock.iso(), String(b.typed_name).trim(), c.id);
    afterSigned(c, req.user.id);
    audit(req.user.id, 'contract_signed', 'contract', c.id, { method: 'online' });
    res.json(contractView(db.prepare('SELECT * FROM contracts WHERE id = ?').get(c.id)));
  });
  r.post('/contracts/:id/signed-copy', STAFF_DEALS, docs.upload.single('file'), (req, res) => {
    const c = db.prepare('SELECT * FROM contracts WHERE id = ?').get(req.params.id); if (!c) throw notFound('Contract');
    const d = dealFor(req, c.deal_id, 'edit');
    if (c.status !== 'pending_signature') throw conflict('not_signable', 'This contract is not waiting for a signature');
    docs.store(req.file, { kind: 'signed_contract', ownerUserId: d.customer_id, dealId: d.id }); // customer can read it (FR-DEAL-07)
    db.prepare("UPDATE contracts SET signed_at = ?, signed_method = 'paper' WHERE id = ?").run(clock.iso(), c.id);
    afterSigned(c, req.user.id);
    audit(req.user.id, 'contract_signed', 'contract', c.id, { method: 'paper' });
    res.json(contractView(db.prepare('SELECT * FROM contracts WHERE id = ?').get(c.id)));
  });

  // stage "Paid" once the contract is signed and the balance is zero (FR-DEAL-05)
  ctx.syncPaid = (dealId, userId) => {
    const d = core.getDeal(dealId);
    if (d.stage === 'contract_signed' && core.financials(dealId).fully_paid) core.moveStage(dealId, 'paid', userId, 'full payment received');
  };

  // ---------- consultant dashboard (FR-DEAL-02) ----------
  r.get('/dashboard/consultant', STAFF_DEALS, (req, res) => {
    const mine = req.user.role === 'sales_consultant';
    const dealsRows = db.prepare(`SELECT * FROM deals WHERE stage NOT IN ('delivered','lost') ${mine ? 'AND consultant_id = ?' : ''} ORDER BY updated_at DESC`).all(...(mine ? [req.user.id] : []));
    const today = ymd(clock.now());
    const appts = db.prepare(`SELECT t.* FROM test_drives t LEFT JOIN deals d ON d.id = t.deal_id WHERE t.status = 'booked' AND substr(t.slot_start,1,10) = ? ${mine ? 'AND d.consultant_id = ?' : ''} ORDER BY t.slot_start`)
      .all(...(mine ? [today, req.user.id] : [today]));
    const stages = {}; dealsRows.forEach((x) => { stages[x.stage] = (stages[x.stage] || 0) + 1; });
    // "What needs me today": one list of things that are waiting for this person (UX)
    const dayDiff = (a, b) => Math.round((new Date(String(a).slice(0, 10)) - new Date(String(b).slice(0, 10))) / 86400000);
    const attention = []; const label = (x) => core.trimLabel(core.getTrim(x.trim_id));
    for (const x of dealsRows) {
      const base = { deal_id: x.id, name: x.contact_name, car: label(x) };
      if (x.stage === 'lead') { const idle = dayDiff(today, x.updated_at); if (idle >= 2) attention.push({ type: 'follow_up', days: idle, ...base }); }
      if (x.stage === 'quoted') { const qu = db.prepare('SELECT valid_until FROM quotations WHERE deal_id = ? ORDER BY id DESC LIMIT 1').get(x.id); if (qu) { const left = dayDiff(qu.valid_until, today); if (left <= 3) attention.push({ type: 'quote_expiring', days: left, ...base }); } }
      if (x.stage === 'reserved') { const ct = db.prepare('SELECT status FROM contracts WHERE deal_id = ?').get(x.id); if (ct && ct.status === 'pending_signature') attention.push({ type: 'sign_contract', ...base }); }
    }
    for (const a of appts) if (!a.license_verified) attention.push({ type: 'license_missing', deal_id: a.deal_id, name: a.name, car: label(a), time: a.slot_start.slice(11, 16) });
    if (!mine) { const n = db.prepare("SELECT COUNT(*) c FROM exceptions WHERE status = 'pending'").get().c; if (n) attention.push({ type: 'exceptions_pending', count: n }); }
    const order = { quote_expiring: 0, license_missing: 1, sign_contract: 2, exceptions_pending: 3, follow_up: 4 };
    attention.sort((a, b) => order[a.type] - order[b.type] || (a.days ?? 0) - (b.days ?? 0));
    res.json({ date: today, attention, stage_counts: stages,
      leads: dealsRows.slice(0, 50).map((x) => ({ id: x.id, contact_name: x.contact_name, source: x.source, stage: x.stage, car_label: core.trimLabel(core.getTrim(x.trim_id)), updated_at: x.updated_at })),
      appointments_today: appts.map((t) => ({ id: t.id, slot_start: t.slot_start, name: t.name, phone: t.phone, car: core.trimLabel(core.getTrim(t.trim_id)), license_verified: !!t.license_verified, deal_id: t.deal_id })) });
  });
  return r;
};
