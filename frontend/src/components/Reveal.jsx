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
      {ok && <video className="streaks-video" autoPlay muted loop playsInline preload="none" onError={() => setOk(false)} onLoadedData={(e) => e.currentTarget.classList.add('on')}><source src="/media/hero.mp4" type="video/mp4" /></video>}
      <div className="streaks-fade" />
    </div>
  );
}
