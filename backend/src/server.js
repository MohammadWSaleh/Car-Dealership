const fs = require('fs');
const http = require('http');
const https = require('https');
const config = require('./config');
const { createApp } = require('./app');
const backupSvc = require('./services/backup');

const { app, ctx } = createApp();

async function start() {
  if (process.env.SEED_ON_EMPTY !== '0' && ctx.db.prepare('SELECT COUNT(*) c FROM users').get().c === 0) {
    console.log('Empty database: loading demo data (set SEED_ON_EMPTY=0 to disable)...');
    if (process.env.SEED_MODE === 'base') require('./seed').seedBase(ctx); else await require('./seed').seed({ app, ctx });
  }
  const server = config.tlsKey && config.tlsCert
    ? https.createServer({ minVersion: 'TLSv1.2', key: fs.readFileSync(config.tlsKey), cert: fs.readFileSync(config.tlsCert) }, app) // NFR-SEC-01 (or run behind the Caddy proxy, see docs)
    : http.createServer(app);
  server.listen(config.port, () => console.log(`Full Stack Motors running on ${config.tlsKey ? 'https' : 'http'}://localhost:${config.port}`));

  // reminders and stock alerts every hour; backup every 24 hours (NFR-REL-01)
  setInterval(() => { try { ctx.runJobs(); } catch (e) { console.error('job failed', e); } }, 60 * 60 * 1000).unref();
  const dailyBackup = () => backupSvc.backup(ctx.db, config).then((n) => console.log('Backup created', n)).catch((e) => console.error('Backup failed', e));
  if (!backupSvc.list(config).length) dailyBackup();
  setInterval(dailyBackup, 24 * 60 * 60 * 1000).unref();
}
start().catch((e) => { console.error(e); process.exit(1); });
