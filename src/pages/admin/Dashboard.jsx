import { ArrowRight, FolderKanban, Plus, User, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AdminLayout from '../../components/admin/AdminLayout';
import { AdminButton, AdminEmptyState, AdminNotice, AdminPageHeader, AdminStatusBadge } from '../../components/admin/AdminUI';
import { canCreateProjects, canManageAllProjects, roleLabel, useAdminAccess } from '../../lib/adminAccess';
import { formatDate } from '../../lib/helpers';
import { supabase } from '../../lib/supabaseClient';

const focusLink = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/50';

export default function Dashboard() {
  const { role, user, adminUser } = useAdminAccess();
  const canSeeAll = canManageAllProjects(role);
  const canViewInquiries = ['super_admin', 'admin', 'editor', 'creative', 'viewer'].includes(role);
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
        } else resultByName[name] = result.value.data || [];
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
    ['total', canSeeAll ? 'Total projects' : 'Accessible projects', 'Available to your role'],
    ['published', 'Published', 'Currently public'],
    ['draft', 'Drafts', 'Still in progress'],
    ...(canViewInquiries ? [['newInquiries', 'New inquiries', 'Awaiting review']] : canSeeAll ? [['creatives', 'Creative profiles', 'People in the directory']] : []),
  ];
  const quickActions = [
    ...(canCreateProjects(role) ? [{ to: '/admin/projects/new', icon: Plus, label: 'New project', tone: 'primary' }] : []),
    { to: '/admin/projects', icon: FolderKanban, label: 'Open projects' },
    ...(canSeeAll ? [{ to: '/admin/creatives', icon: Users, label: 'Manage people' }] : canEditProfile ? [{ to: '/admin/my-profile', icon: User, label: 'Edit my profile' }] : []),
  ].slice(0, 3);
  const nothingUrgent = !loading && !stats.draft && (!canViewInquiries || !stats.newInquiries);

  return (
    <AdminLayout>
      <AdminPageHeader
        eyebrow={`${roleLabel(role)} workspace`}
        title={`Welcome, ${displayName}`}
        description={canSeeAll ? 'Projects, people, services, and client activity at a glance.' : 'Your accessible projects, profile, and current activity.'}
        action={canCreateProjects(role) && <AdminButton to="/admin/projects/new" variant="primary"><Plus size={16} /> New project</AdminButton>}
      />

      {errors.length > 0 && <AdminNotice className="mb-6"><div className="flex flex-wrap items-center justify-between gap-3"><span>{errors.join(' ')}</span><button type="button" onClick={() => setReloadKey((current) => current + 1)} className={`border-b border-red-200/30 pb-1 text-sm text-red-100 ${focusLink}`}>Retry dashboard data</button></div></AdminNotice>}

      <nav aria-label="Primary dashboard actions" className="admin-dashboard-actions mb-6 flex flex-wrap gap-2">
        {quickActions.map((action) => <QuickAction key={action.to} {...action} />)}
      </nav>

      <section aria-labelledby="summary-heading">
        <h2 id="summary-heading" className="sr-only">System summary</h2>
        <div className="admin-dashboard-grid grid gap-px overflow-hidden rounded-lg border border-white/[0.1] bg-white/[0.1] sm:grid-cols-2 lg:grid-cols-4">
          {metricItems.map(([key, label, detail]) => <Metric key={key} label={label} value={stats[key]} detail={detail} loading={loading} />)}
        </div>
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-12">
        <div className="rounded-lg border border-white/[0.1] bg-zinc-900 p-4 sm:p-5 lg:col-span-8">
          <ActivitySection title="Recent projects" description={canSeeAll ? 'Latest portfolio additions.' : 'Latest projects available to you.'} actionTo="/admin/projects" actionLabel="View all">
            {loading ? <ActivitySkeleton /> : recentProjects.length ? recentProjects.map((project) => (
              <Link key={project.id} to={`/admin/projects/${project.id}/edit`} className={`grid cursor-pointer gap-2 border-t border-white/[0.1] px-2 py-4 transition hover:bg-white/[0.025] first:border-t-0 first:pt-0 sm:grid-cols-[1fr_auto] sm:items-start ${focusLink}`}>
                <div className="min-w-0"><h3 className="truncate font-medium text-white">{project.title}</h3><p className="mt-1 text-xs text-zinc-500">{project.category || 'Uncategorized'} · {formatDate(project.updated_at || project.created_at)}</p></div>
                <div className="flex flex-wrap gap-2"><AdminStatusBadge status={project.review_status || project.status} />{project.featured && <AdminStatusBadge status="featured">Featured</AdminStatusBadge>}</div>
              </Link>
            )) : <AdminEmptyState title="No projects yet" message={canCreateProjects(role) ? 'Create a project to begin building the portfolio.' : 'No projects are currently available to your account.'} />}
          </ActivitySection>
        </div>

        <aside className="rounded-lg border border-white/[0.1] bg-zinc-900 p-4 sm:p-5 lg:col-span-4" aria-labelledby="attention-heading">
          <div className="mb-4"><p className="text-[0.66rem] font-semibold uppercase tracking-[0.16em] text-amber-200/70">Priorities</p><h2 id="attention-heading" className="mt-1 text-lg font-semibold text-white">Needs attention</h2></div>
          <div className="divide-y divide-white/[0.08]">
            {stats.draft > 0 && <AttentionLink to="/admin/projects" label="Draft projects" value={stats.draft} />}
            {canViewInquiries && stats.newInquiries > 0 && <AttentionLink to="/admin/inquiries" label="New inquiries" value={stats.newInquiries} />}
            {canViewInquiries && latestInquiries.slice(0, 2).map((inquiry) => <AttentionLink key={inquiry.id} to="/admin/inquiries" label={inquiry.name} meta={inquiry.project_type || 'General inquiry'} status={inquiry.status} />)}
            {nothingUrgent && <p className="py-8 text-center text-sm text-zinc-500">Nothing urgent right now.</p>}
          </div>
        </aside>
      </section>
    </AdminLayout>
  );
}

