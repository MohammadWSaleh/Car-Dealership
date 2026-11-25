import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, getToken, setToken, setUnauthorizedHandler } from './api.js';
import i18n from './i18n/index.js';

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); const [loading, setLoading] = useState(!!getToken());
  const logout = useCallback(() => { setToken(null); setUser(null); }, []);
  useEffect(() => { setUnauthorizedHandler(logout); }, [logout]);
  useEffect(() => {
    if (!getToken()) return;
    api.get('/auth/me').then((r) => { setUser(r.user); if (r.user.language) i18n.changeLanguage(r.user.language); }).catch(() => setToken(null)).finally(() => setLoading(false));
  }, []);
  const accept = (r) => { setToken(r.token); setUser(r.user); if (r.user.language) i18n.changeLanguage(r.user.language); return r.user; };
  const login = async (email, password) => accept(await api.post('/auth/login', { email, password }));
  const register = async (body) => accept(await api.post('/auth/register', body));
  const refresh = async () => { const r = await api.get('/auth/me'); setUser(r.user); return r.user; };
  // FR-ACC-05: the chosen language is remembered for logged-in users
  const setLanguage = async (lng) => { await i18n.changeLanguage(lng); if (user) { try { await api.put('/me', { language: lng }); setUser({ ...user, language: lng }); } catch { /* keep UI language */ } } };
  return <Ctx.Provider value={{ user, loading, login, register, logout, refresh, setLanguage, setUser }}>{children}</Ctx.Provider>;
}
