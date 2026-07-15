import { useEffect } from 'react';

export function motionSafeScrollBehavior() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
}

export default function useStepScroll({ containerRef, request = 0 }) {
  useEffect(() => {
    if (!request) return undefined;
    const frame = window.requestAnimationFrame(() => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const appBarOffset = window.innerWidth < 1024 ? 72 : 80;
      const alreadyPositioned = rect.top >= appBarOffset && rect.top <= Math.min(window.innerHeight * 0.38, appBarOffset + 160);
      if (!alreadyPositioned) container.scrollIntoView({ behavior: motionSafeScrollBehavior(), block: 'start' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [containerRef, request]);
}
