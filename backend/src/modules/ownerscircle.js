const express = require('express');
const clock = require('../clock');
const { bad, conflict, notFound, forbidden, required, round2 } = require('../util');

// FR-OC-01..06 (membership creation, referral link and credit are in services/core.js)
module.exports = function ownersCircle(ctx) {
  const { db, auth, audit, notify, settings, core } = ctx;
  const r = express.Router();
  const SM = auth.requireRole('sales_manager');
  const myMembership = (u) => { const m = db.prepare('SELECT * FROM memberships WHERE customer_id = ?').get(u.id); if (!m) throw notFound('Membership'); return m; };

  r.get('/me/owners-circle', auth.requireRole('customer'), (req, res) => {
    const m = myMembership(req.user);
    const refs = db.prepare('SELECT r.status, r.credit_usd, r.created_at, d.contact_name FROM referrals r JOIN deals d ON d.id = r.deal_id WHERE r.referrer_membership_id = ? ORDER BY r.id DESC').all(m.id);
    const credited = refs.filter((x) => x.status === 'credited').length; const goal = settings.num('ambassador_referrals');
    res.json({ card_number: m.card_number, member_name: req.user.name, referral_code: m.referral_code, referral_link: `/refer/${m.referral_code}`, tier: m.tier, member_since: m.created_at,
      credit_balance: round2(m.credit_balance), referrals: refs, credited_referrals: credited, referrals_to_ambassador: Math.max(0, goal - credited),
      ledger: db.prepare('SELECT amount, reason, deal_id, at FROM credit_ledger WHERE membership_id = ? ORDER BY id DESC').all(m.id) });
  });
  // FR-OC-05: use the credit on accessories or the next purchase (applied as a payment on one of the member's open deals)
  r.post('/me/owners-circle/apply-credit', auth.requireRole('customer'), (req, res) => {
    const m = myMembership(req.user); const b = req.body || {}; required(b, ['deal_id', 'amount']);
    const amount = round2(Number(b.amount)); const d = core.dealOr404(b.deal_id);
    if (d.customer_id !== req.user.id) throw forbidden();
    if (!(amount > 0)) throw bad('invalid_amount', 'Amount must be positive');
    if (amount > m.credit_balance + 0.001) throw conflict('insufficient_credit', 'The amount is more than your credit balance', { balance: round2(m.credit_balance) });
    if (!['reserved', 'contract_signed'].includes(d.stage)) throw conflict('invalid_stage', 'Credit can be used on a reserved deal before it is fully paid');
    const p = db.transaction(() => {
      const pay = ctx.recordPayment(d.id, { kind: 'payment', amount, currency: 'USD', method: 'owner_credit', reference: `Owners Circle ${m.card_number}` }, null);
      core.addCredit(m.id, -amount, 'applied', d.id);
      return pay;
    })();
    res.status(201).json({ payment_id: p.id, credit_balance: round2(db.prepare('SELECT credit_balance FROM memberships WHERE id = ?').get(m.id).credit_balance) });
  });
  // FR-OC-06
  r.get('/me/owners-circle/events', auth.requireRole('customer'), (req, res) => {
    myMembership(req.user); const ar = req.user.language === 'ar';
    res.json(db.prepare('SELECT * FROM owner_events ORDER BY id DESC').all().map((e) => ({ id: e.id, kind: e.kind, title: (ar && e.title_ar) || e.title_en, description: (ar && e.description_ar) || e.description_en, trim_id: e.trim_id, starts_on: e.starts_on, created_at: e.created_at })));
  });
  r.post('/owners-circle/events', SM, (req, res) => {
    const b = req.body || {}; required(b, ['kind', 'title_en']);
    if (!['event', 'early_access'].includes(b.kind)) throw bad('invalid_kind', 'Kind must be event or early_access');
    if (b.trim_id && !core.getTrim(b.trim_id)) throw notFound('Trim');
    const id = db.prepare('INSERT INTO owner_events(kind,title_en,title_ar,description_en,description_ar,trim_id,starts_on,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?)')
      .run(b.kind, b.title_en, b.title_ar || null, b.description_en || '', b.description_ar || null, b.trim_id || null, b.starts_on || null, req.user.id, clock.iso()).lastInsertRowid;
    audit(req.user.id, 'owner_event_published', 'owner_event', id, { kind: b.kind, title: b.title_en });
    let notified = 0;
    db.prepare('SELECT customer_id FROM memberships').all().forEach((m) => { // marketing message: only members who consented (FR-NOT-02)
      const u = db.prepare('SELECT language FROM users WHERE id = ?').get(m.customer_id);
      const ar = u && u.language === 'ar';
      if (notify.send({ userId: m.customer_id, kind: 'marketing', template: 'owner_event', params: { title: (ar && b.title_ar) || b.title_en, description: (ar && b.description_ar) || b.description_en || '' } })) notified++;
    });
    res.status(201).json({ id, notified_members: notified });
  });
  r.get('/owners-circle/events', auth.requireRole('sales_manager', 'general_manager'), (req, res) => res.json(db.prepare('SELECT * FROM owner_events ORDER BY id DESC').all()));
  r.get('/owners-circle/members', auth.requireRole('sales_manager', 'general_manager'), (req, res) => {
    res.json(db.prepare(`SELECT m.card_number, m.tier, m.credit_balance, m.referral_code, m.created_at, u.name,
      (SELECT COUNT(*) FROM referrals r WHERE r.referrer_membership_id = m.id AND r.status = 'credited') credited_referrals FROM memberships m JOIN users u ON u.id = m.customer_id ORDER BY m.id DESC`).all());
  });
  r.put('/owners-circle/referral-credit', SM, (req, res) => {
    const amount = (req.body || {}).amount; required({ amount }, ['amount']);
    settings.setMany({ referral_credit_usd: amount }, req.user.id);
    audit(req.user.id, 'setting_change', 'settings', 'referral_credit_usd', { value: amount });
    res.json({ referral_credit_usd: settings.num('referral_credit_usd') });
  });
  return r;
};