function Metric({ label, value, detail, loading }) {
  return <div className="flex min-h-32 min-w-0 flex-col gap-3 bg-zinc-900 px-4 py-4"><p className="min-w-0 break-words text-[0.66rem] font-semibold uppercase leading-4 tracking-[0.14em] text-zinc-600">{label}</p><div className="mt-auto min-w-0">{loading ? <div className="h-7 w-12 animate-pulse bg-white/[0.05]" /> : <p className="text-2xl font-semibold leading-none tabular-nums text-white">{value ?? '—'}</p>}{detail && <p className="mt-2 min-w-0 break-words text-xs leading-5 text-zinc-500">{detail}</p>}</div></div>;
}

function QuickAction({ to, icon: Icon, label, tone = 'default' }) {
  const primary = tone === 'primary';
  return <Link to={to} className={`group inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-semibold transition ${focusLink} ${primary ? 'border-amber-200/60 bg-amber-300 text-zinc-950 hover:bg-amber-200' : 'border-white/[0.12] bg-zinc-900 text-zinc-300 hover:border-white/[0.22] hover:text-white'}`}><Icon size={15} /><span>{label}</span><ArrowRight size={14} className="ml-1 opacity-50 transition group-hover:translate-x-0.5 group-hover:opacity-100" /></Link>;
}

function AttentionLink({ to, label, value, meta, status }) {
  return <Link to={to} className={`flex items-center gap-3 py-3.5 text-sm transition hover:text-white ${focusLink}`}><span className="min-w-0 flex-1"><span className="block truncate font-medium text-zinc-300">{label}</span>{meta && <span className="mt-0.5 block truncate text-xs text-zinc-600">{meta}</span>}</span>{value != null ? <span className="rounded-md bg-amber-300/10 px-2 py-1 text-xs font-semibold tabular-nums text-amber-100">{value}</span> : status ? <AdminStatusBadge status={status} /> : null}<ArrowRight size={14} className="text-zinc-600" /></Link>;
}

function ActivitySection({ title, description, actionTo, actionLabel, children }) {
  return <div className="min-w-0"><div className="mb-5 flex items-start justify-between gap-4"><div><h2 className="text-lg font-semibold text-white">{title}</h2><p className="mt-1 text-sm text-zinc-500">{description}</p></div><Link to={actionTo} className={`shrink-0 rounded-md px-2 py-1 text-xs text-zinc-400 hover:bg-white/[0.05] hover:text-white ${focusLink}`}>{actionLabel}</Link></div>{children}</div>;
}

function ActivitySkeleton() {
  return <div aria-label="Loading recent activity">{[0, 1, 2].map((item) => <div key={item} className="grid gap-3 border-t border-white/[0.08] py-4 first:border-t-0 first:pt-0"><div className="h-3 w-2/3 animate-pulse bg-white/[0.05]" /><div className="h-2 w-1/3 animate-pulse bg-white/[0.04]" /></div>)}</div>;
}
