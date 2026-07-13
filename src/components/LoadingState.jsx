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
    <div className={`major-border-y ${compact ? 'py-5' : 'py-8'}`} role="status" aria-live="polite" aria-label={label}>
      <div className="mx-auto grid max-w-xl gap-3">
        <div className="h-2 w-28 rounded-sm bg-white/[0.09]" />
        <div className="h-2 w-full rounded-sm bg-white/[0.055]" />
        <div className="h-2 w-2/3 rounded-sm bg-white/[0.04]" />
        <p className="pt-1 text-xs text-zinc-600">{label}...</p>
      </div>
    </div>
  );
}
