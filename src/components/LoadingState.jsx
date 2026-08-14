import { useEffect, useState } from 'react';

export default function LoadingState({ label = 'Loading', delay = 180, compact = false }) {
  const [visible, setVisible] = useState(delay <= 0);

  useEffect(() => {
    if (delay <= 0) return undefined;
    const timer = window.setTimeout(() => setVisible(true), delay);
    return () => window.clearTimeout(timer);
  }, [delay]);

  if (!visible) {
    return <div className={compact ? 'h-8' : 'h-14'} role="status" aria-live="polite" aria-label={label} />;
  }

  return (
    <div className={`ll-loading-state ${compact ? 'is-compact' : ''}`} role="status" aria-live="polite" aria-label={label}>
      <span className="ll-loading-dots" aria-hidden="true"><i/><i/><i/></span>
      <p>{label}</p>
    </div>
  );
}
