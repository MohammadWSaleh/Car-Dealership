const clock = require('../clock');
const calc = require('./calc');
const { bad, conflict, notFound, round2, pad, randomCode, normPhone, ymd, dmy } = require('../util');
const bcrypt = require('bcryptjs');

// Shared business rules used by several modules (deal stages, car reservation, pricing, Owners Circle credit).
const TRANSITIONS = {
  lead: ['quoted', 'lost'],
  quoted: ['reserved', 'lost'],
  reserved: ['contract_signed', 'quoted', 'lost'],
  contract_signed: ['paid', 'delivered', 'lost'],
  paid: ['delivered', 'lost'],
  delivered: [],
  lost: [],
};
const OPEN_STAGES = ['lead', 'quoted', 'reserved', 'contract_signed', 'paid'];
const INSPECTION_ITEMS = [
  ['exterior', 'Exterior and paint'], ['interior', 'Interior and upholstery'], ['mechanical', 'Engine / battery and fluids'],
  ['tires', 'Tires and wheels'], ['electronics', 'Electronics and infotainment'], ['keys_manuals', 'Keys, manuals and spare items'],
];
const REGISTRATION_DOCS = ['invoice', 'identity_copy', 'insurance'];

module.exports = function core(ctx) {
  const { db, settings, audit, notify } = ctx;

  function nextSeq(name) {
    db.prepare('INSERT INTO counters(name,value) VALUES(?,1) ON CONFLICT(name) DO UPDATE SET value = value + 1').run(name);
    return db.prepare('SELECT value FROM counters WHERE name = ?').get(name).value;
  }
  const yearNumber = (prefix, counter) => `${prefix}-${clock.now().getFullYear()}-${pad(nextSeq(counter), 4)}`;
  const plainNumber = (prefix, counter) => `${prefix}-${pad(nextSeq(counter), 6)}`;

  const trimLabel = (t) => (t ? `${t.brand} ${t.model} ${t.name}` : '-');
  const getTrim = (id) => db.prepare('SELECT * FROM trims WHERE id = ?').get(id);
  const getDeal = (id) => db.prepare('SELECT * FROM deals WHERE id = ?').get(id);
  const dealOr404 = (id) => { const d = getDeal(id); if (!d) throw notFound('Deal'); return d; };
  const dealCarName = (deal) => trimLabel(getTrim(deal.trim_id));
  const dealRecipient = (deal) => (deal.customer_id
    ? { userId: deal.customer_id }
    : { to: { email: deal.contact_email, phone: deal.contact_phone, language: deal.language, notify_pref: deal.contact_email ? 'email' : 'whatsapp' } });

  // ---- pricing (FR-CAT-03, FR-CAT-08) ----
  function activePromo(trimId) {
    const today = ymd(clock.now());
    return db.prepare(`SELECT * FROM promotions WHERE active = 1 AND trim_id = ? AND promo_price_usd IS NOT NULL
      AND (starts_on IS NULL OR starts_on <= ?) AND (ends_on IS NULL OR ends_on >= ?) ORDER BY promo_price_usd LIMIT 1`).get(trimId, today, today);
  }
  function effectivePrice(trim) {
    const p = activePromo(trim.id);
    return p ? Math.min(p.promo_price_usd, trim.price_usd) : trim.price_usd;
  }

  // ---- stock status (FR-CAT-04) ----
  function availability(trimId) {
    const inStock = db.prepare("SELECT COUNT(*) c FROM cars WHERE trim_id = ? AND is_demo = 0 AND status = 'in_stock'").get(trimId).c;
    if (inStock > 0) return { status: 'in_stock', count: inStock };
    const tr = db.prepare("SELECT COUNT(*) c, MIN(arrival_date) next FROM cars WHERE trim_id = ? AND is_demo = 0 AND status = 'in_transit'").get(trimId);
    if (tr.c > 0) return { status: 'in_transit', count: tr.c, expected_arrival: tr.next };
    return { status: 'order_only' };
  }

  // ---- quotations / money ----
  const latestQuotation = (dealId) => db.prepare('SELECT * FROM quotations WHERE deal_id = ? ORDER BY id DESC LIMIT 1').get(dealId);
  function quotationTotals(q) {
    const items = db.prepare('SELECT * FROM quotation_items WHERE quotation_id = ? ORDER BY id').all(q.id);
    const approved = items.filter((i) => i.status === 'approved');
    const total = round2(q.price_usd + approved.reduce((s, i) => s + i.price_usd, 0));
    return { items, total_usd: total, ...calc.vatSplit(total, q.vat_rate) }; // the fixed price already includes VAT
  }
  function financials(dealId) {
    const contract = db.prepare("SELECT * FROM contracts WHERE deal_id = ? AND status != 'void' ORDER BY id DESC LIMIT 1").get(dealId);
    const q = latestQuotation(dealId);
    const total = contract ? contract.total_usd : q ? quotationTotals(q).total_usd : 0;
    const row = db.prepare(`SELECT
      COALESCE(SUM(CASE WHEN kind='refund' THEN -amount_usd ELSE amount_usd END),0) paid,
      COALESCE(SUM(CASE WHEN kind='deposit' THEN amount_usd ELSE 0 END),0) deposits
      FROM payments WHERE deal_id = ? AND status = 'completed'`).get(dealId);
    const paid = round2(row.paid);
    return { total_usd: total, paid_usd: paid, deposits_usd: round2(row.deposits), balance_usd: round2(Math.max(0, total - paid)), fully_paid: total > 0 && paid + 0.005 >= total };
  }
  const loanApproved = (dealId) => !!db.prepare("SELECT 1 FROM loans WHERE deal_id = ? AND status = 'approved'").get(dealId);

  // ---- car reservation (FR-INV-03/04/05) ----
  function reserveCar(dealId, specificCarId) {
    return db.transaction(() => {
      const deal = dealOr404(dealId);
      if (deal.car_id) return { allocated: true, car_id: deal.car_id };
      let car;
      if (specificCarId) {
        car = db.prepare("SELECT * FROM cars WHERE id = ? AND is_demo = 0").get(specificCarId);
        if (!car) throw notFound('Car');
        if (car.trim_id !== deal.trim_id) throw bad('car_trim_mismatch', 'The car does not match the deal model');
        if (car.status !== 'in_stock') throw conflict('car_already_reserved', 'This car is not available (already reserved or sold)');
      } else {
        const colorSql = deal.color ? 'AND color = ?' : '';
        const args = deal.color ? [deal.trim_id, deal.color] : [deal.trim_id];
        car = db.prepare(`SELECT * FROM cars WHERE trim_id = ? AND status = 'in_stock' AND is_demo = 0 ${colorSql} ORDER BY received_at, id LIMIT 1`).get(...args);
        if (!car) return { allocated: false }; // waits for the first matching car to arrive (FR-INV-04)
      }
      const upd = db.prepare("UPDATE cars SET status = 'reserved' WHERE id = ? AND status = 'in_stock'").run(car.id);
      if (upd.changes !== 1) throw conflict('car_already_reserved', 'This car is not available (already reserved or sold)');
      db.prepare('UPDATE deals SET car_id = ?, updated_at = ? WHERE id = ?').run(car.id, clock.iso(), dealId);
      if (['contract_signed', 'paid'].includes(deal.stage)) db.prepare("UPDATE cars SET status = 'sold' WHERE id = ?").run(car.id);
      return { allocated: true, car_id: car.id };
    })();
  }
  function allocateWaiting(trimId) {
    const waiting = db.prepare(`SELECT id FROM deals WHERE trim_id = ? AND car_id IS NULL AND stage IN ('reserved','contract_signed','paid') ORDER BY deposit_at, id`).all(trimId);
    for (const w of waiting) { try { const r = reserveCar(w.id); if (!r.allocated) break; } catch { /* next */ } }
  }
  function releaseCar(dealId) {
    const deal = getDeal(dealId);
    if (!deal || !deal.car_id) return;
    db.prepare("UPDATE cars SET status = 'in_stock' WHERE id = ? AND status IN ('reserved','sold')").run(deal.car_id);
    db.prepare('UPDATE deals SET car_id = NULL, updated_at = ? WHERE id = ?').run(clock.iso(), dealId);
    allocateWaiting(deal.trim_id);
  }
  function markInStock(carId) {
    const car = db.prepare('SELECT * FROM cars WHERE id = ?').get(carId);
    db.prepare("UPDATE cars SET status = 'in_stock', received_at = COALESCE(received_at, ?) WHERE id = ?").run(clock.iso(), carId);
    allocateWaiting(car.trim_id);
  }

  // ---- delivery checklists ----
  function ensureDeliveryChecklists(dealId) {
    const i1 = db.prepare('INSERT OR IGNORE INTO inspection_items(deal_id,item_key) VALUES(?,?)');
    INSPECTION_ITEMS.forEach(([k]) => i1.run(dealId, k));
    const i2 = db.prepare('INSERT OR IGNORE INTO registration_docs(deal_id,doc_key) VALUES(?,?)');
    REGISTRATION_DOCS.forEach((k) => i2.run(dealId, k));
  }

  // ---- Owners Circle (FR-OC-01/02/04/05) ----
  function createMembership(customerId) {
    const ex = db.prepare('SELECT * FROM memberships WHERE customer_id = ?').get(customerId);
    if (ex) return ex;
    let code; do { code = randomCode(6); } while (db.prepare('SELECT 1 FROM memberships WHERE referral_code = ?').get(code));
    const info = db.prepare('INSERT INTO memberships(customer_id,card_number,referral_code,tier,credit_balance,created_at) VALUES(?,?,?,?,0,?)')
      .run(customerId, plainNumber('OC', 'card'), code, 'Member', clock.iso());
    return db.prepare('SELECT * FROM memberships WHERE id = ?').get(info.lastInsertRowid);
  }
  function addCredit(membershipId, amount, reason, dealId) {
    db.prepare('UPDATE memberships SET credit_balance = credit_balance + ? WHERE id = ?').run(amount, membershipId);
    db.prepare('INSERT INTO credit_ledger(membership_id,amount,reason,deal_id,at) VALUES(?,?,?,?,?)').run(membershipId, amount, reason, dealId || null, clock.iso());
  }
  function creditReferral(deal) {
    const ref = db.prepare("SELECT * FROM referrals WHERE deal_id = ? AND status = 'pending'").get(deal.id);
    if (!ref) return;
    const amount = settings.num('referral_credit_usd');
    db.transaction(() => {
      db.prepare("UPDATE referrals SET status = 'credited', credit_usd = ? WHERE id = ?").run(amount, ref.id);
      addCredit(ref.referrer_membership_id, amount, 'referral', deal.id);
      const n = db.prepare("SELECT COUNT(*) c FROM referrals WHERE referrer_membership_id = ? AND status = 'credited'").get(ref.referrer_membership_id).c;
      if (n >= settings.num('ambassador_referrals')) db.prepare("UPDATE memberships SET tier = 'Ambassador' WHERE id = ?").run(ref.referrer_membership_id);
    })();
    const m = db.prepare('SELECT * FROM memberships WHERE id = ?').get(ref.referrer_membership_id);
    notify.send({ userId: m.customer_id, template: 'referral_credit', params: { amount, balance: m.credit_balance } });
  }
  function linkReferral(dealId, code) {
    const deal = dealOr404(dealId);
    if (!['lead', 'quoted', 'reserved'].includes(deal.stage)) throw bad('referral_too_late', 'A referral code must be entered before the contract is signed');
    if (db.prepare('SELECT 1 FROM referrals WHERE deal_id = ?').get(dealId)) throw conflict('already_referred', 'This deal already has a referral');
    const m = db.prepare('SELECT * FROM memberships WHERE referral_code = ?').get(String(code || '').trim().toUpperCase());
    if (!m) throw bad('unknown_referral_code', 'Unknown referral code');
    const referrer = db.prepare('SELECT * FROM users WHERE id = ?').get(m.customer_id);
    const sameEmail = deal.contact_email && referrer.email && deal.contact_email.toLowerCase() === referrer.email.toLowerCase();
    const samePhone = deal.contact_phone && referrer.phone && normPhone(deal.contact_phone) === normPhone(referrer.phone);
    if (sameEmail || samePhone || deal.customer_id === referrer.id) throw bad('self_referral', 'A person cannot refer themselves');
    db.prepare('INSERT INTO referrals(referrer_membership_id,deal_id,status,created_at) VALUES(?,?,?,?)').run(m.id, dealId, 'pending', clock.iso());
    db.prepare('UPDATE deals SET referral_membership_id = ?, updated_at = ? WHERE id = ?').run(m.id, clock.iso(), dealId);
    return m;
  }

  // customer account for walk-in buyers, created at handover so that Owners Circle membership can start (FR-OC-01)
  function ensureCustomerAccount(deal) {
    if (deal.customer_id) return deal.customer_id;
    const existing = deal.contact_email && db.prepare('SELECT id FROM users WHERE email = ?').get(deal.contact_email.toLowerCase());
    let id;
    if (existing) id = existing.id;
    else {
      const temp = randomCode(10);
      const email = deal.contact_email ? deal.contact_email.toLowerCase() : `customer${deal.id}@no-email.invalid`;
      const info = db.prepare(`INSERT INTO users(name,email,phone,password_hash,role,language,notify_pref,consent_data_at,consent_marketing,consent_marketing_at)
        VALUES(?,?,?,?,'customer',?,?,?,?,?)`).run(deal.contact_name, email, deal.contact_phone, bcrypt.hashSync(temp, 10), deal.language || 'en',
        deal.contact_email ? 'email' : 'whatsapp', deal.consent_data_at || clock.iso(), deal.consent_marketing ? 1 : 0, deal.consent_marketing ? clock.iso() : null);
      id = info.lastInsertRowid;
      notify.send({ userId: id, template: 'welcome_owner', params: { car: dealCarName(deal), card: 'pending', code: `Temporary password: ${temp}` } });
    }
    db.prepare('UPDATE deals SET customer_id = ? WHERE id = ?').run(id, deal.id);
    return id;
  }

  // ---- deal stage machine (FR-DEAL-05) ----
  function moveStage(dealId, to, userId, reason) {
    const deal = dealOr404(dealId);
    if (!TRANSITIONS[deal.stage].includes(to)) throw conflict('invalid_transition', `A deal in stage ${deal.stage} cannot move to ${to}`);
    if (to === 'lost' && !String(reason || '').trim()) throw bad('reason_required', 'A reason is required when a deal is marked Lost');
    db.transaction(() => {
      db.prepare('UPDATE deals SET stage = ?, lost_reason = ?, updated_at = ? WHERE id = ?').run(to, to === 'lost' ? reason : deal.lost_reason, clock.iso(), dealId);
      db.prepare('INSERT INTO deal_history(deal_id,from_stage,to_stage,user_id,reason,at) VALUES(?,?,?,?,?,?)').run(dealId, deal.stage, to, userId || null, reason || null, clock.iso());
      if (to === 'lost') releaseCar(dealId); // FR-INV-05
      if (to === 'contract_signed') {
        if (deal.car_id) db.prepare("UPDATE cars SET status = 'sold' WHERE id = ? AND status = 'reserved'").run(deal.car_id);
        ensureDeliveryChecklists(dealId);
      }
      if (to === 'delivered') {
        if (deal.car_id) db.prepare("UPDATE cars SET status = 'delivered' WHERE id = ?").run(deal.car_id);
      }
    })();
    if (to === 'delivered') {
      const customerId = ensureCustomerAccount(getDeal(dealId));
      const m = createMembership(customerId); // FR-OC-01 / FR-DEL-05
      notify.send({ userId: customerId, template: 'welcome_owner', params: { car: dealCarName(deal), card: m.card_number, code: m.referral_code } });
      creditReferral(getDeal(dealId));
    }
    return getDeal(dealId);
  }

  // ---- deals / leads (FR-DEAL-01) ----
  function pickConsultant() {
    const r = db.prepare(`SELECT u.id, (SELECT COUNT(*) FROM deals d WHERE d.consultant_id = u.id AND d.stage IN ('lead','quoted','reserved','contract_signed','paid')) c
      FROM users u WHERE u.role = 'sales_consultant' AND u.active = 1 ORDER BY c, u.id LIMIT 1`).get();
    return r ? r.id : null;
  }
  function findOpenDeal({ customerId, email, phone, trimId }) {
    const conds = []; const args = [];
    if (customerId) { conds.push('customer_id = ?'); args.push(customerId); }
    if (email) { conds.push('lower(contact_email) = lower(?)'); args.push(email); }
    if (phone) { conds.push('contact_phone = ?'); args.push(phone); }
    if (!conds.length) return null;
    return db.prepare(`SELECT * FROM deals WHERE stage IN ('lead','quoted','reserved') AND (trim_id IS ? ) AND (${conds.join(' OR ')}) ORDER BY id DESC LIMIT 1`).get(trimId || null, ...args);
  }
  function createDeal(p) {
    const now = clock.iso();
    if (!p.customer_id && p.email) { // an enquiry from a registered customer's email appears in their portal
      const u = db.prepare("SELECT id FROM users WHERE lower(email) = lower(?) AND role = 'customer' AND erased = 0").get(p.email);
      if (u) p = { ...p, customer_id: u.id };
    }
    const consultant = p.consultant_id || pickConsultant();
    const info = db.prepare(`INSERT INTO deals(customer_id,contact_name,contact_phone,contact_email,language,source,trim_id,color,consultant_id,stage,notes,chat_id,consent_data_at,consent_marketing,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,'lead',?,?,?,?,?,?)`).run(p.customer_id || null, p.name, p.phone || null, p.email || null, p.language || 'en', p.source, p.trim_id || null,
      p.color || null, consultant, p.notes || null, p.chat_id || null, p.consent_data_at || now, p.consent_marketing ? 1 : 0, now, now);
    const id = info.lastInsertRowid;
    db.prepare('INSERT INTO deal_history(deal_id,from_stage,to_stage,user_id,reason,at) VALUES(?,?,?,?,?,?)').run(id, null, 'lead', p.user_id || null, `source: ${p.source}`, now);
    if (p.referral_code) {
      try { linkReferral(id, p.referral_code); db.prepare("UPDATE deals SET source = 'referral' WHERE id = ?").run(id); }
      catch (e) { if (p.strict_referral) throw e; }
    }
    if (consultant) {
      notify.send({ userId: consultant, template: 'lead_assigned', params: { source: p.source, name: p.name, car: p.trim_id ? trimLabel(getTrim(p.trim_id)) : '-' } });
    }
    return getDeal(id);
  }

  return { TRANSITIONS, OPEN_STAGES, INSPECTION_ITEMS, REGISTRATION_DOCS, nextSeq, yearNumber, plainNumber, trimLabel, getTrim, getDeal, dealOr404, dealCarName, dealRecipient,
    activePromo, effectivePrice, availability, latestQuotation, quotationTotals, financials, loanApproved, reserveCar, allocateWaiting, releaseCar, markInStock,
    ensureDeliveryChecklists, createMembership, addCredit, linkReferral, moveStage, createDeal, findOpenDeal, ensureCustomerAccount, pickConsultant };
};
