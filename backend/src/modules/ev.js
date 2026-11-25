const express = require('express');
const calc = require('../services/calc');
const clock = require('../clock');
const { bad, notFound, required, parseJson, isEmail } = require('../util');

// FR-EV-01..03: EV Readiness Check
const REASONS = {
  en: {
    no_home_charging_street: 'You park on the street and have no home charging, so charging every day would be impractical.',
    no_home_charging: 'Without home charging you would depend on public chargers; plan where you will charge.',
    long_distance: 'Your daily distance is high for most electric cars; check the real range with a consultant.',
    very_long_distance: 'Your daily distance is above what the electric cars we sell can cover reliably.',
    grid_only: 'Grid power in Lebanon has cuts; a private generator or solar panels make home charging dependable.',
    generator: 'Charging from a private generator works but costs more; solar would lower the charging cost.',
    budget_low: 'Your budget is below the lowest price of our electric cars; a plug-in hybrid or hybrid may fit better.',
    all_good: 'Your daily distance, parking and charging access suit an electric car.',
  },
  ar: {
    no_home_charging_street: 'تركن السيارة في الشارع وليس لديك شحن منزلي، لذا يصعب الشحن اليومي.',
    no_home_charging: 'بدون شحن منزلي ستعتمد على الشواحن العامة؛ خطّط لأماكن الشحن.',
    long_distance: 'مسافتك اليومية مرتفعة لمعظم السيارات الكهربائية؛ تحقق من المدى الفعلي مع المستشار.',
    very_long_distance: 'مسافتك اليومية أعلى مما تغطيه السيارات الكهربائية التي نبيعها بشكل موثوق.',
    grid_only: 'الكهرباء العامة في لبنان تنقطع؛ مولّد خاص أو ألواح شمسية يجعل الشحن المنزلي موثوقًا.',
    generator: 'الشحن من مولّد خاص ممكن لكنه أغلى؛ الطاقة الشمسية تخفض كلفة الشحن.',
    budget_low: 'ميزانيتك أقل من أدنى سعر لسياراتنا الكهربائية؛ قد تناسبك سيارة هجينة أو هجينة قابلة للشحن.',
    all_good: 'مسافتك اليومية ومكان الركن وإمكانية الشحن مناسبة لسيارة كهربائية.',
  },
};
const PARKING = ['private_garage', 'private_driveway', 'shared_garage', 'street'];
const POWER = ['grid', 'generator', 'solar'];

module.exports = function ev(ctx) {
  const { db, auth, core, settings } = ctx;
  const r = express.Router();

  r.post('/ev/check', (req, res) => {
    const b = req.body || {};
    required(b, ['daily_km', 'parking', 'power_source', 'budget_usd']);
    const km = Number(b.daily_km); const budget = Number(b.budget_usd);
    if (!Number.isFinite(km) || km <= 0 || km > 1500) throw bad('invalid_daily_km', 'Daily distance must be between 1 and 1500 km');
    if (!PARKING.includes(b.parking)) throw bad('invalid_parking', 'Invalid parking type');
    if (!POWER.includes(b.power_source)) throw bad('invalid_power_source', 'Invalid power source');
    if (typeof b.home_charging !== 'boolean') throw bad('invalid_home_charging', 'home_charging must be true or false');
    if (!Number.isFinite(budget) || budget <= 0) throw bad('invalid_budget', 'Budget must be a positive number');
    const lang = b.lang === 'ar' ? 'ar' : 'en';

    const evs = db.prepare("SELECT * FROM trims WHERE active = 1 AND fuel_type = 'electric' ORDER BY price_usd").all();
    const { result, reasonKeys } = calc.evAssess({ km, parking: b.parking, homeCharging: b.home_charging, powerSource: b.power_source, budget,
      cheapestEv: evs.length ? Math.min(...evs.map((t) => core.effectivePrice(t))) : null });
    // shortlist: electric trims within budget whose range covers two days of driving; plug-in hybrids when the result is not "suitable"
    const fuels = result === 'suitable' ? ['electric'] : ['electric', 'plug_in_hybrid'];
    const short = db.prepare(`SELECT * FROM trims WHERE active = 1 AND fuel_type IN (${fuels.map(() => '?').join(',')}) ORDER BY price_usd`).all(...fuels)
      .filter((t) => core.effectivePrice(t) <= budget && (t.fuel_type !== 'electric' || (t.range_km || 0) >= km * 2 || result !== 'suitable'))
      .slice(0, 4).map((t) => ({ id: t.id, label: core.trimLabel(t), fuel_type: t.fuel_type, price_usd: core.effectivePrice(t), range_km: t.range_km }));
    const reasons = reasonKeys.map((k) => ({ key: k, text: REASONS[lang][k] }));
    const info = db.prepare('INSERT INTO ev_checks(customer_id,answers,result,reasons,shortlist,created_at) VALUES(?,?,?,?,?,?)')
      .run(req.user && req.user.role === 'customer' ? req.user.id : null, JSON.stringify({ daily_km: km, parking: b.parking, home_charging: b.home_charging, power_source: b.power_source, budget_usd: budget }),
        result, JSON.stringify(reasonKeys), JSON.stringify(short), clock.iso());
    res.status(201).json({ id: info.lastInsertRowid, result, reasons, shortlist: short });
  });

  // FR-EV-03: send the result to a consultant (creates a lead); booking a test drive uses the normal booking endpoint
  r.post('/ev/check/:id/send-to-consultant', (req, res) => {
    const row = db.prepare('SELECT * FROM ev_checks WHERE id = ?').get(req.params.id);
    if (!row) throw notFound('EV check');
    if (row.deal_id) throw bad('already_sent', 'This result was already sent to a consultant');
    const b = req.body || {}; const u = req.user && req.user.role === 'customer' ? req.user : null;
    let name, email, phone, lang, consentMk = false;
    if (u) { name = u.name; email = u.email; phone = u.phone; lang = u.language; }
    else {
      required(b, ['name']);
      if (!b.email && !b.phone) throw bad('contact_required', 'An email address or phone number is required');
      if (b.email && !isEmail(b.email)) throw bad('invalid_email', 'Invalid email address');
      if (b.consent_data !== true) throw bad('consent_required', 'Consent to data processing is required');
      name = b.name; email = b.email || null; phone = b.phone || null; lang = b.lang === 'ar' ? 'ar' : 'en'; consentMk = b.consent_marketing === true;
    }
    const short = parseJson(row.shortlist, []);
    const deal = core.createDeal({ customer_id: u && u.id, name, email, phone, language: lang, source: 'web_form', trim_id: b.trim_id || (short[0] && short[0].id) || null,
      notes: `EV readiness check #${row.id}: ${row.result}. Answers: ${row.answers}`, consent_marketing: consentMk });
    db.prepare('UPDATE ev_checks SET deal_id = ? WHERE id = ?').run(deal.id, row.id);
    res.status(201).json({ lead_id: deal.id });
  });
  return r;
};
