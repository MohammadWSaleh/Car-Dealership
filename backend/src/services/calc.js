// Pure calculation rules (no database, no clock) so they can be unit-tested on their own.
const { round2, bad } = require('../util');

// FR-CAT-06: annual rate in percent, level monthly payment
function installment({ price, down, term, ratePercent }) {
  if (!Number.isFinite(down) || down < 0 || down >= price) throw bad('invalid_down_payment', 'Down payment must be between 0 and the price');
  if (!Number.isInteger(term) || term < 6 || term > 96) throw bad('invalid_term', 'Term must be between 6 and 96 months');
  const financed = price - down; const i = ratePercent / 100 / 12;
  const monthly = i === 0 ? financed / term : (financed * i) / (1 - Math.pow(1 + i, -term));
  return { price_usd: round2(price), down_payment: round2(down), financed: round2(financed), term_months: term, yearly_rate_percent: ratePercent,
    monthly_usd: round2(monthly), total_payable_usd: round2(monthly * term + down), total_interest_usd: round2(monthly * term - financed) };
}

// FR-CAT-07: yearly running cost; a plug-in hybrid is assumed to drive half of the distance on electricity
function yearlyCost(t, km, fuelPrice, elecPrice) {
  const petrol = t.l_per_100km != null ? ((t.l_per_100km * km) / 100) * fuelPrice : null;
  const elec = t.kwh_per_100km != null ? ((t.kwh_per_100km * km) / 100) * elecPrice : null;
  const missing = () => bad('missing_consumption', 'Consumption data is missing for this trim');
  if (t.fuel_type === 'electric') { if (elec == null) throw missing(); return elec; }
  if (t.fuel_type === 'plug_in_hybrid') { if (petrol == null || elec == null) throw missing(); return 0.5 * petrol + 0.5 * elec; }
  if (petrol == null) throw missing();
  return petrol;
}

// FR-PAY-05: the displayed price already contains VAT
function vatSplit(total, ratePercent) {
  const vat = round2((total * ratePercent) / (100 + ratePercent));
  return { vat_amount: vat, net_usd: round2(total - vat) };
}
const stampDuty = (total, percent) => round2((total * percent) / 100);

// FR-EV-01: readiness result from the customer's answers
function evAssess({ km, parking, homeCharging, powerSource, budget, cheapestEv }) {
  const blockers = []; const warnings = [];
  if (!homeCharging && parking === 'street') blockers.push('no_home_charging_street');
  else if (!homeCharging) warnings.push('no_home_charging');
  if (km > 400) blockers.push('very_long_distance'); else if (km > 250) warnings.push('long_distance');
  if (homeCharging && powerSource === 'grid') warnings.push('grid_only');
  if (homeCharging && powerSource === 'generator') warnings.push('generator');
  if (cheapestEv != null && budget < cheapestEv) warnings.push('budget_low');
  const result = blockers.length ? 'not_recommended' : warnings.length ? 'needs_attention' : 'suitable';
  return { result, reasonKeys: result === 'suitable' ? ['all_good'] : [...blockers, ...warnings] };
}
// F2: cumulative cost of an electric car against a petrol car over `years` (purchase price plus running cost)
function evSavings({ ev, evPrice, petrol, petrolPrice, km, years, fuelPrice, elecPrice }) {
  const yEv = yearlyCost(ev, km, fuelPrice, elecPrice); const yP = yearlyCost(petrol, km, fuelPrice, elecPrice);
  const series = []; for (let y = 0; y <= years; y++) series.push({ year: y, ev_total: round2(evPrice + yEv * y), petrol_total: round2(petrolPrice + yP * y) });
  const saving = yP - yEv; let breakEven = null;
  if (evPrice <= petrolPrice) breakEven = 0; else if (saving > 0) breakEven = round2((evPrice - petrolPrice) / saving);
  return { yearly_ev: round2(yEv), yearly_petrol: round2(yP), yearly_saving: round2(saving), series, break_even_years: breakEven,
    total_saving: round2(series[years].petrol_total - series[years].ev_total) };
}

// F4: trade-in value range from a simple, staff-tunable formula (never a promise: a consultant confirms the offer)
const CONDITION = { excellent: 1.05, good: 1, fair: 0.88, poor: 0.72 };
function tradeInEstimate({ base, age, mileage, condition, agePercent, rangePercent }) {
  if (!(condition in CONDITION)) throw bad('invalid_condition', 'Condition must be excellent, good, fair or poor');
  const ageF = Math.pow(1 - agePercent / 100, age);
  const mileF = Math.min(1.1, Math.max(0.7, 1 - (mileage - age * 15000) / 400000)); // 15,000 km a year is normal
  const mid = base * ageF * mileF * CONDITION[condition];
  const r50 = (v) => Math.max(0, Math.round(v / 50) * 50);
  return { low: r50(mid * (1 - rangePercent / 100)), high: r50(mid * (1 + rangePercent / 100)) };
}

// F6: estimated delivery date from what is known about the car and the booking
function deliveryEta({ now, bookingSlot, carStatus, arrivalDate, stockDays, orderDays }) {
  const add = (d, n) => { const x = new Date(d.getTime()); x.setDate(x.getDate() + n); return x; };
  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  if (bookingSlot) return { date: String(bookingSlot).slice(0, 10), basis: 'booked' };
  if (['in_stock', 'reserved', 'sold'].includes(carStatus)) return { date: ymd(add(now, stockDays)), basis: 'in_stock' };
  if (carStatus === 'in_transit' && arrivalDate) { const a = new Date(`${arrivalDate}T12:00:00`); return { date: ymd(add(a > now ? a : now, stockDays)), basis: 'in_transit' }; }
  return { date: ymd(add(now, orderDays)), basis: 'order' };
}
module.exports = { evSavings, tradeInEstimate, deliveryEta, installment, yearlyCost, vatSplit, stampDuty, evAssess };
