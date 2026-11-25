const fs = require('fs');
const path = require('path');

// NFR-REL-01: daily backup of the database and the encrypted uploads; restore loses at most the last 24 hours.
const stamp = (d = new Date()) => d.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
async function backup(db, config, keep = 14) {
  const dir = path.join(config.backupDir, `fsm-${stamp()}`);
  fs.mkdirSync(dir, { recursive: true });
  await db.backup(path.join(dir, 'fsm.db'));
  if (fs.existsSync(config.uploadDir)) fs.cpSync(config.uploadDir, path.join(dir, 'uploads'), { recursive: true });
  const all = fs.readdirSync(config.backupDir).filter((n) => n.startsWith('fsm-')).sort();
  all.slice(0, Math.max(0, all.length - keep)).forEach((n) => fs.rmSync(path.join(config.backupDir, n), { recursive: true, force: true }));
  return path.basename(dir);
}
function list(config) {
  if (!fs.existsSync(config.backupDir)) return [];
  return fs.readdirSync(config.backupDir).filter((n) => n.startsWith('fsm-')).sort().reverse();
}
function restoreFiles(config, name) {
  const dir = path.join(config.backupDir, name);
  if (!fs.existsSync(path.join(dir, 'fsm.db'))) throw new Error(`Backup ${name} not found`);
  for (const ext of ['', '-wal', '-shm']) { try { fs.rmSync(config.dbPath + ext, { force: true }); } catch { /* none */ } }
  fs.copyFileSync(path.join(dir, 'fsm.db'), config.dbPath);
  if (fs.existsSync(path.join(dir, 'uploads'))) { fs.rmSync(config.uploadDir, { recursive: true, force: true }); fs.cpSync(path.join(dir, 'uploads'), config.uploadDir, { recursive: true }); }
}
module.exports = { backup, list, restoreFiles };
