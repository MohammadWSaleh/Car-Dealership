const express = require('express');
const clock = require('../clock');
const backupSvc = require('../services/backup');
const { bad, conflict, notFound, forbidden, required, isEmail } = require('../util');

// FR-ADM-01..04, FR-NOT-01/02 (outbox view), NFR-REL-01
const ROLES = ['customer', 'sales_consultant', 'sales_manager', 'general_manager', 'accountant', 'delivery_coordinator', 'administrator'];
const COMMERCIAL_KEYS = ['default_interest', 'fuel_price_usd_per_l', 'electricity_usd_per_kwh', 'referral_credit_usd'];

module.exports = function admin(ctx) {
  const { db, auth, audit, notify, settings, config } = ctx;
  const r = express.Router();
  const ADM = auth.requireRole('administrator');
  const userRow = (u) => ({ id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role, active: !!u.active, language: u.language, locked_until: u.locked_until, created_at: u.created_at });

  // ----- users and roles (FR-ADM-01/02) -----
  r.get('/admin/users', ADM, (req, res) => {
    const where = []; const args = [];
    if (req.query.role) { where.push('role = ?'); args.push(req.query.role); }
    if (req.query.q) { where.push('(name LIKE ? OR email LIKE ?)'); args.push(`%${req.query.q}%`, `%${req.query.q}%`); }
    res.json(db.prepare(`SELECT * FROM users ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC LIMIT 500`).all(...args).map(userRow));
  });
  r.get('/staff/consultants', auth.requireRole('sales_manager', 'administrator'), (req, res) => {
    res.json(db.prepare("SELECT id, name FROM users WHERE role = 'sales_consultant' AND active = 1 ORDER BY name").all());
  });
  r.post('/admin/users', ADM, (req, res) => {
    const b = req.body || {}; required(b, ['name', 'email', 'password', 'role']);
    if (!ROLES.includes(b.role)) throw bad('invalid_role', 'Unknown role');
    if (!isEmail(b.email)) throw bad('invalid_email', 'Invalid email address');
    if (String(b.password).length < 8) throw bad('weak_password', 'Password must be at least 8 characters');
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(b.email.toLowerCase())) throw conflict('email_taken', 'This email is already registered');
    const id = db.prepare('INSERT INTO users(name,email,phone,password_hash,role,language,consent_data_at) VALUES(?,?,?,?,?,?,?)')
      .run(b.name, b.email.toLowerCase(), b.phone || null, auth.hash(b.password), b.role, b.language === 'ar' ? 'ar' : 'en', clock.iso()).lastInsertRowid;
    audit(req.user.id, 'user_created', 'user', id, { role: b.role });
    res.status(201).json(userRow(db.prepare('SELECT * FROM users WHERE id = ?').get(id)));
  });
  r.put('/admin/users/:id', ADM, (req, res) => {
    const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id); if (!u) throw notFound('User');
    const b = req.body || {};
    if (b.role && b.role !== u.role) {
      if (!ROLES.includes(b.role)) throw bad('invalid_role', 'Unknown role');
      if (u.id === req.user.id) throw bad('cannot_change_own_role', 'You cannot change your own role');
      audit(req.user.id, 'role_change', 'user', u.id, { from: u.role, to: b.role });
    }
    db.prepare('UPDATE users SET name = ?, phone = ?, role = ?, language = ? WHERE id = ?').run(b.name ?? u.name, b.phone ?? u.phone, b.role ?? u.role, b.language === 'ar' ? 'ar' : b.language === 'en' ? 'en' : u.language, u.id);
    res.json(userRow(db.prepare('SELECT * FROM users WHERE id = ?').get(u.id)));
  });
  r.post('/admin/users/:id/deactivate', ADM, (req, res) => {
    const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id); if (!u) throw notFound('User');
    if (u.id === req.user.id) throw bad('cannot_deactivate_self', 'You cannot deactivate your own account');
    db.prepare('UPDATE users SET active = 0 WHERE id = ?').run(u.id); // records are kept; the user can no longer log in
    audit(req.user.id, 'user_deactivated', 'user', u.id);
    res.json(userRow(db.prepare('SELECT * FROM users WHERE id = ?').get(u.id)));
  });
  r.post('/admin/users/:id/activate', ADM, (req, res) => {
    const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id); if (!u) throw notFound('User');
    if (u.erased) throw conflict('erased', 'An erased account cannot be reactivated');
    db.prepare('UPDATE users SET active = 1, failed_logins = 0, locked_until = NULL WHERE id = ?').run(u.id);
    audit(req.user.id, 'user_activated', 'user', u.id);
    res.json(userRow(db.prepare('SELECT * FROM users WHERE id = ?').get(u.id)));
  });
  r.post('/admin/users/:id/reset-password', ADM, (req, res) => {
    const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id); if (!u) throw notFound('User');
    const pw = (req.body || {}).password;
    if (String(pw || '').length < 8) throw bad('weak_password', 'Password must be at least 8 characters');
    db.prepare('UPDATE users SET password_hash = ?, failed_logins = 0, locked_until = NULL WHERE id = ?').run(auth.hash(pw), u.id);
    audit(req.user.id, 'password_reset', 'user', u.id);
    res.json({ ok: true });
  });

  // ----- settings (FR-ADM-03, NFR-MNT-01) -----
  r.get('/settings', auth.staffOnly, (req, res) => res.json(settings.all()));
  r.put('/admin/settings', ADM, (req, res) => {
    const before = settings.all();
    const after = settings.setMany(req.body || {}, req.user.id);
    Object.keys(req.body || {}).forEach((k) => { if (before[k] !== after[k]) audit(req.user.id, 'setting_change', 'settings', k, { old: before[k], new: after[k] }); });
    res.json(after);
  });
  r.put('/settings/commercial', auth.requireRole('sales_manager'), (req, res) => { // interest rate, fuel / electricity prices, referral credit: set by the Sales Manager
    const b = req.body || {};
    const bad_ = Object.keys(b).filter((k) => !COMMERCIAL_KEYS.includes(k));
    if (bad_.length) throw forbidden('setting_not_allowed', `The Sales Manager can change only: ${COMMERCIAL_KEYS.join(', ')}`);
    const before = settings.all(); const after = settings.setMany(b, req.user.id);
    Object.keys(b).forEach((k) => { if (before[k] !== after[k]) audit(req.user.id, 'setting_change', 'settings', k, { old: before[k], new: after[k] }); });
    res.json(after);
  });
  r.get('/admin/exchange-rate-history', auth.requireRole('administrator', 'sales_manager', 'accountant', 'general_manager'), (req, res) => {
    res.json(db.prepare('SELECT h.id, h.rate, h.changed_at, u.name changed_by FROM exchange_rate_history h LEFT JOIN users u ON u.id = h.changed_by ORDER BY h.id DESC LIMIT 100').all());
  });

  // ----- audit log (FR-ADM-04): read-only -----
  r.get('/admin/audit', ADM, (req, res) => {
    const where = []; const args = [];
    if (req.query.action) { where.push('a.action = ?'); args.push(req.query.action); }
    if (req.query.user_id) { where.push('a.user_id = ?'); args.push(req.query.user_id); }
    if (req.query.entity) { where.push('a.entity = ?'); args.push(req.query.entity); }
    if (req.query.from) { where.push('a.at >= ?'); args.push(req.query.from); }
    if (req.query.to) { where.push('a.at <= ?'); args.push(req.query.to + 'T23:59:59'); }
    const limit = Math.min(Number(req.query.limit) || 100, 500); const offset = Number(req.query.offset) || 0;
    const rows = db.prepare(`SELECT a.*, u.name user_name FROM audit_log a LEFT JOIN users u ON u.id = a.user_id ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY a.id DESC LIMIT ? OFFSET ?`).all(...args, limit, offset);
    res.json(rows.map((a) => ({ ...a, details: a.details ? JSON.parse(a.details) : null })));
  });

  // ----- personal-data requests (FR-ACC-04) -----
  r.get('/admin/data-requests', ADM, (req, res) => {
    res.json(db.prepare(`SELECT q.id,q.type,q.status,q.requested_at,q.due_at,q.completed_at,u.name user_name,u.email user_email FROM data_requests q JOIN users u ON u.id = q.user_id ORDER BY q.status, q.due_at`).all()
      .map((x) => ({ ...x, overdue: x.status === 'open' && new Date(x.due_at) < clock.now() })));
  });
  r.post('/admin/data-requests/:id/complete', ADM, (req, res) => res.json(ctx.completeDataRequest(req.params.id, req.user.id)));

  // ----- notification outbox (FR-NOT-01) -----
  r.get('/admin/outbox', auth.requireRole('administrator', 'sales_manager'), (req, res) => {
    const where = []; const args = [];
    if (req.query.kind) { where.push('kind = ?'); args.push(req.query.kind); }
    if (req.query.channel) { where.push('channel = ?'); args.push(req.query.channel); }
    if (req.query.user_id) { where.push('user_id = ?'); args.push(req.query.user_id); }
    res.json(db.prepare(`SELECT * FROM outbox ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC LIMIT 200`).all(...args));
  });

  // ----- backups and scheduled jobs (NFR-REL-01) -----
  r.get('/admin/backups', ADM, (req, res) => res.json(backupSvc.list(config)));
  r.post('/admin/backups', ADM, async (req, res) => { const name = await backupSvc.backup(db, config); audit(req.user.id, 'backup', 'system', name); res.status(201).json({ name }); });
  r.post('/admin/run-jobs', ADM, (req, res) => res.json(ctx.runJobs()));
  return r;
};
