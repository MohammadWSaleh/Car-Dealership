const express = require('express');
const calc = require('../services/calc');
const clock = require('../clock');
const { bad, notFound, required, isEmail, dmy } = require('../util');

// F4: instant trade-in estimate. The range comes from a formula with staff-set values; a consultant confirms a real offer, valid for a few days.
const SEGMENTS = ['small', 'sedan', 'suv', 'premium'];
module.exports = function tradein(ctx) {
  const { db, auth, audit, notify, settings, core } = ctx;
  const r = express.Router();
  const CONSULTANT = auth.requireRole('sales_consultant', 'sales_manager');
  const view = (t) => {
    const expired = t.status === 'offered' && t.offer_valid_until && new Date(t.offer_valid_until.replace(' ', 'T')) < clock.now();
    return { id: t.id, segment: t.segment, brand: t.brand, model: t.model, year: t.year, mileage_km: t.mileage_km, condition: t.condition, est_low: t.est_low, est_high: t.est_high,
      status: expired ? 'expired' : t.status, offer_usd: t.offer_usd, offer_valid_until: t.offer_valid_until, created_at: t.created_at };
  };
  const label = (t) => [t.brand, t.model, t.year].filter(Boolean).join(' ') || `${t.segment} ${t.year}`;

  r.post('/tradein/estimate', (req, res) => {
    const b = req.body || {};
    required(b, ['segment', 'year', 'mileage_km', 'condition']);
    if (!SEGMENTS.includes(b.segment)) throw bad('invalid_segment', 'Invalid vehicle segment');
    const thisYear = clock.now().getFullYear(); const year = Number(b.year); const km = Number(b.mileage_km);
    if (!Number.isInteger(year) || year < thisYear - 25 || year > thisYear + 1) throw bad('invalid_year', 'Year is out of range');
    if (!Number.isFinite(km) || km < 0 || km > 1000000) throw bad('invalid_mileage', 'Mileage must be between 0 and 1,000,000 km');
    const est = calc.tradeInEstimate({ base: settings.num(`tradein_base_${b.segment}`), age: Math.max(0, thisYear - year), mileage: km, condition: b.condition,
      agePercent: settings.num('tradein_age_percent'), rangePercent: settings.num('tradein_range_percent') });
    const u = req.user && req.user.role === 'customer' ? req.user : null;
    const wantsContact = b.send_to_consultant === true;
    let name = u ? u.name : (b.name || null); const email = u ? u.email : (b.email || null); const phone = u ? u.phone : (b.phone || null); const lang = u ? u.language : (b.lang === 'ar' ? 'ar' : 'en');
    if (wantsContact) {
      if (!u) {
        required(b, ['name']);
        if (!email && !phone) throw bad('contact_required', 'An email address or phone number is required');
        if (email && !isEmail(email)) throw bad('invalid_email', 'Invalid email address');
        if (b.consent_data !== true) throw bad('consent_required', 'Consent to data processing is required');
      }
    }
    if (b.trim_id != null && b.trim_id !== '' && !core.getTrim(b.trim_id)) throw notFound('Trim');
    if (!u && !wantsContact) return res.status(201).json({ id: null, segment: b.segment, brand: b.brand || null, model: b.model || null, year, mileage_km: km, condition: b.condition,
      est_low: est.low, est_high: est.high, status: 'estimated', offer_usd: null, offer_valid_until: null }); // anonymous quick estimates are not stored
    const info = db.prepare(`INSERT INTO trade_ins(customer_id,segment,brand,model,year,mileage_km,condition,est_low,est_high,name,phone,email,language,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(u ? u.id : null, b.segment, b.brand || null, b.model || null, year, km, b.condition, est.low, est.high, wantsContact ? name : null, wantsContact ? phone : null, wantsContact ? email : null, lang, wantsContact ? 'requested' : 'estimated', clock.iso());
    const id = info.lastInsertRowid;
    if (wantsContact) {
      const row = db.prepare('SELECT * FROM trade_ins WHERE id = ?').get(id);
      const deal = core.createDeal({ customer_id: u && u.id, name, email, phone, language: lang, source: 'web_form', trim_id: b.trim_id || null,
        notes: `Trade-in request #${id}: ${label(row)}, ${km} km, ${b.condition}. Estimate ${est.low}-${est.high} USD.`, consent_marketing: false });
      db.prepare('UPDATE trade_ins SET deal_id = ? WHERE id = ?').run(deal.id, id);
    }
    res.status(201).json(view(db.prepare('SELECT * FROM trade_ins WHERE id = ?').get(id)));
  });
  r.get('/tradein/mine', auth.requireRole('customer'), (req, res) => {
    res.json(db.prepare('SELECT * FROM trade_ins WHERE customer_id = ? ORDER BY id DESC').all(req.user.id).map(view));
  });
  r.get('/tradein', CONSULTANT, (req, res) => {
    res.json(db.prepare("SELECT * FROM trade_ins WHERE status != 'estimated' ORDER BY id DESC LIMIT 200").all().map((t) => ({ ...view(t), name: t.name, phone: t.phone, email: t.email, deal_id: t.deal_id })));
  });
  r.post('/tradein/:id/offer', CONSULTANT, (req, res) => {
    const t = db.prepare('SELECT * FROM trade_ins WHERE id = ?').get(req.params.id);
    if (!t) throw notFound('Trade-in');
    if (t.status === 'estimated') throw bad('not_requested', 'The customer has not asked for an offer yet');
    const offer = Number((req.body || {}).offer_usd);
    if (!Number.isFinite(offer) || offer <= 0 || offer > 1000000) throw bad('invalid_offer', 'The offer must be a positive amount');
    const until = new Date(clock.now().getTime()); until.setDate(until.getDate() + settings.num('tradein_offer_days'));
    const iso = until.toISOString();
    db.prepare("UPDATE trade_ins SET status = 'offered', offer_usd = ?, offer_valid_until = ?, offered_by = ? WHERE id = ?").run(offer, iso, req.user.id, t.id);
    audit(req.user.id, 'tradein_offer', 'trade_in', t.id, { offer });
    const to = t.customer_id ? { userId: t.customer_id } : { to: { email: t.email, phone: t.phone, language: t.language, notify_pref: t.email ? 'email' : 'whatsapp' } };
    notify.send({ ...to, template: 'tradein_offer', params: { offer, vehicle: label(t), valid_until: dmy(iso) } });
    res.json(view(db.prepare('SELECT * FROM trade_ins WHERE id = ?').get(t.id)));
  });
  return r;
};
