import { useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';
import { navigationScrollPlan, scrollPositionKey } from '../lib/navigationHistory';
const positions = new Map();
export default function PublicScrollRestoration() {
  const location = useLocation(); const navigationType = useNavigationType(); const key = scrollPositionKey(location);
  const previousLocationRef = useRef(location);
  useEffect(() => { const previous = window.history.scrollRestoration; window.history.scrollRestoration = 'manual'; return () => { window.history.scrollRestoration = previous; }; }, []);
  useEffect(() => {
    let frame = 0;
    const save = () => { if (frame) return; frame = requestAnimationFrame(() => { positions.set(key, window.scrollY); frame = 0; }); };
    positions.set(key, window.scrollY);
    window.addEventListener('scroll', save, { passive: true });
    return () => { window.removeEventListener('scroll', save); if (frame) cancelAnimationFrame(frame); };
  }, [key]);
  useLayoutEffect(() => {
    const plan = navigationScrollPlan({ navigationType, previousLocation: previousLocationRef.current, location, savedPosition: positions.get(key), currentPosition: window.scrollY });
    previousLocationRef.current = location;
    if (plan.mode === 'anchor') { requestAnimationFrame(() => document.getElementById(plan.target)?.scrollIntoView({ block: 'start', behavior: 'auto' })); return undefined; }
    if (plan.mode === 'preserve') { positions.set(key, plan.top); return undefined; }
    const restore = () => window.scrollTo({ top: plan.top, behavior: 'auto' });
    restore();
    if (plan.mode !== 'restore' || positions.get(key) === undefined) return undefined;
    let cancelled = false;
    const retry = () => { if (!cancelled) restore(); };
    const timers = [50, 150, 350].map((delay) => window.setTimeout(retry, delay));
    const cancel = () => { cancelled = true; timers.forEach(window.clearTimeout); };
    window.addEventListener('wheel', cancel, { passive: true, once: true });
    window.addEventListener('touchstart', cancel, { passive: true, once: true });
    window.addEventListener('pointerdown', cancel, { passive: true, once: true });
    window.addEventListener('keydown', cancel, { once: true });
    return () => { cancel(); window.removeEventListener('wheel', cancel); window.removeEventListener('touchstart', cancel); window.removeEventListener('pointerdown', cancel); window.removeEventListener('keydown', cancel); };
  }, [key, location, navigationType]);
  return null;
}
