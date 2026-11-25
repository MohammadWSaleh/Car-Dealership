const express = require('express');
const clock = require('../clock');
const { bad, conflict, notFound, forbidden, required, isEmail, randomCode, ymd, slotStr, parseSlot, pad, dmy, round2 } = require('../util');

// FR-TD-01..05
module.exports = function testdrives(ctx) {
  const { db, auth, audit, notify, settings, core, docs } = ctx;
  const r = express.Router();
  const CONSULTANT = auth.requireRole('sales_consultant', 'sales_manager');

  const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
  const isoDay = (d) => (d.getDay() === 0 ? 7 : d.getDay());
  const openDays = () => settings.get('open_days').split(',').map(Number);

  // returns the list of valid slot start strings for a calendar date (showroom hours, slot length from settings)
  function slotGrid(dateStr) {
    const d = parseSlot(`${dateStr} 00:00`);
    if (!d) throw bad('invalid_date', 'Date must be YYYY-MM-DD');
    if (!openDays().includes(isoDay(d))) return [];
    const len = settings.num('slot_minutes'); const out = [];
    for (let m = toMin(settings.get('open_time')); m + len <= toMin(settings.get('close_time')); m += len) out.push(`${dateStr} ${pad(Math.floor(m / 60), 2)}:${pad(m % 60, 2)}`);
    return out;
  }
  function validateSlot(slot) {
    const d = parseSlot(slot);
    if (!d) throw bad('invalid_slot', 'Slot must be YYYY-MM-DD HH:mm');
    if (!slotGrid(slot.slice(0, 10)).includes(slot)) throw bad('outside_showroom_hours', 'The slot is outside showroom hours or not aligned to the slot length');
    if (d <= clock.now()) throw bad('slot_in_past', 'The slot is in the past');
    return d;
  }
  const freeCar = (trimId, slot) => db.prepare(`SELECT c.id FROM cars c WHERE c.trim_id = ? AND c.is_demo = 1 AND c.status = 'in_stock'
    AND NOT EXISTS (SELECT 1 FROM test_drives t WHERE t.car_id = c.id AND t.slot_start = ? AND t.status = 'booked') ORDER BY c.id LIMIT 1`).get(trimId, slot);

  function freeSlots(trimId, dateStr) {
    const now = clock.now();
    return slotGrid(dateStr).filter((s) => parseSlot(s) > now && freeCar(trimId, s)).map((slot_start) => ({ slot_start }));
  }
  function nextFreeSlots(trimId, count = 3) {
    const out = []; const d = clock.now();
    for (let i = 0; i < 14 && out.length < count; i++) {
      freeSlots(trimId, ymd(new Date(d.getFullYear(), d.getMonth(), d.getDate() + i))).forEach((s) => { if (out.length < count) out.push(s.slot_start); });
    }
    return out;
  }

  function book({ trimId, slot, user, contact = {}, language }) {
    const trim = core.getTrim(trimId);
    if (!trim || !trim.active) throw notFound('Trim');
    validateSlot(slot);
    let name, phone, email, lang;
    if (user) { name = user.name; phone = user.phone; email = user.email; lang = user.language; }
    else {
      required(contact, ['name']);
      if (!contact.email && !contact.phone) throw bad('contact_required', 'An email address or phone number is required');
      if (contact.email && !isEmail(contact.email)) throw bad('invalid_email', 'Invalid email address');
      if (contact.consent_data !== true) throw bad('consent_required', 'Consent to data processing is required');
      name = contact.name; phone = contact.phone || null; email = contact.email ? contact.email.toLowerCase() : null; lang = language === 'ar' ? 'ar' : 'en';
    }
    const car = freeCar(trimId, slot);
    if (!car) throw conflict('slot_taken', 'This slot is no longer available for this model');
    const code = randomCode(8);
    let id;
    try {
      // the unique index (car, slot, booked) guarantees no double booking even under concurrent requests (FR-TD-01)
      id = db.prepare(`INSERT INTO test_drives(code,customer_id,trim_id,car_id,name,phone,email,language,slot_start,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,'booked',?)`)
        .run(code, user ? user.id : null, trimId, car.id, name, phone, email, lang, slot, clock.iso()).lastInsertRowid;
    } catch (e) {
      if (String(e.code).startsWith('SQLITE_CONSTRAINT')) throw conflict('slot_taken', 'This slot is no longer available for this model');
      throw e;
    }
    let deal = core.findOpenDeal({ customerId: user && user.id, email, phone, trimId });
    if (!deal) deal = core.createDeal({ customer_id: user && user.id, name, phone, email, language: lang, source: 'test_drive', trim_id: trimId, notes: `Test drive ${slot}`,
      consent_marketing: !user && contact.consent_marketing === true });
    db.prepare('UPDATE test_drives SET deal_id = ? WHERE id = ?').run(deal.id, id);
    const td = db.prepare('SELECT * FROM test_drives WHERE id = ?').get(id);
    notify.send({ ...(user ? { userId: user.id } : { to: { email, phone, language: lang, notify_pref: email ? 'email' : 'whatsapp' } }), template: 'booking_confirmation',
      params: { car: core.trimLabel(trim), slot: `${dmy(slot)} ${slot.slice(11)}`, code } }); // FR-TD-04
    return td;
  }

  const view = (t, staff) => {
    const lic = db.prepare("SELECT id, created_at FROM documents WHERE test_drive_id = ? AND kind = 'license' ORDER BY id DESC LIMIT 1").get(t.id);
    const trim = core.getTrim(t.trim_id);
    return { id: t.id, code: t.code, trim_id: t.trim_id, car: core.trimLabel(trim), fuel_type: trim.fuel_type, slot_start: t.slot_start, status: t.status,
      license_uploaded: !!lic, license_verified: !!t.license_verified, battery_percent: t.battery_percent, feedback: t.feedback,
      checked_in_at: t.checked_in_at, battery_ok: trim.fuel_type === 'electric' ? (t.battery_percent == null ? null : t.battery_percent >= 80) : null,
      ...(staff ? { name: t.name, phone: t.phone, email: t.email, deal_id: t.deal_id, license_document_id: lic ? lic.id : null } : {}) };
  };
  // owner (logged in), staff, or a guest holding the booking code + email
  function access(req, td) {
    const u = req.user;
    if (u) {
      if (['sales_consultant', 'sales_manager'].includes(u.role)) return 'staff';
      if (u.role === 'customer' && (td.customer_id === u.id || (!td.customer_id && td.email && td.email === u.email))) return 'owner';
      throw forbidden();
    }
    const code = (req.body && req.body.code) || req.query.code; const email = (req.body && req.body.email) || req.query.email;
    if (code && email && code === td.code && td.email && td.email.toLowerCase() === String(email).toLowerCase()) return 'owner';
    throw forbidden('booking_access_denied', 'Provide the booking code and email, or log in');
  }
  const getTd = (id) => { const t = db.prepare('SELECT * FROM test_drives WHERE id = ?').get(id); if (!t) throw notFound('Booking'); return t; };

  r.get('/testdrives/slots', (req, res) => {
    const trim = core.getTrim(req.query.trim_id);
    if (!trim) throw notFound('Trim');
    const date = req.query.date || ymd(clock.now());
    res.json({ date, slot_minutes: settings.num('slot_minutes'), slots: freeSlots(trim.id, date) });
  });
  r.post('/testdrives', (req, res) => {
    const b = req.body || {};
    required(b, ['trim_id', 'slot_start']);
    const td = book({ trimId: Number(b.trim_id), slot: b.slot_start, user: req.user && req.user.role === 'customer' ? req.user : null, contact: b.contact || b, language: b.language });
    if (req.user && req.user.role !== 'customer') { /* staff booking for walk-ins is not supported here */ }
    res.status(201).json(view(td, false));
  });
  // F5: staff scan the QR pass (or type the code) when the customer arrives
  r.post('/testdrives/check-in', CONSULTANT, (req, res) => {
    const code = String((req.body || {}).code || '').trim().toUpperCase();
    const td = code ? db.prepare('SELECT * FROM test_drives WHERE upper(code) = ?').get(code) : null;
    if (!td) throw notFound('Booking');
    if (td.status !== 'booked') throw conflict('booking_closed', 'This booking is no longer active');
    if (td.slot_start.slice(0, 10) !== ymd(clock.now())) throw conflict('not_today', `This booking is for ${dmy(td.slot_start.slice(0, 10))}, not today`);
    const already = !!td.checked_in_at;
    if (!already) { db.prepare('UPDATE test_drives SET checked_in_at = ? WHERE id = ?').run(clock.iso(), td.id); audit(req.user.id, 'testdrive_checkin', 'test_drive', td.id, {}); }
    res.json({ already_checked_in: already, booking: view(getTd(td.id), true) });
  });
  r.get('/testdrives/lookup', (req, res) => {
    const td = db.prepare('SELECT * FROM test_drives WHERE code = ?').get(String(req.query.code || ''));
    if (!td || !td.email || td.email.toLowerCase() !== String(req.query.email || '').toLowerCase()) throw notFound('Booking');
    res.json(view(td, false));
  });
  r.get('/testdrives', CONSULTANT, (req, res) => {
    const where = []; const args = [];
    if (req.query.date) { where.push('substr(t.slot_start,1,10) = ?'); args.push(req.query.date); }
    if (req.query.mine === '1') { where.push('d.consultant_id = ?'); args.push(req.user.id); }
    if (req.query.status) { where.push('t.status = ?'); args.push(req.query.status); }
    const rows = db.prepare(`SELECT t.* FROM test_drives t LEFT JOIN deals d ON d.id = t.deal_id ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY t.slot_start`).all(...args);
    res.json(rows.map((t) => view(t, true)));
  });
  r.get('/testdrives/:id', (req, res) => {
    const td = getTd(req.params.id); const who = access(req, td);
    res.json(view(td, who === 'staff'));
  });
  // FR-TD-02: license scan upload (encrypted), then the consultant verifies it
  r.post('/testdrives/:id/license', docs.upload.single('file'), (req, res) => {
    const td = getTd(req.params.id); access(req, td);
    if (td.status !== 'booked') throw conflict('booking_closed', 'This booking is no longer active');
    const doc = docs.store(req.file, { kind: 'license', ownerUserId: td.customer_id, testDriveId: td.id, dealId: td.deal_id });
    db.prepare('UPDATE test_drives SET license_verified = 0, license_verified_by = NULL WHERE id = ?').run(td.id);
    res.status(201).json({ document: doc });
  });
  r.post('/testdrives/:id/verify-license', CONSULTANT, (req, res) => {
    const td = getTd(req.params.id);
    if (!db.prepare("SELECT 1 FROM documents WHERE test_drive_id = ? AND kind = 'license'").get(td.id)) throw conflict('license_missing', 'No license scan has been uploaded for this booking');
    db.prepare('UPDATE test_drives SET license_verified = 1, license_verified_by = ? WHERE id = ?').run(req.user.id, td.id);
    res.json(view(getTd(td.id), true));
  });
  // FR-TD-03
  r.post('/testdrives/:id/reschedule', (req, res) => {
    const td = getTd(req.params.id); const who = access(req, td);
    if (td.status !== 'booked') throw conflict('booking_closed', 'This booking is no longer active');
    if (parseSlot(td.slot_start) <= clock.now()) throw conflict('too_late', 'The slot has already started');
    const slot = (req.body || {}).slot_start; required({ slot }, ['slot']);
    validateSlot(slot);
    const car = freeCar(td.trim_id, slot);
    if (!car) throw conflict('slot_taken', 'This slot is no longer available for this model');
    try { db.prepare('UPDATE test_drives SET slot_start = ?, car_id = ?, reminder_sent = 0 WHERE id = ?').run(slot, car.id, td.id); }
    catch (e) { if (String(e.code).startsWith('SQLITE_CONSTRAINT')) throw conflict('slot_taken', 'This slot is no longer available for this model'); throw e; }
    const t2 = getTd(td.id);
    notify.send({ ...(td.customer_id ? { userId: td.customer_id } : { to: { email: td.email, phone: td.phone, language: td.language, notify_pref: td.email ? 'email' : 'whatsapp' } }),
      template: 'booking_confirmation', params: { car: core.trimLabel(core.getTrim(td.trim_id)), slot: `${dmy(slot)} ${slot.slice(11)}`, code: td.code } });
    res.json(view(t2, who === 'staff'));
  });
  r.post('/testdrives/:id/cancel', (req, res) => {
    const td = getTd(req.params.id); const who = access(req, td);
    if (td.status !== 'booked') throw conflict('booking_closed', 'This booking is no longer active');
    if (parseSlot(td.slot_start) <= clock.now()) throw conflict('too_late', 'The slot has already started and cannot be cancelled');
    db.prepare("UPDATE test_drives SET status = 'cancelled' WHERE id = ?").run(td.id); // the slot is free again (unique index only covers 'booked')
    notify.send({ ...(td.customer_id ? { userId: td.customer_id } : { to: { email: td.email, phone: td.phone, language: td.language, notify_pref: td.email ? 'email' : 'whatsapp' } }),
      template: 'booking_cancelled', params: { code: td.code } });
    res.json(view(getTd(td.id), who === 'staff'));
  });
  // FR-TD-05: consultant checklist for each drive
  r.put('/testdrives/:id/checklist', CONSULTANT, (req, res) => {
    const td = getTd(req.params.id); const b = req.body || {};
    const trim = core.getTrim(td.trim_id);
    if (td.status === 'cancelled') throw conflict('booking_closed', 'This booking was cancelled');
    let battery = td.battery_percent;
    if (b.battery_percent !== undefined) {
      battery = Number(b.battery_percent);
      if (!Number.isInteger(battery) || battery < 0 || battery > 100) throw bad('invalid_battery', 'Battery charge must be 0-100');
    }
    if (b.complete) {
      const problems = [];
      if (!td.license_verified) problems.push('license_not_verified');
      if (trim.fuel_type === 'electric' && (battery == null || battery < 80)) problems.push('battery_below_80');
      if (problems.length) throw conflict('checklist_incomplete', 'The drive cannot start: ' + problems.join(', '), { problems });
    }
    db.prepare('UPDATE test_drives SET battery_percent = ?, feedback = ?, status = ? WHERE id = ?').run(battery, b.feedback !== undefined ? b.feedback : td.feedback, b.complete ? 'completed' : td.status, td.id);
    res.json(view(getTd(td.id), true));
  });

  // day-before reminders (FR-TD-04)
  ctx.jobs.testdriveReminders = () => {
    const t = clock.now(); const tomorrow = ymd(new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1));
    const rows = db.prepare("SELECT * FROM test_drives WHERE status = 'booked' AND reminder_sent = 0 AND substr(slot_start,1,10) = ?").all(tomorrow);
    rows.forEach((td) => {
      notify.send({ ...(td.customer_id ? { userId: td.customer_id } : { to: { email: td.email, phone: td.phone, language: td.language, notify_pref: td.email ? 'email' : 'whatsapp' } }),
        template: 'booking_reminder', params: { car: core.trimLabel(core.getTrim(td.trim_id)), slot: td.slot_start.slice(11), code: td.code } });
      db.prepare('UPDATE test_drives SET reminder_sent = 1 WHERE id = ?').run(td.id);
    });
    return rows.length;
  };
  ctx.testdrives = { freeSlots, nextFreeSlots, book, validateSlot };
  return r;
};
