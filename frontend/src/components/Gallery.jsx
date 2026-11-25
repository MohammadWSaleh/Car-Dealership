import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import CarImage, { COLOR_HEX } from './CarImage.jsx';

// Large picture + thumbnails + colour swatches. With real photos, picking a colour shows the photo tagged with it;
// without photos the illustration is tinted in that colour.
export default function Gallery({ trim }) {
  const { t } = useTranslation(); const photos = trim.images || [];
  const [color, setColor] = useState(trim.colors[0] || null); const [pick, setPick] = useState(null);
  const byColor = photos.find((p) => p.color === color);
  const current = pick != null ? photos.find((p) => p.id === pick) : (byColor || photos[0]);
  return (
    <div>
      <CarImage trim={{ ...trim, image_url: null }} src={current?.url} color={color} className="aspect-[2/1] w-full rounded-2xl ring-1 ring-slate-200" />
      {photos.length > 1 && <div className="mt-2 flex gap-2 overflow-x-auto pb-1" aria-label={t('gallery.photos')}>{photos.map((p) => (
        <button key={p.id} type="button" onClick={() => { setPick(p.id); if (p.color) setColor(p.color); }} aria-label={t('gallery.photo')} className={`h-14 w-24 shrink-0 overflow-hidden rounded-lg ring-2 ${current?.id === p.id ? 'ring-brand-600' : 'ring-transparent'}`}><img src={p.url} alt="" className="h-full w-full object-cover" loading="lazy" /></button>))}</div>}
      {trim.colors.length > 0 && <div className="mt-3"><div className="mb-1 text-xs font-semibold text-slate-600">{t('gallery.colour')}: <span className="text-slate-900">{t(`color.${color}`, color || '')}</span></div>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('gallery.colour')}>{trim.colors.map((c) => (
          <button key={c} type="button" role="radio" aria-checked={c === color} aria-label={t(`color.${c}`, c)} title={t(`color.${c}`, c)} onClick={() => { setColor(c); setPick(null); }}
            className={`h-8 w-8 rounded-full ring-2 ring-offset-2 ${c === color ? 'ring-brand-600' : 'ring-slate-300'}`} style={{ background: COLOR_HEX[c] || '#94a3b8' }} />))}</div></div>}
    </div>
  );
}
