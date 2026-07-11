import { ExternalLink, FileText, FolderKanban, Images, Inbox, Plus, Settings, User, Users, Workflow } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AdminLayout from '../../components/admin/AdminLayout';
import { AdminButton, AdminEmptyState, AdminNotice, AdminPageHeader, AdminStatusBadge } from '../../components/admin/AdminUI';
import { canCreateProjects, canManageAllProjects, canManageSettings, canManageTeam, isPrivilegedRole, roleLabel, useAdminAccess } from '../../lib/adminAccess';
import { formatDate } from '../../lib/helpers';
import { supabase } from '../../lib/supabaseClient';

const focusLink = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/50';

export default function Dashboard() {
  const { role, user, adminUser } = useAdminAccess();
  const canSeeAll = canManageAllProjects(role);
  const canViewInquiries = ['super_admin', 'admin', 'editor', 'creative', 'viewer'].includes(role);
  const canManageMedia = isPrivilegedRole(role) || ['editor', 'creative'].includes(role);
  const canEditProfile = ['super_admin', 'admin', 'editor', 'creative'].includes(role);
  const [stats, setStats] = useState({ total: null, published: null, draft: null, featured: null, creatives: null, newInquiries: null, serviceBranches: null });
  const [recentProjects, setRecentProjects] = useState([]);
  const [latestInquiries, setLatestInquiries] = useState([]);
  const [errors, setErrors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!canSeeAll && !user?.id) return undefined;
    let active = true;

    async function loadDashboard() {
      setLoading(true);
      setErrors([]);

      let projectQuery = supabase
        .from('projects')
        .select('id, title, status, featured, category, created_at, updated_at, review_status, owner_user_id, created_by')
        .order('created_at', { ascending: false });
      if (!canSeeAll) projectQuery = projectQuery.or(`owner_user_id.eq.${user.id},created_by.eq.${user.id}`);

      const requests = [
        ['projects', projectQuery],
        ...(canSeeAll ? [['creatives', supabase.from('creative_members').select('id, is_published')]] : []),
        ...(canViewInquiries ? [['inquiries', supabase.from('project_inquiries').select('id, name, project_type, message, status, created_at').order('created_at', { ascending: false })]] : []),
        ...(canSeeAll ? [['branches', supabase.from('service_branches').select('id, is_published')]] : []),
      ];

      const settled = await Promise.allSettled(requests.map(([, request]) => request));
      if (!active) return;

      const nextErrors = [];
      const resultByName = {};
      settled.forEach((result, index) => {
        const name = requests[index][0];
        if (result.status === 'rejected' || result.value?.error) {
          nextErrors.push(`Unable to load ${name}.`);
          resultByName[name] = null;
        } else {
          resultByName[name] = result.value.data || [];
        }
      });

      const projects = resultByName.projects;
      const inquiries = resultByName.inquiries;
      setStats({
        total: projects ? projects.length : null,
        published: projects ? projects.filter((project) => project.status === 'published').length : null,
        draft: projects ? projects.filter((project) => project.status === 'draft').length : null,
        featured: projects ? projects.filter((project) => project.featured).length : null,
        creatives: resultByName.creatives ? resultByName.creatives.length : null,
        newInquiries: inquiries ? inquiries.filter((inquiry) => inquiry.status === 'new').length : null,
        serviceBranches: resultByName.branches ? resultByName.branches.length : null,
      });
      setRecentProjects((projects || []).slice(0, 5));
      setLatestInquiries((inquiries || []).slice(0, 4));
      setErrors(nextErrors);
      setLoading(false);
    }

    loadDashboard();
    return () => { active = false; };
  }, [canSeeAll, canViewInquiries, reloadKey, user?.id]);

  const displayName = adminUser?.display_name || adminUser?.name || user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'there';
  const metricItems = [
    ['total', canSeeAll ? 'Total projects' : 'Accessible projects', 'Projects available to your role'],
    ['published', 'Published', 'Currently public'],
    ['draft', 'Drafts', 'Still in progress'],
    ...(canSeeAll ? [
      ['creatives', 'Creatives', 'Profiles in the directory'],
      ['serviceBranches', 'Service branches', 'Configured service areas'],
    ] : []),
    ...(canViewInquiries ? [['newInquiries', 'New inquiries', 'Awaiting review']] : []),
  ];

  const quickActions = [
    ...(canCreateProjects(role) ? [{ to: '/admin/projects/new', icon: Plus, label: 'Create Project', detail: 'Add new portfolio work' }] : []),
    { to: '/admin/projects', icon: FolderKanban, label: 'Manage Projects', detail: canSeeAll ? 'Review all projects' : 'Open accessible projects' },
    ...(canEditProfile ? [{ to: '/admin/my-profile', icon: User, label: 'Edit My Profile', detail: 'Update your creative profile' }] : []),
    ...(canSeeAll ? [{ to: '/admin/creatives', icon: Users, label: 'Manage Creatives', detail: 'Edit creative profiles' }, { to: '/admin/service-branches', icon: Workflow, label: 'Service Branches', detail: 'Manage public services' }] : []),
    ...(canViewInquiries ? [{ to: '/admin/inquiries', icon: Inbox, label: 'Review Inquiries', detail: 'Open the client pipeline' }] : []),
    ...(isPrivilegedRole(role) ? [{ to: '/admin/content', icon: FileText, label: 'Edit Page Content', detail: 'Update public copy' }] : []),
    ...(canManageMedia ? [{ to: '/admin/media/icons', icon: Images, label: 'Manage Media', detail: 'Upload reusable assets' }] : []),
    ...(canManageTeam(role) ? [{ to: '/admin/team', icon: Users, label: 'Manage Team', detail: 'Review member access' }] : []),
    ...(canManageSettings(role) ? [{ to: '/admin/settings', icon: Settings, label: 'Site Settings', detail: 'Manage global appearance' }] : []),
    { href: '/', icon: ExternalLink, label: 'View Public Site', detail: 'Open the live website' },
  ];

  return (
    <AdminLayout>
      <div className="w-full max-w-6xl">
        <AdminPageHeader
          eyebrow={`${roleLabel(role)} access`}
          title={`Welcome, ${displayName}`}
          description={canSeeAll ? 'A focused overview of current projects, people, services, and client activity.' : 'Your accessible projects, profile, and current activity in one place.'}
          action={canCreateProjects(role) && <AdminButton to="/admin/projects/new" variant="primary"><Plus size={16} /> New Project</AdminButton>}
        />

        <div className="mb-5 border-y border-white/[0.08] py-3 text-xs uppercase tracking-[0.16em] text-zinc-600">
          Signed in as {roleLabel(role)}
        </div>

        {errors.length > 0 && <AdminNotice className="mb-6"><div className="flex flex-wrap items-center justify-between gap-3"><span>{errors.join(' ')}</span><button type="button" onClick={() => setReloadKey((current) => current + 1)} className={`border-b border-red-200/30 pb-1 text-sm text-red-100 ${focusLink}`}>Retry dashboard data</button></div></AdminNotice>}

        <section className="border-b border-white/[0.08] py-7 first:pt-2" aria-labelledby="summary-heading">
          <div className="mb-5">
            <h2 id="summary-heading" className="text-lg font-semibold text-white">System Summary</h2>
            <p className="mt-1 text-sm text-zinc-500">Live counts available to your current role.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3">
            {metricItems.map(([key, label, detail]) => <Metric key={key} label={label} value={stats[key]} detail={detail} loading={loading} />)}
          </div>
        </section>

        <section className="border-b border-white/[0.08] py-7" aria-labelledby="actions-heading">
          <div className="mb-5">
            <h2 id="actions-heading" className="text-lg font-semibold text-white">Quick Actions</h2>
            <p className="mt-1 text-sm text-zinc-500">Only tools permitted for your role are shown.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3">
            {quickActions.map((action) => <QuickAction key={action.to || action.href} {...action} />)}
          </div>
        </section>

        <section className="grid gap-8 border-b border-white/[0.08] py-7 lg:grid-cols-2">
          <ActivitySection title="Recent Projects" description={canSeeAll ? 'Latest portfolio additions.' : 'Latest projects available to you.'} actionTo="/admin/projects" actionLabel="View all projects">
            {loading ? <ActivitySkeleton /> : recentProjects.length ? recentProjects.map((project) => (
              <Link key={project.id} to={`/admin/projects/${project.id}/edit`} className={`grid cursor-pointer gap-2 border-t border-white/[0.1] px-2 py-4 transition hover:border-amber-200/25 hover:bg-white/[0.025] focus-visible:bg-white/[0.025] first:border-t-0 first:pt-0 sm:grid-cols-[1fr_auto] sm:items-start ${focusLink}`}>
                <div className="min-w-0"><h3 className="truncate font-medium text-white">{project.title}</h3><p className="mt-1 text-xs text-zinc-500">{project.category || 'Uncategorized'} · {formatDate(project.updated_at || project.created_at)}</p></div>
                <div className="flex flex-wrap gap-2"><AdminStatusBadge status={project.review_status || project.status} />{project.featured && <AdminStatusBadge status="featured">Featured</AdminStatusBadge>}</div>
              </Link>
            )) : <AdminEmptyState title="No projects yet" message={canCreateProjects(role) ? 'Create a project to begin building the portfolio.' : 'No projects are currently available to your account.'} />}
          </ActivitySection>

          {canViewInquiries && <ActivitySection title="Latest Inquiries" description="Newest messages in the client pipeline." actionTo="/admin/inquiries" actionLabel="View all inquiries">
            {loading ? <ActivitySkeleton /> : latestInquiries.length ? latestInquiries.map((inquiry) => (
              <Link key={inquiry.id} to="/admin/inquiries" className={`grid cursor-pointer gap-2 border-t border-white/[0.1] px-2 py-4 transition hover:border-amber-200/25 hover:bg-white/[0.025] focus-visible:bg-white/[0.025] first:border-t-0 first:pt-0 sm:grid-cols-[1fr_auto] sm:items-start ${focusLink}`}>
                <div className="min-w-0"><h3 className="truncate font-medium text-white">{inquiry.name}</h3><p className="mt-1 text-xs text-zinc-500">{inquiry.project_type || 'General inquiry'} · {formatDate(inquiry.created_at)}</p><p className="mt-2 line-clamp-1 text-sm text-zinc-500">{inquiry.message}</p></div>
                <AdminStatusBadge status={inquiry.status} />
              </Link>
            )) : <AdminEmptyState title="No inquiries yet" message="New project inquiries will appear here." />}
          </ActivitySection>}
        </section>

        <section className="py-7">
          <h2 className="text-lg font-semibold text-white">Working Safely</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-500">Use Team for access changes, Projects for portfolio work, and My Profile for your linked public identity. Dashboard counts reflect only data available to your current permissions.</p>
        </section>
      </div>
    </AdminLayout>
  );
}

