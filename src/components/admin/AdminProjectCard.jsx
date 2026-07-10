import { Calendar, Edit, GripVertical, Images, Trash2 } from 'lucide-react';
import clsx from 'clsx';
import { canDeleteProject, canEditProject, useAdminAccess } from '../../lib/adminAccess';
import { formatDate } from '../../lib/helpers';
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
}) {
  const mediaCount = (project.gallery_images || []).length + (project.gallery_items || []).length;
  const { role, user } = useAdminAccess();
  const canEdit = canEditProject(role, project, user?.id);
  const canDelete = canDeleteProject(role, project);

  return (
    <article
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={clsx(
        'group grid gap-4 rounded-md bg-white/[0.045] p-4 ring-1 ring-white/[0.06] transition-colors duration-150 md:grid-cols-[1fr_auto] md:items-center',
        draggable && 'cursor-grab active:cursor-grabbing',
        isDragging && 'bg-amber-200/[0.08] opacity-75 ring-amber-200/30'
      )}
    >
      <div className="flex items-start gap-3">
        {draggable && (
          <span className="mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-md bg-white/[0.055] text-zinc-500 ring-1 ring-white/[0.07] transition group-hover:text-amber-100" aria-hidden="true">
            <GripVertical size={16} />
          </span>
        )}
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
      <AdminActionGroup className="md:justify-end">
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

