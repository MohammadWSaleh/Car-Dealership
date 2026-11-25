// Verifies that en.js and ar.js have identical key sets and that every static t('...') key used by the pages exists in both.
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');
const flat = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (typeof v === 'object' ? flat(v, `${p}${k}.`) : [`${p}${k}`]));
const en = new Set(flat((await import(path.join(root, 'i18n/en.js'))).default)); const ar = new Set(flat((await import(path.join(root, 'i18n/ar.js'))).default));
const files = []; (function walk(d) { for (const f of fs.readdirSync(d, { withFileTypes: true })) f.isDirectory() ? walk(path.join(d, f.name)) : /\.jsx?$/.test(f.name) && files.push(path.join(d, f.name)); })(root);
const used = new Set(); for (const f of files) for (const m of fs.readFileSync(f, 'utf8').matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'/g)) used.add(m[1]);
let bad = 0; const report = (msg, list) => { if (list.length) { bad++; console.log(`${msg}:\n  ${list.join('\n  ')}`); } };
report('Used but missing in en.js', [...used].filter((k) => !en.has(k))); report('Used but missing in ar.js', [...used].filter((k) => !ar.has(k)));
report('In en.js but not ar.js', [...en].filter((k) => !ar.has(k))); report('In ar.js but not en.js', [...ar].filter((k) => !en.has(k)));
console.log(`${used.size} keys used, ${en.size} English, ${ar.size} Arabic.`); process.exit(bad ? 1 : 0);
