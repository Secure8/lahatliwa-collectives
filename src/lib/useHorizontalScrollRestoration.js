import { useCallback, useLayoutEffect, useState } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';
import { horizontalScrollPositionKey, horizontalScrollTarget } from './navigationHistory';

const horizontalPositions = new Map();

export default function useHorizontalScrollRestoration(regionId) {
  const location = useLocation();
  const navigationType = useNavigationType();
  const [element, setElement] = useState(null);
  const containerRef = useCallback((node) => setElement(node), []);
  const positionKey = horizontalScrollPositionKey(location, regionId);

  useLayoutEffect(() => {
    if (!element) return undefined;

    let cancelled = false;
    const savedPosition = horizontalPositions.get(positionKey);
    const target = horizontalScrollTarget(navigationType, savedPosition);
    const save = () => horizontalPositions.set(positionKey, element.scrollLeft);
    const restore = () => {
      if (cancelled) return;
      const maximum = Math.max(0, element.scrollWidth - element.clientWidth);
      element.scrollLeft = Math.min(target, maximum);
    };
    const cancelRetries = () => { cancelled = true; };

    element.addEventListener('scroll', save, { passive: true });
    restore();

    const frame = requestAnimationFrame(restore);
    const timers = navigationType === 'POP'
      ? [80, 200, 500, 1000].map((delay) => window.setTimeout(restore, delay))
      : [];
    element.addEventListener('wheel', cancelRetries, { passive: true, once: true });
    element.addEventListener('touchstart', cancelRetries, { passive: true, once: true });
    element.addEventListener('pointerdown', cancelRetries, { passive: true, once: true });
    element.addEventListener('keydown', cancelRetries, { once: true });

    return () => {
      save();
      cancelled = true;
      cancelAnimationFrame(frame);
      timers.forEach(window.clearTimeout);
      element.removeEventListener('scroll', save);
      element.removeEventListener('wheel', cancelRetries);
      element.removeEventListener('touchstart', cancelRetries);
      element.removeEventListener('pointerdown', cancelRetries);
      element.removeEventListener('keydown', cancelRetries);
    };
  }, [element, navigationType, positionKey]);

  return containerRef;
}
