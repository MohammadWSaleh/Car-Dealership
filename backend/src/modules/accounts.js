const express = require('express');
const clock = require('../clock');
const { bad, conflict, notFound, forbidden, required, isEmail, HttpError, parseJson, dmy } = require('../util');

// FR-ACC-01..05, FR-ADM-01 (customer sees only their own data), NFR-SEC-02/03, NFR-DAT-01
module.exports = function accounts(ctx) {
  const { db, auth, audit, notify, config, docs } = ctx;
  const r = express.Router();
  const lockMs = config.lockMinutes * 60 * 1000;

  r.post('/auth/register', (req, res) => {
    const b = req.body || {};
    required(b, ['name', 'email', 'password']);
    if (!isEmail(b.email)) throw bad('invalid_email', 'Invalid email address');
    if (String(b.password).length < 8) throw bad('weak_password', 'Password must be at least 8 characters');
    // FR-ACC-02: consent to data processing is required, marketing consent is a separate, optional choice
    if (b.consent_data !== true) throw bad('consent_required', 'Consent to data processing is required to create an account');
    const email = String(b.email).toLowerCase();
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) throw conflict('email_taken', 'This email is already registered');
    const now = clock.iso();
    const lang = b.language === 'ar' ? 'ar' : 'en';
    const info = db.prepare(`INSERT INTO users(name,email,phone,password_hash,role,language,notify_pref,consent_data_at,consent_marketing,consent_marketing_at)
      VALUES(?,?,?,?,'customer',?,?,?,?,?)`).run(String(b.name).trim(), email, b.phone || null, auth.hash(b.password), lang,
      b.notify_pref === 'whatsapp' ? 'whatsapp' : 'email', now, b.consent_marketing === true ? 1 : 0, b.consent_marketing === true ? now : null);
    // enquiries made before registering (same email) now appear in the new portal
    db.prepare('UPDATE deals SET customer_id = ? WHERE customer_id IS NULL AND lower(contact_email) = ?').run(info.lastInsertRowid, email);
    db.prepare('UPDATE test_drives SET customer_id = ? WHERE customer_id IS NULL AND lower(email) = ?').run(info.lastInsertRowid, email);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
    audit(user.id, 'register', 'user', user.id);
    res.status(201).json({ token: auth.sign(user), user: auth.publicUser(user) });
  });

  r.post('/auth/login', (req, res) => {
    const { email, password } = req.body || {};
    const user = email ? db.prepare('SELECT * FROM users WHERE email = ?').get(String(email).toLowerCase()) : null;
    if (!user || user.erased) { audit(null, 'login_failed', 'user', null, { email }); throw new HttpError(401, 'invalid_credentials', 'Wrong email or password'); }
    if (user.locked_until && new Date(user.locked_until) > clock.now()) {
      throw new HttpError(423, 'account_locked', `Account locked until ${user.locked_until}`, { locked_until: user.locked_until });
    }
    if (!user.active) throw new HttpError(403, 'account_disabled', 'This account has been deactivated');
    if (!auth.verify(String(password || ''), user.password_hash)) {
      const fails = user.failed_logins + 1;
      if (fails >= config.maxFailedLogins) {
        const until = new Date(clock.now().getTime() + lockMs).toISOString();
        db.prepare('UPDATE users SET failed_logins = 0, locked_until = ? WHERE id = ?').run(until, user.id);
        audit(user.id, 'account_locked', 'user', user.id, { until });
        throw new HttpError(423, 'account_locked', `Too many failed attempts. Account locked until ${until}`, { locked_until: until });
      }
      db.prepare('UPDATE users SET failed_logins = ? WHERE id = ?').run(fails, user.id);
      audit(user.id, 'login_failed', 'user', user.id);
      throw new HttpError(401, 'invalid_credentials', 'Wrong email or password');
    }
    db.prepare('UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = ?').run(user.id);
    audit(user.id, 'login', 'user', user.id);
    res.json({ token: auth.sign(user), user: auth.publicUser(user), session_minutes: auth.isStaff(user.role) ? config.staffSessionMinutes : null });
  });

  r.get('/auth/me', auth.requireRole(), (req, res) => res.json({ user: auth.publicUser(req.user) }));

  // FR-ACC-03 / FR-ACC-05
  r.put('/me', auth.requireRole(), (req, res) => {
    const b = req.body || {};
    const u = req.user;
    const name = b.name !== undefined ? String(b.name).trim() : u.name;
    if (!name) throw bad('invalid_name', 'Name cannot be empty');
    const lang = b.language !== undefined ? (b.language === 'ar' ? 'ar' : b.language === 'en' ? 'en' : null) : u.language;
    if (!lang) throw bad('invalid_language', 'Language must be en or ar');
    const pref = b.notify_pref !== undefined ? b.notify_pref : u.notify_pref;
    if (!['email', 'whatsapp'].includes(pref)) throw bad('invalid_notify_pref', 'Notification channel must be email or whatsapp');
    let marketing = u.consent_marketing, marketingAt = u.consent_marketing_at;
    if (b.consent_marketing !== undefined && !!b.consent_marketing !== !!u.consent_marketing) {
      marketing = b.consent_marketing ? 1 : 0; marketingAt = clock.iso(); // FR-NOT-02 opt-out never stops transactional messages
    }
    let hash = u.password_hash;
    if (b.new_password !== undefined) {
      if (!auth.verify(String(b.current_password || ''), u.password_hash)) throw bad('wrong_password', 'Current password is wrong');
      if (String(b.new_password).length < 8) throw bad('weak_password', 'Password must be at least 8 characters');
      hash = auth.hash(b.new_password);
    }
    db.prepare('UPDATE users SET name=?, phone=?, language=?, notify_pref=?, consent_marketing=?, consent_marketing_at=?, password_hash=? WHERE id=?')
      .run(name, b.phone !== undefined ? b.phone : u.phone, lang, pref, marketing, marketingAt, hash, u.id);
    res.json({ user: auth.publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(u.id)) });
  });

  r.get('/me/overview', auth.requireRole('customer'), (req, res) => {
    const id = req.user.id;
    const label = (tid) => ctx.core.trimLabel(ctx.core.getTrim(tid));
    const deals = db.prepare('SELECT * FROM deals WHERE customer_id = ? ORDER BY id DESC').all(id);
    const enquiries = deals.map((d) => ({ id: d.id, car: label(d.trim_id), source: d.source, stage: d.stage, created_at: d.created_at }));
    const appointments = db.prepare("SELECT * FROM test_drives WHERE customer_id = ? OR (customer_id IS NULL AND lower(email) = lower(?)) ORDER BY slot_start DESC").all(id, req.user.email)
      .map((t) => ({ id: t.id, code: t.code, car: label(t.trim_id), slot_start: t.slot_start, status: t.status, license_uploaded: !!db.prepare("SELECT 1 FROM documents WHERE test_drive_id = ? AND kind = 'license'").get(t.id) }));
    const dealIds = deals.map((d) => d.id);
    const ph = dealIds.map(() => '?').join(',') || 'NULL';
    const deposits = db.prepare(`SELECT p.id, p.deal_id, p.amount, p.currency, p.amount_usd, p.receipt_number, p.status, p.created_at FROM payments p WHERE p.kind = 'deposit' AND p.deal_id IN (${ph}) ORDER BY p.id DESC`).all(...dealIds);
    const contracts = db.prepare(`SELECT id, number, deal_id, total_usd, status, signed_at FROM contracts WHERE deal_id IN (${ph}) AND status != 'void' ORDER BY id DESC`).all(...dealIds);
    const orders = deals.filter((d) => ['reserved', 'contract_signed', 'paid', 'delivered'].includes(d.stage)).map((d) => ({ id: d.id, car: label(d.trim_id), stage: d.stage, ...ctx.core.financials(d.id) }));
    res.json({ enquiries, appointments, deposits, contracts, orders });
  });

  r.get('/me/notifications', auth.requireRole('customer'), (req, res) => {
    res.json(db.prepare('SELECT id,channel,kind,subject,body,attachment_url,created_at FROM outbox WHERE user_id = ? ORDER BY id DESC LIMIT 100').all(req.user.id));
  });

  // FR-ACC-04 + NFR-DAT-01: copy or erasure of personal data, completed by the Administrator within 30 days
  r.post('/me/data-requests', auth.requireRole('customer'), (req, res) => {
    const type = (req.body || {}).type;
    if (!['export', 'erasure'].includes(type)) throw bad('invalid_type', 'Type must be export or erasure');
    if (db.prepare("SELECT 1 FROM data_requests WHERE user_id = ? AND type = ? AND status = 'open'").get(req.user.id, type)) throw conflict('request_open', 'You already have an open request of this type');
    const now = clock.now();
    const due = new Date(now.getTime() + 30 * 86400000);
    const info = db.prepare('INSERT INTO data_requests(user_id,type,status,requested_at,due_at) VALUES(?,?,?,?,?)').run(req.user.id, type, 'open', now.toISOString(), due.toISOString());
    notify.send({ userId: req.user.id, template: 'data_request_received', params: { type, due: dmy(due) } });
    res.status(201).json(db.prepare('SELECT id,type,status,requested_at,due_at FROM data_requests WHERE id = ?').get(info.lastInsertRowid));
  });
  r.get('/me/data-requests', auth.requireRole('customer'), (req, res) => {
    res.json(db.prepare('SELECT id,type,status,requested_at,due_at,completed_at FROM data_requests WHERE user_id = ? ORDER BY id DESC').all(req.user.id));
  });
  r.get('/me/data-requests/:id/download', auth.requireRole('customer'), (req, res) => {
    const row = db.prepare('SELECT * FROM data_requests WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!row) throw notFound('Request');
    if (row.type !== 'export' || row.status !== 'completed') throw conflict('not_ready', 'The export is not ready yet');
    res.set('Content-Disposition', 'attachment; filename="my-data.json"').type('application/json').send(row.result);
  });

  // ----- completion by the Administrator (used by the admin module) -----
  function buildExport(userId) {
    const u = db.prepare('SELECT id,name,email,phone,role,language,notify_pref,consent_data_at,consent_marketing,consent_marketing_at,created_at FROM users WHERE id = ?').get(userId);
    const deals = db.prepare('SELECT * FROM deals WHERE customer_id = ?').all(userId);
    const ids = deals.map((d) => d.id); const ph = ids.map(() => '?').join(',') || 'NULL';
    return {
      exported_at: clock.iso(), profile: u, deals,
      test_drives: db.prepare('SELECT id,code,trim_id,slot_start,status FROM test_drives WHERE customer_id = ?').all(userId),
      payments: db.prepare(`SELECT id,deal_id,kind,amount,currency,method,receipt_number,created_at FROM payments WHERE deal_id IN (${ph})`).all(...ids),
      contracts: db.prepare(`SELECT id,number,deal_id,total_usd,status,signed_at FROM contracts WHERE deal_id IN (${ph})`).all(...ids),
      messages: db.prepare('SELECT channel,kind,subject,body,created_at FROM outbox WHERE user_id = ?').all(userId),
      ev_checks: db.prepare('SELECT answers,result,created_at FROM ev_checks WHERE customer_id = ?').all(userId),
      owners_circle: db.prepare('SELECT card_number,referral_code,tier,credit_balance FROM memberships WHERE customer_id = ?').get(userId) || null,
      documents: db.prepare('SELECT id,kind,original_name,created_at FROM documents WHERE owner_user_id = ?').all(userId),
    };
  }
  function eraseUser(userId) {
    const retained = ['payments', 'invoices', 'contracts']; // kept by law (VAT / stamp-duty records, UR-26)
    db.transaction(() => {
      db.prepare('SELECT id FROM documents WHERE owner_user_id = ? OR test_drive_id IN (SELECT id FROM test_drives WHERE customer_id = ?)').all(userId, userId).forEach((d) => docs.remove(d.id));
      db.prepare("UPDATE test_drives SET name = 'Erased', phone = NULL, email = NULL WHERE customer_id = ?").run(userId);
      db.prepare("UPDATE chats SET contact = NULL WHERE customer_id = ?").run(userId);
      db.prepare('DELETE FROM ev_checks WHERE customer_id = ?').run(userId);
      db.prepare('DELETE FROM outbox WHERE user_id = ?').run(userId);
      // deals with financial records keep the buyer name (invoice / contract integrity); all others are anonymised fully
      db.prepare(`UPDATE deals SET contact_name = 'Erased', contact_phone = NULL, contact_email = NULL, notes = NULL
        WHERE customer_id = ? AND id NOT IN (SELECT deal_id FROM payments UNION SELECT deal_id FROM contracts UNION SELECT deal_id FROM invoices)`).run(userId);
      db.prepare(`UPDATE deals SET contact_phone = NULL, contact_email = NULL, notes = NULL WHERE customer_id = ?`).run(userId);
      db.prepare("UPDATE users SET name = 'Erased user', email = ?, phone = NULL, password_hash = 'erased', active = 0, erased = 1, consent_marketing = 0 WHERE id = ?")
        .run(`erased-${userId}@erased.invalid`, userId);
    })();
    return { erased: ['profile', 'contact details', 'uploaded documents', 'messages', 'EV checks'], retained };
  }
  function completeDataRequest(requestId, adminId) {
    const row = db.prepare('SELECT * FROM data_requests WHERE id = ?').get(requestId);
    if (!row) throw notFound('Request');
    if (row.status === 'completed') throw conflict('already_completed', 'Request already completed');
    let result;
    if (row.type === 'export') {
      result = JSON.stringify(buildExport(row.user_id), null, 2);
      audit(adminId, 'data_export', 'user', row.user_id, { request: row.id });
    } else {
      notify.send({ userId: row.user_id, template: 'data_request_done', params: { type: row.type } }); // send before the contact data disappears
      result = JSON.stringify(eraseUser(row.user_id));
      audit(adminId, 'data_erasure', 'user', row.user_id, { request: row.id });
    }
    db.prepare("UPDATE data_requests SET status = 'completed', completed_at = ?, handled_by = ?, result = ? WHERE id = ?").run(clock.iso(), adminId, result, requestId);
    if (row.type === 'export') notify.send({ userId: row.user_id, template: 'data_request_done', params: { type: row.type } });
    return db.prepare('SELECT id,user_id,type,status,requested_at,due_at,completed_at FROM data_requests WHERE id = ?').get(requestId);
  }
  ctx.completeDataRequest = completeDataRequest;
  return r;
};
