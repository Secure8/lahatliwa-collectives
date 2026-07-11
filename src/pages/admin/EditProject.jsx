import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import AdminLayout from '../../components/admin/AdminLayout';
import { AdminButton, AdminEmptyState, AdminNotice, AdminPageHeader } from '../../components/admin/AdminUI';
import ProjectForm from '../../components/admin/ProjectForm';
import LoadingState from '../../components/LoadingState';
import { supabase } from '../../lib/supabaseClient';
import { canEditProject, canManageAllProjects, useAdminAccess } from '../../lib/adminAccess';
import ContributorRequestPanel from '../../components/admin/ContributorRequestPanel';

export default function EditProject() {
  const { id } = useParams();
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { role, user, adminUser } = useAdminAccess();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
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
      {!loading && !project && <AdminEmptyState title="Project not found" message="The requested project could not be loaded." action={<AdminButton to="/admin/projects">Back to projects</AdminButton>} />}
      {project && (canEditProject(role, project, user?.id) || canManageAllProjects(role)
        ? <><ProjectForm initialProject={project} mode="edit" /><div className="mt-6"><ContributorRequestPanel project={project} creativeId={adminUser?.creative_member_id} canReview /></div></>
        : <><AdminNotice tone="success" className="mb-5">You can view this project as a contributor. Editing and credit management require owner, editor, manager, or administrator access.</AdminNotice><ContributorRequestPanel project={project} creativeId={adminUser?.creative_member_id} /></>)}
    </AdminLayout>
  );
}

