import { describe, it, expect, beforeAll } from 'vitest';
const fs = require('fs');
const { makeApp, staff } = require('./helpers');
let t, S, routes;

// Walk the real Express router so a newly added endpoint is covered automatically.
function listRoutes(app) {
  const out = []; const walk = (stack, prefix) => {
    for (const l of stack) {
      if (l.route) for (const m of Object.keys(l.route.methods)) out.push({ method: m, path: prefix + l.route.path });
      else if (l.handle && l.handle.stack) walk(l.handle.stack, prefix + (l.path && l.path !== '/' ? l.path : (prefix === '' ? '/api' : '')));
    }
  };
  walk((app.router || app._router).stack, '');
  return out.filter((r) => !r.path.includes('_test') && !/restore/.test(r.path) && r.path.startsWith('/api'));
}
// every field name any handler reads from a request body, found in the source itself
const KEYS = (() => {
  const files = require('fs').readdirSync(require('path').join(__dirname, '../src/modules')).map((f) => require('path').join(__dirname, '../src/modules', f));
  const set = new Set();
  for (const f of files) { const src = fs.readFileSync(f, 'utf8'); for (const m of src.matchAll(/\b(?:b|body|req\.body|p|x)\.([a-z][a-z0-9_]+)/g)) set.add(m[1]); for (const m of src.matchAll(/required\(\w+, \[([^\]]+)\]/g)) m[1].split(',').forEach((k) => set.add(k.replace(/['\s]/g, ''))); }
  return [...set].filter((k) => !['length', 'map', 'filter', 'id'].includes(k));
})();
const ALLKEYS = (v) => Object.fromEntries(KEYS.map((k) => [k, v]));
const fill = (p, v) => p.replace(/:[A-Za-z_]+/g, v);
beforeAll(async () => { t = makeApp(); S = await staff(t); routes = listRoutes(t.app); });

describe('route inventory', () => {
  it('collects the field names used by the handlers', () => { expect(KEYS.length).toBeGreaterThan(80); });
  it('finds the whole API', () => { expect(routes.length).toBeGreaterThan(120); });
});

const BODIES = [
  {}, { id: null, amount: -1, name: 'x'.repeat(20000), email: 'a', code: [], trim_id: 'abc', slot_start: {}, price_usd: 'NaN', term_months: 0 },
  { name: "Robert'); DROP TABLE users;--", email: '<script>alert(1)</script>@x.lb', trim_id: '1 OR 1=1', amount: 1e308, deposit_rule: {}, reason: null },
  [], 'just a string',
  ...[{ x: 1 }, [1, 'a'], 1e308, true, null, '', 'x'.repeat(4000), -1, '0', "'; --", 0.5, '2020-13-45'].map((v) => ALLKEYS(v)),
];
const IDS = ['1', 'abc', '-1', '99999999999999999999', "1' OR '1'='1"];

describe('no endpoint ever answers 5xx or leaks internals, for any role and any hostile input', () => {
  const who = ['pub', 'cust', 'c1', 'mgr', 'acc', 'del', 'gm', 'admin'];
  it('sweeps every route x role x payload x id', async () => {
    const bad = []; let calls = 0;
    for (const r of routes) for (const w of who) for (const idv of (r.path.includes(':') ? IDS : ['1'])) {
      const bodies = ['get', 'delete', 'head'].includes(r.method) ? [null] : BODIES;
      for (const b of bodies) {
        const path = fill(r.path, idv).replace(/^\/api/, '') + (r.method === 'get' ? '?lang=zz&limit=-5&date=nope&trim_id=abc&from=x&to=y&q=%00' : '');
        const c = w === 'pub' ? t.pub : S[w];
        let res;
        try {
          if (r.method === 'get') res = await (w === 'pub' ? t.pub.get(path) : c.get(path));
          else if (r.method === 'delete') res = await (w === 'pub' ? t.api.delete('/api' + path) : c.del(path));
          else if (r.method === 'head') continue;
          else res = w === 'pub' ? await t.api[r.method]('/api' + path).send(b) : await c.raw(r.method, path).send(b);
        } catch (e) { bad.push({ r: `${r.method} ${r.path}`, w, why: 'threw ' + e.message.slice(0, 80) }); continue; }
        calls++;
        const text = res.text || '';
        if (res.status >= 500) bad.push({ r: `${r.method} ${r.path}`, w, id: idv, b: JSON.stringify(b).slice(0, 60), status: res.status, msg: text.slice(0, 160) });
        else if (/SQLITE_|\bat .*\.js:\d+|node_modules|TypeError|ReferenceError/.test(text)) bad.push({ r: `${r.method} ${r.path}`, w, why: 'leak', msg: text.slice(0, 160) });
      }
    }
    fs.writeFileSync('/tmp/sweep.json', JSON.stringify({ calls, bad }, null, 1));
    expect(bad.slice(0, 15)).toEqual([]);
  }, 600000);
});
