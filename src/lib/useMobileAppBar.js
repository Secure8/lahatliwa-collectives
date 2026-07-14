import { useEffect, useRef, useState } from 'react';
import { mobileAppBarVisibility } from './mobileAppShell';

export default function useMobileAppBar({ locked = false, routeKey = '' } = {}) {
  const [visible, setVisible] = useState(true);
  const lastYRef = useRef(0);
  const frameRef = useRef(0);

  useEffect(() => {
    lastYRef.current = Math.max(0, window.scrollY || 0);
    setVisible(true);
  }, [routeKey]);

  useEffect(() => {
    if (locked) setVisible(true);
  }, [locked]);

  useEffect(() => {
    const onScroll = () => {
      if (frameRef.current) return;
      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = 0;
        const next = mobileAppBarVisibility({
          currentVisible: visible,
          lastY: lastYRef.current,
          nextY: window.scrollY,
          locked,
        });
        lastYRef.current = next.lastY;
        setVisible(next.visible);
      });
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frameRef.current) window.cancelAnimationFrame(frameRef.current);
      frameRef.current = 0;
    };
  }, [locked, visible]);

  return visible;
}
