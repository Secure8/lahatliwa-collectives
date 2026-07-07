import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import AdminLayout from '../../components/admin/AdminLayout';
import ProjectForm from '../../components/admin/ProjectForm';
import LoadingState from '../../components/LoadingState';
import { supabase } from '../../lib/supabaseClient';

export default function EditProject() {
  const { id } = useParams();
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadProject() {
      const { data, error: projectError } = await supabase.from('projects').select('*').eq('id', id).single();
      if (projectError) setError(projectError.message);
      else setProject(data);
      setLoading(false);
    }
    loadProject();
  }, [id]);

  return (
    <AdminLayout>
      <div className="mb-8">
        <p className="text-sm text-amber-200">Edit</p>
        <h1 className="mt-2 text-3xl font-bold">Edit Project</h1>
      </div>
      {loading && <LoadingState label="Loading project" />}
      {error && <div className="rounded-lg border border-red-400/30 bg-red-500/10 p-4 text-red-100">{error}</div>}
      {project && (
        <div className="rounded-lg border border-white/10 bg-zinc-900/70 p-5">
          <ProjectForm initialProject={project} mode="edit" />
        </div>
      )}
    </AdminLayout>
  );
}
