import { useEffect, useRef } from 'react';

const focusableSelector = 'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

export default function useModalDrawer({ open, onClose }) {
  const panelRef = useRef(null);
  const triggerRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;

    const root = document.documentElement;
    const previousOverflow = document.body.style.overflow;
    const previouslyFocused = document.activeElement;
    root.classList.add('mobile-navigation-open');
    document.body.style.overflow = 'hidden';

    const focusPanel = window.requestAnimationFrame(() => {
      const initial = panelRef.current?.querySelector('[data-drawer-initial-focus]') || panelRef.current?.querySelector(focusableSelector);
      initial?.focus();
    });

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;
      const focusable = [...panelRef.current.querySelectorAll(focusableSelector)].filter((element) => !element.hasAttribute('hidden'));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.cancelAnimationFrame(focusPanel);
      document.removeEventListener('keydown', onKeyDown);
      root.classList.remove('mobile-navigation-open');
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [open]);

  return { panelRef, triggerRef };
}
