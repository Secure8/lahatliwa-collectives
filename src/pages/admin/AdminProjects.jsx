import { Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import AdminProjectCard from '../../components/admin/AdminProjectCard';
import { AdminButton, AdminEmptyState, AdminNotice, AdminPageHeader } from '../../components/admin/AdminUI';
import LoadingState from '../../components/LoadingState';
import { canCreateProjects, canDeleteProject, canManageAllProjects, useAdminAccess } from '../../lib/adminAccess';
import { supabase } from '../../lib/supabaseClient';
import { deleteImages } from '../../lib/storage';
import {
  collectProjectExternalMediaObjectIds,
  collectProjectExternalPreviewPaths,
  collectProjectMediaPaths,
} from '../../lib/projectMediaCleanup';
import {
  deleteGoogleDriveMedia,
  prepareGoogleDriveProjectDeletion,
} from '../../lib/googleDriveStorage';

export default function AdminProjects() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingOrder, setSavingOrder] = useState(false);
  const [draggingProjectId, setDraggingProjectId] = useState('');
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
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

    const { data, error: projectError } = await query;
    if (projectError) setError(projectError.message);
    else setProjects(data || []);
    setLoading(false);
  }

  useEffect(() => {
    loadProjects();
  }, []);

  const featuredProjects = useMemo(() => projects.filter((project) => project.featured), [projects]);
  const filteredProjects = useMemo(() => projects.filter((project) => (
    filter === 'all'
    || (filter === 'owned' && (project.owner_user_id === user?.id || project.created_by === user?.id))
    || (filter === 'published' && project.status === 'published')
    || (filter === 'draft' && project.status === 'draft')
    || (filter === 'archived' && project.review_status === 'archived')
  )), [filter, projects, user?.id]);

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
    const externalMediaIds = collectProjectExternalMediaObjectIds(project);
    const externalPreviewPaths = new Set(collectProjectExternalPreviewPaths(project));
    const projectMediaPaths = collectProjectMediaPaths(project).filter((path) => !externalPreviewPaths.has(path));
    if (externalMediaIds.length) {
      try {
        await prepareGoogleDriveProjectDeletion(project.id, externalMediaIds);
      } catch (cleanupError) {
        setError(cleanupError.message || 'Private Google Drive media cleanup could not be prepared, so the project was not deleted.');
        return;
      }
    }
    const { error: queueError } = await supabase.rpc('enqueue_project_media_cleanup', { p_project_id: project.id, p_paths: projectMediaPaths, p_reason: 'project_deleted' });
    if (queueError) { setError(queueError.message); return; }
    const { error: deleteError } = await supabase.from('projects').delete().eq('id', project.id);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    const supabaseCleanup = async () => {
      await deleteImages(projectMediaPaths);
      const { error: completeError } = await supabase.rpc('complete_project_cleanup_paths', { p_project_id: project.id, p_paths: projectMediaPaths });
      if (completeError) throw completeError;
    };
    const cleanupResults = await Promise.allSettled([
      ...(projectMediaPaths.length ? [supabaseCleanup()] : []),
      ...externalMediaIds.map((mediaObjectId) => deleteGoogleDriveMedia(mediaObjectId, { projectId: project.id })),
    ]);
    if (cleanupResults.some((result) => result.status === 'rejected')) {
      setError('Project deleted. Some media cleanup remains queued or privately recorded for administrator follow-up.');
    }
    setProjects((current) => current.filter((item) => item.id !== project.id));
  }

  return (
    <AdminLayout>
      <AdminPageHeader
        eyebrow="Project manager"
        title="Projects"
        description={canManageAll ? 'Manage published project records, drafts, featured placement, and contributor credits.' : 'Browse available project records, then manage the work you own or have been assigned.'}
        action={canCreate && <AdminButton to="/admin/projects/new" variant="primary">
          <Plus size={18} /> New project
        </AdminButton>}
      />
      {loading && <LoadingState label="Loading admin projects" />}
      {error && <AdminNotice className="mb-5">{error}</AdminNotice>}
      {!loading && (
        projects.length ? (
          <div className="grid gap-6">
            {canManageAll && <section className="grid gap-4 border-y border-white/[0.07] py-5">
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
            </section>}

            <section className="grid gap-4 border-y border-white/[0.07] py-5">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Content library</p>
                <h2 className="mt-2 text-xl font-semibold text-white">All projects</h2>
              </div>
              <div className="flex flex-wrap gap-2" aria-label="Filter admin projects">{[['all','All projects'],['published','Published'],['draft','Drafts'],['archived','Archived'],['owned','My projects']].map(([key,label])=><AdminButton key={key} aria-pressed={filter===key} onClick={()=>setFilter(key)} variant={filter===key?'primary':'secondary'}>{label}</AdminButton>)}</div>
              {filteredProjects.map((project) => <AdminProjectCard key={project.id} project={project} onDelete={deleteProject} />)}
              {!filteredProjects.length && <p className="text-sm text-zinc-500">{filter === 'owned' ? 'You have not created any projects yet.' : `No ${filter === 'all' ? 'team' : filter} projects yet.`}</p>}
            </section>
          </div>
        ) : <AdminEmptyState title="No projects yet" message="Add your first project from the dashboard." action={canCreate && <AdminButton to="/admin/projects/new" variant="primary"><Plus size={17} /> Add project</AdminButton>} />
      )}
    </AdminLayout>
  );
}

