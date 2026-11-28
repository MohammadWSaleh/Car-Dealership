import { useState } from 'react';
// Placeholder illustration used when a trim has no photo yet (image_url can be set from the staff console).
const PALETTE = { Toyota: '#c2410c', Hyundai: '#1d4ed8', Kia: '#be123c', Nissan: '#475569', BYD: '#0f766e', MG: '#b91c1c', Volkswagen: '#1e40af', 'Mercedes-Benz': '#334155' };
export const COLOR_HEX = { White: '#f8fafc', Black: '#111827', Silver: '#cbd5e1', Grey: '#6b7280', Blue: '#2563eb', Red: '#dc2626', Green: '#15803d', Brown: '#78350f', Orange: '#ea580c', Yellow: '#eab308' };
const PHOTO = { 'BYD Atto 3': 'byd-atto-3', 'BYD Seal': 'byd-seal', 'Hyundai Ioniq 5': 'hyundai-ioniq-5', 'Hyundai Tucson': 'hyundai-tucson', 'Kia EV6': 'kia-ev6', 'Kia Sportage': 'kia-sportage', 'MG ZS EV': 'mg-zs-ev', 'Mercedes-Benz C-Class': 'mercedes-c-class', 'Nissan Sunny': 'nissan-sunny', 'Toyota Corolla': 'toyota-corolla', 'Toyota RAV4': 'toyota-rav4', 'Volkswagen ID.4': 'vw-id4' };
// Catalogue photo for a trim (static files in /public/cars; credits in docs/IMAGE-CREDITS.md)
export function photoFor(trim) {
  if (!trim) return null;
  if (trim.image_url) return trim.image_url;
  let key = PHOTO[`${trim.brand} ${trim.model}`];
  if (key === 'hyundai-tucson' && trim.fuel_type === 'plug_in_hybrid') key = 'hyundai-tucson-phev';
  return key ? `/cars/${key}.jpg` : null;
}
export default function CarImage({ trim, className = '', color, src }) {
  const [failed, setFailed] = useState(false);
  const photo = failed ? null : (src || photoFor(trim));
  const label = `${trim.brand} ${trim.model} ${trim.name || ''}`.trim();
  if (photo) return <img src={photo} alt={label} className={`object-cover ${className}`} loading="lazy" onError={() => setFailed(true)} />;
  const c = (color && COLOR_HEX[color]) || PALETTE[trim.brand] || '#1f6feb'; const suv = trim.body_type === 'suv';
  return (
    <svg viewBox="0 0 320 160" className={className} role="img" aria-label={label}>
      <defs><linearGradient id="bgA" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1b2433" /><stop offset="1" stopColor="#0b0f17" /></linearGradient></defs><rect width="320" height="160" fill="url(#bgA)" /><rect y="118" width="320" height="42" fill="#05070b" /><ellipse cx="160" cy="124" rx="120" ry="7" fill="#000" opacity=".5" />
      {suv ? <path d="M40 112 L52 78 Q58 66 74 64 L206 64 Q226 64 238 82 L262 100 Q276 104 278 116 L278 120 L40 120 Z" fill={c} />
        : <path d="M36 114 L58 86 Q68 76 84 74 L150 72 Q176 56 206 70 L240 76 Q268 82 280 108 L284 120 L36 120 Z" fill={c} />}
      <path d={suv ? 'M80 70 L88 70 L88 92 L66 92 Z M96 68 L146 68 L146 92 L96 92 Z M154 68 L206 68 Q220 70 228 90 L154 92 Z' : 'M92 80 L146 78 L146 98 L74 98 Z M154 78 Q176 66 200 78 L224 96 L154 98 Z'} fill="#dbeafe" opacity=".85" />
      {[88, 236].map((x) => <g key={x}><circle cx={x} cy="120" r="19" fill="#0f172a" /><circle cx={x} cy="120" r="9" fill="#cbd5e1" /></g>)}
      {trim.fuel_type === 'electric' && <text x="160" y="112" textAnchor="middle" fontSize="12" fontWeight="700" fill="#fff">⚡ EV</text>}
    </svg>
  );
}
