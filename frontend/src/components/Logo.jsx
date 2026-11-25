import { useId } from 'react';

/** Full Stack Motors mark: a car roofline sweeping over a "stack" of three speed bars. */
export function LogoMark({ size = 36, className = '' }) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} role="img" aria-label="Full Stack Motors">
      <defs><linearGradient id={`g${id}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#1558c7" /><stop offset="1" stopColor="#0ea5e9" /></linearGradient></defs>
      <rect width="64" height="64" rx="15" fill={`url(#g${id})`} />
      <path d="M8 38C15 26 27 19 40 19c8 0 14 6 17 14-10-4-20-4-30-1-7 2-13 5-19 6z" fill="#fff" />
      <rect x="8" y="43" width="48" height="3.6" rx="1.8" fill="#fff" opacity=".95" />
      <rect x="8" y="49.5" width="36" height="3.6" rx="1.8" fill="#fff" opacity=".7" />
      <rect x="8" y="56" width="22" height="3.6" rx="1.8" fill="#fff" opacity=".45" />
      <circle cx="56.5" cy="34.5" r="3" fill="#ffb454" />
    </svg>
  );
}

/** Mark + wordmark. tone="light" is for dark backgrounds, "dark" for white backgrounds. */
export function Logo({ tone = 'light', size = 36, text = true, className = '' }) {
  const main = tone === 'light' ? 'text-white' : 'text-slate-900';
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark size={size} />
      {text && <span className={`leading-none ${main}`} style={{ direction: 'ltr' }}>
        <span className="block text-[1.05em] font-black italic tracking-tight">FULL STACK</span>
        <span className={`mt-1 flex items-center gap-1.5 text-[0.62em] font-bold uppercase tracking-[0.42em] ${tone === 'light' ? 'text-sky-400' : 'text-sky-700'}`}><span className="h-px w-3 bg-amber-400" />Motors</span>
      </span>}
    </span>
  );
}