function Metric({ label, value, detail, loading }) {
  return <div className="border-t border-white/[0.08] py-4 sm:px-4"><p className="text-xs uppercase tracking-[0.14em] text-zinc-600">{label}</p>{loading ? <div className="mt-3 h-7 w-12 animate-pulse bg-white/[0.05]" /> : <p className="mt-2 text-2xl font-semibold text-white">{value ?? '—'}</p>}<p className="mt-1 text-xs text-zinc-500">{detail}</p></div>;
}

function QuickAction({ to, href, icon: Icon, label, detail }) {
  const classes = `group grid grid-cols-[2rem_1fr] gap-3 border-t border-white/[0.08] py-4 text-left transition hover:border-amber-200/30 ${focusLink} sm:px-4 sm:first:pl-0`;
  const content = <><span className="grid h-8 w-8 place-items-center text-zinc-500 transition group-hover:text-amber-100"><Icon size={17} /></span><span><span className="block text-sm font-medium text-zinc-200 group-hover:text-white">{label}</span><span className="mt-1 block text-xs text-zinc-600">{detail}</span></span></>;
  return href ? <a href={href} target="_blank" rel="noreferrer noopener" className={classes}>{content}</a> : <Link to={to} className={classes}>{content}</Link>;
}

function ActivitySection({ title, description, actionTo, actionLabel, children }) {
  return <div className="min-w-0"><div className="mb-5 flex items-start justify-between gap-4"><div><h2 className="text-lg font-semibold text-white">{title}</h2><p className="mt-1 text-sm text-zinc-500">{description}</p></div><Link to={actionTo} className={`shrink-0 border-b border-white/[0.1] pb-1 text-xs text-zinc-400 hover:border-amber-200/40 hover:text-white ${focusLink}`}>{actionLabel}</Link></div>{children}</div>;
}

function ActivitySkeleton() {
  return <div aria-label="Loading recent activity">{[0, 1, 2].map((item) => <div key={item} className="grid gap-3 border-t border-white/[0.08] py-4 first:border-t-0 first:pt-0"><div className="h-3 w-2/3 animate-pulse bg-white/[0.05]" /><div className="h-2 w-1/3 animate-pulse bg-white/[0.04]" /></div>)}</div>;
}
