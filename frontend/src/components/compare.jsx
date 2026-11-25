import { createContext, useContext, useEffect, useState } from 'react';
const Ctx = createContext(null); export const useCompare = () => useContext(Ctx);
export function CompareProvider({ children }) {
  const [ids, setIds] = useState(() => { try { return JSON.parse(localStorage.getItem('fsm_compare') || '[]'); } catch { return []; } });
  useEffect(() => { try { localStorage.setItem('fsm_compare', JSON.stringify(ids)); } catch { /* ignore */ } }, [ids]);
  const toggle = (id) => setIds((x) => (x.includes(id) ? x.filter((i) => i !== id) : x.length >= 3 ? x : [...x, id])); // FR-CAT-05: up to three
  return <Ctx.Provider value={{ ids, toggle, clear: () => setIds([]), full: ids.length >= 3 }}>{children}</Ctx.Provider>;
}
