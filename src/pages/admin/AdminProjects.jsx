import { Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
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
  const [error, setError] = useState('');

  async function loadProjects() {
    setLoading(true);
    const { data, error: projectError } = await supabase.from('projects').select('*').order('created_at', { ascending: false });
    if (projectError) setError(projectError.message);
    else setProjects(data || []);
    setLoading(false);
  }

  useEffect(() => {
    loadProjects();
  }, []);

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
      {!loading && !error && (
        projects.length ? (
          <div className="grid gap-3">
            {projects.map((project) => <AdminProjectCard key={project.id} project={project} onDelete={deleteProject} />)}
          </div>
        ) : <EmptyState title="No projects yet" message="Add your first project from the dashboard." />
      )}
    </AdminLayout>
  );
}
