import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en.js';
import ar from './ar.js';

export const LANGS = ['en', 'ar'];
export function applyLanguage(lng) {
  document.documentElement.lang = lng; document.documentElement.dir = lng === 'ar' ? 'rtl' : 'ltr'; // FR-ACC-05
  try { localStorage.setItem('fsm_lang', lng); } catch { /* ignore */ }
}
let saved = 'en'; try { saved = localStorage.getItem('fsm_lang') || 'en'; } catch { /* ignore */ }
i18n.use(initReactI18next).init({ resources: { en: { translation: en }, ar: { translation: ar } }, lng: LANGS.includes(saved) ? saved : 'en', fallbackLng: 'en', interpolation: { escapeValue: false }, returnEmptyString: false });
applyLanguage(i18n.language);
i18n.on('languageChanged', applyLanguage);
export default i18n;
