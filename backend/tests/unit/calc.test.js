import { describe, it, expect, beforeAll, afterEach } from 'vitest';
// UNIT TESTS: pure calculation rules (services/calc.js) – no database, no HTTP.
const { installment, yearlyCost, vatSplit, stampDuty, evAssess } = require('../../src/services/calc');

describe('FR-CAT-06 instalment', () => {
  it('level payment: 30000 financed, 8%, 60 months is about 608.29', () => {
    const r = installment({ price: 30000, down: 0, term: 60, ratePercent: 8 });
    expect(r.monthly_usd).toBeCloseTo(608.29, 1);
    expect(r.total_payable_usd).toBeCloseTo(r.monthly_usd * 60, 0);
  });
  it('down payment reduces the financed amount and is added back to the total', () => {
    const r = installment({ price: 30000, down: 10000, term: 48, ratePercent: 8 });
    expect(r.financed).toBe(20000);
    expect(r.total_payable_usd).toBeCloseTo(r.monthly_usd * 48 + 10000, 0);
  });
  it('zero interest divides evenly', () => expect(installment({ price: 12000, down: 0, term: 12, ratePercent: 0 }).monthly_usd).toBe(1000));
  it('interest = total repayment minus financed', () => { const r = installment({ price: 20000, down: 0, term: 36, ratePercent: 9 }); expect(r.total_interest_usd).toBeCloseTo(r.monthly_usd * 36 - 20000, 0); });
  it.each([[-1], [30000], [40000], [NaN]])('rejects down payment %s', (down) => expect(() => installment({ price: 30000, down, term: 60, ratePercent: 8 })).toThrow(/Down payment/));
  it.each([[5], [97], [12.5], [0]])('rejects term %s (boundary 6–96 months)', (term) => expect(() => installment({ price: 30000, down: 0, term, ratePercent: 8 })).toThrow(/Term/));
  it.each([[6], [96]])('accepts boundary term %s', (term) => expect(installment({ price: 30000, down: 0, term, ratePercent: 8 }).term_months).toBe(term));
});

describe('FR-CAT-07 running cost', () => {
  const petrol = { fuel_type: 'petrol', l_per_100km: 8, kwh_per_100km: null };
  const hybrid = { fuel_type: 'hybrid', l_per_100km: 4.5, kwh_per_100km: null };
  const ev = { fuel_type: 'electric', l_per_100km: null, kwh_per_100km: 16 };
  const phev = { fuel_type: 'plug_in_hybrid', l_per_100km: 1.6, kwh_per_100km: 18 };
  it('petrol: 8 L/100 km × 15000 km × 1.1 = 1320', () => expect(yearlyCost(petrol, 15000, 1.1, 0.2)).toBeCloseTo(1320, 5));
  it('hybrid uses fuel only', () => expect(yearlyCost(hybrid, 10000, 1, 0.2)).toBeCloseTo(450, 5));
  it('electric uses electricity only', () => expect(yearlyCost(ev, 10000, 1.1, 0.2)).toBeCloseTo(320, 5));
  it('plug-in hybrid assumes half of the distance on electricity', () => expect(yearlyCost(phev, 10000, 1, 0.2)).toBeCloseTo(0.5 * 160 + 0.5 * 360, 5));
  it('missing consumption data is refused, not guessed', () => { expect(() => yearlyCost({ fuel_type: 'electric', kwh_per_100km: null }, 1000, 1, 1)).toThrow(/Consumption/); expect(() => yearlyCost({ fuel_type: 'plug_in_hybrid', l_per_100km: 1, kwh_per_100km: null }, 1000, 1, 1)).toThrow(/Consumption/); });
  it('cost scales linearly with distance', () => expect(yearlyCost(ev, 20000, 1, 0.2)).toBeCloseTo(2 * yearlyCost(ev, 10000, 1, 0.2), 8));
});

describe('FR-PAY-05 VAT and stamp duty', () => {
  it('price includes 11% VAT: 11,100 → VAT 1,100, net 10,000', () => expect(vatSplit(11100, 11)).toEqual({ vat_amount: 1100, net_usd: 10000 }));
  it('VAT + net always equals the total', () => { for (const [t, r] of [[34900, 11], [24999.99, 11], [100, 0], [100, 20]]) { const s = vatSplit(t, r); expect(s.vat_amount + s.net_usd).toBeCloseTo(t, 2); } });
  it('0% VAT leaves everything net', () => expect(vatSplit(500, 0)).toEqual({ vat_amount: 0, net_usd: 500 }));
  it('stamp duty 0.4% of 35,350 = 141.40', () => expect(stampDuty(35350, 0.4)).toBe(141.4));
  it('stamp duty is rounded to cents', () => expect(stampDuty(33333.33, 0.4)).toBe(133.33));
});

describe('FR-EV-01 readiness rules', () => {
  const base = { km: 40, parking: 'private_garage', homeCharging: true, powerSource: 'solar', budget: 60000, cheapestEv: 34900 };
  it('ideal answers → suitable', () => expect(evAssess(base)).toEqual({ result: 'suitable', reasonKeys: ['all_good'] }));
  it('street parking without home charging → not recommended', () => expect(evAssess({ ...base, parking: 'street', homeCharging: false }).result).toBe('not_recommended'));
  it('no home charging in a garage → needs attention', () => expect(evAssess({ ...base, homeCharging: false }).reasonKeys).toContain('no_home_charging'));
  it('daily distance boundaries: 250 ok, 251 attention, 400 attention, 401 not recommended', () => {
    expect(evAssess({ ...base, km: 250 }).result).toBe('suitable'); expect(evAssess({ ...base, km: 251 }).result).toBe('needs_attention');
    expect(evAssess({ ...base, km: 400 }).result).toBe('needs_attention'); expect(evAssess({ ...base, km: 401 }).result).toBe('not_recommended');
  });
  it('grid-only and generator power need attention when charging at home', () => { expect(evAssess({ ...base, powerSource: 'grid' }).reasonKeys).toContain('grid_only'); expect(evAssess({ ...base, powerSource: 'generator' }).reasonKeys).toContain('generator'); });
  it('budget below the cheapest EV is flagged', () => expect(evAssess({ ...base, budget: 20000 }).reasonKeys).toContain('budget_low'));
  it('a blocker outranks warnings', () => { const r = evAssess({ ...base, km: 500, powerSource: 'grid' }); expect(r.result).toBe('not_recommended'); expect(r.reasonKeys[0]).toBe('very_long_distance'); });
});
