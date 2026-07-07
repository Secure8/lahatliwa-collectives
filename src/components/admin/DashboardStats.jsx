const labels = {
  total: 'Total Projects',
  published: 'Published',
  draft: 'Drafts',
  featured: 'Featured',
};

export default function DashboardStats({ stats }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Object.entries(labels).map(([key, label]) => (
        <div key={key} className="rounded-lg border border-white/10 bg-zinc-900/70 p-5">
          <p className="text-sm text-zinc-400">{label}</p>
          <p className="mt-3 text-3xl font-semibold text-white">{stats[key] ?? 0}</p>
        </div>
      ))}
    </div>
  );
}
