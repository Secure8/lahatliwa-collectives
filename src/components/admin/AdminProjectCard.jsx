import { ArrowDown, ArrowUp, Calendar, Edit, GripVertical, Images, Trash2 } from 'lucide-react';
import clsx from 'clsx';
import { canDeleteProject, canEditProject, useAdminAccess } from '../../lib/adminAccess';
import { formatDate } from '../../lib/helpers';
import { getPublicImageUrl } from '../../lib/storage';
import { AdminActionButton, AdminActionGroup, AdminStatusBadge } from './AdminUI';

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
  position,
  total,
  moving = false,
  onMoveUp,
  onMoveDown,
}) {
  const mediaCount = (project.gallery_images || []).length + (project.gallery_items || []).length;
  const { role, user } = useAdminAccess();
  const canEdit = canEditProject(role, project, user?.id);
  const canDelete = canDeleteProject(role, project);
  const coverImage = getPublicImageUrl(project.cover_image);

  return (
    <article
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={clsx(
        'group grid gap-4 border-b border-white/[0.06] px-1 py-4 transition-colors duration-150 last:border-b-0 md:grid-cols-[1fr_auto] md:items-center md:px-2',
        draggable && 'cursor-grab active:cursor-grabbing',
        isDragging && 'bg-amber-200/[0.08] opacity-75 ring-amber-200/30'
      )}
    >
      <div className="flex items-start gap-3">
        {draggable && (
          <span className="mt-1 hidden h-9 w-9 shrink-0 place-items-center rounded-md bg-white/[0.055] text-zinc-500 ring-1 ring-white/[0.07] transition group-hover:text-amber-100 md:grid" aria-hidden="true">
            <GripVertical size={16} />
          </span>
        )}
        <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-md border border-white/[0.08] bg-zinc-950 text-[10px] font-semibold uppercase tracking-[0.1em] text-zinc-600">
          {coverImage ? <img src={coverImage} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" /> : 'No image'}
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-white">{project.title}</h3>
            {orderLabel && <AdminStatusBadge status="featured">{orderLabel}</AdminStatusBadge>}
            <AdminStatusBadge status={project.status} />
            {project.review_status && <AdminStatusBadge status={project.review_status}>{project.review_status.replace('_', ' ')}</AdminStatusBadge>}
            {project.featured && <AdminStatusBadge status="featured">Featured</AdminStatusBadge>}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm text-zinc-500">
            <span>{project.category}</span>
            <span className="inline-flex items-center gap-1.5"><Calendar size={14} /> {formatDate(project.project_date || project.created_at)}</span>
            <span className="inline-flex items-center gap-1.5"><Images size={14} /> {mediaCount} media</span>
            {project.display_order != null && <span>Order {project.display_order}</span>}
          </div>
          <p className="mt-2 truncate text-sm text-zinc-600">/{project.slug}</p>
        </div>
      </div>
      <AdminActionGroup className="admin-record-actions md:justify-end">
        {draggable && <>
          <AdminActionButton onClick={onMoveUp} disabled={moving || position === 0} aria-label={`Move ${project.title} up`}>
            <ArrowUp size={14} aria-hidden="true" /> Up
          </AdminActionButton>
          <AdminActionButton onClick={onMoveDown} disabled={moving || position === total - 1} aria-label={`Move ${project.title} down`}>
            <ArrowDown size={14} aria-hidden="true" /> Down
          </AdminActionButton>
        </>}
        {canEdit && <AdminActionButton to={`/admin/projects/${project.id}/edit`}>
          <Edit size={14} /> Edit
        </AdminActionButton>}
        {canDelete && <AdminActionButton onClick={() => onDelete(project)} variant="danger">
          <Trash2 size={14} /> Delete
        </AdminActionButton>}
      </AdminActionGroup>
    </article>
  );
}

