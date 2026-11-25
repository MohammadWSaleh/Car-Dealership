const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const path = require('path');
const baseConfig = require('./config');
const { openDb } = require('./db');
const { HttpError } = require('./util');

function createApp(options = {}) {
  const config = { ...baseConfig, ...(options.config || {}) };
  const db = openDb(options.dbPath || config.dbPath);
  const ctx = { db, config, jobs: {} };
  ctx.settings = require('./services/settings')(db); ctx.settings.ensureDefaults();
  ctx.audit = require('./services/audit')(db);
  ctx.auth = require('./services/auth')({ db, config });
  ctx.notify = require('./services/notify')({ db });
  ctx.docs = require('./services/docs')({ db, config });
  ctx.core = require('./services/core')(ctx);
  ctx.runJobs = () => Object.fromEntries(Object.entries(ctx.jobs).map(([k, fn]) => [k, fn()]));

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  // browsers only honour HSTS over HTTPS (NFR-SEC-01)
  // "upgrade-insecure-requests" only when the site is really served over HTTPS (own TLS or behind the HTTPS proxy); otherwise Safari/WebKit
// rewrites every asset to https:// and a plain-HTTP demo shows a blank page.
const httpsSite = !!(baseConfig.tlsKey || /^https:/i.test(process.env.PUBLIC_ORIGIN || '') || process.env.BEHIND_HTTPS_PROXY === '1');
  app.use(helmet({ hsts: { maxAge: 31536000, includeSubDomains: true }, contentSecurityPolicy: { directives: { ...helmet.contentSecurityPolicy.getDefaultDirectives(), 'upgrade-insecure-requests': httpsSite ? [] : null } } }));
  app.use(cors({ origin: (o, cb) => cb(null, !o || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o) || o === process.env.PUBLIC_ORIGIN), exposedHeaders: ['X-Refresh-Token'] }));
  app.use(express.json({ limit: '1mb' }));

  if (options.rateLimit !== false && process.env.RATE_LIMIT !== 'off') {
    app.use('/api/auth/login', rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: true, legacyHeaders: false, message: { error: { code: 'too_many_requests', message: 'Too many attempts, try again in a minute' } } }));
    app.use('/api', rateLimit({ windowMs: 60_000, limit: 1200, standardHeaders: true, legacyHeaders: false, message: { error: { code: 'too_many_requests', message: 'Too many requests' } } }));
  }

  app.use('/api', ctx.auth.authenticate);
  // Only for the system-test run (FSM_TEST_HOOKS=1): move the server clock, trigger scheduled jobs and internal notifications directly.
  // These hooks do not exist unless that variable is set; they are never enabled in production.
  if (process.env.FSM_TEST_HOOKS === '1') {
    const clk = require('./clock');
    app.post('/api/_test/clock', (req, res) => { clk.set((req.body || {}).now || null); res.json({ now: clk.iso() }); });
    app.post('/api/_test/jobs/:name', (req, res) => res.json({ result: ctx.jobs[req.params.name]() }));
    app.post('/api/_test/notify', (req, res) => res.json({ row: ctx.notify.send(req.body || {}) }));
  }
  app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));
  // order matters only for modules that publish helpers on ctx at load time
  ['accounts', 'catalogue', 'testdrives', 'assistant', 'ev', 'deals', 'payments', 'inventory', 'delivery', 'ownerscircle', 'admin', 'reports']
    .forEach((m) => app.use('/api', require(`./modules/${m}`)(ctx)));
  app.get('/api/documents/:id', ctx.auth.requireRole(), (req, res) => {
    const { doc, buffer } = ctx.docs.read(req.user, Number(req.params.id));
    res.type(doc.mime).set('Content-Disposition', `inline; filename="${doc.original_name.replace(/[^\w.\-]/g, '_')}"`).send(buffer);
  });
  app.use('/api', (req, res) => res.status(404).json({ error: { code: 'not_found', message: 'Unknown endpoint' } }));

  // single-page frontend (production build)
  const index = path.join(config.frontendDir, 'index.html');
  if (options.serveFrontend !== false && fs.existsSync(index)) {
    app.use(express.static(config.frontendDir, { index: false, maxAge: '1h' }));
    app.use((req, res, next) => (req.method === 'GET' ? res.sendFile(index) : next()));
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: { code: err.code, message: err.message, ...(err.extra ? { details: err.extra } : {}) } });
    if (err && err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: { code: 'file_too_large', message: 'The file is larger than 5 MB' } });
    if (err && err.name === 'MulterError') return res.status(400).json({ error: { code: 'upload_error', message: err.message } });
    if (err instanceof SyntaxError && err.status === 400) return res.status(400).json({ error: { code: 'invalid_json', message: 'The request body is not valid JSON' } });
    if (err && /SQLITE_CONSTRAINT/.test(String(err.code))) return res.status(409).json({ error: { code: 'constraint_violation', message: 'The change conflicts with existing data' } });
    console.error(err); // never leak internals to the client
    res.status(500).json({ error: { code: 'server_error', message: 'Something went wrong' } });
  });
  return { app, ctx };
}
module.exports = { createApp };
