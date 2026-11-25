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
module.exports = { installment, yearlyCost, vatSplit, stampDuty, evAssess };
