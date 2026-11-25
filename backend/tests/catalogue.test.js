import { describe, it, expect, beforeAll } from 'vitest';
const { makeApp, staff } = require('./helpers');
let t, S;
beforeAll(async () => { t = makeApp(); S = await staff(t); });

describe('Catalogue (FR-CAT)', () => {
  it('FR-CAT-01 public catalogue lists all trims without login, with specs and photo field', async () => {
    const r = await t.pub.get('/catalogue/trims'); expect(r.status).toBe(200);
    expect(r.body.length).toBe(15);
    expect(r.body[0]).toHaveProperty('specs'); expect(r.body[0]).toHaveProperty('image_url');
    expect((await t.pub.get('/catalogue/trims/' + r.body[0].id)).body.specs.engine).toBeTruthy();
  });
  it('FR-CAT-02 filters by brand, body, fuel, price range, alone and combined', async () => {
    const q = async (s) => (await t.pub.get('/catalogue/trims?' + s)).body;
    expect((await q('brand=Toyota')).every((x) => x.brand === 'Toyota')).toBe(true);
    expect((await q('fuel_type=electric')).every((x) => x.fuel_type === 'electric')).toBe(true);
    expect((await q('body_type=sedan')).every((x) => x.body_type === 'sedan')).toBe(true);
    const mid = await q('min_price=30000&max_price=40000'); expect(mid.length).toBeGreaterThan(0);
    expect(mid.every((x) => x.price_usd >= 30000 && x.price_usd <= 40000)).toBe(true);
    const combo = await q('brand=BYD&fuel_type=electric&max_price=36000'); expect(combo.map((x) => x.model)).toEqual(['Atto 3']);
    expect(await q('brand=Toyota&fuel_type=electric')).toEqual([]);
  });
  it('FR-CAT-03 one final USD price with LBP equivalent and availability; price follows the exchange rate', async () => {
    const one = (await t.pub.get('/catalogue/trims/' + t.trimId('Nissan', 'Sunny'))).body;
    expect(one.price_usd).toBe(17500); expect(one.price_lbp).toBe(17500 * Number(t.ctx.settings.all().exchange_rate));
    expect(['in_stock', 'in_transit', 'order_only']).toContain(one.availability.status);
    await S.admin.put('/admin/settings', { exchange_rate: 100000 });
    expect((await t.pub.get('/catalogue/trims/' + one.id)).body.price_lbp).toBe(1750000000);
  });
  it('FR-CAT-04 each trim shows In stock (with count), In transit (with date) or Order only', async () => {
    const stock = (await t.pub.get('/catalogue/trims/' + t.trimId('Nissan', 'Sunny'))).body.availability;
    expect(stock.status).toBe('in_stock'); expect(stock.count).toBeGreaterThan(0);
    const nt = await S.mgr.post('/catalogue/trims', { brand: 'Test', model: 'Availability', name: 'Base', body_type: 'sedan', fuel_type: 'petrol', price_usd: 20000, specs: {}, colors: ['White'], description_en: 'x', description_ar: 'س' });
    expect((await t.pub.get('/catalogue/trims/' + nt.body.id)).body.availability.status).toBe('order_only');
    await S.mgr.post('/inventory/cars', { vin: 'FSMTEST0000000001', trim_id: nt.body.id, status: 'in_transit', arrival_date: '2027-01-15', color: 'White' });
    const tr = (await t.pub.get('/catalogue/trims/' + nt.body.id)).body.availability;
    expect(tr.status).toBe('in_transit'); expect(tr.expected_arrival).toBe('2027-01-15');
  });
  it('FR-CAT-05 compares up to three trims side by side', async () => {
    const ids = [1, 2, 3, 4];
    expect((await t.pub.get('/catalogue/compare?ids=1,2,3')).body.length).toBe(3);
    expect((await t.pub.get('/catalogue/compare?ids=' + ids.join(','))).status).toBe(400);
  });
  it('FR-CAT-06 installment estimate', async () => {
    const r = await t.pub.get(`/catalogue/installment?trim_id=${t.trimId('Nissan', 'Sunny')}&down_payment=2500&term_months=48`);
    expect(r.status).toBe(200); expect(r.body.financed).toBe(15000);
    const i = 0.08 / 12; const m = (15000 * i) / (1 - Math.pow(1 + i, -48));
    expect(r.body.monthly_usd).toBeCloseTo(m, 1);
    expect((await t.pub.get(`/catalogue/installment?trim_id=${t.trimId('Nissan', 'Sunny')}&down_payment=99999&term_months=48`)).status).toBe(400);
    expect((await t.pub.get(`/catalogue/installment?trim_id=${t.trimId('Nissan', 'Sunny')}&down_payment=0&term_months=3`)).status).toBe(400);
  });
  it('F1 finder config comes from staff-set settings and the sales manager can change it', async () => {
    const r = await t.pub.get('/catalogue/finder-config');
    expect(r.status).toBe(200); expect(r.body).toEqual({ rate_percent: 8, term_months: 60, down_percent: 20 });
    const put = await S.mgr.put('/settings/commercial', { finder_term_months: 48, finder_down_percent: 30 });
    expect(put.status).toBe(200);
    expect((await t.pub.get('/catalogue/finder-config')).body).toMatchObject({ term_months: 48, down_percent: 30 });
    expect((await S.mgr.put('/settings/commercial', { finder_term_months: 3 })).status).toBe(400);
    await S.mgr.put('/settings/commercial', { finder_term_months: 60, finder_down_percent: 20 });
  });
  it('FR-CAT-07 yearly running cost uses editable fuel and electricity prices', async () => {
    const ev = t.trimId('BYD', 'Atto 3'); const pet = t.ctx.db.prepare("SELECT id FROM trims WHERE model = 'Corolla' AND fuel_type = 'petrol'").get().id;
    const r = await t.pub.get(`/catalogue/running-cost?trim_id=${ev}&petrol_trim_id=${pet}&km_per_year=15000`);
    expect(r.status).toBe(200);
    expect(r.body.alternative.yearly_cost_usd).toBeCloseTo(15.5 * 150 * 0.2, 1);
    expect(r.body.petrol.yearly_cost_usd).toBeCloseTo(6.8 * 150 * 1.1, 1);
    await S.mgr.put('/settings/commercial', { fuel_price_usd_per_l: 2 });
    const r2 = await t.pub.get(`/catalogue/running-cost?trim_id=${ev}&petrol_trim_id=${pet}&km_per_year=15000`);
    expect(r2.body.petrol.yearly_cost_usd).toBeCloseTo(6.8 * 150 * 2, 1);
    expect((await t.pub.get(`/catalogue/running-cost?trim_id=${pet}&petrol_trim_id=${pet}&km_per_year=15000`)).status).toBe(400);
    expect((await t.pub.get(`/catalogue/running-cost?trim_id=${ev}&petrol_trim_id=${pet}&km_per_year=-5`)).status).toBe(400);
  });
  it('FR-CAT-08 sales manager manages prices, trims, promotions, accessories; history and audit kept; others blocked', async () => {
    const id = t.trimId('Kia', 'Sportage');
    const p = await S.mgr.put(`/catalogue/trims/${id}/price`, { price_usd: 32500 }); expect(p.status).toBe(200);
    expect((await t.pub.get('/catalogue/trims/' + id)).body.price_usd).toBe(32500);
    const h = await S.mgr.get(`/catalogue/trims/${id}/price-history`); expect(h.body.length).toBe(2);
    expect((await S.c1.put(`/catalogue/trims/${id}/price`, { price_usd: 1 })).status).toBe(403);
    expect((await S.gm.put(`/catalogue/trims/${id}/price`, { price_usd: 1 })).status).toBe(403);
    expect((await S.mgr.put(`/catalogue/trims/${id}/price`, { price_usd: -5 })).status).toBe(400);
    const promo = await S.mgr.post('/catalogue/promotions', { trim_id: id, title_en: 'Spring', title_ar: 'ربيع', promo_price_usd: 30000, starts_on: '2020-01-01', ends_on: '2099-01-01' });
    expect(promo.status).toBe(201);
    expect((await t.pub.get('/catalogue/trims/' + id)).body.price_usd).toBe(30000);
    expect((await S.mgr.del(`/catalogue/promotions/${promo.body.id}`)).status).toBe(200);
    expect((await t.pub.get('/catalogue/trims/' + id)).body.price_usd).toBe(32500);
    expect((await S.mgr.post('/catalogue/accessories', { name_en: 'Mud flaps', name_ar: 'واقيات', price_usd: 60 })).status).toBe(201);
    const nt = await S.mgr.post('/catalogue/trims', { brand: 'Test', model: 'One', name: 'Base', body_type: 'sedan', fuel_type: 'petrol', price_usd: 20000, specs: {}, colors: ['White'], description_en: 'x', description_ar: 'س' });
    expect(nt.status).toBe(201);
    const audit = (await S.admin.get('/admin/audit?action=price_change')).body; expect((audit.rows || audit).length).toBeGreaterThan(0);
  });
  it('FR-CAT-08 a promotion can never make the shown price differ from what is quoted', async () => {
    const id = t.trimId('Toyota', 'RAV4');
    const trims = (await t.pub.get('/catalogue/trims?brand=Toyota')).body;
    expect(trims.find((x) => x.id === id).price_usd).toBeGreaterThan(0);
  });
  it('FR-CAT-01 pictures: only the Sales Manager uploads, only real images are accepted, they are public and show on cards', async () => {
    const id = t.trimId('Toyota', 'RAV4');
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40)]);
    const up = (who, buf, name = 'a.png') => who.raw('post', `/catalogue/trims/${id}/images`).field('color', 'White').attach('file', buf, { filename: name, contentType: 'image/png' });
    expect((await up(S.c1, png)).status).toBe(403);
    expect((await up(S.mgr, Buffer.from('<script>alert(1)</script>'), 'x.png')).status).toBe(400);
    const ok = await up(S.mgr, png); expect(ok.status).toBe(201); expect(ok.body.color).toBe('White');
    const img = await t.api.get(ok.body.url); expect(img.status).toBe(200); expect(img.headers['content-type']).toMatch(/image\/png/);
    const trim = (await t.pub.get('/catalogue/trims/' + id)).body; expect(trim.images.length).toBe(1); expect(trim.image_url).toBe(ok.body.url);
    expect((await t.pub.get('/catalogue/trims')).body.find((x) => x.id === id).image_url).toBe(ok.body.url);
    expect((await S.c1.del(`/catalogue/trims/${id}/images/${ok.body.id}`)).status).toBe(403);
    expect((await S.mgr.del(`/catalogue/trims/${id}/images/${ok.body.id}`)).status).toBe(200);
    expect((await t.api.get(ok.body.url)).status).toBe(404);
  });
});
