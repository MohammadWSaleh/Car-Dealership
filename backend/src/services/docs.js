const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const clock = require('../clock');
const { bad, forbidden, notFound } = require('../util');

// NFR-SEC-04: uploaded personal documents are encrypted at rest (AES-256-GCM) and served only to authorised roles.
const MAX_BYTES = 5 * 1024 * 1024;
const sniff = (buf) => {
  if (buf.slice(0, 4).toString() === '%PDF') return 'application/pdf';
  if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  return null;
};
// who may read each kind of document besides the owner
const READERS = {
  license: ['sales_consultant', 'sales_manager'],
  identity: ['delivery_coordinator', 'sales_manager'],
  signed_contract: ['sales_consultant', 'sales_manager', 'accountant', 'delivery_coordinator', 'general_manager'],
  signed_handover: ['sales_consultant', 'sales_manager', 'delivery_coordinator', 'general_manager'],
};

module.exports = function docsService({ db, config }) {
  fs.mkdirSync(config.uploadDir, { recursive: true });
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BYTES, files: 1 } });

  function encrypt(buf) {
    const iv = crypto.randomBytes(12);
    const c = crypto.createCipheriv('aes-256-gcm', config.docKey, iv);
    const enc = Buffer.concat([c.update(buf), c.final()]);
    return Buffer.concat([iv, c.getAuthTag(), enc]);
  }
  function decrypt(blob) {
    const iv = blob.slice(0, 12), tag = blob.slice(12, 28), enc = blob.slice(28);
    const d = crypto.createDecipheriv('aes-256-gcm', config.docKey, iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(enc), d.final()]);
  }
  function store(file, { kind, ownerUserId = null, dealId = null, testDriveId = null }) {
    if (!file) throw bad('file_required', 'A file is required');
    const mime = sniff(file.buffer);
    if (!mime) throw bad('invalid_file', 'Only PDF, PNG or JPEG files are accepted');
    const name = `${crypto.randomUUID()}.enc`;
    fs.writeFileSync(path.join(config.uploadDir, name), encrypt(file.buffer));
    const info = db.prepare('INSERT INTO documents(kind,owner_user_id,deal_id,test_drive_id,path,original_name,mime,created_at) VALUES(?,?,?,?,?,?,?,?)')
      .run(kind, ownerUserId, dealId, testDriveId, name, String(file.originalname || 'file').slice(0, 120), mime, clock.iso());
    return db.prepare('SELECT id,kind,original_name,mime,created_at FROM documents WHERE id = ?').get(info.lastInsertRowid);
  }
  function canRead(user, doc) {
    if (!user) return false;
    if (doc.owner_user_id && doc.owner_user_id === user.id) return true;
    return (READERS[doc.kind] || []).includes(user.role);
  }
  function read(user, id) {
    const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(id);
    if (!doc) throw notFound('Document');
    if (!canRead(user, doc)) throw forbidden();
    return { doc, buffer: decrypt(fs.readFileSync(path.join(config.uploadDir, doc.path))) };
  }
  function remove(docId) {
    const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(docId);
    if (!doc) return;
    try { fs.unlinkSync(path.join(config.uploadDir, doc.path)); } catch { /* already gone */ }
    db.prepare('DELETE FROM documents WHERE id = ?').run(docId);
  }
  return { upload, store, read, remove, canRead, encrypt, decrypt };
};
