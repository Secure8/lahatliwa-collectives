import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createMobileAppBarScrollState, mobileAppBarVisibility } from './mobileAppShell';

export default function useMobileAppBar({ locked = false, routeKey = '' } = {}) {
  const [visible, setVisible] = useState(true);
  const scrollStateRef = useRef(createMobileAppBarScrollState());
  const frameRef = useRef(0);

  useLayoutEffect(() => {
    scrollStateRef.current = createMobileAppBarScrollState({ lastY: window.scrollY || 0 });
    setVisible(true);
  }, [routeKey]);

  useEffect(() => {
    if (!locked) return;
    scrollStateRef.current = createMobileAppBarScrollState({ lastY: window.scrollY || 0 });
    setVisible(true);
  }, [locked]);

  useEffect(() => {
    const onScroll = () => {
      if (frameRef.current) return;
      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = 0;
        const next = mobileAppBarVisibility({
          state: scrollStateRef.current,
          nextY: window.scrollY,
          locked,
        });
        scrollStateRef.current = next;
        setVisible(next.visible);
      });
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frameRef.current) window.cancelAnimationFrame(frameRef.current);
      frameRef.current = 0;
    };
  }, [locked]);

  return visible;
}
