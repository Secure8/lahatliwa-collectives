import { useEffect, useState } from 'react';

export default function useKeyboardVisibility() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return undefined;
    const baseline = Math.max(window.innerHeight, viewport.height);
    const update = () => {
      const focused = document.activeElement?.matches?.('input, textarea, select, [contenteditable="true"]');
      setVisible(Boolean(focused && baseline - viewport.height > 140));
    };
    viewport.addEventListener('resize', update, { passive: true });
    viewport.addEventListener('scroll', update, { passive: true });
    document.addEventListener('focusin', update);
    document.addEventListener('focusout', update);
    return () => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
      document.removeEventListener('focusin', update);
      document.removeEventListener('focusout', update);
    };
  }, []);

  return visible;
}
