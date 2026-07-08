export default function LoadingState({ label = 'Loading' }) {
  return (
    <div className="major-border-y py-12 text-center text-zinc-400">
      <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-zinc-700" style={{ borderTopColor: 'var(--site-accent)' }} />
      {label}...
    </div>
  );
}
