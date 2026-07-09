import AdminLayout from '../../components/admin/AdminLayout';
import { AdminPageHeader } from '../../components/admin/AdminUI';
import ProjectForm from '../../components/admin/ProjectForm';

export default function NewProject() {
  return (
    <AdminLayout>
      <AdminPageHeader eyebrow="Create" title="New Project" description="Build a polished portfolio entry with galleries, external links, contributors, and publishing controls." />
      <ProjectForm />
    </AdminLayout>
  );
}
