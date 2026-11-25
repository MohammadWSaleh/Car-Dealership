// Usage: npm run restore -- <backup-folder-name>   (stop the server first)
const config = require('../src/config');
const { list, restoreFiles } = require('../src/services/backup');
const name = process.argv[2];
if (!name) { console.log('Available backups:\n' + list(config).join('\n')); process.exit(0); }
restoreFiles(config, name);
console.log('Restored', name, '- start the server again.');
