const express = require('express');
const { stringify } = require('csv-stringify/sync');
const clock = require('../clock');
const pdf = require('../services/pdf');
const { bad, conflict, notFound, forbidden, required, round2, dmy } = require('../util');

// FR-PAY-01..08
const METHODS = ['cash', 'bank_transfer', 'cheque', 'card'];

module.exports = function payments(ctx) {
  const { db, auth, audit, notify, settings, core } = ctx;
  const r = express.Router();
  const RECORDERS = auth.requireRole('sales_consultant', 'sales_manager', 'accountant');
  const PAY_VIEW = ['sales_consultant', 'sales_manager', 'accountant', 'general_manager'];
  const carName = (deal) => core.trimLabel(core.getTrim(deal.trim_id));
  const getPayment = (id) => { const p = db.prepare('SELECT * FROM payments WHERE id = ?').get(id); if (!p) throw notFound('Payment'); return p; };
  const dealAccess = (u, d) => {
    if (u.role === 'customer') return d.customer_id === u.id;
    if (u.role === 'sales_consultant') return d.consultant_id === u.id;
    return true;
  };
  const publicPayment = (p) => ({ id: p.id, deal_id: p.deal_id, kind: p.kind, amount: p.amount, currency: p.currency, exchange_rate: p.exchange_rate, amount_usd: p.amount_usd,
    method: p.method, reference: p.reference, receipt_number: p.receipt_number, status: p.status, reason: p.reason, linked_payment_id: p.linked_payment_id, created_at: p.created_at });

  // Records a deposit or payment. Shared with the Owners Circle credit (method owner_credit, no staff member).
  function recordPayment(dealId, input, staffUser) {
    const d = core.dealOr404(dealId);
    if (staffUser && !dealAccess(staffUser, d)) throw forbidden();
    const { kind, currency = 'USD', method, reference } = input; const amount = Number(input.amount);
    if (!['deposit', 'payment'].includes(kind)) throw bad('invalid_kind', 'Kind must be deposit or payment');
    if (!Number.isFinite(amount) || amount <= 0) throw bad('invalid_amount', 'Amount must be a positive number');
    if (!['USD', 'LBP'].includes(currency)) throw bad('invalid_currency', 'Currency must be USD or LBP');
    if (![...METHODS, 'owner_credit'].includes(method)) throw bad('invalid_method', 'Method must be cash, bank_transfer, cheque or card');
    const rate = settings.num('exchange_rate'); // the rate in force is recorded with every payment
    const amountUsd = round2(currency === 'USD' ? amount : amount / rate);
    if (amountUsd <= 0) throw bad('invalid_amount', 'Amount is too small');
    const q = core.latestQuotation(d.id);
    if (kind === 'deposit') {
      if (d.stage !== 'quoted') throw conflict('invalid_stage', 'A deposit can be recorded on a quoted deal (one deposit per deal)');
      if (!q || new Date(q.valid_until) < clock.now()) throw conflict('quotation_expired', 'The quotation has expired; create a new one first');
      if (core.quotationTotals(q).items.some((i) => i.status === 'pending')) throw conflict('pending_exception', 'An exception request is still waiting for the Sales Manager');
    } else {
      if (d.stage === 'quoted') throw conflict('deposit_first', 'Record the deposit first');
      if (!['reserved', 'contract_signed', 'paid'].includes(d.stage)) throw conflict('invalid_stage', 'Payments cannot be recorded in this stage');
    }
    const fin = core.financials(d.id);
    if (fin.total_usd > 0 && amountUsd > fin.balance_usd + 0.01) throw conflict('overpayment', `The amount is more than the balance of ${fin.balance_usd} USD`, { balance_usd: fin.balance_usd });
    const id = db.transaction(() => {
      if (kind === 'deposit') {
        core.reserveCar(d.id, input.car_id ? Number(input.car_id) : undefined); // exclusive reservation, or waits for arrival (FR-INV-03/04)
      }
      const pid = db.prepare(`INSERT INTO payments(deal_id,kind,amount,currency,exchange_rate,amount_usd,method,reference,received_by,receipt_number,status,created_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(d.id, kind, amount, currency, rate, amountUsd, method, reference || null, staffUser ? staffUser.id : null,
        core.plainNumber('R', 'receipt'), 'completed', clock.iso()).lastInsertRowid;
      if (kind === 'deposit') {
        const holdUntil = new Date(clock.now().getTime() + settings.num('hold_days') * 86400000).toISOString();
        const keep = d.price_locked_until && new Date(d.price_locked_until) > new Date(holdUntil) ? d.price_locked_until : holdUntil; // FR-PAY-02
        db.prepare('UPDATE deals SET deposit_at = ?, price_locked_until = ?, updated_at = ? WHERE id = ?').run(clock.iso(), keep, clock.iso(), d.id);
        core.moveStage(d.id, 'reserved', staffUser ? staffUser.id : null, 'deposit received');
      }
      audit(staffUser ? staffUser.id : null, 'payment', 'payment', pid, { deal: d.id, kind, amount, currency, amount_usd: amountUsd, method });
      return pid;
    })();
    ctx.syncPaid(d.id, staffUser ? staffUser.id : null);
    const p = getPayment(id);
    notify.send({ ...core.dealRecipient(d), template: 'receipt', params: { number: p.receipt_number, amount: p.amount.toLocaleString('en-US'), currency: p.currency, method: p.method, car: carName(d) },
      attachmentUrl: `/api/payments/${p.id}/receipt.pdf` }); // FR-PAY-03
    return p;
  }
  ctx.recordPayment = recordPayment;

  r.post('/payments', RECORDERS, (req, res) => {
    const b = req.body || {}; required(b, ['deal_id', 'kind', 'amount', 'method']);
    if (b.method === 'owner_credit') throw bad('invalid_method', 'Owner credit is applied from the Owners Circle');
    const p = recordPayment(b.deal_id, b, req.user);
    const d = core.getDeal(p.deal_id);
    res.status(201).json({ payment: publicPayment(p), financials: core.financials(d.id), stage: d.stage, car_allocated: !!d.car_id });
  });
  r.get('/payments', auth.requireRole(...PAY_VIEW), (req, res) => {
    const where = []; const args = [];
    if (req.query.deal_id) { where.push('p.deal_id = ?'); args.push(req.query.deal_id); }
    if (req.query.kind) { where.push('p.kind = ?'); args.push(req.query.kind); }
    if (req.query.status) { where.push('p.status = ?'); args.push(req.query.status); }
    if (req.user.role === 'sales_consultant') { where.push('d.consultant_id = ?'); args.push(req.user.id); }
    const rows = db.prepare(`SELECT p.*, d.contact_name, u.name received_by_name FROM payments p JOIN deals d ON d.id = p.deal_id LEFT JOIN users u ON u.id = p.received_by
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY p.id DESC LIMIT 500`).all(...args);
    res.json(rows.map((p) => ({ ...publicPayment(p), contact_name: p.contact_name, received_by_name: p.received_by_name })));
  });
  r.get('/payments/export.csv', auth.requireRole('accountant', 'sales_manager'), (req, res) => {
    const type = req.query.type === 'invoices' ? 'invoices' : 'payments';
    const from = req.query.from || '0000-01-01'; const to = (req.query.to || '9999-12-31') + 'T23:59:59';
    let rows;
    if (type === 'invoices') {
      rows = db.prepare(`SELECT i.number invoice_number, substr(i.created_at,1,10) date, d.contact_name customer, i.net_usd, i.vat_rate, i.vat_amount, i.total_usd FROM invoices i JOIN deals d ON d.id = i.deal_id
        WHERE i.created_at >= ? AND i.created_at <= ? ORDER BY i.id`).all(from, to);
    } else {
      rows = db.prepare(`SELECT p.receipt_number, substr(p.created_at,1,10) date, d.contact_name customer, p.kind, p.method, p.currency, p.amount, p.exchange_rate, p.amount_usd, p.reference, p.status
        FROM payments p JOIN deals d ON d.id = p.deal_id WHERE p.created_at >= ? AND p.created_at <= ? ORDER BY p.id`).all(from, to);
    }
    const csv = stringify(rows, { header: true, columns: rows.length ? Object.keys(rows[0]) : (type === 'invoices' ? ['invoice_number', 'date', 'customer', 'net_usd', 'vat_rate', 'vat_amount', 'total_usd'] : ['receipt_number', 'date', 'customer', 'kind', 'method', 'currency', 'amount', 'exchange_rate', 'amount_usd', 'reference', 'status']) });
    res.type('text/csv').set('Content-Disposition', `attachment; filename="${type}.csv"`).send(csv);
  });
  r.get('/payments/:id/receipt.pdf', auth.requireRole(), async (req, res) => {
    const p = getPayment(req.params.id); const d = core.getDeal(p.deal_id);
    if (req.user.role === 'customer' ? d.customer_id !== req.user.id : !PAY_VIEW.includes(req.user.role) || !dealAccess(req.user, d)) throw forbidden();
    if (!p.receipt_number) throw conflict('no_receipt', 'This payment has no receipt yet');
    const staff = p.received_by ? db.prepare('SELECT name FROM users WHERE id = ?').get(p.received_by) : null;
    const buf = await pdf.receiptPdf({ payment: p, deal: d, car_name: carName(d), staff_name: staff ? staff.name : 'System', balance_usd: core.financials(d.id).balance_usd });
    res.type('application/pdf').set('Content-Disposition', `inline; filename="${p.receipt_number}.pdf"`).send(buf);
  });

  // ---------- refunds (FR-PAY-04): accountant records, Sales Manager approves ----------
  r.post('/payments/:id/refund', auth.requireRole('accountant'), (req, res) => {
    const orig = getPayment(req.params.id); const b = req.body || {};
    if (orig.kind === 'refund' || orig.status !== 'completed') throw conflict('not_refundable', 'Only completed payments can be refunded');
    if (!String(b.reason || '').trim()) throw bad('reason_required', 'A reason is required');
    const amount = Number(b.amount === undefined ? orig.amount : b.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw bad('invalid_amount', 'Amount must be a positive number');
    const already = db.prepare("SELECT COALESCE(SUM(amount),0) s FROM payments WHERE linked_payment_id = ? AND kind = 'refund' AND status IN ('completed','pending_approval')").get(orig.id).s;
    if (amount + already > orig.amount + 0.001) throw conflict('refund_exceeds_payment', 'The refund is more than the original payment', { refundable: round2(orig.amount - already) });
    const usdVal = round2((amount / orig.amount) * orig.amount_usd);
    const id = db.prepare(`INSERT INTO payments(deal_id,kind,amount,currency,exchange_rate,amount_usd,method,reference,received_by,linked_payment_id,reason,status,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,'pending_approval',?)`).run(orig.deal_id, 'refund', amount, orig.currency, orig.exchange_rate, usdVal, orig.method === 'owner_credit' ? 'cash' : orig.method, b.reference || null, req.user.id, orig.id, b.reason, clock.iso()).lastInsertRowid;
    res.status(201).json(publicPayment(getPayment(id)));
  });
  r.post('/payments/:id/approve', auth.requireRole('sales_manager'), (req, res) => {
    const p = getPayment(req.params.id); const b = req.body || {};
    if (p.kind !== 'refund' || p.status !== 'pending_approval') throw conflict('not_pending', 'This refund is not waiting for approval');
    if (b.approve === false) {
      db.prepare("UPDATE payments SET status = 'rejected', approved_by = ? WHERE id = ?").run(req.user.id, p.id);
      audit(req.user.id, 'refund_rejected', 'payment', p.id, { reason: b.reason });
      return res.json(publicPayment(getPayment(p.id)));
    }
    db.transaction(() => {
      db.prepare("UPDATE payments SET status = 'completed', approved_by = ?, receipt_number = ? WHERE id = ?").run(req.user.id, core.plainNumber('R', 'receipt'), p.id);
      audit(req.user.id, 'refund', 'payment', p.id, { deal: p.deal_id, amount_usd: p.amount_usd, reason: p.reason });
      // FR-INV-05: a refunded deposit releases the car (deal returns to Quoted if no contract is signed yet)
      const orig = getPayment(p.linked_payment_id); const d = core.getDeal(p.deal_id);
      if (orig.kind === 'deposit' && d.stage === 'reserved' && core.financials(d.id).paid_usd <= 0.005) { // nothing left paid on the deal
        core.releaseCar(d.id);
        core.moveStage(d.id, 'quoted', req.user.id, 'deposit refunded');
      }
    })();
    const d = core.getDeal(p.deal_id); const done = getPayment(p.id);
    notify.send({ ...core.dealRecipient(d), template: 'refund_issued', params: { number: done.receipt_number, amount_usd: done.amount_usd, car: carName(d), reason: done.reason }, attachmentUrl: `/api/payments/${done.id}/receipt.pdf` });
    res.json(publicPayment(done));
  });

  // ---------- invoices (FR-PAY-05) ----------
  r.post('/deals/:id/invoice', auth.requireRole('accountant', 'sales_manager', 'sales_consultant'), (req, res) => {
    const d = core.dealOr404(req.params.id);
    if (!dealAccess(req.user, d)) throw forbidden();
    if (!['contract_signed', 'paid', 'delivered'].includes(d.stage)) throw conflict('invalid_stage', 'An invoice is issued once the contract is signed');
    if (db.prepare('SELECT 1 FROM invoices WHERE deal_id = ?').get(d.id)) throw conflict('invoice_exists', 'An invoice already exists for this deal');
    const c = db.prepare("SELECT * FROM contracts WHERE deal_id = ? AND status = 'signed' ORDER BY id DESC LIMIT 1").get(d.id);
    const rate = settings.num('vat_rate'); // set by the Administrator, default 11%
    const total = c.total_usd; const vat = round2((total * rate) / (100 + rate));
    const info = db.prepare('INSERT INTO invoices(number,deal_id,total_usd,vat_rate,vat_amount,net_usd,issued_by,created_at) VALUES(?,?,?,?,?,?,?,?)')
      .run(core.yearNumber('INV', 'invoice'), d.id, total, rate, vat, round2(total - vat), req.user.id, clock.iso());
    audit(req.user.id, 'invoice_issued', 'invoice', info.lastInsertRowid, { deal: d.id, total });
    res.status(201).json(db.prepare('SELECT * FROM invoices WHERE id = ?').get(info.lastInsertRowid));
  });
  r.get('/invoices', auth.requireRole('accountant', 'sales_manager', 'general_manager'), (req, res) => {
    res.json(db.prepare('SELECT i.*, d.contact_name FROM invoices i JOIN deals d ON d.id = i.deal_id ORDER BY i.id DESC LIMIT 500').all());
  });
  r.get('/deals/:id/invoice', auth.requireRole(), (req, res) => {
    const d = core.dealOr404(req.params.id);
    if (req.user.role === 'customer' ? d.customer_id !== req.user.id : !dealAccess(req.user, d)) throw forbidden();
    const inv = db.prepare('SELECT * FROM invoices WHERE deal_id = ?').get(d.id); if (!inv) throw notFound('Invoice');
    res.json(inv);
  });
  r.get('/invoices/:id/pdf', auth.requireRole(), async (req, res) => {
    const inv = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id); if (!inv) throw notFound('Invoice');
    const d = core.getDeal(inv.deal_id);
    if (req.user.role === 'customer' ? d.customer_id !== req.user.id : !dealAccess(req.user, d)) throw forbidden();
    const c = db.prepare("SELECT * FROM contracts WHERE deal_id = ? AND status != 'void' ORDER BY id DESC LIMIT 1").get(d.id);
    const q = db.prepare('SELECT * FROM quotations WHERE id = ?').get(c.quotation_id); const trim = core.getTrim(q.trim_id);
    const lines = [{ description: `${core.trimLabel(trim)} (includes import charges)`, price_usd: q.price_usd }, ...core.quotationTotals(q).items.filter((i) => i.status === 'approved')];
    const car = d.car_id ? db.prepare('SELECT vin FROM cars WHERE id = ?').get(d.car_id) : null;
    const buf = await pdf.invoicePdf({ invoice: inv, deal: d, car_name: core.trimLabel(trim), vin: car && car.vin, lines });
    res.type('application/pdf').set('Content-Disposition', `inline; filename="${inv.number}.pdf"`).send(buf);
  });

  // ---------- bank loan request summary (FR-PAY-06) ----------
  r.post('/deals/:id/loan', auth.requireRole('sales_consultant', 'sales_manager'), (req, res) => {
    const d = core.dealOr404(req.params.id);
    if (!dealAccess(req.user, d)) throw forbidden();
    if (!core.latestQuotation(d.id) || !['quoted', 'reserved', 'contract_signed', 'paid'].includes(d.stage)) throw conflict('invalid_stage', 'A loan request needs a quotation on an active deal');
    const bank = String((req.body || {}).bank || '').trim(); if (!bank) throw bad('bank_required', 'Choose the partner bank');
    if (db.prepare("SELECT 1 FROM loans WHERE deal_id = ? AND status IN ('submitted','approved')").get(d.id)) throw conflict('loan_exists', 'This deal already has an active loan request');
    const info = db.prepare('INSERT INTO loans(deal_id,bank,status,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(d.id, bank, 'submitted', req.user.id, clock.iso(), clock.iso());
    res.status(201).json(db.prepare('SELECT * FROM loans WHERE id = ?').get(info.lastInsertRowid));
  });
  r.patch('/loans/:id', auth.requireRole('sales_consultant', 'sales_manager'), (req, res) => {
    const l = db.prepare('SELECT * FROM loans WHERE id = ?').get(req.params.id); if (!l) throw notFound('Loan request');
    const d = core.getDeal(l.deal_id); if (!dealAccess(req.user, d)) throw forbidden();
    const status = (req.body || {}).status;
    const ok = { submitted: ['approved', 'rejected', 'withdrawn'], approved: ['withdrawn'], rejected: [], withdrawn: [] };
    if (!['submitted', 'approved', 'rejected', 'withdrawn'].includes(status)) throw bad('invalid_status', 'Status must be submitted, approved, rejected or withdrawn');
    if (!ok[l.status].includes(status)) throw conflict('invalid_transition', `A ${l.status} request cannot become ${status}`);
    db.prepare('UPDATE loans SET status = ?, updated_at = ? WHERE id = ?').run(status, clock.iso(), l.id);
    audit(req.user.id, 'loan_status', 'loan', l.id, { status });
    res.json(db.prepare('SELECT * FROM loans WHERE id = ?').get(l.id));
  });
  r.get('/loans/:id/pdf', auth.requireRole('sales_consultant', 'sales_manager', 'accountant'), async (req, res) => {
    const l = db.prepare('SELECT * FROM loans WHERE id = ?').get(req.params.id); if (!l) throw notFound('Loan request');
    const d = core.getDeal(l.deal_id); if (!dealAccess(req.user, d)) throw forbidden();
    const q = core.latestQuotation(d.id);
    const buf = await pdf.loanPdf({ loan: l, deal: d, quotation: q, car_name: core.trimLabel(core.getTrim(q.trim_id)), total_usd: core.quotationTotals(q).total_usd });
    res.type('application/pdf').set('Content-Disposition', `inline; filename="loan-${l.id}.pdf"`).send(buf);
  });

  // ---------- cancellation of a reserved deal (FR-PAY-08) ----------
  r.post('/deals/:id/cancel', auth.requireRole('sales_manager'), (req, res) => {
    const d = core.dealOr404(req.params.id); const b = req.body || {};
    if (!['reserved', 'contract_signed'].includes(d.stage)) throw conflict('invalid_stage', 'Only a reserved deal or a deal with a signed contract can be cancelled here');
    if (!String(b.reason || '').trim()) throw bad('reason_required', 'A reason is required');
    const contract = db.prepare("SELECT * FROM contracts WHERE deal_id = ? AND status != 'void' ORDER BY id DESC LIMIT 1").get(d.id);
    let rule = contract ? contract.deposit_rule : b.decision; let pct = contract ? contract.partial_percent : Number(b.partial_percent ?? 50);
    if (!['full_refund', 'partial_refund', 'forfeit'].includes(rule)) throw bad('decision_required', 'Choose full_refund, partial_refund or forfeit (no contract rule exists yet)');
    const fin = core.financials(d.id);
    const otherPaid = round2(fin.paid_usd - fin.deposits_usd);
    const factor = rule === 'full_refund' ? 1 : rule === 'partial_refund' ? pct / 100 : 0;
    const refund = round2(Math.max(0, fin.deposits_usd * factor + Math.max(0, otherPaid))); // non-deposit payments are returned in full
    const out = db.transaction(() => {
      let pid = null;
      if (refund > 0) {
        const dep = db.prepare("SELECT * FROM payments WHERE deal_id = ? AND kind = 'deposit' AND status = 'completed' ORDER BY id LIMIT 1").get(d.id) || db.prepare("SELECT * FROM payments WHERE deal_id = ? AND status = 'completed' ORDER BY id LIMIT 1").get(d.id);
        pid = db.prepare(`INSERT INTO payments(deal_id,kind,amount,currency,exchange_rate,amount_usd,method,received_by,receipt_number,linked_payment_id,reason,status,approved_by,created_at)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,'completed',?,?)`).run(d.id, 'refund', refund, 'USD', settings.num('exchange_rate'), refund, 'bank_transfer', req.user.id, core.plainNumber('R', 'receipt'),
          dep ? dep.id : null, `Cancellation (${rule}): ${b.reason}`, req.user.id, clock.iso()).lastInsertRowid;
      }
      db.prepare('INSERT INTO cancellations(deal_id,decision,refund_usd,reason,decided_by,at) VALUES(?,?,?,?,?,?)').run(d.id, rule, refund, b.reason, req.user.id, clock.iso());
      if (contract) db.prepare("UPDATE contracts SET status = 'void' WHERE id = ?").run(contract.id);
      core.moveStage(d.id, 'lost', req.user.id, `Cancelled: ${b.reason}`);
      audit(req.user.id, 'deal_cancelled', 'deal', d.id, { rule, refund_usd: refund, reason: b.reason });
      if (refund > 0) audit(req.user.id, 'refund', 'payment', pid, { deal: d.id, amount_usd: refund });
      return pid;
    })();
    if (out) { const p = getPayment(out); notify.send({ ...core.dealRecipient(d), template: 'refund_issued', params: { number: p.receipt_number, amount_usd: refund, car: carName(d), reason: p.reason }, attachmentUrl: `/api/payments/${p.id}/receipt.pdf` }); }
    res.json({ deal_id: d.id, decision: rule, deposit_paid_usd: fin.deposits_usd, refund_usd: refund, stage: core.getDeal(d.id).stage });
  });
  return r;
};
