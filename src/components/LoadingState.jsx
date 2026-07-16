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
    <div className={compact ? 'py-5' : 'py-8'} role="status" aria-live="polite" aria-label={label}>
      <div className="mx-auto flex max-w-xl flex-col items-center justify-center gap-3 text-center">
        <span className={`brand-loading-mark ${compact ? 'brand-loading-mark--compact' : ''}`} aria-hidden="true">
          <img src="/official-logo.webp" alt="" width="56" height="56" className="brand-loading-mark__image" />
        </span>
        <p className="text-xs font-medium tracking-[0.08em] text-zinc-500">{label}...</p>
      </div>
    </div>
  );
}
