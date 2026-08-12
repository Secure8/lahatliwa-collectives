import { ArrowRight, ExternalLink, FolderKanban, Inbox, PanelsTopLeft, Plus, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import AdminLayout from '../../components/admin/AdminLayout.jsx';
import { AdminEmptyState, AdminNotice, AdminPageHeader, AdminStatusBadge, AdminSurface } from '../../components/admin/AdminUI.jsx';
import { canManageTeam, roleLabel, useAdminAccess } from '../../lib/adminAccess.jsx';
import { formatDate } from '../../lib/helpers.js';
import { supabase } from '../../lib/supabaseClient.js';

const focusLink = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/50';
const inquiryRoles = new Set(['super_admin', 'admin', 'editor', 'creative', 'viewer']);

export default function Dashboard() {
  const access = useAdminAccess();
  const { role, user, adminUser } = access;
  const canViewInquiries = inquiryRoles.has(role);
  const canManagePeople = canManageTeam(role);
  const [state, setState] = useState({ loading: true, error: '', totals: {}, attention: [], activity: [] });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    async function loadDashboard() {
      setState((current) => ({ ...current, loading: true, error: '' }));
      const requests = [
        ['activeProjects', supabase.from('projects').select('id', { count: 'exact', head: true }).eq('status', 'published').eq('work_status', 'active')],
        ['completedProjects', supabase.from('projects').select('id', { count: 'exact', head: true }).eq('status', 'published').eq('work_status', 'completed')],
        ['recentProjects', supabase.from('projects').select('id,title,status,work_status,progress_updates,updated_at').order('updated_at', { ascending: false }).limit(6)],
        ...(canViewInquiries ? [['openInquiries', supabase.from('project_inquiries').select('id', { count: 'exact', head: true }).in('status', ['new', 'open', 'awaiting_response', 'accepted', 'in_progress'])], ['failedDelivery', supabase.from('project_inquiries').select('id,name,public_reference,notification_status,created_at').in('notification_status', ['failed', 'partially_sent']).order('created_at', { ascending: false }).limit(4)], ['recentInquiries', supabase.from('project_inquiries').select('id,name,public_reference,status,created_at').order('created_at', { ascending: false }).limit(4)]] : []),
        ...(canManagePeople ? [['team', supabase.from('admin_users').select('id', { count: 'exact', head: true }).eq('status', 'active')], ['pendingInvites', supabase.from('admin_users').select('id,email,status,created_at').eq('status', 'invited').order('created_at', { ascending: false }).limit(4)], ['recentTeam', supabase.from('admin_users').select('id,display_name,email,status,updated_at').order('updated_at', { ascending: false }).limit(3)]] : []),
      ];
      const results = await Promise.allSettled(requests.map(([, request]) => request));
      if (!active) return;
      const byName = {};
      const failed = [];
      results.forEach((result, index) => {
        const name = requests[index][0];
        if (result.status === 'rejected' || result.value?.error) failed.push(name);
        else byName[name] = result.value;
      });

      const attention = [];
      for (const inquiry of byName.failedDelivery?.data || []) attention.push({ key: `delivery-${inquiry.id}`, to: `/admin/inquiries?reference=${inquiry.public_reference}`, label: 'Inquiry delivery failed', detail: inquiry.name, status: 'failed' });
      for (const project of (byName.recentProjects?.data || []).filter((item) => item.status === 'published' && item.work_status === 'active' && !(item.progress_updates || []).length).slice(0, 4)) attention.push({ key: `project-${project.id}`, to: `/admin/projects/${project.id}/edit`, label: 'Active project needs an update', detail: project.title, status: 'active' });
      for (const invite of byName.pendingInvites?.data || []) attention.push({ key: `invite-${invite.id}`, to: '/admin/team', label: 'Invitation pending', detail: invite.email, status: 'invited' });
      const activity = [
        ...(byName.recentProjects?.data || []).map((item) => ({ key: `project-${item.id}`, to: `/admin/projects/${item.id}/edit`, title: item.title, meta: `${item.work_status === 'active' ? 'Current work' : 'Portfolio'} · ${formatDate(item.updated_at)}`, occurredAt: item.updated_at, status: item.status })),
        ...(byName.recentInquiries?.data || []).map((item) => ({ key: `inquiry-${item.id}`, to: `/admin/inquiries?reference=${item.public_reference}`, title: item.name, meta: `Inquiry · ${formatDate(item.created_at)}`, occurredAt: item.created_at, status: item.status })),
        ...(byName.recentTeam?.data || []).map((item) => ({ key: `team-${item.id}`, to: '/admin/team', title: item.display_name || item.email, meta: `Team · ${formatDate(item.updated_at)}`, occurredAt: item.updated_at, status: item.status })),
      ].sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()).slice(0, 8);

      setState({ loading: false, error: failed.length ? 'Some dashboard information could not be loaded.' : '', totals: { activeProjects: byName.activeProjects?.count ?? null, completedProjects: byName.completedProjects?.count ?? null, openInquiries: byName.openInquiries?.count ?? null, team: byName.team?.count ?? null }, attention, activity });
    }
    loadDashboard();
    return () => { active = false; };
  }, [canManagePeople, canViewInquiries, reloadKey, role, user?.id]);

  const displayName = adminUser?.display_name || adminUser?.name || user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'there';
  const actions = useMemo(() => [
    ...(['super_admin', 'admin'].includes(role) ? [{ to: '/admin/website', icon: PanelsTopLeft, label: 'Edit website', description: 'Open Website Studio to change page copy and site settings.', primary: true }] : []),
    { to: '/admin/projects/new', icon: Plus, label: 'Start a project', description: 'Create active work, add public updates, and move it to the portfolio when complete.', primary: !['super_admin', 'admin'].includes(role) },
    { to: '/admin/projects', icon: FolderKanban, label: 'Update current work', description: 'Post progress or mark a project completed.' },
    ...(canViewInquiries ? [{ to: '/admin/inquiries', icon: Inbox, label: 'Review inquiries', description: 'Read questions and continue follow-up.' }] : []),
    ...(canManagePeople ? [{ to: '/admin/team', icon: Users, label: 'Manage team', description: 'Invite members and update access.' }] : []),
    { to: '/', icon: ExternalLink, label: 'View live website', description: 'Open the public website.', external: true },
  ], [canManagePeople, canViewInquiries, role]);

  const metrics = [
    ['activeProjects', 'Active public projects'], ['completedProjects', 'Portfolio projects'],
    ...(canViewInquiries ? [['openInquiries', 'Open inquiries']] : []),
    ...(canManagePeople ? [['team', 'Active team members']] : []),
  ];

  return <AdminLayout>
    <AdminPageHeader eyebrow={`${roleLabel(role)} workspace`} title={`Welcome, ${displayName}`} description="Choose what you want to work on. Everything else can wait." />
    {state.error && <AdminNotice className="mb-6"><div className="flex flex-wrap items-center justify-between gap-3"><span>{state.error}</span><button type="button" onClick={() => setReloadKey((value) => value + 1)} className={`text-sm underline decoration-white/30 underline-offset-4 ${focusLink}`}>Retry</button></div></AdminNotice>}

    <section aria-labelledby="quick-actions-heading"><div className="mb-4"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-200/70">Start here</p><h2 id="quick-actions-heading" className="mt-1 text-xl font-semibold">What would you like to do?</h2></div><nav className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Primary actions">{actions.map((action) => <QuickAction key={action.label} {...action} />)}</nav></section>

    <section className="mt-8" aria-labelledby="overview-heading"><div className="mb-4"><h2 id="overview-heading" className="text-xl font-semibold">Overview</h2></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{metrics.map(([key, label]) => <AdminSurface key={key} className="min-h-28"><p className="text-sm text-zinc-400">{label}</p><p className="mt-5 text-3xl font-semibold text-white">{state.loading ? '…' : state.totals[key] ?? '—'}</p></AdminSurface>)}</div></section>

    {state.attention.length > 0 && <AdminSurface className="mt-8" aria-labelledby="attention-heading"><div className="mb-4"><h2 id="attention-heading" className="text-xl font-semibold">Needs attention</h2></div><div className="divide-y divide-white/[0.08]">{state.attention.slice(0, 8).map((item) => <Link key={item.key} to={item.to} className={`flex items-center gap-3 py-4 ${focusLink}`}><span className="min-w-0 flex-1"><span className="block text-sm font-medium text-zinc-200">{item.label}</span><span className="mt-1 block truncate text-xs capitalize text-zinc-500">{item.detail}</span></span><AdminStatusBadge status={item.status} /><ArrowRight size={15} className="text-zinc-600" /></Link>)}</div></AdminSurface>}

    <div className="mt-8">
      <AdminSurface aria-labelledby="activity-heading"><div className="mb-4"><h2 id="activity-heading" className="text-xl font-semibold">Recent work</h2></div>{state.loading ? <p className="py-8 text-sm text-zinc-500">Loading recent work…</p> : state.activity.length ? <div className="divide-y divide-white/[0.08]">{state.activity.map((item) => <Link key={item.key} to={item.to} className={`grid gap-2 py-4 sm:grid-cols-[1fr_auto] sm:items-center ${focusLink}`}><div className="min-w-0"><p className="truncate font-medium text-zinc-100">{item.title}</p><p className="mt-1 text-xs capitalize text-zinc-500">{item.meta}</p></div><AdminStatusBadge status={item.status} /></Link>)}</div> : <AdminEmptyState title="No recent work" message="Recent projects, inquiries, and team updates will appear here." />}</AdminSurface>
    </div>
  </AdminLayout>;
}

function QuickAction({ to, icon: Icon, label, description, primary = false, external = false }) {
  return <Link to={to} target={external ? '_blank' : undefined} rel={external ? 'noreferrer noopener' : undefined} className={`group flex min-h-32 flex-col rounded-xl border p-5 transition ${focusLink} ${primary ? 'border-amber-200/60 bg-amber-300 text-zinc-950 hover:bg-amber-200 sm:col-span-2 lg:col-span-1' : 'border-white/[0.1] bg-zinc-900 text-zinc-200 hover:border-amber-200/30 hover:bg-zinc-800'}`}><Icon size={20} /><span className="mt-4 flex items-center justify-between gap-3 text-base font-semibold">{label}<ArrowRight size={16} className="opacity-55 transition group-hover:translate-x-0.5" /></span><span className={`mt-2 text-sm leading-5 ${primary ? 'text-zinc-800' : 'text-zinc-500'}`}>{description}</span></Link>;
}
