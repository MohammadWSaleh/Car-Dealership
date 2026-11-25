// NFR-PERF-01: 50 simulated users browse the public catalogue; 95% of requests must finish within 3 s.
// Usage: npm run loadtest            (starts its own server on a temporary database)
//        BASE_URL=http://localhost:4000 npm run loadtest   (tests a running server)
const USERS = Number(process.env.USERS || 50); const ROUNDS = Number(process.env.ROUNDS || 6);
const PAGES = ['/api/catalogue/trims', '/api/catalogue/filters', '/api/catalogue/trims?fuel_type=electric', '/api/catalogue/trims?brand=Toyota', '/api/catalogue/trims/1', '/api/catalogue/compare?ids=1,2,3', '/api/catalogue/promotions'];
(async () => {
  let server; let base = process.env.BASE_URL;
  if (!base) {
    const fs = require('fs'); const os = require('os'); const path = require('path'); const http = require('http');
    const { createApp } = require('../src/app'); const { seedBase } = require('../src/seed');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fsm-load-'));
    const { app, ctx } = createApp({ dbPath: ':memory:', rateLimit: false, config: { uploadDir: dir, backupDir: dir } });
    seedBase(ctx); server = http.createServer(app); await new Promise((r) => server.listen(0, r)); base = `http://127.0.0.1:${server.address().port}`;
  }
  const times = []; let failed = 0; const started = Date.now();
  await Promise.all(Array.from({ length: USERS }, async (_, u) => {
    for (let i = 0; i < ROUNDS; i++) {
      const page = PAGES[(u + i) % PAGES.length]; const s = Date.now();
      try { const r = await fetch(base + page); await r.arrayBuffer(); if (!r.ok) failed++; } catch { failed++; }
      times.push(Date.now() - s);
    }
  }));
  times.sort((a, b) => a - b); const p = (q) => times[Math.min(times.length - 1, Math.floor(times.length * q))];
  const result = { users: USERS, requests: times.length, failed, seconds: ((Date.now() - started) / 1000).toFixed(2), p50_ms: p(0.5), p95_ms: p(0.95), max_ms: times[times.length - 1] };
  console.log(JSON.stringify(result, null, 2));
  const pass = result.p95_ms <= 3000 && failed === 0;
  console.log(pass ? 'PASS: 95% of requests finished within 3 seconds (NFR-PERF-01)' : 'FAIL: NFR-PERF-01 not met');
  if (server) server.close(); process.exit(pass ? 0 : 1);
})();
