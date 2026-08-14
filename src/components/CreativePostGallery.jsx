import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

const gridClass = { 1: 'grid-cols-1', 2: 'grid-cols-2', 3: 'grid-cols-2 grid-rows-2', 4: 'grid-cols-2 grid-rows-2' };

export default function CreativePostGallery({ items = [] }) {
  const visible = items.slice(0, 4);
  const [active, setActive] = useState(null);
  if (!items.length) return null;
  return <>
    <div className={`grid ${gridClass[Math.min(visible.length, 4)]} gap-1 overflow-hidden rounded-xl bg-zinc-900`}>
      {visible.map((item, index) => <button key={item.id} type="button" onClick={() => setActive(index)} className={`group relative min-h-0 overflow-hidden bg-zinc-900 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange-300 ${visible.length === 1 ? 'aspect-[4/3]' : 'aspect-square'} ${visible.length === 3 && index === 0 ? 'row-span-2' : ''}`} aria-label={`Open image ${index + 1} of ${items.length}`}>
        <img src={item.display_url || item.expanded_url} alt={item.alt_text || ''} loading="lazy" decoding="async" className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.025] motion-reduce:transition-none" style={{ objectPosition: `${item.focal_x ?? 50}% ${item.focal_y ?? 50}%` }} />
        {index === 3 && items.length > 4 && <span className="absolute inset-0 grid place-items-center bg-black/60 text-2xl font-semibold text-white">+{items.length - 4}</span>}
      </button>)}
    </div>
    {active !== null && <Lightbox items={items} index={active} onIndex={setActive} onClose={() => setActive(null)} />}
  </>;
}

function Lightbox({ items, index, onIndex, onClose }) {
  const closeRef = useRef(null); const touchStart = useRef(null); const item = items[index];
  const move = (delta) => onIndex((index + delta + items.length) % items.length);
  useEffect(() => {
    const previous = document.activeElement; const overflow = document.body.style.overflow; document.body.style.overflow = 'hidden'; closeRef.current?.focus();
    const onKey = (event) => { if (event.key === 'Escape') onClose(); if (event.key === 'ArrowLeft') move(-1); if (event.key === 'ArrowRight') move(1); };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; previous?.focus?.(); };
  }, [index]);
  return <div role="dialog" aria-modal="true" aria-label={`Image ${index + 1} of ${items.length}`} className="fixed inset-0 z-[100] grid bg-black/95 p-3 sm:p-8" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }} onTouchStart={(event) => { touchStart.current = event.touches[0]?.clientX; }} onTouchEnd={(event) => { const end = event.changedTouches[0]?.clientX; if (touchStart.current != null && Math.abs(end - touchStart.current) > 55) move(end < touchStart.current ? 1 : -1); }}>
    <button ref={closeRef} type="button" onClick={onClose} aria-label="Close gallery" className="absolute right-4 top-4 z-10 grid h-11 w-11 place-items-center rounded-full bg-zinc-900/90 text-white ring-1 ring-white/20 focus-visible:ring-2 focus-visible:ring-orange-300"><X /></button>
    {items.length > 1 && <><button type="button" onClick={() => move(-1)} aria-label="Previous image" className="absolute left-3 top-1/2 z-10 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-zinc-900/90 text-white ring-1 ring-white/20 focus-visible:ring-2 focus-visible:ring-orange-300 sm:left-6"><ChevronLeft /></button><button type="button" onClick={() => move(1)} aria-label="Next image" className="absolute right-3 top-1/2 z-10 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-zinc-900/90 text-white ring-1 ring-white/20 focus-visible:ring-2 focus-visible:ring-orange-300 sm:right-6"><ChevronRight /></button></>}
    <figure className="m-auto grid max-h-full max-w-6xl place-items-center gap-3"><img src={item.expanded_url || item.display_url} alt={item.alt_text || ''} className="max-h-[82vh] max-w-full object-contain" />{item.caption && <figcaption className="max-w-2xl text-center text-sm text-zinc-300">{item.caption}</figcaption>}<span className="text-xs text-zinc-500">{index + 1} / {items.length}</span></figure>
  </div>;
}
