import { FileText, FolderKanban, Inbox, Plus, Settings, Users, Workflow } from 'lucide-react';
import { useEffect, useState } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import DashboardStats from '../../components/admin/DashboardStats';
import { AdminActionButton, AdminButton, AdminEmptyState, AdminPageHeader, AdminSoftPanel, AdminStatusBadge, AdminSurface } from '../../components/admin/AdminUI';
import LoadingState from '../../components/LoadingState';
import { canCreateProjects, canManageAllProjects, canManageSettings, canManageTeam, useAdminAccess } from '../../lib/adminAccess';
import { formatDate } from '../../lib/helpers';
import { supabase } from '../../lib/supabaseClient';

export default function Dashboard() {
  const { role, user } = useAdminAccess();
  const canSeeAll = canManageAllProjects(role);
  const canViewInquiries = ['super_admin', 'admin', 'editor', 'creative', 'viewer'].includes(role);
  const [stats, setStats] = useState({ total: 0, published: 0, draft: 0, featured: 0, creatives: 0, newInquiries: 0, serviceBranches: 0 });
  const [recentProjects, setRecentProjects] = useState([]);
  const [latestInquiries, setLatestInquiries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadStats() {
      let projectQuery = supabase
        .from('projects')
        .select('id, title, slug, status, featured, category, created_at, review_status, owner_user_id, created_by')
        .order('created_at', { ascending: false });
      if (!canSeeAll) {
        projectQuery = projectQuery.or(`owner_user_id.eq.${user?.id},created_by.eq.${user?.id}`);
      }
      const [
        { data: projectRows },
        { data: creativeRows },
        { data: inquiryRows },
        { data: branchRows },
      ] = await Promise.all([
        projectQuery,
        supabase.from('creative_members').select('id, is_published'),
        canViewInquiries
          ? supabase.from('project_inquiries').select('id, name, project_type, message, status, created_at').order('created_at', { ascending: false })
          : Promise.resolve({ data: [] }),
        supabase.from('service_branches').select('id, is_published'),
      ]);
      const rows = projectRows || [];
      const inquiries = inquiryRows || [];
      setStats({
        total: rows.length,
        published: rows.filter((project) => project.status === 'published').length,
        draft: rows.filter((project) => project.status === 'draft').length,
        featured: rows.filter((project) => project.featured).length,
        creatives: (creativeRows || []).length,
        newInquiries: inquiries.filter((inquiry) => inquiry.status === 'new').length,
        serviceBranches: (branchRows || []).length,
      });
      setRecentProjects(rows.slice(0, 5));
      setLatestInquiries(inquiries.slice(0, 4));
      setLoading(false);
    }
    if (canSeeAll || user?.id) loadStats();
  }, [canSeeAll, canViewInquiries, user?.id]);

  return (
    <AdminLayout>
      <AdminPageHeader
        eyebrow="Welcome back"
        title="Studio Command Center"
        description="A calm overview of projects, creatives, inquiries, service modules, and content activity across Lahat Liwa Collectives."
        action={canCreateProjects(role) && <AdminButton to="/admin/projects/new" variant="primary"><Plus size={17} /> New project</AdminButton>}
      />

      <AdminSurface className="mb-6 overflow-hidden p-0">
        <div className="grid gap-8 p-6 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-amber-200/70">Collective operations</p>
            <h2 className="mt-4 max-w-2xl text-3xl font-semibold leading-tight text-white">Manage the work, people, services, and client pipeline from one focused space.</h2>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-zinc-400">Use quick actions for frequent updates, then review current activity below.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:w-80 lg:grid-cols-1">
            <QuickAction to="/admin/projects" icon={FolderKanban} label="Manage projects" />
            {canSeeAll && <QuickAction to="/admin/creatives" icon={Users} label="Manage creatives" />}
            {canSeeAll && <QuickAction to="/admin/service-branches" icon={Workflow} label="Service branches" />}
            {canViewInquiries && <QuickAction to="/admin/inquiries" icon={Inbox} label="View inquiries" />}
            {canCreateProjects(role) && <QuickAction to="/admin/content" icon={FileText} label="Edit content" />}
            {canManageTeam(role) && <QuickAction to="/admin/team" icon={Users} label="Team access" />}
            {canManageSettings(role) && <QuickAction to="/admin/settings" icon={Settings} label="Site settings" />}
          </div>
        </div>
      </AdminSurface>

      {loading ? <LoadingState label="Loading dashboard" /> : (
        <div className="grid gap-6">
          <DashboardStats stats={stats} />

          <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
            <AdminSurface>
              <div className="mb-5 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Recent projects</p>
                  <h2 className="mt-2 text-xl font-semibold text-white">Latest work updates</h2>
                </div>
                <AdminButton to="/admin/projects" variant="ghost">View all</AdminButton>
              </div>
              {recentProjects.length ? (
                <div className="grid gap-3">
                  {recentProjects.map((project) => (
                    <AdminSoftPanel key={project.id} className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-medium text-white">{project.title}</h3>
                          <AdminStatusBadge status={project.review_status || project.status} />
                          {project.featured && <AdminStatusBadge status="featured">Featured</AdminStatusBadge>}
                        </div>
                        <p className="mt-1 text-sm text-zinc-500">{project.category} / {formatDate(project.created_at)}</p>
                      </div>
                      <AdminActionButton to={`/admin/projects/${project.id}/edit`}>Edit</AdminActionButton>
                    </AdminSoftPanel>
                  ))}
                </div>
              ) : <AdminEmptyState title="No projects yet" message="Create the first project to begin filling the collective portfolio." />}
            </AdminSurface>

            <AdminSurface>
              <div className="mb-5 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Client pipeline</p>
                  <h2 className="mt-2 text-xl font-semibold text-white">Latest inquiries</h2>
                </div>
                <AdminButton to="/admin/inquiries" variant="ghost">Open</AdminButton>
              </div>
              {latestInquiries.length ? (
                <div className="grid gap-3">
                  {latestInquiries.map((inquiry) => (
                    <AdminSoftPanel key={inquiry.id}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="font-medium text-white">{inquiry.name}</h3>
                          <p className="mt-1 text-sm text-zinc-500">{inquiry.project_type}</p>
                        </div>
                        <AdminStatusBadge status={inquiry.status} />
                      </div>
                      <p className="mt-3 line-clamp-2 text-sm leading-6 text-zinc-400">{inquiry.message}</p>
                    </AdminSoftPanel>
                  ))}
                </div>
              ) : <AdminEmptyState title="No inquiries yet" message="Project inquiries from the public site will appear here." />}
            </AdminSurface>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

function QuickAction({ to, icon: Icon, label }) {
  return (
    <AdminButton to={to} variant="secondary" className="justify-start rounded-md">
      <span className="inline-flex items-center gap-2"><Icon size={16} /> {label}</span>
    </AdminButton>
  );
}

