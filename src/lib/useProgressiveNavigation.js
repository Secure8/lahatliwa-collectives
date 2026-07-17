import { useCallback, useEffect, useRef } from 'react';

export function motionSafeScrollBehavior() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
}

function currentNavigationOffset() {
  const bars = [
    document.querySelector('[data-public-mobile-primary][data-mobile-visible="true"]'),
    document.querySelector('[data-public-mobile-secondary][data-mobile-visible="true"]'),
    document.querySelector('[data-admin-mobile-app-bar][data-mobile-visible="true"]'),
  ].filter(Boolean);
  return Math.max(16, ...bars.map((bar) => Math.max(0, bar.getBoundingClientRect().bottom + 16)));
}

function targetIsComfortablyVisible(target, offset) {
  const rect = target.getBoundingClientRect();
  return rect.top >= offset && rect.top <= window.innerHeight * 0.42;
}

export function scheduleProgressiveNavigation({ targetRef, targetId, onComplete } = {}) {
  let cancelled = false;
  let started = false;
  let frame = 0;
  let settleFrame = 0;
  let stableFrames = 0;
  let previousY = window.scrollY;

  const stop = ({ halt = false } = {}) => {
    cancelled = true;
    if (frame) window.cancelAnimationFrame(frame);
    if (settleFrame) window.cancelAnimationFrame(settleFrame);
    if (halt && started) window.scrollTo({ top: window.scrollY, behavior: 'auto' });
    window.removeEventListener('wheel', interrupt);
    window.removeEventListener('touchstart', interrupt);
    window.removeEventListener('pointerdown', interrupt);
    window.removeEventListener('keydown', interrupt);
  };

  const interrupt = () => stop({ halt: true });
  const settle = () => {
    if (cancelled) return;
    if (Math.abs(window.scrollY - previousY) < 1) stableFrames += 1;
    else stableFrames = 0;
    previousY = window.scrollY;
    if (stableFrames >= 3) {
      stop();
      onComplete?.();
      return;
    }
    settleFrame = window.requestAnimationFrame(settle);
  };

  window.addEventListener('wheel', interrupt, { passive: true, once: true });
  window.addEventListener('touchstart', interrupt, { passive: true, once: true });
  window.addEventListener('pointerdown', interrupt, { passive: true, once: true });
  window.addEventListener('keydown', interrupt, { once: true });

  frame = window.requestAnimationFrame(() => {
    frame = window.requestAnimationFrame(() => {
      if (cancelled) return;
      const target = targetRef?.current || (targetId ? document.getElementById(targetId) : null);
      if (!target || targetIsComfortablyVisible(target, currentNavigationOffset())) {
        stop();
        return;
      }
      const offset = currentNavigationOffset();
      started = true;
      window.scrollTo({ top: Math.max(0, window.scrollY + target.getBoundingClientRect().top - offset), behavior: motionSafeScrollBehavior() });
      settleFrame = window.requestAnimationFrame(settle);
    });
  });

  return stop;
}

export default function useProgressiveNavigation({ routeKey = '' } = {}) {
  const cancelRef = useRef(() => {});
  const lastSelectionRef = useRef('');

  const navigateToNextStep = useCallback((options = {}) => {
    if (!options.selectionKey || options.selectionKey === lastSelectionRef.current) return false;
    lastSelectionRef.current = options.selectionKey;
    cancelRef.current();
    cancelRef.current = scheduleProgressiveNavigation(options);
    return true;
  }, []);

  useEffect(() => {
    lastSelectionRef.current = '';
    cancelRef.current();
  }, [routeKey]);

  useEffect(() => () => cancelRef.current(), []);

  return { navigateToNextStep, cancelProgressiveNavigation: () => cancelRef.current() };
}
