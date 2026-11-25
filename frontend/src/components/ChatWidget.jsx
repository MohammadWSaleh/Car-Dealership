import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';

// FR-VA-01..04: automated assistant on public pages (always online, Arabic and English)
export default function ChatWidget() {
  const { t, i18n } = useTranslation(); const { user } = useAuth();
  const [open, setOpen] = useState(false); const [msgs, setMsgs] = useState([]); const [text, setText] = useState(''); const [sid, setSid] = useState(() => { try { return sessionStorage.getItem('fsm_chat'); } catch { return null; } });
  const [options, setOptions] = useState([]); const [needsContact, setNeedsContact] = useState(false); const [pending, setPending] = useState(null); const [contact, setContact] = useState({ name: '', email: '', phone: '' }); const [busy, setBusy] = useState(false);
  const end = useRef(null);
  useEffect(() => { const on = () => setOpen(true); window.addEventListener('fsm:open-chat', on); return () => window.removeEventListener('fsm:open-chat', on); }, []);
  useEffect(() => { end.current?.scrollIntoView?.({ behavior: 'smooth' }); }, [msgs, open]);
  useEffect(() => { if (open && !msgs.length && !sid) send('hello', true); }, [open]); // eslint-disable-line
  async function call(body) {
    setBusy(true);
    try {
      const r = await api.post('/assistant/chat', { session_id: sid || undefined, lang: i18n.language, ...body });
      if (r.session_id && r.session_id !== sid) { setSid(r.session_id); try { sessionStorage.setItem('fsm_chat', r.session_id); } catch { /* ignore */ } }
      setMsgs((m) => [...m, { from: 'bot', text: r.reply }]); setOptions(r.options || []); setNeedsContact(!!r.needs_contact);
      if (r.booked || r.handed_off) { setPending(null); setNeedsContact(false); }
    } catch (e) { setMsgs((m) => [...m, { from: 'bot', text: e.message }]); } finally { setBusy(false); }
  }
  const send = (message, silent) => { if (!silent) setMsgs((m) => [...m, { from: 'me', text: message }]); setText(''); setOptions([]); return call({ message }); };
  const pick = (o) => { setMsgs((m) => [...m, { from: 'me', text: o.label }]); setOptions([]); if (!user) { setPending(o.action); setNeedsContact(true); setMsgs((m) => [...m, { from: 'bot', text: t('chat.need_contact') }]); } else call({ action: o.action }); };
  const submitContact = (e) => { e.preventDefault(); if (pending) { call({ action: pending, contact }); } else { call({ message: `${contact.name} ${contact.email || contact.phone}`, contact }); } setNeedsContact(false); };
  return (
    <>
      <button onClick={() => setOpen(!open)} className="fixed bottom-4 end-4 z-40 rounded-full bg-brand-600 px-5 py-3 text-sm font-bold text-white shadow-lg hover:bg-brand-700" aria-label={t('chat.title')}>💬 {t('chat.title')}</button>
      {open && <div className="fixed bottom-20 end-4 z-40 flex h-[28rem] max-h-[75vh] w-[calc(100vw-2rem)] max-w-sm flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200" role="dialog" aria-label={t('chat.title')}>
        <div className="flex items-center justify-between bg-brand-700 px-4 py-3 text-white"><div><div className="text-sm font-bold">{t('chat.title')}</div><div className="text-xs text-brand-100">{t('chat.automated')}</div></div><button onClick={() => setOpen(false)} aria-label="Close">✕</button></div>
        <div className="flex-1 space-y-2 overflow-y-auto p-3 text-sm">
          {msgs.map((m, i) => <div key={i} className={`flex ${m.from === 'me' ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[85%] whitespace-pre-line rounded-2xl px-3 py-2 ${m.from === 'me' ? 'bg-brand-600 text-white' : 'bg-slate-100'}`}>{m.text}</div></div>)}
          {options.map((o, i) => <button key={i} onClick={() => pick(o)} className="me-2 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-brand-700 ring-1 ring-brand-500">{o.label}</button>)}
          <div ref={end} />
        </div>
        {needsContact ? <form onSubmit={submitContact} className="space-y-2 border-t p-3">
          <input required className="input" placeholder={t('form.name')} value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} />
          <input className="input" type="email" placeholder={t('form.email')} value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} />
          <input className="input" type="tel" placeholder={t('form.phone')} value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} />
          <p className="text-[11px] text-slate-500">{t('chat.consent_note')}</p>
          <button className="btn-primary w-full" disabled={busy || (!contact.email && !contact.phone)}>{t('common.send')}</button></form>
          : <form onSubmit={(e) => { e.preventDefault(); if (text.trim()) send(text.trim()); }} className="flex gap-2 border-t p-3"><input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder={t('chat.placeholder')} aria-label={t('chat.placeholder')} /><button className="btn-primary" disabled={busy}>{t('common.send')}</button></form>}
      </div>}
    </>
  );
}
