// Demo data. `npm run seed` (add -- --reset to start from an empty database).
// Base data (users, catalogue, accessories, stock) is inserted directly; the sales scenarios then run through the real API,
// so every rule (reservation, VAT, receipts, audit log...) is exercised exactly as in normal use.
const http = require('http');
const bcrypt = require('bcryptjs');
const clock = require('./clock');

const PASSWORD = 'Fsm@2026!';
const COLORS = ['White', 'Black', 'Silver', 'Blue', 'Red', 'Grey'];
const day = 86400000;

const TRIMS = [
  // brand, model, name, body, fuel, price, range, kwh battery, l/100, kwh/100, specs, desc_en, desc_ar
  ['Toyota', 'Corolla', '1.6 Comfort', 'sedan', 'petrol', 24900, null, null, 6.8, null, { engine: '1.6 L petrol', power_hp: 122, transmission: 'CVT', drivetrain: 'FWD', seats: 5, trunk_l: 470, warranty_years: 3 }, 'The reliable family sedan with low running costs.', 'سيارة عائلية موثوقة وبتكاليف تشغيل منخفضة.'],
  ['Toyota', 'Corolla', 'Hybrid 1.8', 'sedan', 'hybrid', 29900, null, null, 4.3, null, { engine: '1.8 L hybrid', power_hp: 140, transmission: 'e-CVT', drivetrain: 'FWD', seats: 5, trunk_l: 361, warranty_years: 3 }, 'Hybrid efficiency with no plug and no range worries.', 'كفاءة هجينة بدون شاحن وبدون قلق من المدى.'],
  ['Toyota', 'RAV4', '2.0 Executive', 'suv', 'petrol', 38500, null, null, 8.1, null, { engine: '2.0 L petrol', power_hp: 175, transmission: 'CVT', drivetrain: 'AWD', seats: 5, trunk_l: 580, warranty_years: 3 }, 'A spacious all-wheel-drive SUV for every road.', 'سيارة دفع رباعي واسعة لكل الطرق.'],
  ['Toyota', 'RAV4', 'Hybrid 2.5', 'suv', 'hybrid', 44900, null, null, 5.0, null, { engine: '2.5 L hybrid', power_hp: 222, transmission: 'e-CVT', drivetrain: 'AWD', seats: 5, trunk_l: 580, warranty_years: 3 }, 'Strong hybrid power with SUV space.', 'قوة هجينة مع مساحة سيارة دفع رباعي.'],
  ['Hyundai', 'Tucson', '1.6 Turbo', 'suv', 'petrol', 33900, null, null, 7.9, null, { engine: '1.6 L turbo', power_hp: 180, transmission: '7-speed DCT', drivetrain: 'FWD', seats: 5, trunk_l: 620, warranty_years: 5 }, 'Bold design, generous equipment, 5-year warranty.', 'تصميم جريء وتجهيزات غنية وضمان 5 سنوات.'],
  ['Hyundai', 'Tucson', 'Plug-in Hybrid', 'suv', 'plug_in_hybrid', 46900, 62, 13.8, 1.6, 18.0, { engine: '1.6 L turbo + e-motor', power_hp: 265, transmission: '6-speed auto', drivetrain: 'AWD', seats: 5, trunk_l: 558, warranty_years: 5 }, 'Drive electric on short trips, petrol for long ones.', 'قيادة كهربائية للمشاوير القصيرة وبنزين للطويلة.'],
  ['Hyundai', 'Ioniq 5', 'Long Range', 'suv', 'electric', 49900, 480, 77.4, null, 17.0, { engine: 'Electric motor', power_hp: 228, transmission: 'Single speed', drivetrain: 'RWD', seats: 5, trunk_l: 527, warranty_years: 5 }, 'Fast-charging electric crossover with a lounge-like cabin.', 'كروس أوفر كهربائية بشحن سريع ومقصورة مريحة.'],
  ['Kia', 'Sportage', '2.0 GT-Line', 'suv', 'petrol', 31900, null, null, 8.0, null, { engine: '2.0 L petrol', power_hp: 155, transmission: '6-speed auto', drivetrain: 'FWD', seats: 5, trunk_l: 591, warranty_years: 5 }, 'Sharp looks and a roomy, well-equipped cabin.', 'مظهر أنيق ومقصورة واسعة ومجهزة جيدًا.'],
  ['Kia', 'EV6', 'Standard Range', 'suv', 'electric', 47900, 430, 77.0, null, 17.5, { engine: 'Electric motor', power_hp: 229, transmission: 'Single speed', drivetrain: 'RWD', seats: 5, trunk_l: 490, warranty_years: 5 }, 'Sporty electric crossover with ultra-fast charging.', 'كروس أوفر كهربائية رياضية بشحن فائق السرعة.'],
  ['Nissan', 'Sunny', '1.6 SV', 'sedan', 'petrol', 17500, null, null, 6.4, null, { engine: '1.6 L petrol', power_hp: 118, transmission: 'CVT', drivetrain: 'FWD', seats: 5, trunk_l: 510, warranty_years: 3 }, 'An affordable, dependable sedan for city life.', 'سيارة سيدان اقتصادية وموثوقة لحياة المدينة.'],
  ['BYD', 'Atto 3', 'Comfort', 'suv', 'electric', 34900, 420, 60.5, null, 15.5, { engine: 'Electric motor', power_hp: 204, transmission: 'Single speed', drivetrain: 'FWD', seats: 5, trunk_l: 440, warranty_years: 6 }, 'A well-priced electric SUV with a long warranty.', 'سيارة كهربائية بسعر مناسب وضمان طويل.'],
  ['BYD', 'Seal', 'Design', 'sedan', 'electric', 41900, 510, 82.5, null, 15.0, { engine: 'Electric motor', power_hp: 313, transmission: 'Single speed', drivetrain: 'RWD', seats: 5, trunk_l: 400, warranty_years: 6 }, 'A sleek electric sedan with very long range.', 'سيدان كهربائية أنيقة بمدى طويل جدًا.'],
  ['MG', 'ZS EV', 'Comfort', 'suv', 'electric', 29500, 320, 51.0, null, 17.5, { engine: 'Electric motor', power_hp: 174, transmission: 'Single speed', drivetrain: 'FWD', seats: 5, trunk_l: 470, warranty_years: 5 }, 'The most accessible way into electric driving.', 'أسهل طريق لبدء القيادة الكهربائية.'],
  ['Volkswagen', 'ID.4', 'Pro', 'suv', 'electric', 43500, 520, 77.0, null, 16.5, { engine: 'Electric motor', power_hp: 204, transmission: 'Single speed', drivetrain: 'RWD', seats: 5, trunk_l: 543, warranty_years: 4 }, 'Practical, spacious and quiet electric SUV.', 'سيارة كهربائية عملية وواسعة وهادئة.'],
  ['Mercedes-Benz', 'C-Class', 'C 200', 'sedan', 'petrol', 52900, null, null, 6.9, null, { engine: '1.5 L mild hybrid petrol', power_hp: 204, transmission: '9G-Tronic', drivetrain: 'RWD', seats: 5, trunk_l: 455, warranty_years: 3 }, 'Executive comfort and technology in a compact sedan.', 'راحة وتقنية فاخرة في سيدان مدمجة.'],
];
const ACCESSORIES = [['Floor mats set', 'طقم دعسات', 120], ['Roof rails', 'قضبان سقف', 250], ['Window tint', 'تظليل زجاج', 300], ['Dash camera', 'كاميرا أمامية', 180],
  ['Home EV wall charger (7 kW)', 'شاحن منزلي للسيارة الكهربائية (7 كيلوواط)', 750], ['Tow bar', 'سحب قطر', 400], ['Premium audio upgrade', 'تحسين نظام الصوت', 650], ['Ceramic paint protection', 'حماية سيراميك للطلاء', 450]];

