const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const calc = require('../services/calc');
const clock = require('../clock');
const { bad, notFound, required, parseJson, round2 } = require('../util');

// FR-CAT-01..08
const INCLUDES = {
  en: { in: ['The vehicle', 'Import charges', 'VAT'], out: ['Registration fees', 'Insurance', 'Stamp duty on the contract', 'Optional accessories'] },
  ar: { in: ['السيارة', 'رسوم الاستيراد', 'ضريبة القيمة المضافة'], out: ['رسوم التسجيل', 'التأمين', 'رسم الطابع على العقد', 'الإكسسوارات الاختيارية'] },
};

module.exports = function catalogue(ctx) {
  const { db, auth, audit, settings, core } = ctx;
  const r = express.Router();
  const SM = auth.requireRole('sales_manager');

  // Photos (UX): public, not personal data, so they are stored unencrypted under uploads/photos
  const photoDir = path.join(ctx.config ? ctx.config.uploadDir : require('../config').uploadDir, 'photos');
  const IMG_TYPES = [['image/jpeg', (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff, 'jpg'], ['image/png', (b) => b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), 'png'],
    ['image/webp', (b) => b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP', 'webp']];
  const imagesOf = (trimId) => db.prepare('SELECT id, color FROM trim_images WHERE trim_id = ? ORDER BY position, id').all(trimId).map((i) => ({ id: i.id, color: i.color, url: `/api/catalogue/images/${i.id}` }));
  function serialize(t, lang = 'en') {
    const price = core.effectivePrice(t);
    const images = imagesOf(t.id);
    const promo = core.activePromo(t.id);
    const l = lang === 'ar' ? 'ar' : 'en';
    return {
      id: t.id, brand: t.brand, model: t.model, name: t.name, body_type: t.body_type, fuel_type: t.fuel_type, image_url: (images[0] && images[0].url) || t.image_url, images,
      specs: parseJson(t.specs, {}), colors: parseJson(t.colors, []), range_km: t.range_km, battery_kwh: t.battery_kwh,
      l_per_100km: t.l_per_100km, kwh_per_100km: t.kwh_per_100km,
      description: (l === 'ar' ? t.description_ar : t.description_en) || t.description_en || '',
      price_usd: round2(price), list_price_usd: t.price_usd, price_lbp: settings.lbp(price), exchange_rate: settings.num('exchange_rate'),
      price_includes: INCLUDES[l].in.map((x) => (x === 'VAT' || x === 'ضريبة القيمة المضافة' ? `${x} (${settings.get('vat_rate')}%)` : x)),
      price_excludes: INCLUDES[l].out,
      promotion: promo ? { id: promo.id, title: l === 'ar' && promo.title_ar ? promo.title_ar : promo.title_en, ends_on: promo.ends_on } : null,
      availability: core.availability(t.id),
    };
  }

  r.get('/catalogue/filters', (req, res) => {
    const col = (c) => db.prepare(`SELECT DISTINCT ${c} v FROM trims WHERE active = 1 ORDER BY ${c}`).all().map((x) => x.v);
    const p = db.prepare('SELECT MIN(price_usd) min, MAX(price_usd) max FROM trims WHERE active = 1').get();
    res.json({ brands: col('brand'), body_types: col('body_type'), fuel_types: col('fuel_type'), min_price: p.min, max_price: p.max });
  });

  // FR-CAT-01 / FR-CAT-02
  r.get('/catalogue/trims', (req, res) => {
    const q = req.query; const where = ['active = 1']; const args = [];
    const list = (v) => String(v).split(',').map((s) => s.trim()).filter(Boolean);
    if (q.brand) { const l = list(q.brand); where.push(`brand IN (${l.map(() => '?').join(',')})`); args.push(...l); }
    if (q.body_type) { const l = list(q.body_type); where.push(`body_type IN (${l.map(() => '?').join(',')})`); args.push(...l); }
    if (q.fuel_type) { const l = list(q.fuel_type); where.push(`fuel_type IN (${l.map(() => '?').join(',')})`); args.push(...l); }
    if (q.min_price !== undefined && q.min_price !== '') { if (isNaN(+q.min_price)) throw bad('invalid_price', 'min_price must be a number'); where.push('price_usd >= ?'); args.push(+q.min_price); }
    if (q.max_price !== undefined && q.max_price !== '') { if (isNaN(+q.max_price)) throw bad('invalid_price', 'max_price must be a number'); where.push('price_usd <= ?'); args.push(+q.max_price); }
    if (q.q) { where.push('(brand LIKE ? OR model LIKE ? OR name LIKE ?)'); args.push(`%${q.q}%`, `%${q.q}%`, `%${q.q}%`); }
    const order = q.sort === 'price_desc' ? 'price_usd DESC' : q.sort === 'price_asc' ? 'price_usd ASC' : 'brand, model, price_usd';
    const rows = db.prepare(`SELECT * FROM trims WHERE ${where.join(' AND ')} ORDER BY ${order}`).all(...args);
    res.json(rows.map((t) => serialize(t, q.lang)));
  });
  // FR-CAT-05: compare up to three trims
  r.get('/catalogue/compare', (req, res) => {
    const ids = String(req.query.ids || '').split(',').map((s) => parseInt(s, 10)).filter(Boolean);
    if (!ids.length) throw bad('no_trims', 'Select at least one trim');
    if (new Set(ids).size > 3) throw bad('too_many_trims', 'You can compare at most three trims');
    const out = [...new Set(ids)].map((id) => { const t = core.getTrim(id); if (!t || !t.active) throw notFound('Trim'); return serialize(t, req.query.lang); });
    res.json(out);
  });
  r.get('/catalogue/trims/:id', (req, res) => {
    const t = core.getTrim(req.params.id);
    if (!t || !t.active) throw notFound('Trim');
    res.json(serialize(t, req.query.lang));
  });
  // FR-CAT-06: instalment; the interest rate is set by the Sales Manager (a setting), never by the visitor
  r.get('/catalogue/installment', (req, res) => {
    const t = core.getTrim(req.query.trim_id);
    if (!t) throw notFound('Trim');
    const price = core.effectivePrice(t);
    const down = Number(req.query.down_payment ?? 0);
    const term = parseInt(req.query.term_months, 10);
    res.json(calc.installment({ price, down, term, ratePercent: settings.num('default_interest') }));
  });
  // F1 budget-first finder: the terms behind the monthly-budget slider (staff-set, never by the visitor)
  r.get('/catalogue/finder-config', (req, res) => {
    res.json({ rate_percent: settings.num('default_interest'), term_months: settings.num('finder_term_months'), down_percent: settings.num('finder_down_percent') });
  });
  // F2: Lebanon EV savings calculator (fuel and electricity prices are staff-set settings)
  r.get('/catalogue/ev-savings', (req, res) => {
    const ev = core.getTrim(req.query.trim_id);
    if (!ev || !ev.active) throw notFound('Trim');
    if (ev.fuel_type === 'petrol' || ev.fuel_type === 'hybrid') throw bad('not_alternative_fuel', 'Choose an electric or plug-in hybrid trim');
    const km = Number(req.query.daily_km ?? 40);
    if (!Number.isFinite(km) || km < 1 || km > 500) throw bad('invalid_daily_km', 'Daily distance must be between 1 and 500 km');
    let petrol = req.query.petrol_trim_id ? core.getTrim(req.query.petrol_trim_id) : null;
    if (req.query.petrol_trim_id && !petrol) throw notFound('Trim');
    if (petrol && petrol.fuel_type !== 'petrol') throw bad('not_petrol', 'The comparison trim must be a petrol trim');
    const evPrice = core.effectivePrice(ev);
    if (!petrol) { // default: the petrol car of the same body type closest in price, else the closest petrol car
      const all = db.prepare("SELECT * FROM trims WHERE active = 1 AND fuel_type = 'petrol' AND l_per_100km IS NOT NULL").all();
      const rank = (x) => [x.body_type === ev.body_type ? 0 : 1, Math.abs(core.effectivePrice(x) - evPrice)];
      petrol = all.sort((a, b) => { const ra = rank(a); const rb = rank(b); return ra[0] - rb[0] || ra[1] - rb[1]; })[0];
      if (!petrol) throw notFound('Petrol trim');
    }
    const out = calc.evSavings({ ev, evPrice, petrol, petrolPrice: core.effectivePrice(petrol), km: km * 365, years: 5,
      fuelPrice: settings.num('fuel_price_usd_per_l'), elecPrice: settings.num('electricity_usd_per_kwh') });
    res.json({ ev: { id: ev.id, label: core.trimLabel(ev), price_usd: evPrice }, petrol: { id: petrol.id, label: core.trimLabel(petrol), price_usd: core.effectivePrice(petrol) },
      daily_km: km, fuel_price_usd_per_l: settings.num('fuel_price_usd_per_l'), electricity_usd_per_kwh: settings.num('electricity_usd_per_kwh'), ...out });
  });
  // F3: public price history of a trim, plus how long a quoted price stays locked
  r.get('/catalogue/trims/:id/price-trend', (req, res) => {
    const t = core.getTrim(req.params.id);
    if (!t || !t.active) throw notFound('Trim');
    const rows = db.prepare('SELECT new_price price, changed_at at FROM price_history WHERE trim_id = ? ORDER BY id').all(t.id);
    const current = core.effectivePrice(t);
    const points = rows.map((x) => ({ at: x.at, price: x.price }));
    if (!points.length || points[points.length - 1].price !== t.price_usd) points.push({ at: clock.iso(), price: t.price_usd });
    const prices = points.map((p) => p.price);
    res.json({ points, current_usd: current, list_price_usd: t.price_usd, lowest_usd: Math.min(...prices), highest_usd: Math.max(...prices), changes: Math.max(0, points.length - 1), lock_days: settings.num('quotation_days') });
  });
  // FR-CAT-07: yearly running cost, hybrid / electric vs a chosen petrol trim
  r.get('/catalogue/running-cost', (req, res) => {
    const a = core.getTrim(req.query.trim_id); const b = core.getTrim(req.query.petrol_trim_id);
    if (!a || !b) throw notFound('Trim');
    if (a.fuel_type === 'petrol') throw bad('not_alternative_fuel', 'Choose a hybrid or electric trim to compare');
    if (b.fuel_type !== 'petrol') throw bad('not_petrol', 'The comparison trim must be a petrol trim');
    const km = Number(req.query.km_per_year);
    if (!Number.isFinite(km) || km <= 0 || km > 200000) throw bad('invalid_distance', 'Annual distance must be between 1 and 200000 km');
    const fuel = settings.num('fuel_price_usd_per_l'); const el = settings.num('electricity_usd_per_kwh');
    const cost = (t) => calc.yearlyCost(t, km, fuel, el);
    const ca = round2(cost(a)); const cb = round2(cost(b));
    res.json({ km_per_year: km, fuel_price_usd_per_l: fuel, electricity_usd_per_kwh: el, plug_in_hybrid_electric_share: 0.5,
      alternative: { trim_id: a.id, yearly_cost_usd: ca }, petrol: { trim_id: b.id, yearly_cost_usd: cb }, yearly_saving_usd: round2(cb - ca) });
  });

  r.get('/catalogue/accessories', (req, res) => {
    res.json(db.prepare('SELECT id,name_en,name_ar,price_usd FROM accessories WHERE active = 1 ORDER BY name_en').all());
  });
  r.get('/catalogue/promotions', (req, res) => {
    const today = clock.iso().slice(0, 10); const lang = req.query.lang === 'ar' ? 'ar' : 'en';
    const rows = db.prepare(`SELECT * FROM promotions WHERE active = 1 AND (starts_on IS NULL OR starts_on <= ?) AND (ends_on IS NULL OR ends_on >= ?) ORDER BY id DESC`).all(today, today);
    res.json(rows.map((p) => ({ id: p.id, trim_id: p.trim_id, title: (lang === 'ar' && p.title_ar) || p.title_en, description: (lang === 'ar' && p.description_ar) || p.description_en, promo_price_usd: p.promo_price_usd, ends_on: p.ends_on })));
  });

  r.get('/catalogue/images/:id', (req, res) => {
    const im = db.prepare('SELECT * FROM trim_images WHERE id = ?').get(req.params.id); if (!im) throw notFound('Image');
    const f = path.join(photoDir, im.file); if (!fs.existsSync(f)) throw notFound('Image');
    res.set({ 'Content-Type': im.mime, 'Cache-Control': 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff' }); res.send(fs.readFileSync(f));
  });

  // ----- management: Sales Manager only (FR-CAT-08) -----
  r.post('/catalogue/trims/:id/images', SM, ctx.docs.upload.single('file'), (req, res) => {
    const t = core.getTrim(req.params.id); if (!t) throw notFound('Trim');
    if (!req.file) throw bad('file_required', 'A picture is required');
    const type = IMG_TYPES.find(([, test]) => test(req.file.buffer)); if (!type) throw bad('invalid_image', 'Only JPEG, PNG or WebP pictures are accepted');
    const color = req.body.color ? String(req.body.color).slice(0, 40) : null;
    if (db.prepare('SELECT COUNT(*) c FROM trim_images WHERE trim_id = ?').get(t.id).c >= 12) throw bad('too_many_images', 'At most 12 pictures per trim');
    fs.mkdirSync(photoDir, { recursive: true }); const file = `${crypto.randomUUID()}.${type[2]}`; fs.writeFileSync(path.join(photoDir, file), req.file.buffer);
    const pos = db.prepare('SELECT COALESCE(MAX(position),0)+1 p FROM trim_images WHERE trim_id = ?').get(t.id).p;
    const info = db.prepare('INSERT INTO trim_images(trim_id,color,file,mime,position,created_at) VALUES(?,?,?,?,?,?)').run(t.id, color, file, type[0], pos, clock.iso());
    audit(req.user.id, 'trim_image_add', 'trim', t.id, { image: info.lastInsertRowid, color });
    res.status(201).json({ id: info.lastInsertRowid, color, url: `/api/catalogue/images/${info.lastInsertRowid}` });
  });
  r.delete('/catalogue/trims/:id/images/:imageId', SM, (req, res) => {
    const im = db.prepare('SELECT * FROM trim_images WHERE id = ? AND trim_id = ?').get(req.params.imageId, req.params.id); if (!im) throw notFound('Image');
    db.prepare('DELETE FROM trim_images WHERE id = ?').run(im.id); try { fs.unlinkSync(path.join(photoDir, im.file)); } catch { /* already gone */ }
    audit(req.user.id, 'trim_image_remove', 'trim', Number(req.params.id), { image: im.id }); res.json({ ok: true });
  });
  r.post('/catalogue/trims', SM, (req, res) => {
    const b = req.body || {};
    required(b, ['brand', 'model', 'name', 'body_type', 'fuel_type', 'price_usd']);
    if (!['petrol', 'hybrid', 'plug_in_hybrid', 'electric'].includes(b.fuel_type)) throw bad('invalid_fuel_type', 'Invalid fuel type');
    if (!(Number(b.price_usd) > 0)) throw bad('invalid_price', 'Price must be positive');
    const info = db.prepare(`INSERT INTO trims(brand,model,name,body_type,fuel_type,price_usd,image_url,specs,colors,range_km,battery_kwh,l_per_100km,kwh_per_100km,description_en,description_ar)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(b.brand, b.model, b.name, b.body_type, b.fuel_type, +b.price_usd, b.image_url || null, JSON.stringify(b.specs || {}), JSON.stringify(b.colors || []),
      b.range_km ?? null, b.battery_kwh ?? null, b.l_per_100km ?? null, b.kwh_per_100km ?? null, b.description_en || null, b.description_ar || null);
    db.prepare('INSERT INTO price_history(trim_id,old_price,new_price,changed_by,changed_at) VALUES(?,?,?,?,?)').run(info.lastInsertRowid, null, +b.price_usd, req.user.id, clock.iso());
    audit(req.user.id, 'price_change', 'trim', info.lastInsertRowid, { old: null, new: +b.price_usd });
    res.status(201).json(serialize(core.getTrim(info.lastInsertRowid)));
  });
  r.put('/catalogue/trims/:id', SM, (req, res) => {
    const t = core.getTrim(req.params.id); if (!t) throw notFound('Trim');
    const b = req.body || {};
    if ('price_usd' in b) throw bad('use_price_endpoint', 'Change prices through the price endpoint so that they are recorded');
    const f = (k, d) => (b[k] !== undefined ? b[k] : d);
    db.prepare(`UPDATE trims SET name=?, body_type=?, image_url=?, specs=?, colors=?, range_km=?, battery_kwh=?, l_per_100km=?, kwh_per_100km=?, description_en=?, description_ar=?, active=? WHERE id=?`)
      .run(f('name', t.name), f('body_type', t.body_type), f('image_url', t.image_url), b.specs ? JSON.stringify(b.specs) : t.specs, b.colors ? JSON.stringify(b.colors) : t.colors,
        f('range_km', t.range_km), f('battery_kwh', t.battery_kwh), f('l_per_100km', t.l_per_100km), f('kwh_per_100km', t.kwh_per_100km),
        f('description_en', t.description_en), f('description_ar', t.description_ar), b.active === undefined ? t.active : (b.active ? 1 : 0), t.id);
    res.json(serialize(core.getTrim(t.id)));
  });
  r.put('/catalogue/trims/:id/price', SM, (req, res) => {
    const t = core.getTrim(req.params.id); if (!t) throw notFound('Trim');
    const price = Number((req.body || {}).price_usd);
    if (!Number.isFinite(price) || price <= 0) throw bad('invalid_price', 'Price must be a positive number');
    db.transaction(() => {
      db.prepare('UPDATE trims SET price_usd = ? WHERE id = ?').run(price, t.id);
      db.prepare('INSERT INTO price_history(trim_id,old_price,new_price,changed_by,changed_at) VALUES(?,?,?,?,?)').run(t.id, t.price_usd, price, req.user.id, clock.iso());
      audit(req.user.id, 'price_change', 'trim', t.id, { old: t.price_usd, new: price }); // FR-ADM-04: "who changed this price?"
    })();
    res.json(serialize(core.getTrim(t.id)));
  });
  r.get('/catalogue/trims/:id/price-history', auth.staffOnly, (req, res) => {
    res.json(db.prepare(`SELECT h.*, u.name changed_by_name FROM price_history h LEFT JOIN users u ON u.id = h.changed_by WHERE trim_id = ? ORDER BY h.id DESC`).all(req.params.id));
  });
  r.post('/catalogue/promotions', SM, (req, res) => {
    const b = req.body || {};
    required(b, ['title_en']);
    if (b.promo_price_usd !== undefined && b.promo_price_usd !== null) {
      if (!(Number(b.promo_price_usd) > 0)) throw bad('invalid_price', 'Promotion price must be positive');
      if (!b.trim_id) throw bad('trim_required', 'A promotion price needs a trim');
    }
    const info = db.prepare(`INSERT INTO promotions(trim_id,title_en,title_ar,description_en,description_ar,promo_price_usd,starts_on,ends_on,active,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,1,?,?)`)
      .run(b.trim_id || null, b.title_en, b.title_ar || null, b.description_en || null, b.description_ar || null, b.promo_price_usd ?? null, b.starts_on || null, b.ends_on || null, req.user.id, clock.iso());
    audit(req.user.id, 'promotion_publish', 'promotion', info.lastInsertRowid, b);
    res.status(201).json(db.prepare('SELECT * FROM promotions WHERE id = ?').get(info.lastInsertRowid));
  });
  r.delete('/catalogue/promotions/:id', SM, (req, res) => {
    db.prepare('UPDATE promotions SET active = 0 WHERE id = ?').run(req.params.id);
    audit(req.user.id, 'promotion_end', 'promotion', req.params.id);
    res.json({ ok: true });
  });
  r.get('/catalogue/promotions-all', SM, (req, res) => res.json(db.prepare('SELECT * FROM promotions ORDER BY id DESC').all()));
  r.post('/catalogue/accessories', SM, (req, res) => {
    const b = req.body || {}; required(b, ['name_en', 'price_usd']);
    if (!(Number(b.price_usd) >= 0)) throw bad('invalid_price', 'Price must be zero or positive');
    const info = db.prepare('INSERT INTO accessories(name_en,name_ar,price_usd,active) VALUES(?,?,?,1)').run(b.name_en, b.name_ar || null, +b.price_usd);
    audit(req.user.id, 'price_change', 'accessory', info.lastInsertRowid, { new: +b.price_usd });
    res.status(201).json(db.prepare('SELECT * FROM accessories WHERE id = ?').get(info.lastInsertRowid));
  });
  r.put('/catalogue/accessories/:id', SM, (req, res) => {
    const a = db.prepare('SELECT * FROM accessories WHERE id = ?').get(req.params.id); if (!a) throw notFound('Accessory');
    const b = req.body || {};
    const price = b.price_usd !== undefined ? Number(b.price_usd) : a.price_usd;
    if (!(price >= 0)) throw bad('invalid_price', 'Price must be zero or positive');
    db.prepare('UPDATE accessories SET name_en=?, name_ar=?, price_usd=?, active=? WHERE id=?').run(b.name_en ?? a.name_en, b.name_ar ?? a.name_ar, price, b.active === undefined ? a.active : (b.active ? 1 : 0), a.id);
    if (price !== a.price_usd) audit(req.user.id, 'price_change', 'accessory', a.id, { old: a.price_usd, new: price });
    res.json(db.prepare('SELECT * FROM accessories WHERE id = ?').get(a.id));
  });
  return r;
};
