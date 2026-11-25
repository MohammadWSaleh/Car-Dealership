// SYSTEM TEST RUNNER: for every API test file, boots a fresh real server process (own SQLite file, uploads, backups, test hooks, TLS off),
// then runs the file's tests against it over HTTP (SYSTEM_URL) and stops the server. Usage: node scripts/run-system-tests.js [file...]
const { spawn, spawnSync } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path'), net = require('net');
const root = path.join(__dirname, '..');
const files = process.argv.slice(2).length ? process.argv.slice(2) : fs.readdirSync(path.join(root, 'tests')).filter((f) => f.endsWith('.test.js')).map((f) => 'tests/' + f);
const freePort = () => new Promise((r) => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => r(p)); }); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  let failed = 0;
  for (const f of files) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fsm-sys-')); const port = await freePort();
    const env = { ...process.env, PORT: String(port), DB_PATH: path.join(dir, 'fsm.db'), UPLOAD_DIR: path.join(dir, 'up'), BACKUP_DIR: path.join(dir, 'bk'),
      SEED_ON_EMPTY: '0', RATE_LIMIT: 'off', FSM_TEST_HOOKS: '1', NODE_ENV: 'test', JWT_SECRET: 'system-test-secret' };
    const srv = spawn(process.execPath, ['src/server.js'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let log = ''; srv.stdout.on('data', (d) => log += d); srv.stderr.on('data', (d) => log += d);
    let up = false;
    for (let i = 0; i < 100 && !up; i++) { try { up = (await fetch(`http://127.0.0.1:${port}/api/health`)).ok; } catch { await sleep(100); } }
    if (!up) { console.error('server did not start\n' + log); srv.kill(); failed++; continue; }
    console.log(`\n=== SYSTEM RUN ${f}  (server pid ${srv.pid}, port ${port}) ===`);
    const r = spawnSync(process.execPath, [path.join(root, 'node_modules/vitest/vitest.mjs'), 'run', f], { cwd: root, stdio: 'inherit',
      env: { ...env, SYSTEM_URL: `http://127.0.0.1:${port}`, SYSTEM_DB: env.DB_PATH, SYSTEM_UPLOAD: env.UPLOAD_DIR, SYSTEM_BACKUP: env.BACKUP_DIR } });
    srv.kill(); if (r.status) failed++;
  }
  console.log(failed ? `\nSYSTEM RUN: ${failed} file(s) failed` : '\nSYSTEM RUN: all files passed'); process.exit(failed ? 1 : 0);
})();
