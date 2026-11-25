const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..');
const jwtSecret = process.env.JWT_SECRET || 'dev-only-secret-change-in-production';

module.exports = {
  port: Number(process.env.PORT || 3000),
  jwtSecret,
  dbPath: process.env.DB_PATH || path.join(root, 'data', 'fsm.db'),
  uploadDir: process.env.UPLOAD_DIR || path.join(root, 'data', 'uploads'),
  backupDir: process.env.BACKUP_DIR || path.join(root, 'data', 'backups'),
  // 32-byte key for AES-256-GCM encryption of uploaded personal documents (NFR-SEC-04)
  docKey: crypto.createHash('sha256').update(process.env.DOC_KEY || jwtSecret).digest(),
  // NFR-SEC-03: staff sessions end after 15 minutes of inactivity; account locks after 5 failed logins for 15 minutes
  staffSessionMinutes: Number(process.env.STAFF_SESSION_MINUTES || 15),
  customerSessionHours: Number(process.env.CUSTOMER_SESSION_HOURS || 8),
  maxFailedLogins: 5,
  lockMinutes: 15,
  frontendDir: process.env.FRONTEND_DIR || path.join(root, '..', 'frontend', 'dist'),
  tlsKey: process.env.TLS_KEY || '',
  tlsCert: process.env.TLS_CERT || '',
};
