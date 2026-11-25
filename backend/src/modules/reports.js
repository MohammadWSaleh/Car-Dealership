const express = require('express');
const clock = require('../clock');
const { round2, bad } = require('../util');

// FR-REP-01..05 : all figures are computed from live data
module.exports = function reports(ctx) {
  const { db, auth, core } = ctx;
  const r = express.Router();
  const BOTH = auth.requireRole('general_manager', 'sales_manager');
  const range = (q, col) => { const from = q.from || '0000-01-01'; const to = (q.to || '9999-12-31') + 'T23:59:59'; return { sql: `${col} >= ? AND ${col} <= ?`, args: [from, to] }; };

  // FR-REP-01 part 1: cars sold and revenue by period, model and fuel type (a car is sold when its contract is signed)
  r.get('/reports/sales', BOTH, (req, res) => {
    const rg = range(req.query, 'c.signed_at');
    const base = `FROM contracts c JOIN quotations q ON q.id = c.quotation_id JOIN trims t ON t.id = q.trim_id JOIN deals d ON d.id = c.deal_id WHERE c.status = 'signed' AND ${rg.sql}`;
    const grp = (expr) => db.prepare(`SELECT ${expr} label, COUNT(*) cars_sold, ROUND(SUM(c.total_usd),2) revenue_usd ${base} GROUP BY label ORDER BY label`).all(...rg.args);
    const totals = db.prepare(`SELECT COUNT(*) cars_sold, COALESCE(ROUND(SUM(c.total_usd),2),0) revenue_usd ${base}`).get(...rg.args);
    res.json({ totals, delivered: db.prepare("SELECT COUNT(*) c FROM deals WHERE stage = 'delivered'").get().c,
      by_month: grp("substr(c.signed_at,1,7)"), by_model: grp("t.brand || ' ' || t.model"), by_fuel: grp('t.fuel_type') });
  });
  // FR-REP-01 part 2: conversion funnel from lead to delivery, and average days from enquiry to contract
  r.get('/reports/funnel', BOTH, (req, res) => {
    const rg = range(req.query, 'd.created_at');
    const reached = (stage) => db.prepare(`SELECT COUNT(DISTINCT d.id) c FROM deals d JOIN deal_history h ON h.deal_id = d.id WHERE h.to_stage = ? AND ${rg.sql}`).get(stage, ...rg.args).c;
    const stages = ['lead', 'quoted', 'reserved', 'contract_signed', 'paid', 'delivered'];
    const counts = stages.map((s) => ({ stage: s, count: reached(s) }));
    const lost = db.prepare(`SELECT COUNT(*) c FROM deals d WHERE d.stage = 'lost' AND ${rg.sql}`).get(...rg.args).c;
    const avg = db.prepare(`SELECT AVG(julianday(h.at) - julianday(d.created_at)) days FROM deals d JOIN deal_history h ON h.deal_id = d.id AND h.to_stage = 'contract_signed' WHERE ${rg.sql}`).get(...rg.args).days;
    const leads = counts[0].count || 0;
    res.json({ stages: counts.map((c) => ({ ...c, percent_of_leads: leads ? round2((c.count / leads) * 100) : 0 })), lost, lead_to_delivery_percent: leads ? round2((counts[5].count / leads) * 100) : 0,
      avg_days_enquiry_to_contract: avg == null ? null : round2(avg) });
  });
  // FR-REP-02
  r.get('/reports/consultants', BOTH, (req, res) => {
    const rows = db.prepare("SELECT id, name FROM users WHERE role = 'sales_consultant' ORDER BY name").all().map((u) => {
      const one = (sql) => db.prepare(sql).get(u.id).c;
      const leads = one('SELECT COUNT(*) c FROM deals WHERE consultant_id = ?');
      const td = one("SELECT COUNT(*) c FROM test_drives t JOIN deals d ON d.id = t.deal_id WHERE d.consultant_id = ? AND t.status != 'cancelled'");
      const deals = one("SELECT COUNT(*) c FROM deals WHERE consultant_id = ? AND stage IN ('reserved','contract_signed','paid','delivered')");
      const won = one("SELECT COUNT(*) c FROM deals WHERE consultant_id = ? AND stage IN ('contract_signed','paid','delivered')");
      return { consultant_id: u.id, name: u.name, leads, test_drives: td, deals, contracts_signed: won, conversion_rate_percent: leads ? round2((won / leads) * 100) : 0 };
    });
    res.json(rows);
  });
  // FR-REP-03
  r.get('/reports/stock', BOTH, (req, res) => {
    const by_status = db.prepare("SELECT status, COUNT(*) count FROM cars WHERE is_demo = 0 GROUP BY status").all();
    const by_trim = db.prepare(`SELECT t.id trim_id, t.brand || ' ' || t.model || ' ' || t.name car,
      SUM(c.status='in_transit') in_transit, SUM(c.status='in_stock') in_stock, SUM(c.status='reserved') reserved, SUM(c.status='sold') sold, SUM(c.status='delivered') delivered
      FROM trims t LEFT JOIN cars c ON c.trim_id = t.id AND c.is_demo = 0 GROUP BY t.id ORDER BY car`).all();
    const aging = db.prepare("SELECT id, vin, trim_id, color, received_at FROM cars WHERE status = 'in_stock' AND is_demo = 0 ORDER BY received_at").all()
      .map((c) => ({ car_id: c.id, vin: c.vin, car: core.trimLabel(core.getTrim(c.trim_id)), color: c.color, age_days: c.received_at ? Math.floor((clock.now() - new Date(c.received_at)) / 86400000) : null }));
    res.json({ by_status, by_trim, unsold_age: aging });
  });
  // FR-REP-04
  r.get('/reports/assistant', BOTH, (req, res) => {
    const c = (sql) => db.prepare(sql).get().c;
    const total = c('SELECT COUNT(*) c FROM chats');
    const handed = c("SELECT COUNT(*) c FROM chats WHERE status = 'handed_off'");
    const resolved = c("SELECT COUNT(*) c FROM chats WHERE status = 'resolved'");
    res.json({ total_chats: total, handed_off: handed, resolved_without_person: resolved, open_or_abandoned: total - handed - resolved,
      resolved_without_person_percent: total ? round2((resolved / total) * 100) : 0 });
  });
  // FR-REP-05
  r.get('/reports/owners-circle', BOTH, (req, res) => {
    const c = (sql) => db.prepare(sql).get().c;
    const delivered = c("SELECT COUNT(*) c FROM deals WHERE stage = 'delivered'");
    const referredDelivered = c("SELECT COUNT(*) c FROM deals d JOIN referrals r ON r.deal_id = d.id WHERE d.stage = 'delivered'");
    res.json({ members: c('SELECT COUNT(*) c FROM memberships'), ambassadors: c("SELECT COUNT(*) c FROM memberships WHERE tier = 'Ambassador'"),
      referrals_total: c('SELECT COUNT(*) c FROM referrals'), referrals_credited: c("SELECT COUNT(*) c FROM referrals WHERE status = 'credited'"),
      credits_issued_usd: round2(db.prepare("SELECT COALESCE(SUM(amount),0) s FROM credit_ledger WHERE reason = 'referral'").get().s),
      credits_used_usd: round2(-db.prepare("SELECT COALESCE(SUM(amount),0) s FROM credit_ledger WHERE reason = 'applied'").get().s),
      sales_from_referrals_percent: delivered ? round2((referredDelivered / delivered) * 100) : 0, delivered_total: delivered });
  });
  return r;
};
