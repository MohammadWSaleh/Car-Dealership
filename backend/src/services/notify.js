const clock = require('../clock');
const { dmy, usd } = require('../util');

// FR-NOT-01 / FR-NOT-02. Messages go to a simulated outbox (email or WhatsApp, per the user's preference, in the user's
// language). A real provider can be plugged in at `deliver()` without touching any module (system evolution, Table 26).
const T = {
  booking_confirmation: {
    en: (p) => ({ subject: 'Test drive confirmed', body: `Your test drive of the ${p.car} is booked for ${p.slot}. Booking code: ${p.code}. Please bring your driving license.` }),
    ar: (p) => ({ subject: 'تأكيد موعد التجربة', body: `تم حجز تجربة قيادة ${p.car} بتاريخ ${p.slot}. رمز الحجز: ${p.code}. يرجى إحضار رخصة القيادة.` }),
  },
  booking_reminder: {
    en: (p) => ({ subject: 'Test drive reminder', body: `Reminder: your test drive of the ${p.car} is tomorrow at ${p.slot}. Booking code: ${p.code}.` }),
    ar: (p) => ({ subject: 'تذكير بموعد التجربة', body: `تذكير: تجربة قيادة ${p.car} غدًا في ${p.slot}. رمز الحجز: ${p.code}.` }),
  },
  booking_cancelled: {
    en: (p) => ({ subject: 'Test drive cancelled', body: `Your test drive booking ${p.code} was cancelled and the slot is free again.` }),
    ar: (p) => ({ subject: 'إلغاء موعد التجربة', body: `تم إلغاء حجز تجربة القيادة ${p.code} وأصبح الموعد متاحًا.` }),
  },
  quotation_ready: {
    en: (p) => ({ subject: `Quotation ${p.number}`, body: `Your quotation ${p.number} for the ${p.car} is ready: total ${usd(p.total)}. It is valid until ${p.valid_until}.` }),
    ar: (p) => ({ subject: `عرض السعر ${p.number}`, body: `عرض السعر ${p.number} لسيارة ${p.car} جاهز: المجموع ${usd(p.total)}. صالح حتى ${p.valid_until}.` }),
  },
  contract_ready: {
    en: (p) => ({ subject: `Contract ${p.number}`, body: `Your purchase contract ${p.number} is ready. Please sign it in your account or at the showroom.` }),
    ar: (p) => ({ subject: `العقد ${p.number}`, body: `عقد الشراء ${p.number} جاهز. يرجى توقيعه من حسابك أو في المعرض.` }),
  },
  receipt: {
    en: (p) => ({ subject: `Receipt ${p.number}`, body: `We received ${p.amount} ${p.currency} (${p.method}) for your ${p.car}. Receipt ${p.number} is attached.` }),
    ar: (p) => ({ subject: `إيصال ${p.number}`, body: `استلمنا ${p.amount} ${p.currency} (${p.method}) لسيارتك ${p.car}. الإيصال ${p.number} مرفق.` }),
  },
  refund_issued: {
    en: (p) => ({ subject: `Refund ${p.number}`, body: `A refund of ${usd(p.amount_usd)} was recorded for your ${p.car}. Reason: ${p.reason}.` }),
    ar: (p) => ({ subject: `استرداد ${p.number}`, body: `تم تسجيل استرداد بقيمة ${usd(p.amount_usd)} لسيارتك ${p.car}. السبب: ${p.reason}.` }),
  },
  delivery_confirmation: {
    en: (p) => ({ subject: 'Delivery slot confirmed', body: `Your ${p.car} will be handed over on ${p.slot}.` }),
    ar: (p) => ({ subject: 'تأكيد موعد التسليم', body: `سيتم تسليم سيارتك ${p.car} بتاريخ ${p.slot}.` }),
  },
  delivery_reminder: {
    en: (p) => ({ subject: 'Delivery reminder', body: `Reminder: your ${p.car} will be handed over tomorrow at ${p.slot}.` }),
    ar: (p) => ({ subject: 'تذكير بموعد التسليم', body: `تذكير: سيتم تسليم سيارتك ${p.car} غدًا في ${p.slot}.` }),
  },
  welcome_owner: {
    en: (p) => ({ subject: 'Welcome to the Owners Circle', body: `Congratulations on your ${p.car}! Your owner card is ${p.card} and your referral code is ${p.code}.` }),
    ar: (p) => ({ subject: 'أهلاً بك في نادي المالكين', body: `مبروك سيارتك ${p.car}! بطاقتك ${p.card} ورمز الإحالة الخاص بك ${p.code}.` }),
  },
  referral_credit: {
    en: (p) => ({ subject: 'Referral credit added', body: `You earned a credit of ${usd(p.amount)}. Your balance is ${usd(p.balance)}.` }),
    ar: (p) => ({ subject: 'تمت إضافة رصيد الإحالة', body: `حصلت على رصيد ${usd(p.amount)}. رصيدك الحالي ${usd(p.balance)}.` }),
  },
  owner_event: {
    en: (p) => ({ subject: p.title, body: `${p.title}: ${p.description}` }),
    ar: (p) => ({ subject: p.title, body: `${p.title}: ${p.description}` }),
  },
  data_request_received: {
    en: (p) => ({ subject: 'Data request received', body: `We received your ${p.type} request. We will complete it within 30 days (by ${p.due}).` }),
    ar: (p) => ({ subject: 'تم استلام طلب البيانات', body: `استلمنا طلبك (${p.type}). سننجزه خلال 30 يومًا (قبل ${p.due}).` }),
  },
  data_request_done: {
    en: (p) => ({ subject: 'Data request completed', body: `Your ${p.type} request has been completed.` }),
    ar: (p) => ({ subject: 'اكتمل طلب البيانات', body: `اكتمل طلبك (${p.type}).` }),
  },
  lead_assigned: {
    en: (p) => ({ subject: 'New lead assigned', body: `A new lead (${p.source}) from ${p.name} for ${p.car} was assigned to you.` }),
    ar: (p) => ({ subject: 'عميل محتمل جديد', body: `تم تعيين عميل محتمل جديد (${p.source}) من ${p.name} لسيارة ${p.car}.` }),
  },
  stock_alert: {
    en: (p) => ({ subject: 'Stock alert', body: p.message }),
    ar: (p) => ({ subject: 'تنبيه المخزون', body: p.message }),
  },
  order_stage: {
    en: (p) => ({ subject: `Your ${p.car}: ${p.stage}`, body: `Update on your ${p.car}: ${p.stage}. Estimated delivery: ${p.eta}. You can follow every step in your account.` }),
    ar: (p) => ({ subject: `سيارتك ${p.car}: ${p.stage_ar}`, body: `تحديث بخصوص سيارتك ${p.car}: ${p.stage_ar}. موعد التسليم المتوقع: ${p.eta}. يمكنك متابعة كل خطوة من حسابك.` }),
  },
  tradein_offer: {
    en: (p) => ({ subject: 'Your trade-in offer', body: `We offer ${usd(p.offer)} for your ${p.vehicle}. The offer is valid until ${p.valid_until}.` }),
    ar: (p) => ({ subject: 'عرض استبدال سيارتك', body: `نعرض ${usd(p.offer)} مقابل سيارتك ${p.vehicle}. العرض صالح حتى ${p.valid_until}.` }),
  },
  exception_decided: {
    en: (p) => ({ subject: 'Exception request decided', body: `Your exception request "${p.description}" was ${p.status}. ${p.reason || ''}` }),
    ar: (p) => ({ subject: 'تم البت في طلب الاستثناء', body: `طلب الاستثناء "${p.description}" ${p.status}. ${p.reason || ''}` }),
  },
};

