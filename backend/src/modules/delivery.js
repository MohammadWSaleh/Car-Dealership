const express = require('express');
const clock = require('../clock');
const pdf = require('../services/pdf');
const { bad, conflict, notFound, forbidden, required, ymd, slotStr, parseSlot, pad, dmy } = require('../util');

// FR-DEL-01..06
module.exports = function delivery(ctx) {
  const { db, auth, audit, notify, settings, core, docs } = ctx;
  const r = express.Router();
  const COORD = auth.requireRole('delivery_coordinator');
  const VIEW = auth.requireRole('delivery_coordinator', 'sales_manager', 'sales_consultant');
  const labels = Object.fromEntries(core.INSPECTION_ITEMS);

  const inspection = (dealId) => db.prepare('SELECT item_key, passed, notes, checked_at FROM inspection_items WHERE deal_id = ? ORDER BY id').all(dealId).map((i) => ({ ...i, label: labels[i.item_key] || i.item_key, passed: !!i.passed }));
  const regDocs = (dealId) => db.prepare('SELECT doc_key, ready, marked_at FROM registration_docs WHERE deal_id = ? ORDER BY id').all(dealId).map((x) => ({ ...x, ready: !!x.ready }));
  const booking = (dealId) => db.prepare("SELECT * FROM delivery_bookings WHERE deal_id = ? AND status = 'booked'").get(dealId) || null;
  const deliverable = (d) => { const f = core.financials(d.id); const insp = inspection(d.id); const reasons = [];
    if (!d.car_id) reasons.push('no_car_allocated');
    if (!insp.length || !insp.every((i) => i.passed)) reasons.push('inspection_incomplete');
    if (!f.fully_paid && !core.loanApproved(d.id)) reasons.push('payment_or_loan_missing');
    return reasons; };
  const getDeal = (id) => { const d = core.dealOr404(id); if (!['contract_signed', 'paid', 'delivered'].includes(d.stage)) throw conflict('no_signed_contract', 'This deal has no signed contract yet'); return d; };
  const carBrief = (d) => (d.car_id ? db.prepare('SELECT vin,color,status FROM cars WHERE id = ?').get(d.car_id) : null);

  // FR-DEL-01
  r.get('/delivery/deals', VIEW, (req, res) => {
    const rows = db.prepare("SELECT * FROM deals WHERE stage IN ('contract_signed','paid') ORDER BY updated_at DESC").all();
    res.json(rows.map((d) => { const insp = inspection(d.id); const f = core.financials(d.id); const b = booking(d.id);
      return { id: d.id, contact_name: d.contact_name, car_label: core.trimLabel(core.getTrim(d.trim_id)), stage: d.stage, car: carBrief(d), waiting_for_car: !d.car_id,
        inspection_passed: insp.filter((i) => i.passed).length, inspection_total: insp.length, balance_usd: f.balance_usd, fully_paid: f.fully_paid, loan_approved: core.loanApproved(d.id),
        delivery_slot: b ? b.slot_start : null, ready_to_deliver: deliverable(d).length === 0 }; }));
  });
  r.get('/delivery/deals/:id', VIEW, (req, res) => {
    const d = getDeal(req.params.id);
    res.json({ id: d.id, contact: { name: d.contact_name, phone: d.contact_phone, email: d.contact_email }, car_label: core.trimLabel(core.getTrim(d.trim_id)), stage: d.stage, car: carBrief(d),
      inspection: inspection(d.id), registration: regDocs(d.id), delivery_slot: (booking(d.id) || {}).slot_start || null, financials: core.financials(d.id), loan_approved: core.loanApproved(d.id),
      blockers: d.stage === 'delivered' ? [] : deliverable(d), accessories: accessoriesOf(d.id),
      handover: db.prepare('SELECT keys_count, notes, completed_at FROM handovers WHERE deal_id = ?').get(d.id) || null });
  });
  r.put('/delivery/deals/:id/inspection/:key', COORD, (req, res) => {
    const d = getDeal(req.params.id);
    if (d.stage === 'delivered') throw conflict('already_delivered', 'This deal is already delivered');
    const item = db.prepare('SELECT * FROM inspection_items WHERE deal_id = ? AND item_key = ?').get(d.id, req.params.key); if (!item) throw notFound('Inspection item');
    const b = req.body || {}; if (typeof b.passed !== 'boolean') throw bad('passed_required', 'passed must be true or false');
    db.prepare('UPDATE inspection_items SET passed = ?, notes = ?, checked_by = ?, checked_at = ? WHERE id = ?').run(b.passed ? 1 : 0, b.notes ?? item.notes, req.user.id, clock.iso(), item.id);
    res.json({ inspection: inspection(d.id) });
  });
  // FR-DEL-04
  r.put('/delivery/deals/:id/registration/:key', COORD, (req, res) => {
    const d = getDeal(req.params.id);
    const row = db.prepare('SELECT * FROM registration_docs WHERE deal_id = ? AND doc_key = ?').get(d.id, req.params.key); if (!row) throw notFound('Registration document');
    const b = req.body || {}; if (typeof b.ready !== 'boolean') throw bad('ready_required', 'ready must be true or false');
    db.prepare('UPDATE registration_docs SET ready = ?, marked_by = ?, marked_at = ? WHERE id = ?').run(b.ready ? 1 : 0, req.user.id, clock.iso(), row.id);
    res.json({ registration: regDocs(d.id) });
  });
  function accessoriesOf(dealId) {
    const q = core.latestQuotation(dealId); if (!q) return [];
    return core.quotationTotals(q).items.filter((i) => i.status === 'approved').map((i) => i.description);
  }
  // FR-DEL-05: handover form (PDF), then the signed copy completes the delivery
  r.get('/delivery/deals/:id/handover-form.pdf', VIEW, async (req, res) => {
    const d = getDeal(req.params.id); const car = carBrief(d); const c = db.prepare("SELECT number FROM contracts WHERE deal_id = ? AND status != 'void' ORDER BY id DESC LIMIT 1").get(d.id);
    const h = db.prepare('SELECT keys_count FROM handovers WHERE deal_id = ?').get(d.id);
    const buf = await pdf.handoverPdf({ deal: d, car_name: core.trimLabel(core.getTrim(d.trim_id)), vin: car && car.vin, color: car && car.color, contract_number: c && c.number, keys_count: h && h.keys_count,
      accessories: accessoriesOf(d.id), inspection: inspection(d.id) });
    res.type('application/pdf').set('Content-Disposition', `inline; filename="handover-${d.id}.pdf"`).send(buf);
  });
  r.post('/delivery/deals/:id/handover', COORD, docs.upload.single('file'), (req, res) => {
    const d = getDeal(req.params.id); const b = req.body || {};
    if (d.stage === 'delivered') throw conflict('already_delivered', 'This deal is already delivered');
    const reasons = deliverable(d);
    if (reasons.length) throw conflict('delivery_blocked', 'The car cannot be delivered yet: ' + reasons.join(', '), { reasons }); // FR-DEL-02
    const keys = parseInt(b.keys_count, 10);
    if (!Number.isInteger(keys) || keys < 1 || keys > 10) throw bad('invalid_keys', 'Enter how many keys were handed over (1-10)');
    if (!req.file) throw bad('signed_form_required', 'Upload the signed handover form');
    const customerId = core.ensureCustomerAccount(d);
    const doc = docs.store(req.file, { kind: 'signed_handover', ownerUserId: customerId, dealId: d.id });
    db.prepare('INSERT INTO handovers(deal_id,keys_count,notes,signed_doc_id,completed_by,completed_at) VALUES(?,?,?,?,?,?)').run(d.id, keys, b.notes || null, doc.id, req.user.id, clock.iso());
    core.moveStage(d.id, 'delivered', req.user.id, 'handover form signed'); // marks Delivered and starts Owners Circle membership
    audit(req.user.id, 'delivered', 'deal', d.id, { keys });
    res.status(201).json({ deal_id: d.id, stage: core.getDeal(d.id).stage, membership: db.prepare('SELECT card_number, referral_code, tier FROM memberships WHERE customer_id = ?').get(core.getDeal(d.id).customer_id) || null });
  });

  // ---------- customer side ----------
  const myDeal = (req) => { const d = core.dealOr404(req.params.id); if (d.customer_id !== req.user.id) throw forbidden(); return d; };
  // FR-DEL-06 progress timeline
  r.get('/me/deals/:id/timeline', auth.requireRole('customer'), (req, res) => {
    const d = myDeal(req);
    const at = (stage) => (db.prepare('SELECT at FROM deal_history WHERE deal_id = ? AND to_stage = ? ORDER BY id DESC LIMIT 1').get(d.id, stage) || {}).at || null;
    const insp = inspection(d.id); const ready = insp.length > 0 && insp.every((i) => i.passed);
    const lastCheck = ready ? insp.map((i) => i.checked_at).sort().pop() : null;
    const paidAt = at('paid') || (core.loanApproved(d.id) ? (db.prepare("SELECT updated_at FROM loans WHERE deal_id = ? AND status = 'approved'").get(d.id) || {}).updated_at : null);
    const order = ['lead', 'quoted', 'reserved', 'contract_signed', 'paid', 'delivered'];
    const past = (s) => order.indexOf(d.stage) >= order.indexOf(s) && d.stage !== 'lost';
    res.json({ stage: d.stage, steps: [
      { key: 'reserved', done: past('reserved'), at: at('reserved') },
      { key: 'contract_signed', done: past('contract_signed'), at: at('contract_signed') },
      { key: 'paid', done: past('paid') || !!paidAt, at: paidAt },
      { key: 'car_ready', done: ready || d.stage === 'delivered', at: lastCheck },
      { key: 'delivered', done: d.stage === 'delivered', at: at('delivered') },
    ], delivery_slot: (booking(d.id) || {}).slot_start || null, waiting_for_car: !d.car_id && ['reserved', 'contract_signed', 'paid'].includes(d.stage) });
  });
  r.get('/me/deals/:id/registration', auth.requireRole('customer'), (req, res) => { const d = myDeal(req); res.json({ registration: regDocs(d.id), identity_uploaded: !!db.prepare("SELECT 1 FROM documents WHERE deal_id = ? AND kind = 'identity'").get(d.id) }); });
  r.post('/me/deals/:id/identity', auth.requireRole('customer'), docs.upload.single('file'), (req, res) => {
    const d = myDeal(req);
    if (!['reserved', 'contract_signed', 'paid'].includes(d.stage)) throw conflict('invalid_stage', 'Identity copy can be uploaded after the deposit');
    res.status(201).json({ document: docs.store(req.file, { kind: 'identity', ownerUserId: req.user.id, dealId: d.id }) });
  });
  // FR-DEL-03
  r.get('/me/deals/:id/delivery-slots', auth.requireRole('customer'), (req, res) => {
    const d = myDeal(req); const date = req.query.date || ymd(clock.now());
    const day = parseSlot(`${date} 00:00`); if (!day) throw bad('invalid_date', 'Date must be YYYY-MM-DD');
    const open = settings.get('open_days').split(',').map(Number).includes(day.getDay() === 0 ? 7 : day.getDay());
    const slots = open ? settings.get('delivery_slots').split(',').map((t) => `${date} ${t.trim()}`).filter((s) => parseSlot(s) > clock.now() && !db.prepare("SELECT 1 FROM delivery_bookings WHERE slot_start = ? AND status = 'booked' AND deal_id != ?").get(s, d.id)) : [];
    res.json({ date, slots: slots.map((slot_start) => ({ slot_start })) });
  });
  r.post('/me/deals/:id/delivery-slot', auth.requireRole('customer'), (req, res) => {
    const d = myDeal(req); const slot = (req.body || {}).slot_start; required({ slot }, ['slot']);
    if (!['contract_signed', 'paid'].includes(d.stage)) throw conflict('invalid_stage', 'You can choose a delivery slot after signing the contract');
    const day = parseSlot(slot); if (!day || day <= clock.now()) throw bad('invalid_slot', 'Choose a future slot');
    if (!settings.get('open_days').split(',').map(Number).includes(day.getDay() === 0 ? 7 : day.getDay()) || !settings.get('delivery_slots').split(',').map((t) => t.trim()).includes(slot.slice(11))) throw bad('slot_not_offered', 'This slot is not offered');
    try {
      db.transaction(() => {
        db.prepare("UPDATE delivery_bookings SET status = 'cancelled' WHERE deal_id = ? AND status = 'booked'").run(d.id);
        db.prepare('INSERT INTO delivery_bookings(deal_id,slot_start,status,reminder_sent,created_at) VALUES(?,?,?,0,?)').run(d.id, slot, 'booked', clock.iso());
      })();
    } catch (e) { if (String(e.code).startsWith('SQLITE_CONSTRAINT')) throw conflict('slot_taken', 'This delivery slot is taken'); throw e; }
    notify.send({ userId: req.user.id, template: 'delivery_confirmation', params: { car: core.trimLabel(core.getTrim(d.trim_id)), slot: `${dmy(slot)} ${slot.slice(11)}` } });
    res.status(201).json({ delivery_slot: slot });
  });
  ctx.jobs.deliveryReminders = () => {
    const t = clock.now(); const tomorrow = ymd(new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1));
    const rows = db.prepare("SELECT * FROM delivery_bookings WHERE status = 'booked' AND reminder_sent = 0 AND substr(slot_start,1,10) = ?").all(tomorrow);
    rows.forEach((b) => { const d = core.getDeal(b.deal_id);
      notify.send({ ...core.dealRecipient(d), template: 'delivery_reminder', params: { car: core.trimLabel(core.getTrim(d.trim_id)), slot: b.slot_start.slice(11) } });
      db.prepare('UPDATE delivery_bookings SET reminder_sent = 1 WHERE id = ?').run(b.id); });
    return rows.length;
  };
  return r;
};
