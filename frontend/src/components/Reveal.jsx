import { useEffect, useRef, useState } from 'react';

/** Fades/slides its children in when they scroll into view. Honors reduced-motion. */
export function Reveal({ children, from = 'up', delay = 0, className = '', as: Tag = 'div' }) {
  const ref = useRef(null);
  const [shown, setShown] = useState(() => typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    if (shown || !ref.current) return undefined;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setShown(true); io.disconnect(); } }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [shown]);
  return <Tag ref={ref} style={{ transitionDelay: `${delay}ms` }} className={`reveal reveal-${from} ${shown ? 'reveal-in' : ''} ${className}`}>{children}</Tag>;
}

/** Animated "light streak" backdrop (original artwork) with an optional looping video the owner can drop in. */
export function Streaks({ video = true }) {
  const [ok, setOk] = useState(video);
  return (
    <div className="streaks" aria-hidden="true">
      <div className="streaks-glow" />
      {[0, 1, 2, 3, 4, 5, 6].map((i) => <span key={i} className={`streak streak-${i}`} />)}
      <svg className="streaks-car" viewBox="0 0 640 200" fill="none"><path d="M20 150c10-34 52-52 120-60l110-44c52-18 120-18 170 4l82 38c60 6 98 22 106 44v18H20z" fill="#0b0b0f" stroke="rgba(255,255,255,.28)" strokeWidth="2" /><circle cx="170" cy="152" r="30" fill="#050507" stroke="rgba(255,255,255,.35)" strokeWidth="3" /><circle cx="486" cy="152" r="30" fill="#050507" stroke="rgba(255,255,255,.35)" strokeWidth="3" /><path d="M520 98l70 14" stroke="#ffb454" strokeWidth="4" strokeLinecap="round" /></svg>
      {ok && <video className="streaks-video" autoPlay muted loop playsInline preload="none" onError={() => setOk(false)} onLoadedData={(e) => e.currentTarget.classList.add('on')}><source src="/media/hero.mp4" type="video/mp4" /></video>}
      <div className="streaks-fade" />
    </div>
  );
}
