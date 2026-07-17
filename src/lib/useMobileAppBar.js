import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createMobileAppBarScrollState, MOBILE_APP_BAR_TOP_VISIBLE_BOUNDARY, mobileAppBarVisibility } from './mobileAppShell';

export default function useMobileAppBar({ locked = false, routeKey = '' } = {}) {
  const [visibility, setVisibility] = useState(() => createMobileAppBarScrollState());
  const scrollStateRef = useRef(createMobileAppBarScrollState());
  const frameRef = useRef(0);

  useLayoutEffect(() => {
    scrollStateRef.current = createMobileAppBarScrollState({ lastY: window.scrollY || 0 });
    setVisibility(scrollStateRef.current);
  }, [routeKey]);

  useEffect(() => {
    if (!locked) return;
    scrollStateRef.current = createMobileAppBarScrollState({
      lastY: window.scrollY || 0,
      primaryVisible: scrollStateRef.current.primaryVisible || (window.scrollY || 0) <= MOBILE_APP_BAR_TOP_VISIBLE_BOUNDARY,
    });
    setVisibility(scrollStateRef.current);
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
        setVisibility(next);
      });
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frameRef.current) window.cancelAnimationFrame(frameRef.current);
      frameRef.current = 0;
    };
  }, [locked]);

  return visibility;
}
