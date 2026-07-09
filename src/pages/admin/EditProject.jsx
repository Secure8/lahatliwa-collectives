import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import AdminLayout from '../../components/admin/AdminLayout';
import { AdminNotice, AdminPageHeader } from '../../components/admin/AdminUI';
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
      <AdminPageHeader eyebrow="Edit" title="Edit Project" description="Refine project details, gallery content, contributor assignments, and publishing settings." />
      {loading && <LoadingState label="Loading project" />}
      {error && <AdminNotice>{error}</AdminNotice>}
      {project && <ProjectForm initialProject={project} mode="edit" />}
    </AdminLayout>
  );
}

