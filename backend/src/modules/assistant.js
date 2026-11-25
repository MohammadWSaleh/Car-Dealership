const express = require('express');
const crypto = require('crypto');
const clock = require('../clock');
const { bad, notFound, isEmail, parseJson, usd, dmy, parseSlot } = require('../util');

// FR-VA-01..04 - rule-based chat assistant. It answers ONLY from catalogue data and its small rule base (FR-VA-02).
const KW = {
  human: /\b(human|agent|person|consultant|representative|someone|sales ?person|call me)\b|بشري|موظف|مستشار|شخص|اتصل/i,
  greet: /\b(hi|hello|hey|good (morning|evening))\b|مرحبا|أهلا|اهلا|السلام/i,
  price: /\b(price|cost|how much|prices)\b|سعر|أسعار|اسعار|كم/i,
  stock: /\b(available|availability|in stock|stock|arrive|delivery time)\b|متوفر|مخزون|توفر|متاح/i,
  drive: /\b(test ?drive|drive|try)\b|تجربة|قيادة/i,
  models: /\b(models?|cars?|catalog(ue)?|what do you (have|sell)|lineup)\b|موديل|سيارات|ماذا لديكم/i,
  ev: /\b(electric|ev|hybrid|charging|charger)\b|كهرباء|كهربائ|هجين|شحن/i,
  thanks: /\b(thanks|thank you|thx)\b|شكرا|شكراً|يعطيك/i,
};
const TXT = {
  en: {
    disclosure: 'Hi, I am the Full Stack Motors automated assistant (not a person). I can tell you about our models, prices, availability and test-drive slots.',
    greet: 'How can I help you? Ask about a model, its price, availability or a test drive. Type "agent" any time to talk to a consultant.',
    unknown: 'Sorry, I did not understand that. Try asking about a model, its price or availability, or a test drive.',
    price: (t) => `${t.label}: ${usd(t.price_usd)} (about LBP ${t.price_lbp.toLocaleString('en-US')}). One fixed price - VAT and import charges included.`,
    stock: (t) => `${t.label}: ${{ in_stock: `in stock (${t.availability.count} car${t.availability.count > 1 ? 's' : ''})`, in_transit: `in transit, expected ${t.availability.expected_arrival ? dmy(t.availability.expected_arrival) : 'soon'}`, order_only: 'available to order' }[t.availability.status]}.`,
    models: (l) => `We currently offer: ${l}. Ask me about any of them.`,
    slots: (label, slots) => (slots.length ? `Next free test-drive slots for ${label}: ${slots.map((s) => `${dmy(s)} ${s.slice(11)}`).join(', ')}. Tap a slot to book.` : `There are no free test-drive slots for ${label} in the next two weeks.`),
    ev: 'We have hybrid, plug-in hybrid and electric models. Try the EV Readiness Check on the website to see if an electric car suits you.',
    which: 'Which model do you mean? For example: ' ,
    askContact: 'I will pass you to a consultant. Please send your name and your email or phone number. By sending them you agree that we store them to contact you.',
    handedOff: 'Thank you. A consultant will contact you soon and can see this chat.',
    booked: (label, slot, code) => `Your test drive of the ${label} is booked for ${dmy(slot)} ${slot.slice(11)}. Booking code ${code}.`,
    needContact: 'To book, please send your name and your email or phone number (and agree that we store them).',
    bye: 'You are welcome! Anything else?',
  },
  ar: {
    disclosure: 'مرحبًا، أنا المساعد الآلي لشركة فول ستاك موتورز (ولست شخصًا). يمكنني إخبارك عن الموديلات والأسعار والتوفر ومواعيد التجربة.',
    greet: 'كيف أستطيع مساعدتك؟ اسأل عن موديل أو سعره أو توفره أو تجربة قيادة. اكتب "موظف" في أي وقت للتحدث مع مستشار.',
    unknown: 'عذرًا، لم أفهم ذلك. جرّب السؤال عن موديل أو سعره أو توفره أو تجربة قيادة.',
    price: (t) => `${t.label}: ${usd(t.price_usd)} (حوالي ${t.price_lbp.toLocaleString('en-US')} ل.ل.). سعر ثابت واحد يشمل الضريبة ورسوم الاستيراد.`,
    stock: (t) => `${t.label}: ${{ in_stock: `متوفرة في المخزون (${t.availability.count})`, in_transit: `في الطريق، الوصول المتوقع ${t.availability.expected_arrival ? dmy(t.availability.expected_arrival) : 'قريبًا'}`, order_only: 'متاحة بالطلب' }[t.availability.status]}.`,
    models: (l) => `نقدّم حاليًا: ${l}. اسألني عن أي منها.`,
    slots: (label, slots) => (slots.length ? `أقرب مواعيد التجربة لـ ${label}: ${slots.map((s) => `${dmy(s)} ${s.slice(11)}`).join('، ')}. اختر موعدًا للحجز.` : `لا توجد مواعيد تجربة متاحة لـ ${label} خلال أسبوعين.`),
    ev: 'لدينا سيارات هجينة وهجينة قابلة للشحن وكهربائية. جرّب فحص الجاهزية للسيارات الكهربائية في الموقع.',
    which: 'أي موديل تقصد؟ مثلًا: ',
    askContact: 'سأحوّلك إلى مستشار. يرجى إرسال اسمك وبريدك الإلكتروني أو رقم هاتفك. بإرسالها توافق على حفظها للتواصل معك.',
    handedOff: 'شكرًا لك. سيتواصل معك مستشار قريبًا ويمكنه الاطلاع على هذه المحادثة.',
    booked: (label, slot, code) => `تم حجز تجربة قيادة ${label} بتاريخ ${dmy(slot)} ${slot.slice(11)}. رمز الحجز ${code}.`,
    needContact: 'للحجز يرجى إرسال اسمك وبريدك أو هاتفك (وموافقتك على حفظها).',
    bye: 'عفوًا! هل من شيء آخر؟',
  },
};

