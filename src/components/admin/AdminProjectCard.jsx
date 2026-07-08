import { Edit, GripVertical, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';

export default function AdminProjectCard({
  project,
  onDelete,
  draggable = false,
  isDragging = false,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  orderLabel,
}) {
  return (
    <article
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={clsx(
        'grid gap-4 rounded-lg border border-white/10 bg-zinc-900/70 p-4 transition md:grid-cols-[1fr_auto] md:items-center',
        draggable && 'cursor-grab active:cursor-grabbing',
        isDragging && 'border-amber-300/50 bg-zinc-900 opacity-70'
      )}
    >
      <div className="flex items-start gap-3">
        {draggable && (
          <span className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-md border border-white/10 text-zinc-500" aria-hidden="true">
            <GripVertical size={16} />
          </span>
        )}
        <div>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold text-white">{project.title}</h3>
          {orderLabel && <span className="rounded-md bg-white/5 px-2 py-1 text-xs text-zinc-300">{orderLabel}</span>}
          <span className="rounded-md bg-white/5 px-2 py-1 text-xs text-zinc-300">{project.category}</span>
          <span className={clsx('rounded-md px-2 py-1 text-xs', project.status === 'published' ? 'bg-emerald-400/15 text-emerald-200' : 'bg-zinc-700 text-zinc-200')}>
            {project.status}
          </span>
          {project.featured && <span className="rounded-md bg-amber-400/15 px-2 py-1 text-xs text-amber-200">Featured</span>}
        </div>
        <p className="mt-2 text-sm text-zinc-500">/{project.slug}</p>
        </div>
      </div>
      <div className="flex gap-2">
        <Link to={`/admin/projects/${project.id}/edit`} className="inline-flex items-center gap-2 rounded-md border border-white/10 px-3 py-2 text-sm text-zinc-200 hover:border-amber-300/60 hover:text-amber-200">
          <Edit size={16} /> Edit
        </Link>
        <button onClick={() => onDelete(project)} className="inline-flex items-center gap-2 rounded-md border border-red-400/20 px-3 py-2 text-sm text-red-200 hover:bg-red-500/10">
          <Trash2 size={16} /> Delete
        </button>
      </div>
    </article>
  );
}
