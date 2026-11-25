const express = require('express');
const { parse } = require('csv-parse/sync');
const clock = require('../clock');
const { bad, conflict, notFound, required, round2, ymd } = require('../util');

// FR-INV-01, 02, 04, 06  (reservation rules FR-INV-03/05 live in services/core.js)
const VIN_RE = /^[A-HJ-NPR-Z0-9]{11,17}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

module.exports = function inventory(ctx) {
  const { db, auth, audit, notify, settings, core, docs } = ctx;
  const r = express.Router();
  const SM = auth.requireRole('sales_manager');
  const VIEW = auth.requireRole('sales_manager', 'sales_consultant', 'general_manager', 'delivery_coordinator');

  const daysSince = (iso) => (iso ? Math.floor((clock.now() - new Date(iso)) / 86400000) : null);
  const findTrim = (brand, model, name) => db.prepare('SELECT * FROM trims WHERE lower(brand)=lower(?) AND lower(model)=lower(?) AND lower(name)=lower(?)').get(brand || '', model || '', name || '');
  const carRow = (c) => { const t = core.getTrim(c.trim_id);
    const deal = db.prepare('SELECT id, contact_name FROM deals WHERE car_id = ?').get(c.id);
    return { id: c.id, vin: c.vin, trim_id: c.trim_id, car: core.trimLabel(t), color: c.color, status: c.status, arrival_date: c.arrival_date, received_at: c.received_at, is_demo: !!c.is_demo,
      age_days: c.status === 'in_stock' && !c.is_demo ? daysSince(c.received_at) : null, deal_id: deal ? deal.id : null, deal_contact: deal ? deal.contact_name : null }; };

  r.get('/inventory/cars', VIEW, (req, res) => {
    const where = []; const args = [];
    if (req.query.status) { where.push('status = ?'); args.push(req.query.status); }
    if (req.query.trim_id) { where.push('trim_id = ?'); args.push(req.query.trim_id); }
    if (req.query.q) { where.push('vin LIKE ?'); args.push(`%${req.query.q}%`); }
    res.json(db.prepare(`SELECT * FROM cars ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC LIMIT 1000`).all(...args).map(carRow));
  });
  r.post('/inventory/cars', SM, (req, res) => {
    const b = req.body || {}; required(b, ['vin', 'trim_id', 'status']);
    const vin = String(b.vin).toUpperCase().trim();
    if (!VIN_RE.test(vin)) throw bad('invalid_vin', 'A VIN has 11-17 letters and digits (no I, O or Q)');
    if (!core.getTrim(b.trim_id)) throw notFound('Trim');
    if (!['in_transit', 'in_stock'].includes(b.status)) throw bad('invalid_status', 'A new car is In transit or In stock');
    if (b.status === 'in_transit' && !DATE_RE.test(b.arrival_date || '')) throw bad('arrival_required', 'An in-transit car needs an expected arrival date (YYYY-MM-DD)');
    if (db.prepare('SELECT 1 FROM cars WHERE vin = ?').get(vin)) throw conflict('duplicate_vin', 'A car with this VIN already exists');
    const id = db.prepare('INSERT INTO cars(vin,trim_id,color,status,arrival_date,received_at,is_demo) VALUES(?,?,?,?,?,?,?)')
      .run(vin, b.trim_id, b.color || null, b.status, b.arrival_date || null, b.status === 'in_stock' ? clock.iso() : null, b.is_demo ? 1 : 0).lastInsertRowid;
    if (b.status === 'in_stock' && !b.is_demo) core.allocateWaiting(Number(b.trim_id));
    res.status(201).json(carRow(db.prepare('SELECT * FROM cars WHERE id = ?').get(id)));
  });
  r.patch('/inventory/cars/:id', SM, (req, res) => {
    const c = db.prepare('SELECT * FROM cars WHERE id = ?').get(req.params.id); if (!c) throw notFound('Car');
    const b = req.body || {};
    if (b.status && b.status !== c.status) throw bad('status_managed', 'Status changes through arrival, reservation, sale and delivery; use the arrive endpoint for arrivals');
    if (b.arrival_date && !DATE_RE.test(b.arrival_date)) throw bad('invalid_date', 'Date must be YYYY-MM-DD');
    db.prepare('UPDATE cars SET color = ?, arrival_date = ? WHERE id = ?').run(b.color ?? c.color, b.arrival_date ?? c.arrival_date, c.id);
    res.json(carRow(db.prepare('SELECT * FROM cars WHERE id = ?').get(c.id)));
  });
  r.post('/inventory/cars/:id/arrive', SM, (req, res) => {
    const c = db.prepare('SELECT * FROM cars WHERE id = ?').get(req.params.id); if (!c) throw notFound('Car');
    if (c.status !== 'in_transit') throw conflict('not_in_transit', 'Only an in-transit car can arrive');
    core.markInStock(c.id); // allocates the first matching waiting deposit (FR-INV-04)
    res.json(carRow(db.prepare('SELECT * FROM cars WHERE id = ?').get(c.id)));
  });
  r.get('/inventory/waiting', SM, (req, res) => {
    res.json(db.prepare("SELECT id, contact_name, trim_id, color, deposit_at FROM deals WHERE car_id IS NULL AND stage IN ('reserved','contract_signed','paid') ORDER BY deposit_at").all()
      .map((d) => ({ ...d, car: core.trimLabel(core.getTrim(d.trim_id)) })));
  });

  // ---------- CSV import (FR-INV-02) ----------
  r.post('/inventory/import', SM, docs.upload.single('file'), (req, res) => {
    const type = req.query.type;
    if (!['prices', 'stock', 'shipments'].includes(type)) throw bad('invalid_type', 'type must be prices, stock or shipments');
    if (!req.file) throw bad('file_required', 'Upload a CSV file');
    let rows;
    try { rows = parse(req.file.buffer.toString('utf8'), { columns: (h) => h.map((x) => x.trim().toLowerCase()), skip_empty_lines: true, trim: true, bom: true }); }
    catch (e) { throw bad('invalid_csv', `The file is not a valid CSV: ${e.message}`); }
    if (rows.length > 5000) throw bad('too_many_rows', 'At most 5000 rows per import');
    const need = { prices: ['brand', 'model', 'trim', 'price_usd'], stock: ['vin', 'brand', 'model', 'trim', 'color', 'status'], shipments: ['vin', 'brand', 'model', 'trim', 'color', 'arrival_date'] }[type];
    const head = rows.length ? Object.keys(rows[0]) : need;
    const missingCols = need.filter((c) => !head.includes(c));
    if (missingCols.length) throw bad('missing_columns', `Missing columns: ${missingCols.join(', ')}`, { columns: missingCols });
    const rejected = []; let imported = 0; const seen = new Set(); const touchedTrims = new Set();
    rows.forEach((row, i) => {
      const line = i + 2; // header is line 1
      const reject = (reason) => rejected.push({ row: line, reason, data: row });
      const trim = findTrim(row.brand, row.model, row.trim);
      if (!trim) return reject('unknown_trim');
      if (type === 'prices') {
        const p = Number(row.price_usd);
        if (!Number.isFinite(p) || p <= 0) return reject('invalid_price');
        db.transaction(() => {
          db.prepare('UPDATE trims SET price_usd = ? WHERE id = ?').run(p, trim.id);
          db.prepare('INSERT INTO price_history(trim_id,old_price,new_price,changed_by,changed_at) VALUES(?,?,?,?,?)').run(trim.id, trim.price_usd, p, req.user.id, clock.iso());
          audit(req.user.id, 'price_change', 'trim', trim.id, { old: trim.price_usd, new: p, via: 'csv_import' });
        })();
        return imported++;
      }
      const vin = String(row.vin || '').toUpperCase();
      if (!VIN_RE.test(vin)) return reject('invalid_vin');
      if (seen.has(vin) || db.prepare('SELECT 1 FROM cars WHERE vin = ?').get(vin)) return reject('duplicate_vin');
      const status = type === 'shipments' ? 'in_transit' : row.status;
      if (!['in_stock', 'in_transit'].includes(status)) return reject('invalid_status');
      if (status === 'in_transit' && !DATE_RE.test(row.arrival_date || '')) return reject('invalid_arrival_date');
      const colors = JSON.parse(trim.colors || '[]');
      if (row.color && colors.length && !colors.includes(row.color)) return reject('invalid_color');
      seen.add(vin);
      db.prepare('INSERT INTO cars(vin,trim_id,color,status,arrival_date,received_at) VALUES(?,?,?,?,?,?)').run(vin, trim.id, row.color || null, status, row.arrival_date || null, status === 'in_stock' ? clock.iso() : null);
      if (status === 'in_stock') touchedTrims.add(trim.id);
      imported++;
    });
    touchedTrims.forEach((t) => core.allocateWaiting(t));
    audit(req.user.id, 'inventory_import', 'inventory', null, { type, imported, rejected: rejected.length });
    res.json({ type, total_rows: rows.length, imported, rejected });
  });

  // ---------- alerts (FR-INV-06) ----------
  function computeAlerts() {
    const threshold = settings.num('stock_threshold'); const maxDays = settings.num('unsold_days');
    const low = db.prepare('SELECT id FROM trims WHERE active = 1').all().map((t) => {
      const n = db.prepare("SELECT COUNT(*) c FROM cars WHERE trim_id = ? AND status = 'in_stock' AND is_demo = 0").get(t.id).c;
      return { trim_id: t.id, car: core.trimLabel(core.getTrim(t.id)), in_stock: n, threshold };
    }).filter((x) => x.in_stock < threshold);
    const aged = db.prepare("SELECT * FROM cars WHERE status = 'in_stock' AND is_demo = 0 AND received_at IS NOT NULL").all()
      .map((c) => ({ car_id: c.id, vin: c.vin, car: core.trimLabel(core.getTrim(c.trim_id)), days_unsold: daysSince(c.received_at), limit_days: maxDays })).filter((x) => x.days_unsold > maxDays);
    return { low_stock: low, unsold_too_long: aged };
  }
  r.get('/inventory/alerts', auth.requireRole('sales_manager', 'general_manager'), (req, res) => res.json(computeAlerts()));
  ctx.jobs.stockAlerts = () => {
    const a = computeAlerts(); const managers = db.prepare("SELECT id FROM users WHERE role = 'sales_manager' AND active = 1").all();
    const msgs = [...a.low_stock.map((x) => `Low stock: ${x.car} has ${x.in_stock} car(s) in stock (threshold ${x.threshold}).`),
      ...a.unsold_too_long.map((x) => `Unsold for ${x.days_unsold} days: ${x.car} (${x.vin}).`)];
    let sent = 0;
    msgs.forEach((m) => managers.forEach((u) => {
      if (db.prepare("SELECT 1 FROM outbox WHERE user_id = ? AND template = 'stock_alert' AND body = ? AND created_at >= ?").get(u.id, m, new Date(clock.now() - 86400000).toISOString())) return;
      if (notify.send({ userId: u.id, template: 'stock_alert', params: { message: m } })) sent++;
    }));
    return sent;
  };
  ctx.computeAlerts = computeAlerts;
  return r;
};
