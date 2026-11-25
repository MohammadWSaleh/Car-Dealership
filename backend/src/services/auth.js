const clock = require('../clock');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { HttpError, forbidden } = require('../util');

const STAFF = ['sales_consultant', 'sales_manager', 'general_manager', 'accountant', 'delivery_coordinator', 'administrator'];

module.exports = function authService({ db, config }) {
  const isStaff = (role) => role !== 'customer';
  function sign(user) {
    const expiresIn = isStaff(user.role) ? `${config.staffSessionMinutes}m` : `${config.customerSessionHours}h`;
    return jwt.sign({ sub: user.id, role: user.role, iat: Math.floor(clock.now().getTime() / 1000) }, config.jwtSecret, { expiresIn });
  }
  const hash = (pw) => bcrypt.hashSync(pw, 10); // salted hash (NFR-SEC-02)
  const verify = (pw, h) => bcrypt.compareSync(pw, h);

  // Reads the bearer token if present; never fails when there is none (public pages).
  function authenticate(req, res, next) {
    const h = req.headers.authorization || '';
    if (!h.startsWith('Bearer ')) return next();
    try {
      const payload = jwt.verify(h.slice(7), config.jwtSecret, { clockTimestamp: Math.floor(clock.now().getTime() / 1000) });
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.sub);
      if (!user || !user.active) throw new HttpError(401, 'session_invalid', 'Account is not active');
      req.user = user;
      // sliding window: every staff request renews the 15-minute inactivity timer (NFR-SEC-03)
      if (isStaff(user.role)) {
        res.set('X-Refresh-Token', sign(user));
        res.set('Access-Control-Expose-Headers', 'X-Refresh-Token');
      }
      return next();
    } catch (e) {
      if (e instanceof HttpError) return next(e);
      return next(new HttpError(401, 'session_expired', 'Session expired, please log in again'));
    }
  }
  // Role guard. No roles listed = any logged-in user.
  const requireRole = (...roles) => (req, res, next) => {
    if (!req.user) return next(new HttpError(401, 'login_required', 'Please log in'));
    if (roles.length && !roles.includes(req.user.role)) return next(forbidden());
    next();
  };
  const staffOnly = requireRole(...STAFF);
  const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role, language: u.language, notify_pref: u.notify_pref, consent_marketing: !!u.consent_marketing });
  return { sign, hash, verify, authenticate, requireRole, staffOnly, isStaff, publicUser, STAFF };
};
module.exports.STAFF = STAFF;
