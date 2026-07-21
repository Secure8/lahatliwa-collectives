import { Plus, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import AdminProjectCard from '../../components/admin/AdminProjectCard';
import { AdminButton, AdminEmptyState, AdminNotice, AdminPageHeader } from '../../components/admin/AdminUI';
import { useAdminConfirmation } from '../../components/admin/AdminDialog';
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
import { moveProjectBefore, moveProjectByOffset } from '../../lib/adminProjectOrdering';
import { finalizeManagedProjectDeletion, prepareManagedProjectDeletion } from '../../lib/r2Media';

export default function AdminProjects() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingOrder, setSavingOrder] = useState(false);
  const [draggingProjectId, setDraggingProjectId] = useState('');
  const [error, setError] = useState('');
  const [orderAnnouncement, setOrderAnnouncement] = useState('');
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const { role, user } = useAdminAccess();
  const canCreate = canCreateProjects(role);
  const canManageAll = canManageAllProjects(role);
  const { requestConfirmation, confirmationDialog } = useAdminConfirmation();

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
  const filteredProjects = useMemo(() => {
    const query = search.trim().toLowerCase();
    return projects.filter((project) => (
      (filter === 'all'
      || (filter === 'owned' && (project.owner_user_id === user?.id || project.created_by === user?.id))
      || (filter === 'published' && project.status === 'published')
      || (filter === 'draft' && project.status === 'draft')
      || (filter === 'archived' && project.review_status === 'archived'))
      && (!query || [project.title, project.category, project.slug].some((value) => String(value || '').toLowerCase().includes(query)))
    ));
  }, [filter, projects, search, user?.id]);

  async function saveFeaturedOrder(orderedProjects, announcement = '') {
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
      if (announcement) setOrderAnnouncement(announcement);
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
    const reordered = moveProjectBefore(featuredProjects, draggingProjectId, targetId);
    const movedIndex = reordered.findIndex((project) => project.id === draggingProjectId);
    const movedProject = reordered[movedIndex];
    saveFeaturedOrder(reordered, `${movedProject.title} moved to position ${movedIndex + 1} of ${reordered.length}.`);
  }

  function moveFeaturedProject(project, offset) {
    if (savingOrder) return;
    const reordered = moveProjectByOffset(featuredProjects, project.id, offset);
    if (reordered === featuredProjects) return;
    const nextIndex = reordered.findIndex((item) => item.id === project.id);
    saveFeaturedOrder(reordered, `${project.title} moved to position ${nextIndex + 1} of ${reordered.length}.`);
  }

  async function deleteProject(project) {
    if (!canDeleteProject(role, project)) {
      setError('You do not have permission to delete this project.');
      return;
    }
    requestConfirmation({
      title: `Delete “${project.title}”?`,
      description: 'This project and its connected media records will be removed. This cannot be undone.',
      confirmLabel: 'Delete project',
      destructive: true,
      onConfirm: () => performDeleteProject(project),
    });
  }

  async function performDeleteProject(project) {
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
    let r2DeletionAuthorization = null;
    try {
      const prepared = await prepareManagedProjectDeletion(project.id);
      r2DeletionAuthorization = prepared.authorization;
    } catch (cleanupError) {
      setError(cleanupError.message || 'Managed website media cleanup could not be prepared, so the project was not deleted.');
      return;
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
      ...(r2DeletionAuthorization ? [finalizeManagedProjectDeletion(project.id, r2DeletionAuthorization)] : []),
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
            {canManageAll && <section className="grid gap-4 rounded-lg border border-white/[0.1] bg-zinc-900 p-4 sm:p-5">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Homepage curation</p>
                  <h2 className="mt-2 text-xl font-semibold text-white">Featured order</h2>
                  <p className="mt-2 text-sm text-zinc-500">Use the arrow buttons, or drag with a pointer, to arrange how projects appear on the homepage.</p>
                </div>
                {savingOrder && <span className="text-sm text-amber-200">Saving order...</span>}
              </div>
              {featuredProjects.length ? (
                <div data-featured-project-grid className="grid gap-3 sm:gap-4">
                  <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{orderAnnouncement}</p>
                  {featuredProjects.map((project, index) => (
                    <AdminProjectCard
                      key={`featured-${project.id}`}
                      project={project}
                      onDelete={deleteProject}
                      separated
                      draggable={!savingOrder}
                      isDragging={draggingProjectId === project.id}
                      orderLabel={`#${index + 1}`}
                      position={index}
                      total={featuredProjects.length}
                      moving={savingOrder}
                      onMoveUp={() => moveFeaturedProject(project, -1)}
                      onMoveDown={() => moveFeaturedProject(project, 1)}
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

            <section className="overflow-hidden rounded-lg border border-white/[0.1] bg-zinc-900">
              <div className="border-b border-white/[0.1] p-4 sm:p-5">
                <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-[0.66rem] font-semibold uppercase tracking-[0.16em] text-zinc-600">Project list</p><h2 className="mt-1 text-lg font-semibold text-white">All projects</h2></div><span className="text-xs tabular-nums text-zinc-500">{filteredProjects.length} shown</span></div>
                <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(16rem,1fr)_auto] xl:items-center">
                  <label data-search-shell className="flex h-10 items-center gap-2 rounded-md border border-white/[0.12] bg-zinc-950 px-3"><Search size={15} className="text-zinc-600" /><span className="sr-only">Search projects</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search title, category, or slug" className="min-w-0 flex-1 border-0 bg-transparent text-sm text-white outline-none placeholder:text-zinc-600" /></label>
                  <div className="flex gap-1 overflow-x-auto" aria-label="Filter admin projects">{[['all','All'],['published','Published'],['draft','Drafts'],['archived','Archived'],['owned','Mine']].map(([key,label])=><button key={key} type="button" aria-pressed={filter===key} onClick={()=>setFilter(key)} className={`interactive-tab h-10 shrink-0 px-3 text-xs ${filter===key?'text-white':'text-zinc-500 hover:text-white'}`}>{label}</button>)}</div>
                </div>
              </div>
              <div data-project-card-grid className="grid gap-3 p-4 sm:gap-4 sm:p-5">{filteredProjects.map((project) => <AdminProjectCard key={project.id} project={project} onDelete={deleteProject} separated />)}</div>
              {!filteredProjects.length && <p className="px-5 py-12 text-center text-sm text-zinc-500">{search ? 'No projects match this search.' : filter === 'owned' ? 'You have not created any projects yet.' : `No ${filter === 'all' ? 'team' : filter} projects yet.`}</p>}
            </section>
          </div>
        ) : <AdminEmptyState title="No projects yet" message="Add your first project from the dashboard." action={canCreate && <AdminButton to="/admin/projects/new" variant="primary"><Plus size={17} /> Add project</AdminButton>} />
      )}
      {confirmationDialog}
    </AdminLayout>
  );
}

