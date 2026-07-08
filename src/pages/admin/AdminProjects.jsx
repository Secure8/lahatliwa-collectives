import { Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import AdminLayout from '../../components/admin/AdminLayout';
import AdminProjectCard from '../../components/admin/AdminProjectCard';
import EmptyState from '../../components/EmptyState';
import LoadingState from '../../components/LoadingState';
import { supabase } from '../../lib/supabaseClient';
import { deleteImages } from '../../lib/storage';

export default function AdminProjects() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingOrder, setSavingOrder] = useState(false);
  const [draggingProjectId, setDraggingProjectId] = useState('');
  const [error, setError] = useState('');

  async function loadProjects() {
    setLoading(true);
    const { data, error: projectError } = await supabase
      .from('projects')
      .select('*')
      .order('featured', { ascending: false })
      .order('display_order', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false });
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
    const confirmed = window.confirm(`Delete "${project.title}"? This cannot be undone.`);
    if (!confirmed) return;
    const { error: deleteError } = await supabase.from('projects').delete().eq('id', project.id);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    await deleteImages([project.cover_image, ...(project.gallery_images || [])]);
    setProjects((current) => current.filter((item) => item.id !== project.id));
  }

  return (
    <AdminLayout>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-amber-200">Project manager</p>
          <h1 className="mt-2 text-3xl font-bold">Projects</h1>
        </div>
        <Link to="/admin/projects/new" className="inline-flex items-center gap-2 rounded-md bg-amber-300 px-4 py-3 font-semibold text-zinc-950">
          <Plus size={18} /> New project
        </Link>
      </div>
      {loading && <LoadingState label="Loading admin projects" />}
      {error && <div className="rounded-lg border border-red-400/30 bg-red-500/10 p-4 text-red-100">{error}</div>}
      {!loading && (
        projects.length ? (
          <div className="grid gap-8">
            <section className="grid gap-3">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-white">Featured order</h2>
                  <p className="mt-1 text-sm text-zinc-500">Drag selected projects to arrange how they appear on the homepage.</p>
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
              ) : <EmptyState title="No featured projects yet" message="Mark projects as featured to arrange them here." />}
            </section>

            <section className="grid gap-3">
              <h2 className="text-lg font-semibold text-white">All projects</h2>
              {projects.map((project) => <AdminProjectCard key={project.id} project={project} onDelete={deleteProject} />)}
            </section>
          </div>
        ) : <EmptyState title="No projects yet" message="Add your first project from the dashboard." />
      )}
    </AdminLayout>
  );
}
