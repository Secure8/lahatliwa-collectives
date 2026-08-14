import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export default function CreativePostGallery({ items = [] }) {
  const visible = items.slice(0, items.length === 3 ? 3 : 4);
  const [active, setActive] = useState(null);
  if (!items.length) return null;
  return <>
    <div className={`ll-adaptive-gallery ll-adaptive-gallery--${Math.min(items.length, 5)}`}>
      {visible.map((item, index) => <button key={item.id} type="button" onClick={() => setActive(index)} aria-label={`Open image ${index + 1} of ${items.length}`}>
        <img src={item.display_url || item.expanded_url} alt={item.alt_text || ''} loading="lazy" decoding="async" style={{ objectPosition: `${item.focal_x ?? 50}% ${item.focal_y ?? 50}%` }} />
        {index === visible.length - 1 && items.length > visible.length && <span className="ll-gallery-more">+{items.length - visible.length}<small>View all</small></span>}
      </button>)}
    </div>
    {active !== null && <Lightbox items={items} index={active} onIndex={setActive} onClose={() => setActive(null)} />}
  </>;
}

function Lightbox({ items, index, onIndex, onClose }) {
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  const touchStart = useRef(null);
  const item = items[index];
  const move = (delta) => onIndex((index + delta + items.length) % items.length);
  useEffect(() => {
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const onKey = (event) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowLeft') move(-1);
      if (event.key === 'ArrowRight') move(1);
      if (event.key === 'Tab') {
        const controls = [...dialogRef.current.querySelectorAll('button:not(:disabled)')];
        if (!controls.length) return;
        const first = controls[0]; const last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; previous?.focus?.(); };
  }, [index]);
  return <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={`Image ${index + 1} of ${items.length}`} className="ll-lightbox" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }} onTouchStart={(event) => { touchStart.current = event.touches[0]?.clientX; }} onTouchEnd={(event) => { const end = event.changedTouches[0]?.clientX; if (touchStart.current != null && Math.abs(end - touchStart.current) > 55) move(end < touchStart.current ? 1 : -1); }}>
    <header><span>{index + 1} / {items.length}</span><button ref={closeRef} type="button" onClick={onClose} aria-label="Close gallery"><X /></button></header>
    {items.length > 1 && <><button type="button" onClick={() => move(-1)} aria-label="Previous image" className="ll-lightbox__previous"><ChevronLeft /></button><button type="button" onClick={() => move(1)} aria-label="Next image" className="ll-lightbox__next"><ChevronRight /></button></>}
    <figure><img src={item.expanded_url || item.display_url} alt={item.alt_text || ''} />{(item.caption || item.alt_text) && <figcaption>{item.caption && <strong>{item.caption}</strong>}{item.alt_text && <span>{item.alt_text}</span>}</figcaption>}</figure>
  </div>;
}
