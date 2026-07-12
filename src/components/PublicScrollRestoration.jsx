import { useEffect, useLayoutEffect } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';
import { scrollPositionKey } from '../lib/navigationHistory';
const positions = new Map();
export default function PublicScrollRestoration() {
  const location = useLocation(); const navigationType = useNavigationType(); const key = scrollPositionKey(location);
  useEffect(() => { const previous = window.history.scrollRestoration; window.history.scrollRestoration = 'manual'; return () => { window.history.scrollRestoration = previous; }; }, []);
  useEffect(() => {
    let frame = 0;
    const save = () => { if (frame) return; frame = requestAnimationFrame(() => { positions.set(key, window.scrollY); frame = 0; }); };
    positions.set(key, window.scrollY);
    window.addEventListener('scroll', save, { passive: true });
    return () => { window.removeEventListener('scroll', save); if (frame) cancelAnimationFrame(frame); };
  }, [key]);
  useLayoutEffect(() => {
    if (location.hash) { requestAnimationFrame(() => document.getElementById(location.hash.slice(1))?.scrollIntoView()); return undefined; }
    const target = navigationType === 'POP' ? positions.get(key) : 0;
    const restore = () => window.scrollTo({ top: target || 0, behavior: 'auto' }); restore();
    if (navigationType !== 'POP' || target === undefined) return undefined;
    const timers = [50, 150, 350].map((delay) => window.setTimeout(restore, delay)); return () => timers.forEach(window.clearTimeout);
  }, [key, location.hash, navigationType]);
  return null;
}
