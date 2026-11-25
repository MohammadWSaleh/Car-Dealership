const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE, phone TEXT, password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('customer','sales_consultant','sales_manager','general_manager','accountant','delivery_coordinator','administrator')),
  active INTEGER NOT NULL DEFAULT 1, language TEXT NOT NULL DEFAULT 'en' CHECK(language IN ('en','ar')),
  notify_pref TEXT NOT NULL DEFAULT 'email' CHECK(notify_pref IN ('email','whatsapp')),
  consent_data_at TEXT, consent_marketing INTEGER NOT NULL DEFAULT 0, consent_marketing_at TEXT,
  failed_logins INTEGER NOT NULL DEFAULT 0, locked_until TEXT, erased INTEGER NOT NULL DEFAULT 0,
  branch_id INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (datetime('now')));

CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT, updated_by INTEGER);
CREATE TABLE IF NOT EXISTS exchange_rate_history(id INTEGER PRIMARY KEY, rate REAL NOT NULL, changed_at TEXT NOT NULL, changed_by INTEGER);
CREATE TABLE IF NOT EXISTS counters(name TEXT PRIMARY KEY, value INTEGER NOT NULL DEFAULT 0);

CREATE TABLE IF NOT EXISTS trims(
  id INTEGER PRIMARY KEY, brand TEXT NOT NULL, model TEXT NOT NULL, name TEXT NOT NULL, body_type TEXT NOT NULL,
  fuel_type TEXT NOT NULL CHECK(fuel_type IN ('petrol','hybrid','plug_in_hybrid','electric')),
  price_usd REAL NOT NULL CHECK(price_usd >= 0), image_url TEXT, specs TEXT NOT NULL DEFAULT '{}', colors TEXT NOT NULL DEFAULT '[]',
  range_km INTEGER, battery_kwh REAL, l_per_100km REAL, kwh_per_100km REAL,
  description_en TEXT, description_ar TEXT, active INTEGER NOT NULL DEFAULT 1, branch_id INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS price_history(id INTEGER PRIMARY KEY, trim_id INTEGER NOT NULL, old_price REAL, new_price REAL NOT NULL, changed_by INTEGER, changed_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS promotions(
  id INTEGER PRIMARY KEY, trim_id INTEGER, title_en TEXT NOT NULL, title_ar TEXT, description_en TEXT, description_ar TEXT,
  promo_price_usd REAL, starts_on TEXT, ends_on TEXT, active INTEGER NOT NULL DEFAULT 1, created_by INTEGER, created_at TEXT);
CREATE TABLE IF NOT EXISTS accessories(id INTEGER PRIMARY KEY, name_en TEXT NOT NULL, name_ar TEXT, price_usd REAL NOT NULL, active INTEGER NOT NULL DEFAULT 1);

CREATE TABLE IF NOT EXISTS cars(
  id INTEGER PRIMARY KEY, vin TEXT NOT NULL UNIQUE, trim_id INTEGER NOT NULL, color TEXT,
  status TEXT NOT NULL CHECK(status IN ('in_transit','in_stock','reserved','sold','delivered')),
  arrival_date TEXT, received_at TEXT, is_demo INTEGER NOT NULL DEFAULT 0, branch_id INTEGER NOT NULL DEFAULT 1);

CREATE TABLE IF NOT EXISTS deals(
  id INTEGER PRIMARY KEY, customer_id INTEGER, contact_name TEXT, contact_phone TEXT, contact_email TEXT, language TEXT DEFAULT 'en',
  source TEXT NOT NULL CHECK(source IN ('web_form','chat','test_drive','walk_in','referral')),
  trim_id INTEGER, color TEXT, consultant_id INTEGER,
  stage TEXT NOT NULL DEFAULT 'lead' CHECK(stage IN ('lead','quoted','reserved','contract_signed','paid','delivered','lost')),
  lost_reason TEXT, notes TEXT, car_id INTEGER, referral_membership_id INTEGER, deposit_at TEXT, price_locked_until TEXT,
  chat_id INTEGER, consent_data_at TEXT, consent_marketing INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, branch_id INTEGER NOT NULL DEFAULT 1);
CREATE UNIQUE INDEX IF NOT EXISTS ux_deals_car ON deals(car_id) WHERE car_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS deal_history(id INTEGER PRIMARY KEY, deal_id INTEGER NOT NULL, from_stage TEXT, to_stage TEXT NOT NULL, user_id INTEGER, reason TEXT, at TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS quotations(
  id INTEGER PRIMARY KEY, number TEXT NOT NULL UNIQUE, deal_id INTEGER NOT NULL, trim_id INTEGER NOT NULL, color TEXT,
  price_usd REAL NOT NULL, vat_rate REAL NOT NULL, valid_until TEXT NOT NULL, created_by INTEGER, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS quotation_items(
  id INTEGER PRIMARY KEY, quotation_id INTEGER NOT NULL, accessory_id INTEGER, description TEXT NOT NULL, price_usd REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'approved' CHECK(status IN ('approved','pending','rejected')), exception_id INTEGER);
CREATE TABLE IF NOT EXISTS exceptions(
  id INTEGER PRIMARY KEY, deal_id INTEGER NOT NULL, quotation_id INTEGER, description TEXT NOT NULL, price_usd REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  requested_by INTEGER, decided_by INTEGER, decision_reason TEXT, decided_at TEXT, created_at TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS contracts(
  id INTEGER PRIMARY KEY, number TEXT NOT NULL UNIQUE, deal_id INTEGER NOT NULL, quotation_id INTEGER NOT NULL,
  total_usd REAL NOT NULL, vat_amount REAL NOT NULL, stamp_duty_usd REAL NOT NULL, hold_days INTEGER NOT NULL,
  deposit_rule TEXT NOT NULL CHECK(deposit_rule IN ('full_refund','partial_refund','forfeit')), partial_percent REAL,
  terms TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending_signature' CHECK(status IN ('pending_signature','signed','void')),
  signed_at TEXT, signed_method TEXT CHECK(signed_method IN ('online','paper')), signed_name TEXT, created_by INTEGER, created_at TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS payments(
  id INTEGER PRIMARY KEY, deal_id INTEGER NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('deposit','payment','refund')),
  amount REAL NOT NULL CHECK(amount > 0), currency TEXT NOT NULL CHECK(currency IN ('USD','LBP')), exchange_rate REAL NOT NULL, amount_usd REAL NOT NULL,
  method TEXT NOT NULL CHECK(method IN ('cash','bank_transfer','cheque','card','owner_credit')), reference TEXT,
  received_by INTEGER, receipt_number TEXT UNIQUE, linked_payment_id INTEGER, reason TEXT,
  status TEXT NOT NULL DEFAULT 'completed' CHECK(status IN ('completed','pending_approval','rejected')), approved_by INTEGER, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS invoices(
  id INTEGER PRIMARY KEY, number TEXT NOT NULL UNIQUE, deal_id INTEGER NOT NULL, total_usd REAL NOT NULL, vat_rate REAL NOT NULL,
  vat_amount REAL NOT NULL, net_usd REAL NOT NULL, issued_by INTEGER, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS loans(
  id INTEGER PRIMARY KEY, deal_id INTEGER NOT NULL, bank TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK(status IN ('submitted','approved','rejected','withdrawn')),
  created_by INTEGER, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS cancellations(
  id INTEGER PRIMARY KEY, deal_id INTEGER NOT NULL, decision TEXT NOT NULL, refund_usd REAL NOT NULL, reason TEXT NOT NULL, decided_by INTEGER, at TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS test_drives(
  id INTEGER PRIMARY KEY, code TEXT NOT NULL UNIQUE, deal_id INTEGER, customer_id INTEGER, trim_id INTEGER NOT NULL, car_id INTEGER NOT NULL,
  name TEXT, phone TEXT, email TEXT, language TEXT DEFAULT 'en', slot_start TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'booked' CHECK(status IN ('booked','cancelled','completed')),
  license_verified INTEGER NOT NULL DEFAULT 0, license_verified_by INTEGER, battery_percent INTEGER, feedback TEXT,
  reminder_sent INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, checked_in_at TEXT);
CREATE UNIQUE INDEX IF NOT EXISTS ux_td_slot ON test_drives(car_id, slot_start) WHERE status = 'booked';

CREATE TABLE IF NOT EXISTS documents(
  id INTEGER PRIMARY KEY, kind TEXT NOT NULL, owner_user_id INTEGER, deal_id INTEGER, test_drive_id INTEGER,
  path TEXT NOT NULL, original_name TEXT, mime TEXT, created_at TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS chats(
  id INTEGER PRIMARY KEY, session_id TEXT NOT NULL UNIQUE, lang TEXT NOT NULL DEFAULT 'en',
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','awaiting_contact','handed_off','resolved')),
  failures INTEGER NOT NULL DEFAULT 0, customer_id INTEGER, contact TEXT, deal_id INTEGER, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS chat_messages(id INTEGER PRIMARY KEY, chat_id INTEGER NOT NULL, sender TEXT NOT NULL, text TEXT NOT NULL, at TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS ev_checks(
  id INTEGER PRIMARY KEY, customer_id INTEGER, answers TEXT NOT NULL, result TEXT NOT NULL, reasons TEXT NOT NULL, shortlist TEXT NOT NULL, deal_id INTEGER, created_at TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS inspection_items(
  id INTEGER PRIMARY KEY, deal_id INTEGER NOT NULL, item_key TEXT NOT NULL, passed INTEGER NOT NULL DEFAULT 0, notes TEXT, checked_by INTEGER, checked_at TEXT,
  UNIQUE(deal_id, item_key));
CREATE TABLE IF NOT EXISTS registration_docs(
  id INTEGER PRIMARY KEY, deal_id INTEGER NOT NULL, doc_key TEXT NOT NULL, ready INTEGER NOT NULL DEFAULT 0, marked_by INTEGER, marked_at TEXT,
  UNIQUE(deal_id, doc_key));
CREATE TABLE IF NOT EXISTS delivery_bookings(
  id INTEGER PRIMARY KEY, deal_id INTEGER NOT NULL, slot_start TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'booked' CHECK(status IN ('booked','cancelled')),
  reminder_sent INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS ux_delivery_slot ON delivery_bookings(slot_start) WHERE status = 'booked';
CREATE TABLE IF NOT EXISTS handovers(
  id INTEGER PRIMARY KEY, deal_id INTEGER NOT NULL UNIQUE, keys_count INTEGER NOT NULL, notes TEXT, signed_doc_id INTEGER, completed_by INTEGER, completed_at TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS memberships(
  id INTEGER PRIMARY KEY, customer_id INTEGER NOT NULL UNIQUE, card_number TEXT NOT NULL UNIQUE, referral_code TEXT NOT NULL UNIQUE,
  tier TEXT NOT NULL DEFAULT 'Member', credit_balance REAL NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS referrals(
  id INTEGER PRIMARY KEY, referrer_membership_id INTEGER NOT NULL, deal_id INTEGER NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','credited')), credit_usd REAL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS credit_ledger(id INTEGER PRIMARY KEY, membership_id INTEGER NOT NULL, amount REAL NOT NULL, reason TEXT NOT NULL, deal_id INTEGER, at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS owner_events(
  id INTEGER PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('event','early_access')), title_en TEXT NOT NULL, title_ar TEXT,
  description_en TEXT, description_ar TEXT, trim_id INTEGER, starts_on TEXT, created_by INTEGER, created_at TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS outbox(
  id INTEGER PRIMARY KEY, user_id INTEGER, recipient TEXT, channel TEXT NOT NULL CHECK(channel IN ('email','whatsapp')), language TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('transactional','marketing')), template TEXT NOT NULL, subject TEXT, body TEXT NOT NULL,
  attachment_url TEXT, status TEXT NOT NULL DEFAULT 'sent', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS data_requests(
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, type TEXT NOT NULL CHECK(type IN ('export','erasure')),
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','completed')), requested_at TEXT NOT NULL, due_at TEXT NOT NULL,
  completed_at TEXT, handled_by INTEGER, result TEXT);

CREATE TABLE IF NOT EXISTS audit_log(
  id INTEGER PRIMARY KEY, at TEXT NOT NULL, user_id INTEGER, action TEXT NOT NULL, entity TEXT, entity_id TEXT, details TEXT);
CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit_log BEGIN SELECT RAISE(ABORT, 'audit log is read-only'); END;
CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit_log BEGIN SELECT RAISE(ABORT, 'audit log is read-only'); END;

CREATE INDEX IF NOT EXISTS ix_deals_stage ON deals(stage);
CREATE INDEX IF NOT EXISTS ix_deals_customer ON deals(customer_id);
CREATE INDEX IF NOT EXISTS ix_cars_trim ON cars(trim_id, status);
CREATE INDEX IF NOT EXISTS ix_payments_deal ON payments(deal_id);
CREATE TABLE IF NOT EXISTS trim_images(
  id INTEGER PRIMARY KEY, trim_id INTEGER NOT NULL REFERENCES trims(id), color TEXT, file TEXT NOT NULL, mime TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS trade_ins(
  id INTEGER PRIMARY KEY, customer_id INTEGER, deal_id INTEGER, segment TEXT NOT NULL, brand TEXT, model TEXT, year INTEGER NOT NULL, mileage_km INTEGER NOT NULL,
  condition TEXT NOT NULL, est_low REAL NOT NULL, est_high REAL NOT NULL, name TEXT, phone TEXT, email TEXT, language TEXT DEFAULT 'en',
  status TEXT NOT NULL DEFAULT 'estimated' CHECK(status IN ('estimated','requested','offered')), offer_usd REAL, offer_valid_until TEXT, offered_by INTEGER, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS ix_trim_images ON trim_images(trim_id, position);
CREATE INDEX IF NOT EXISTS ix_trims_filter ON trims(brand, body_type, fuel_type, price_usd);
`;

function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  // databases created before F5 lack the check-in column
  if (!db.prepare('PRAGMA table_info(test_drives)').all().some((c) => c.name === 'checked_in_at')) db.exec('ALTER TABLE test_drives ADD COLUMN checked_in_at TEXT');
  return db;
}
module.exports = { openDb };
