// Usage: npm run backup   - creates data/backups/fsm-<timestamp>/ with the database and encrypted uploads
const config = require('../src/config');
const { openDb } = require('../src/db');
const { backup } = require('../src/services/backup');
const db = openDb(config.dbPath);
backup(db, config).then((n) => { console.log('Backup created:', n); db.close(); }).catch((e) => { console.error(e); process.exit(1); });