module.exports = function notifyService({ db }) {
  const ins = db.prepare('INSERT INTO outbox(user_id,recipient,channel,language,kind,template,subject,body,attachment_url,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)');
  function deliver(row) { return row; } // plug a real email / WhatsApp provider in here

  // target: { userId } or { to: { email, phone, language, notify_pref } } for guests
  function send({ userId, to, template, params = {}, kind = 'transactional', attachmentUrl = null }) {
    let rec = to || {};
    if (userId) {
      const u = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
      if (!u || u.erased || !u.active) return null;
      rec = { email: u.email, phone: u.phone, language: u.language, notify_pref: u.notify_pref, consent_marketing: u.consent_marketing };
    }
    // FR-NOT-02: marketing needs consent; a customer who opted out still receives receipts and reminders
    if (kind === 'marketing' && !rec.consent_marketing) return null;
    const lang = rec.language === 'ar' ? 'ar' : 'en';
    let channel = rec.notify_pref === 'whatsapp' && rec.phone ? 'whatsapp' : 'email';
    if (channel === 'email' && !rec.email && rec.phone) channel = 'whatsapp';
    const recipient = channel === 'whatsapp' ? rec.phone : rec.email;
    if (!recipient) return null;
    const tpl = T[template];
    if (!tpl) throw new Error(`Unknown notification template ${template}`);
    const { subject, body } = tpl[lang](params);
    const info = ins.run(userId || null, recipient, channel, lang, kind, template, subject, body, attachmentUrl, 'sent', clock.iso());
    return deliver(db.prepare('SELECT * FROM outbox WHERE id = ?').get(info.lastInsertRowid));
  }
  return { send, templates: Object.keys(T) };
};
