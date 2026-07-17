import { useEffect, useRef } from 'react';
import { motionSafeScrollBehavior, scheduleProgressiveNavigation } from './useProgressiveNavigation';

export { motionSafeScrollBehavior };

export default function useStepScroll({ containerRef, request = 0 }) {
  const cancelRef = useRef(() => {});

  useEffect(() => {
    if (!request) return undefined;
    cancelRef.current();
    cancelRef.current = scheduleProgressiveNavigation({ targetRef: containerRef });
    return () => cancelRef.current();
  }, [containerRef, request]);
}