function seedBase(ctx) {
  const { db, auth } = ctx; const now = clock.now();
  const addUser = (name, email, role, extra = {}) => db.prepare(`INSERT INTO users(name,email,phone,password_hash,role,language,notify_pref,consent_data_at,consent_marketing,consent_marketing_at)
    VALUES(?,?,?,?,?,?,?,?,?,?)`).run(name, email, extra.phone || null, bcrypt.hashSync(PASSWORD, 8), role, extra.language || 'en', extra.notify || 'email', now.toISOString(), extra.marketing ? 1 : 0, extra.marketing ? now.toISOString() : null).lastInsertRowid;
  const ids = {};
  ids.admin = addUser('Nadine Khoury', 'admin@fsm.lb', 'administrator');
  ids.manager = addUser('Samir Haddad', 'manager@fsm.lb', 'sales_manager');
  ids.c1 = addUser('Layla Mansour', 'consultant1@fsm.lb', 'sales_consultant', { phone: '+96170111001' });
  ids.c2 = addUser('Omar Saab', 'consultant2@fsm.lb', 'sales_consultant', { phone: '+96170111002' });
  ids.gm = addUser('Rita Aoun', 'gm@fsm.lb', 'general_manager');
  ids.acc = addUser('Hassan Daher', 'accountant@fsm.lb', 'accountant');
  ids.del = addUser('Maya Fares', 'delivery@fsm.lb', 'delivery_coordinator');
  ids.cust = addUser('Karim Nassar', 'customer@fsm.lb', 'customer', { phone: '+96171222333', marketing: true });
  ids.owner = addUser('Rami Haddad', 'owner@fsm.lb', 'customer', { phone: '+96103444555', language: 'ar', notify: 'whatsapp', marketing: true });
  ids.cust2 = addUser('Joumana Karam', 'customer2@fsm.lb', 'customer', { phone: '+96176555666' });

  const insTrim = db.prepare(`INSERT INTO trims(brand,model,name,body_type,fuel_type,price_usd,specs,colors,range_km,battery_kwh,l_per_100km,kwh_per_100km,description_en,description_ar) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const trimIds = {};
  TRIMS.forEach((t) => {
    const id = insTrim.run(t[0], t[1], t[2], t[3], t[4], t[5], JSON.stringify(t[10]), JSON.stringify(COLORS), t[6], t[7], t[8], t[9], t[11], t[12]).lastInsertRowid;
    trimIds[`${t[0]} ${t[1]} ${t[2]}`] = id;
    db.prepare('INSERT INTO price_history(trim_id,old_price,new_price,changed_by,changed_at) VALUES(?,?,?,?,?)').run(id, null, t[5], ids.manager, now.toISOString());
  });
  const insAcc = db.prepare('INSERT INTO accessories(name_en,name_ar,price_usd) VALUES(?,?,?)');
  ACCESSORIES.forEach((a) => insAcc.run(a[0], a[1], a[2]));

  // stock: a demo car for test drives on every trim, plus sale stock in the three statuses
  let n = 0; const vin = () => `FSM1${String(++n).padStart(8, '0')}K`;
  const insCar = db.prepare('INSERT INTO cars(vin,trim_id,color,status,arrival_date,received_at,is_demo) VALUES(?,?,?,?,?,?,?)');
  const ago = (d) => new Date(now.getTime() - d * day).toISOString();
  const ymd = (d) => new Date(now.getTime() + d * day).toISOString().slice(0, 10);
  const keys = Object.keys(trimIds);
  keys.forEach((k, i) => {
    insCar.run(vin(), trimIds[k], 'White', 'in_stock', null, ago(200), 1);
    const stock = [4, 3, 3, 2, 3, 2, 2, 3, 1, 5, 3, 2, 1, 2, 1][i];
    for (let s = 0; s < stock; s++) insCar.run(vin(), trimIds[k], COLORS[(i + s) % COLORS.length], 'in_stock', null, ago(s === 0 && i % 5 === 0 ? 120 : 3 + s * 9 + i), 0);
    if ([1, 6, 8, 11].includes(i)) insCar.run(vin(), trimIds[k], COLORS[(i + 2) % COLORS.length], 'in_transit', ymd(10 + i), null, 0);
    if ([12, 13].includes(i)) insCar.run(vin(), trimIds[k], 'Blue', 'in_transit', ymd(25 + i), null, 0);
  });
  db.prepare("INSERT INTO promotions(trim_id,title_en,title_ar,description_en,description_ar,promo_price_usd,starts_on,ends_on,active,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,1,?,?)")
    .run(trimIds['Toyota Corolla Hybrid 1.8'], 'Hybrid month', 'شهر الهجين', 'Corolla Hybrid at a special fixed price.', 'كورولا هجينة بسعر ثابت خاص.', 28900, ymd(-5), ymd(30), ids.manager, now.toISOString());
  return { ids, trimIds };
}

// ---- tiny API client used by the scenarios ----
function client(server) {
  const base = `http://127.0.0.1:${server.address().port}/api`;
  return async function call(method, path, { token, body, form } = {}) {
    const headers = {}; let payload;
    if (token) headers.Authorization = `Bearer ${token}`;
    if (form) payload = form; else if (body) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
    const res = await fetch(base + path, { method, headers, body: payload });
    const type = res.headers.get('content-type') || '';
    const data = type.includes('json') ? await res.json() : null;
    if (res.status >= 400) throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(data)}`);
    return data;
  };
}
const pdfForm = (extra = {}) => { const f = new FormData(); f.append('file', new Blob(['%PDF-1.4\n% seed signed copy\n%%EOF'], { type: 'application/pdf' }), 'signed.pdf'); Object.entries(extra).forEach(([k, v]) => f.append(k, v)); return f; };

async function seedScenarios({ app, ctx }, base) {
  const { db } = ctx; const { trimIds } = base;
  const server = http.createServer(app); await new Promise((r) => server.listen(0, r));
  const call = client(server);
  const login = async (email) => (await call('POST', '/auth/login', { body: { email, password: PASSWORD } })).token;
  const [c1, c2, mgr, acc, del, cust, owner] = await Promise.all(['consultant1@fsm.lb', 'consultant2@fsm.lb', 'manager@fsm.lb', 'accountant@fsm.lb', 'delivery@fsm.lb', 'customer@fsm.lb', 'owner@fsm.lb'].map(login));
  const trim = (k) => trimIds[k];
  // colours actually in stock (so a deal can be allocated a car) and one colour with no stock (a deal that waits)
  const stockColor = (k, skip = 0) => db.prepare("SELECT color FROM cars WHERE trim_id = ? AND status = 'in_stock' AND is_demo = 0 ORDER BY received_at, id").all(trim(k))[skip].color;
  const missingColor = (k) => COLORS.find((c) => !db.prepare("SELECT 1 FROM cars WHERE trim_id = ? AND color = ? AND status IN ('in_stock','reserved','sold') AND is_demo = 0").get(trim(k), c));
  const shifted = [];

  // helper: walk a deal up to a chosen point
  async function sale({ consultantToken, name, email, phone, trimKey, color: wantedColor, accessories = [1], deposit = 1500, upTo = 'paid', customerToken, referral_code, lang = 'en', pay = 'full', source = 'walk_in' }) {
    const color = wantedColor === 'wait' ? missingColor(trimKey) : stockColor(trimKey);
    const lead = await call('POST', '/leads', { token: consultantToken, body: { name, email, phone, trim_id: trim(trimKey), color, consent_data: true, source, referral_code, language: lang } });
    const id = lead.id; if (upTo === 'lead') return id;
    await call('POST', `/deals/${id}/quotation`, { token: consultantToken, body: { color, accessory_ids: accessories } });
    if (upTo === 'quoted') return id;
    await call('POST', '/payments', { token: consultantToken, body: { deal_id: id, kind: 'deposit', amount: deposit, currency: 'USD', method: 'cash', reference: 'Showroom' } });
    if (upTo === 'reserved') return id;
    const contract = await call('POST', `/deals/${id}/contract`, { token: consultantToken, body: { deposit_rule: 'partial_refund', partial_percent: 50 } });
    if (upTo === 'contract_pending') return id;
    if (customerToken) await call('POST', `/contracts/${contract.id}/sign`, { token: customerToken, body: { typed_name: name, accept: true } });
    else await call('POST', `/contracts/${contract.id}/signed-copy`, { token: consultantToken, form: pdfForm() });
    if (upTo === 'contract_signed') return id;
    const d = await call('GET', `/deals/${id}`, { token: consultantToken });
    const rest = pay === 'full' ? d.financials.balance_usd : Math.round(d.financials.balance_usd / 2);
    await call('POST', '/payments', { token: acc, body: { deal_id: id, kind: 'payment', amount: rest, currency: 'USD', method: pay === 'full' ? 'bank_transfer' : 'cheque', reference: 'Bank ref' } });
    if (pay === 'full') await call('POST', `/deals/${id}/invoice`, { token: acc });
    return id;
  }
  async function deliver(id) {
    for (const k of ['exterior', 'interior', 'mechanical', 'tires', 'electronics', 'keys_manuals']) await call('PUT', `/delivery/deals/${id}/inspection/${k}`, { token: del, body: { passed: true } });
    await call('POST', `/delivery/deals/${id}/handover`, { token: del, form: pdfForm({ keys_count: '2', notes: 'Handed over at the showroom' }) });
  }

  // A. a delivered sale: Owners Circle member Rami (Arabic, WhatsApp) with a referral code and a credit-earning referral waiting
  const dealA = await sale({ consultantToken: c1, name: 'Rami Haddad', email: 'owner@fsm.lb', phone: '+96103444555', trimKey: 'Toyota RAV4 Hybrid 2.5', color: 'Black', accessories: [1, 2, 4], deposit: 3000, customerToken: owner, lang: 'ar' });
  await deliver(dealA); shifted.push([dealA, 70]);
  const myCircle = await call('GET', '/me/owners-circle', { token: owner });
  await call('POST', '/owners-circle/events', { token: mgr, body: { kind: 'event', title_en: 'Owners weekend drive', title_ar: 'رحلة نهاية الأسبوع للمالكين', description_en: 'Join a scenic group drive and lunch on Saturday.', description_ar: 'انضم إلى رحلة جماعية وغداء يوم السبت.', starts_on: new Date(Date.now() + 14 * day).toISOString().slice(0, 10) } });
  await call('POST', '/owners-circle/events', { token: mgr, body: { kind: 'early_access', title_en: 'Early access: new electric arrivals', title_ar: 'وصول مبكر: سيارات كهربائية جديدة', description_en: 'Owners can reserve the new arrivals one week before everyone else.', description_ar: 'يمكن للمالكين حجز السيارات الجديدة قبل الجميع بأسبوع.' } });

  // B. a referred buyer finishing (credit is added to Rami on delivery)
  const dealB = await sale({ consultantToken: c2, name: 'Nadim Sleiman', email: 'nadim@example.com', phone: '+96171000111', trimKey: 'Hyundai Ioniq 5 Long Range', color: 'Blue', accessories: [5], deposit: 2500, referral_code: myCircle.referral_code });
  await deliver(dealB); shifted.push([dealB, 40]);

  // C. historical sales so the dashboards show a trend
  const hist = [['Toyota Corolla 1.6 Comfort', 'Silver', 150, c1], ['Toyota Corolla Hybrid 1.8', 'White', 125, c2], ['Hyundai Tucson 1.6 Turbo', 'Grey', 100, c1], ['BYD Atto 3 Comfort', 'White', 95, c2],
    ['Kia Sportage 2.0 GT-Line', 'Black', 65, c1], ['Nissan Sunny 1.6 SV', 'White', 55, c2], ['MG ZS EV Comfort', 'Red', 45, c1], ['BYD Seal Design', 'Blue', 20, c2], ['Mercedes-Benz C-Class C 200', 'Black', 12, c1], ['Toyota RAV4 2.0 Executive', 'Silver', 8, c2]];
  let h = 0;
  for (const [k, color, back, tok] of hist) { h++; const id = await sale({ consultantToken: tok, name: `Buyer ${h}`, email: `buyer${h}@example.com`, phone: `+9617100${String(h).padStart(4, '0')}`, trimKey: k, color, accessories: h % 2 ? [1] : [1, 3], deposit: 1000 }); shifted.push([id, back]); if (back > 30) { await deliver(id); } }

  // D. Karim (customer portal demo): a reserved deal with a contract to sign, a quoted EV deal and a booked test drive
  const dealD = await sale({ consultantToken: c1, name: 'Karim Nassar', email: 'customer@fsm.lb', phone: '+96171222333', trimKey: 'Kia Sportage 2.0 GT-Line', color: 'Red', accessories: [1, 7], deposit: 2000, upTo: 'contract_pending' });
  await sale({ consultantToken: c1, name: 'Karim Nassar', email: 'customer@fsm.lb', phone: '+96171222333', trimKey: 'BYD Atto 3 Comfort', color: 'Grey', accessories: [5], upTo: 'quoted', source: 'walk_in' });
  for (let i = 1; i <= 7; i++) { // first day the showroom is open
    const d = new Date(Date.now() + i * day); const slot = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} 10:00`;
    try { await call('POST', '/testdrives', { token: cust, body: { trim_id: trim('BYD Atto 3 Comfort'), slot_start: slot } }); break; } catch { /* closed day */ }
  }

  // E. in-progress deals for the staff screens: signed and part-paid, waiting for a car, pending exception, pending refund, lost, new leads, chat
  const dealE = await sale({ consultantToken: c2, name: 'Tarek Younes', email: 'tarek@example.com', phone: '+96170777888', trimKey: 'Hyundai Tucson Plug-in Hybrid', color: 'Silver', accessories: [1], deposit: 2500, upTo: 'paid', pay: 'half' });
  await call('PUT', `/delivery/deals/${dealE}/inspection/exterior`, { token: del, body: { passed: true } });
  await call('PUT', `/delivery/deals/${dealE}/inspection/interior`, { token: del, body: { passed: true } });
  const dealF = await sale({ consultantToken: c1, name: 'Hala Rizk', email: 'hala@example.com', phone: '+96170999000', trimKey: 'Toyota Corolla Hybrid 1.8', color: 'wait', accessories: [1], deposit: 1200, upTo: 'reserved' }); // colour with no stock in stock: waits for arrival
  const dealG = await sale({ consultantToken: c1, name: 'Elie Abboud', email: 'elie@example.com', phone: '+96170123123', trimKey: 'Volkswagen ID.4 Pro', color: 'Blue', upTo: 'quoted' });
  await call('POST', `/quotations/${(await call('GET', `/deals/${dealG}/quotation`, { token: c1 })).id}/items`, { token: c1, body: { description: 'Custom two-tone paint', price_usd: 900 } });
  const dealH = await sale({ consultantToken: c2, name: 'Sara Moussa', email: 'sara@example.com', phone: '+96170456456', trimKey: 'Nissan Sunny 1.6 SV', color: 'White', upTo: 'quoted' });
  await call('POST', `/deals/${dealH}/lost`, { token: c2, body: { reason: 'Bought a cheaper used car elsewhere' } });
  const pay = (await call('GET', `/payments?deal_id=${dealD}`, { token: acc }))[0];
  await call('POST', `/payments/${pay.id}/refund`, { token: acc, body: { amount: 500, reason: 'Customer asked to reduce the deposit' } });
  await call('POST', '/leads', { body: { name: 'Walid Chehab', email: 'walid@example.com', trim_id: trim('Kia EV6 Standard Range'), message: 'Do you offer a home charger installation?', consent_data: true, language: 'en' } });
  await call('POST', '/leads', { body: { name: 'Dana Farah', phone: '+96178222111', trim_id: trim('Toyota RAV4 2.0 Executive'), message: 'Interested in a quotation', consent_data: true, consent_marketing: true, language: 'ar' } });
  const ev = await call('POST', '/ev/check', { body: { daily_km: 60, parking: 'private_garage', home_charging: true, power_source: 'solar', budget_usd: 50000, lang: 'en' } });
  await call('POST', `/ev/check/${ev.id}/send-to-consultant`, { body: { name: 'Zeina Hamdan', email: 'zeina@example.com', consent_data: true } });
  const chat1 = await call('POST', '/assistant/chat', { body: { message: 'How much is the BYD Atto 3?', lang: 'en' } });
  await call('POST', '/assistant/chat', { body: { session_id: chat1.session_id, message: 'Thanks!', lang: 'en' } });
  const chat2 = await call('POST', '/assistant/chat', { body: { message: 'I want to talk to an agent', lang: 'en' } });
  await call('POST', '/assistant/chat', { body: { session_id: chat2.session_id, message: 'Maged Ibrahim maged@example.com', lang: 'en' } });
  await call('POST', '/assistant/chat', { body: { message: 'ما سعر تويوتا كورولا؟', lang: 'ar' } });

  // spread the historical deals over the last months so reports show a trend
  const sh = db.prepare(`UPDATE deals SET created_at = strftime('%Y-%m-%dT%H:%M:%SZ', created_at, ?), updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', updated_at, ?) WHERE id = ?`);
  const tables = [['deal_history', 'deal_id', 'at'], ['quotations', 'deal_id', 'created_at'], ['quotations', 'deal_id', 'valid_until'], ['contracts', 'deal_id', 'created_at'], ['contracts', 'deal_id', 'signed_at'], ['payments', 'deal_id', 'created_at'], ['invoices', 'deal_id', 'created_at'], ['inspection_items', 'deal_id', 'checked_at'], ['handovers', 'deal_id', 'completed_at']];
  for (const [id, back] of shifted) {
    const off = `-${back} days`; sh.run(off, off, id);
    for (const [t, k, c] of tables) db.prepare(`UPDATE ${t} SET ${c} = strftime('%Y-%m-%dT%H:%M:%SZ', ${c}, ?) WHERE ${k} = ? AND ${c} IS NOT NULL`).run(off, id);
    db.prepare("UPDATE deals SET price_locked_until = strftime('%Y-%m-%dT%H:%M:%SZ', price_locked_until, ?) WHERE id = ? AND price_locked_until IS NOT NULL").run(off, id);
  }
  // a couple of unsold cars have been waiting for a long time (stock alert demo)
  db.prepare("UPDATE cars SET received_at = strftime('%Y-%m-%dT%H:%M:%SZ','now','-130 days') WHERE id IN (SELECT id FROM cars WHERE status = 'in_stock' AND is_demo = 0 ORDER BY id LIMIT 2)").run();
  await new Promise((r) => server.close(r));
  return { dealA, dealD, dealE, dealF };
}

async function seed({ app, ctx }) {
  const base = seedBase(ctx);
  await seedScenarios({ app, ctx }, base);
  ctx.jobs.stockAlerts();
  console.log(`Demo data ready. Staff and customer accounts use the password ${PASSWORD}`);
}
module.exports = { seed, seedBase, PASSWORD, COLORS };

if (require.main === module) {
  const fs = require('fs'); const config = require('./config');
  if (process.argv.includes('--reset')) for (const ext of ['', '-wal', '-shm']) fs.rmSync(config.dbPath + ext, { force: true });
  const { createApp } = require('./app'); const { app, ctx } = createApp({ rateLimit: false });
  if (ctx.db.prepare('SELECT COUNT(*) c FROM users').get().c) { console.log('The database already has data. Use: npm run seed -- --reset'); process.exit(0); }
  seed({ app, ctx }).then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}
