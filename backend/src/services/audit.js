const clock = require('../clock');
// FR-ADM-04: append-only audit log; the database itself blocks UPDATE and DELETE (see triggers in db.js).
module.exports = (db) => {
  const ins = db.prepare('INSERT INTO audit_log(at,user_id,action,entity,entity_id,details) VALUES(?,?,?,?,?,?)');
  return function audit(userId, action, entity, entityId, details) {
    ins.run(clock.iso(), userId || null, action, entity || null, entityId == null ? null : String(entityId), details ? JSON.stringify(details) : null);
  };
};
