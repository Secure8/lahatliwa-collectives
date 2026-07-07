import AdminLayout from '../../components/admin/AdminLayout';
import ProjectForm from '../../components/admin/ProjectForm';

export default function NewProject() {
  return (
    <AdminLayout>
      <div className="mb-8">
        <p className="text-sm text-amber-200">Create</p>
        <h1 className="mt-2 text-3xl font-bold">New Project</h1>
      </div>
      <div className="rounded-lg border border-white/10 bg-zinc-900/70 p-5">
        <ProjectForm />
      </div>
    </AdminLayout>
  );
}
