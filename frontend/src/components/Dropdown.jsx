import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

export const Chevron = ({ open }) => <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}><path d="m6 9 6 6 6-6" /></svg>;

/**
 * Accessible dropdown menu. items: [{ label, to?, onClick?, active?, hint?, danger? } | { divider: true }]
 * Closes on outside click, Escape, route change and item activation; ArrowUp/Down move between items.
 */
export default function Dropdown({ label, items, className = 'btn-outline btn-sm', align = 'end', menuLabel, icon, up }) {
  const [open, setOpen] = useState(false); const box = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    const key = (e) => { if (e.key === 'Escape') { setOpen(false); box.current?.querySelector('button')?.focus(); } };
    document.addEventListener('mousedown', away); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', key); };
  }, [open]);
  const move = (e) => {
    if (!['ArrowDown', 'ArrowUp'].includes(e.key)) return; e.preventDefault();
    const els = [...box.current.querySelectorAll('[role=menuitem]')]; if (!els.length) return;
    const i = els.indexOf(document.activeElement); els[(i + (e.key === 'ArrowDown' ? 1 : -1) + els.length) % els.length].focus();
  };
  const cls = 'dd-item';
  return (
    <div className="relative" ref={box} onKeyDown={move}>
      <button type="button" className={`${className} gap-1.5`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>{icon}{label}<Chevron open={open} /></button>
      {open && <div role="menu" aria-label={menuLabel} className={`dd-menu ${up ? 'dd-up' : ''} ${align === 'start' ? 'start-0' : 'end-0'}`}>
        {items.map((it, i) => it.divider ? <div key={i} role="separator" className="my-1 h-px bg-white/10" /> : it.to
          ? <Link key={it.to} role="menuitem" to={it.to} className={`${cls} ${it.active ? 'dd-on' : ''}`} onClick={() => setOpen(false)}><span>{it.label}</span>{it.hint}</Link>
          : <button key={i} type="button" role="menuitem" className={`${cls} ${it.active ? 'dd-on' : ''} ${it.danger ? 'dd-danger' : ''}`} onClick={() => { setOpen(false); it.onClick?.(); }}><span>{it.label}</span>{it.hint}</button>)}
      </div>}
    </div>
  );
}
