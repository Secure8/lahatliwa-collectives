import { Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import AdminProjectCard from '../../components/admin/AdminProjectCard';
import { AdminButton, AdminEmptyState, AdminNotice, AdminPageHeader, AdminSurface } from '../../components/admin/AdminUI';
import LoadingState from '../../components/LoadingState';
import { canCreateProjects, canDeleteProject, canManageAllProjects, useAdminAccess } from '../../lib/adminAccess';
import { supabase } from '../../lib/supabaseClient';
import { deleteImages } from '../../lib/storage';

export default function AdminProjects() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingOrder, setSavingOrder] = useState(false);
  const [draggingProjectId, setDraggingProjectId] = useState('');
  const [error, setError] = useState('');
  const { role, user } = useAdminAccess();
  const canCreate = canCreateProjects(role);
  const canManageAll = canManageAllProjects(role);

  async function loadProjects() {
    setLoading(true);
    let query = supabase
      .from('projects')
      .select('*')
      .order('featured', { ascending: false })
      .order('display_order', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false });

    if (!canManageAll && user?.id) {
      query = query.or(`owner_user_id.eq.${user.id},created_by.eq.${user.id}`);
    }

    const { data, error: projectError } = await query;
    if (projectError) setError(projectError.message);
    else setProjects(data || []);
    setLoading(false);
  }

  useEffect(() => {
    loadProjects();
  }, []);

  const featuredProjects = useMemo(() => projects.filter((project) => project.featured), [projects]);

  function moveProject(items, activeId, targetId) {
    const fromIndex = items.findIndex((project) => project.id === activeId);
    const toIndex = items.findIndex((project) => project.id === targetId);
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return items;
    const next = [...items];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    return next;
  }

  async function saveFeaturedOrder(orderedProjects) {
    const orderedWithPositions = orderedProjects.map((project, index) => ({
      ...project,
      display_order: (index + 1) * 100,
    }));

    setSavingOrder(true);
    setError('');
    try {
      const updates = await Promise.all(
        orderedWithPositions.map((project) => (
          supabase
            .from('projects')
            .update({ display_order: project.display_order })
            .eq('id', project.id)
        ))
      );
      const failedUpdate = updates.find((result) => result.error);
      if (failedUpdate?.error) throw failedUpdate.error;

      const orderMap = new Map(orderedWithPositions.map((project) => [project.id, project]));
      setProjects((current) => [
        ...orderedWithPositions,
        ...current.filter((project) => !orderMap.has(project.id)),
      ]);
    } catch (orderError) {
      setError(orderError.message || 'Could not save the featured project order.');
    } finally {
      setSavingOrder(false);
      setDraggingProjectId('');
    }
  }

  function handleDrop(targetId) {
    if (!draggingProjectId || draggingProjectId === targetId || savingOrder) {
      setDraggingProjectId('');
      return;
    }
    const reordered = moveProject(featuredProjects, draggingProjectId, targetId);
    saveFeaturedOrder(reordered);
  }

  async function deleteProject(project) {
    if (!canDeleteProject(role, project)) {
      setError('You do not have permission to delete this project.');
      return;
    }
    const confirmed = window.confirm(`Delete "${project.title}"? This cannot be undone.`);
    if (!confirmed) return;
    const { error: deleteError } = await supabase.from('projects').delete().eq('id', project.id);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    const thumbnailPaths = (project.gallery_items || [])
      .map((item) => item.thumbnail_storage_path)
      .filter(Boolean);
    await deleteImages([project.cover_image, ...(project.gallery_images || []), ...thumbnailPaths]);
    setProjects((current) => current.filter((item) => item.id !== project.id));
  }

  return (
    <AdminLayout>
      <AdminPageHeader
        eyebrow="Project manager"
        title="Projects"
        description={canManageAll ? 'Arrange featured works, manage drafts, and keep the collective portfolio moving.' : 'Manage your own drafts, submissions, and published works under the collective.'}
        action={canCreate && <AdminButton to="/admin/projects/new" variant="primary">
          <Plus size={18} /> New project
        </AdminButton>}
      />
      {loading && <LoadingState label="Loading admin projects" />}
      {error && <AdminNotice className="mb-5">{error}</AdminNotice>}
      {!loading && (
        projects.length ? (
          <div className="grid gap-6">
            {canManageAll && <AdminSurface className="grid gap-4">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Homepage curation</p>
                  <h2 className="mt-2 text-xl font-semibold text-white">Featured order</h2>
                  <p className="mt-2 text-sm text-zinc-500">Drag selected projects to arrange how they appear on the homepage.</p>
                </div>
                {savingOrder && <span className="text-sm text-amber-200">Saving order...</span>}
              </div>
              {featuredProjects.length ? (
                <div className="grid gap-3">
                  {featuredProjects.map((project, index) => (
                    <AdminProjectCard
                      key={`featured-${project.id}`}
                      project={project}
                      onDelete={deleteProject}
                      draggable={!savingOrder}
                      isDragging={draggingProjectId === project.id}
                      orderLabel={`#${index + 1}`}
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = 'move';
                        setDraggingProjectId(project.id);
                      }}
                      onDragEnd={() => setDraggingProjectId('')}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => {
                        event.preventDefault();
                        handleDrop(project.id);
                      }}
                    />
                  ))}
                </div>
              ) : <AdminEmptyState title="No featured projects yet" message="Mark projects as featured to arrange them here." />}
            </AdminSurface>}

            <AdminSurface className="grid gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Content library</p>
                <h2 className="mt-2 text-xl font-semibold text-white">All projects</h2>
              </div>
              {projects.map((project) => <AdminProjectCard key={project.id} project={project} onDelete={deleteProject} />)}
            </AdminSurface>
          </div>
        ) : <AdminEmptyState title="No projects yet" message="Add your first project from the dashboard." action={canCreate && <AdminButton to="/admin/projects/new" variant="primary"><Plus size={17} /> Add project</AdminButton>} />
      )}
    </AdminLayout>
  );
}

