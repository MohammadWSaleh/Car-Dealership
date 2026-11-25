const { bad } = require('../util');
const clock = require('../clock');

// NFR-MNT-01 / FR-ADM-03: every business rule that can change lives here, never in code.
const DEFAULTS = {
  vat_rate: '11',                 // % (default 11, FR-PAY-05)
  stamp_duty_percent: '0.4',      // % of the contract total (rule to be confirmed with the accountant)
  exchange_rate: '89500',         // LBP per 1 USD, entered manually
  open_time: '09:00',
  close_time: '18:00',
  open_days: '1,2,3,4,5,6',       // 1 = Monday ... 7 = Sunday
  slot_minutes: '30',
  stock_threshold: '2',           // alert when in-stock cars of a trim fall below this
  unsold_days: '90',              // alert when a car stays unsold longer
  hold_days: '30',                // default deposit price-hold period (FR-PAY-02)
  quotation_days: '7',            // quotation validity (FR-DEAL-03)
  default_interest: '8',          // yearly % for instalment calculator (FR-CAT-06)
  fuel_price_usd_per_l: '1.1',
  electricity_usd_per_kwh: '0.2',
  referral_credit_usd: '200',
  ambassador_referrals: '3',
  delivery_slots: '10:00,11:00,14:00,15:00,16:00',
};

const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;
const VALIDATORS = {
  vat_rate: (v) => num(v, 0, 100),
  stamp_duty_percent: (v) => num(v, 0, 100),
  exchange_rate: (v) => num(v, 1, 10000000),
  open_time: (v) => timeRe.test(v),
  close_time: (v) => timeRe.test(v),
  open_days: (v) => /^[1-7](,[1-7])*$/.test(v),
  slot_minutes: (v) => num(v, 5, 240),
  stock_threshold: (v) => num(v, 0, 1000),
  unsold_days: (v) => num(v, 1, 3650),
  hold_days: (v) => num(v, 1, 365),
  quotation_days: (v) => num(v, 1, 90),
  default_interest: (v) => num(v, 0, 100),
  fuel_price_usd_per_l: (v) => num(v, 0, 100),
  electricity_usd_per_kwh: (v) => num(v, 0, 100),
  referral_credit_usd: (v) => num(v, 0, 100000),
  ambassador_referrals: (v) => num(v, 1, 100),
  delivery_slots: (v) => v.split(',').every((t) => timeRe.test(t.trim())),
};
function num(v, min, max) { const n = Number(v); return Number.isFinite(n) && n >= min && n <= max; }

function settingsService(db) {
  const getStmt = db.prepare('SELECT value FROM settings WHERE key = ?');
  const upsert = db.prepare('INSERT INTO settings(key,value,updated_at,updated_by) VALUES(?,?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at, updated_by=excluded.updated_by');

  function ensureDefaults() {
    const ins = db.prepare('INSERT OR IGNORE INTO settings(key,value,updated_at) VALUES(?,?,?)');
    for (const [k, v] of Object.entries(DEFAULTS)) ins.run(k, v, clock.iso());
    const has = db.prepare('SELECT COUNT(*) c FROM exchange_rate_history').get().c;
    if (!has) db.prepare('INSERT INTO exchange_rate_history(rate,changed_at,changed_by) VALUES(?,?,NULL)').run(Number(DEFAULTS.exchange_rate), clock.iso());
  }
  const get = (key) => { const r = getStmt.get(key); return r ? r.value : DEFAULTS[key]; };
  const num_ = (key) => Number(get(key));
  const all = () => Object.fromEntries(Object.keys(DEFAULTS).map((k) => [k, get(k)]));

  function setMany(values, userId) {
    const entries = Object.entries(values);
    for (const [k, v] of entries) {
      if (!(k in DEFAULTS)) throw bad('unknown_setting', `Unknown setting: ${k}`);
      if (!VALIDATORS[k](String(v))) throw bad('invalid_setting', `Invalid value for ${k}`, { key: k });
    }
    const tx = db.transaction(() => {
      for (const [k, v] of entries) {
        const old = get(k);
        upsert.run(k, String(v), clock.iso(), userId);
        if (k === 'exchange_rate' && old !== String(v)) {
          db.prepare('INSERT INTO exchange_rate_history(rate,changed_at,changed_by) VALUES(?,?,?)').run(Number(v), clock.iso(), userId);
        }
      }
    });
    tx();
    return all();
  }
  const lbp = (usdAmount) => Math.round(usdAmount * num_('exchange_rate'));
  return { ensureDefaults, get, num: num_, all, setMany, lbp, DEFAULTS };
}
module.exports = settingsService;