module.exports = function assistant(ctx) {
  const { db, auth, core, settings, testdrives } = ctx;
  const r = express.Router();

  const catalogue = () => db.prepare('SELECT * FROM trims WHERE active = 1').all().map((t) => ({
    ...t, label: core.trimLabel(t), price_usd: core.effectivePrice(t), price_lbp: settings.lbp(core.effectivePrice(t)), availability: core.availability(t.id) }));
  function matchTrims(text, all) {
    const low = text.toLowerCase();
    let hits = all.filter((t) => low.includes(`${t.brand} ${t.model} ${t.name}`.toLowerCase()));
    if (!hits.length) hits = all.filter((t) => low.includes(`${t.brand} ${t.model}`.toLowerCase()) || low.includes(t.model.toLowerCase()));
    if (!hits.length) hits = all.filter((t) => low.includes(t.brand.toLowerCase()));
    return hits;
  }
  const record = (chatId, sender, text) => db.prepare('INSERT INTO chat_messages(chat_id,sender,text,at) VALUES(?,?,?,?)').run(chatId, sender, text, clock.iso());
  const transcript = (chatId) => db.prepare('SELECT sender,text,at FROM chat_messages WHERE chat_id = ? ORDER BY id').all(chatId).map((m) => `[${m.sender}] ${m.text}`).join('\n');

  function extractContact(text) {
    const email = (text.match(/[^\s@]+@[^\s@]+\.[^\s@]+/) || [])[0];
    const phone = (text.replace(/[^\d+ ]/g, ' ').match(/\+?\d[\d ]{6,}\d/) || [])[0];
    let name = text.replace(email || '', '').replace(phone || '', '').replace(/[,;:\n]/g, ' ').replace(/\b(my name is|name|email|phone|tel|اسمي|الاسم)\b/gi, '').replace(/\s+/g, ' ').trim();
    return { name: name || null, email: email || null, phone: phone ? phone.replace(/\s+/g, '') : null };
  }
  function handOff(chat, user, contact, lang) {
    const t = TXT[lang];
    const c = user ? { name: user.name, email: user.email, phone: user.phone } : contact;
    const deal = core.createDeal({ customer_id: user ? user.id : null, name: c.name || 'Website visitor', email: c.email, phone: c.phone, language: lang, source: 'chat', chat_id: chat.id,
      notes: `Chat hand-off. Transcript:\n${transcript(chat.id)}` });
    db.prepare("UPDATE chats SET status = 'handed_off', deal_id = ?, contact = ? WHERE id = ?").run(deal.id, JSON.stringify(c), chat.id);
    return { reply: t.handedOff, handed_off: true, lead_id: deal.id };
  }

  r.post('/assistant/chat', (req, res) => {
    const b = req.body || {};
    const lang = b.lang === 'ar' ? 'ar' : 'en'; const t = TXT[lang];
    const user = req.user && req.user.role === 'customer' ? req.user : null;
    const message = String(b.message || '').trim().slice(0, 500);
    if (!message && !b.action) throw bad('empty_message', 'Message is empty');
    let chat = b.session_id ? db.prepare('SELECT * FROM chats WHERE session_id = ?').get(String(b.session_id)) : null;
    let first = false;
    if (!chat) {
      const sid = crypto.randomUUID();
      const id = db.prepare('INSERT INTO chats(session_id,lang,status,customer_id,created_at) VALUES(?,?,?,?,?)').run(sid, lang, 'open', user ? user.id : null, clock.iso()).lastInsertRowid;
      chat = db.prepare('SELECT * FROM chats WHERE id = ?').get(id); first = true;
    }
    if (message) record(chat.id, 'user', message);
    const out = { session_id: chat.session_id, is_automated: true, disclosure: first ? t.disclosure : undefined, options: [] };
    const reply = (text, extra = {}) => { record(chat.id, 'bot', text); res.json({ ...out, ...extra, reply: (first ? `${t.disclosure}\n` : '') + text }); };
    if (chat.status === 'handed_off') return reply(t.handedOff, { handed_off: true });

    const all = catalogue();
    // FR-VA-04: book a test drive inside the chat
    if (b.action && b.action.type === 'book_test_drive') {
      const trim = core.getTrim(Number(b.action.trim_id));
      if (!trim) throw notFound('Trim');
      const contact = b.contact || {};
      if (!user && (!contact.name || (!contact.email && !contact.phone))) return reply(t.needContact, { needs_contact: true });
      const td = testdrives.book({ trimId: trim.id, slot: b.action.slot_start, user, contact: { ...contact, consent_data: true }, language: lang });
      return reply(t.booked(core.trimLabel(trim), td.slot_start, td.code), { booked: true, booking_code: td.code });
    }

    if (chat.status === 'awaiting_contact') {
      const c = b.contact && (b.contact.email || b.contact.phone) ? b.contact : extractContact(message);
      if (c.email && !isEmail(c.email)) return reply(t.askContact, { needs_contact: true });
      if (c.email || c.phone) return reply(handOff(chat, user, c, lang).reply, { handed_off: true });
      return reply(t.askContact, { needs_contact: true });
    }

    const wantsHuman = KW.human.test(message);
    const startHandoff = () => {
      if (user) return reply(handOff(chat, user, null, lang).reply, { handed_off: true });
      db.prepare("UPDATE chats SET status = 'awaiting_contact' WHERE id = ?").run(chat.id);
      return reply(t.askContact, { needs_contact: true });
    };
    if (wantsHuman) return startHandoff();                         // FR-VA-03 (user asks)
    if (KW.thanks.test(message)) { db.prepare("UPDATE chats SET status = 'resolved' WHERE id = ? AND status = 'open'").run(chat.id); return reply(t.bye); }

    const hits = matchTrims(message, all);
    if (KW.drive.test(message)) {
      if (hits.length === 1 || (hits.length && new Set(hits.map((h) => h.model)).size === 1)) {
        const trim = hits[0]; const slots = testdrives.nextFreeSlots(trim.id, 3);
        return reply(t.slots(trim.label, slots), { options: slots.map((s) => ({ label: `${dmy(s)} ${s.slice(11)}`, action: { type: 'book_test_drive', trim_id: trim.id, slot_start: s } })) });
      }
      return reply(t.which + [...new Set(all.map((x) => `${x.brand} ${x.model}`))].slice(0, 4).join(', '));
    }
    if (KW.price.test(message) || KW.stock.test(message)) {
      if (hits.length) {
        const lines = hits.slice(0, 4).map((h) => (KW.stock.test(message) && !KW.price.test(message) ? t.stock(h) : `${t.price(h)} ${t.stock(h)}`));
        return reply(lines.join('\n'));
      }
      return reply(t.which + [...new Set(all.map((x) => `${x.brand} ${x.model}`))].slice(0, 4).join(', '));
    }
    if (KW.ev.test(message)) return reply(t.ev);
    if (KW.models.test(message)) return reply(t.models([...new Set(all.map((x) => `${x.brand} ${x.model}`))].join(', ')));
    if (hits.length) return reply(hits.slice(0, 3).map((h) => `${t.price(h)} ${t.stock(h)}`).join('\n'));
    if (KW.greet.test(message)) return reply(t.greet);
    // could not answer: after two failed attempts, hand over to a consultant (FR-VA-03)
    const failures = chat.failures + 1;
    db.prepare('UPDATE chats SET failures = ? WHERE id = ?').run(failures, chat.id);
    if (failures >= 2) return startHandoff();
    return reply(t.unknown);
  });

  r.get('/assistant/chats/:session', (req, res) => {
    const chat = db.prepare('SELECT * FROM chats WHERE session_id = ?').get(req.params.session);
    if (!chat) throw notFound('Chat');
    res.json({ status: chat.status, messages: db.prepare('SELECT sender,text,at FROM chat_messages WHERE chat_id = ? ORDER BY id').all(chat.id) });
  });
  r.post('/assistant/chats/:session/close', (req, res) => {
    const chat = db.prepare('SELECT * FROM chats WHERE session_id = ?').get(req.params.session);
    if (!chat) throw notFound('Chat');
    if (chat.status === 'open' && (req.body || {}).resolved) db.prepare("UPDATE chats SET status = 'resolved' WHERE id = ?").run(chat.id);
    res.json({ status: db.prepare('SELECT status FROM chats WHERE id = ?').get(chat.id).status });
  });
  return r;
};
