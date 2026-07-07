export default function EmptyState({ title = 'Nothing here yet', message = 'Check back soon for new work.' }) {
  return (
    <div className="border-y border-dashed border-white/15 py-12 text-center">
      <h3 className="text-lg font-semibold text-white">{title}</h3>
      <p className="mt-2 text-sm text-zinc-400">{message}</p>
    </div>
  );
}
