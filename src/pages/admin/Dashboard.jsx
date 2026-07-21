import { ArrowRight, ExternalLink, Inbox, MapPinned, Plus, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import AdminLayout from '../../components/admin/AdminLayout.jsx';
import { AdminEmptyState, AdminNotice, AdminPageHeader, AdminStatusBadge, AdminSurface } from '../../components/admin/AdminUI.jsx';
import { canManageTeam, roleLabel, useAdminAccess } from '../../lib/adminAccess.jsx';
import { formatDate } from '../../lib/helpers.js';
import { supabase } from '../../lib/supabaseClient.js';

const focusLink = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/50';
const inquiryRoles = new Set(['super_admin', 'admin', 'editor', 'creative', 'viewer']);
const editorialRoles = new Set(['super_admin', 'admin', 'editor', 'writer']);

export default function Dashboard() {
  const access = useAdminAccess();
  const { role, user, adminUser } = access;
  const canUseEditorial = editorialRoles.has(role) || access.editorialRoles?.some((item) => editorialRoles.has(item));
  const canViewInquiries = inquiryRoles.has(role);
  const canManagePeople = canManageTeam(role);
  const [state, setState] = useState({ loading: true, error: '', totals: {}, attention: [], activity: [] });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    async function loadDashboard() {
      setState((current) => ({ ...current, loading: true, error: '' }));
      const requests = [
        ['destinations', supabase.from('editorial_posts').select('id', { count: 'exact', head: true }).eq('content_type', 'place').eq('status', 'published').is('archived_at', null)],
        ['stories', supabase.from('editorial_posts').select('id', { count: 'exact', head: true }).eq('status', 'published').is('archived_at', null)],
        ...(canViewInquiries ? [['openInquiries', supabase.from('project_inquiries').select('id', { count: 'exact', head: true }).in('status', ['new', 'open', 'awaiting_response', 'accepted', 'in_progress'])], ['failedDelivery', supabase.from('project_inquiries').select('id,name,public_reference,notification_status,created_at').in('notification_status', ['failed', 'partially_sent']).order('created_at', { ascending: false }).limit(4)], ['recentInquiries', supabase.from('project_inquiries').select('id,name,public_reference,status,created_at').order('created_at', { ascending: false }).limit(4)]] : []),
        ...(canManagePeople ? [['team', supabase.from('admin_users').select('id', { count: 'exact', head: true }).eq('status', 'active')], ['pendingInvites', supabase.from('admin_users').select('id,email,status,created_at').eq('status', 'invited').order('created_at', { ascending: false }).limit(4)], ['recentTeam', supabase.from('admin_users').select('id,display_name,email,status,updated_at').order('updated_at', { ascending: false }).limit(3)]] : []),
        ...(canUseEditorial ? [['incompleteStories', supabase.from('editorial_posts').select('id,title,status,summary,updated_at').in('status', ['draft', 'needs_revision']).order('updated_at', { ascending: false }).limit(6)], ['recentStories', supabase.from('editorial_posts').select('id,title,content_type,status,updated_at,published_at').order('updated_at', { ascending: false }).limit(5)]] : []),
        ...(role === 'super_admin' ? [['slides', supabase.from('editorial_homepage_slides').select('slot_type,post_id,enabled,editorial_posts(id,status,published_revision_id,archived_at)')]] : []),
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
      for (const post of (byName.incompleteStories?.data || []).filter((item) => String(item.summary || '').trim().length < 20).slice(0, 4)) attention.push({ key: `story-${post.id}`, to: `/editorial/content/${post.id}/edit`, label: 'Story needs details', detail: post.title, status: post.status });
      for (const invite of byName.pendingInvites?.data || []) attention.push({ key: `invite-${invite.id}`, to: '/admin/team', label: 'Invitation pending', detail: invite.email, status: 'invited' });
      for (const slide of byName.slides?.data || []) {
        const post = slide.editorial_posts;
        if (slide.enabled && (!post || post.status !== 'published' || !post.published_revision_id || post.archived_at)) attention.push({ key: `slide-${slide.slot_type}`, to: '/admin/editorial/homepage', label: 'Slideshow selection is unavailable', detail: slide.slot_type.replace('_', ' '), status: 'disabled' });
      }

      const activity = [
        ...(byName.recentStories?.data || []).map((item) => ({ key: `story-${item.id}`, to: `/editorial/content/${item.id}/edit`, title: item.title, meta: `${item.content_type.replace('_', ' ')} · ${formatDate(item.updated_at)}`, occurredAt: item.updated_at, status: item.status })),
        ...(byName.recentInquiries?.data || []).map((item) => ({ key: `inquiry-${item.id}`, to: `/admin/inquiries?reference=${item.public_reference}`, title: item.name, meta: `Inquiry · ${formatDate(item.created_at)}`, occurredAt: item.created_at, status: item.status })),
        ...(byName.recentTeam?.data || []).map((item) => ({ key: `team-${item.id}`, to: '/admin/team', title: item.display_name || item.email, meta: `Team · ${formatDate(item.updated_at)}`, occurredAt: item.updated_at, status: item.status })),
      ].sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()).slice(0, 8);

      setState({ loading: false, error: failed.length ? 'Some dashboard information could not be loaded.' : '', totals: { destinations: byName.destinations?.count ?? null, stories: byName.stories?.count ?? null, openInquiries: byName.openInquiries?.count ?? null, team: byName.team?.count ?? null }, attention, activity });
    }
    loadDashboard();
    return () => { active = false; };
  }, [canManagePeople, canUseEditorial, canViewInquiries, reloadKey, role, user?.id]);

  const displayName = adminUser?.display_name || adminUser?.name || user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'there';
  const actions = useMemo(() => [
    ...(canUseEditorial ? [{ to: '/editorial/new', icon: Plus, label: 'Create a story', description: 'Start a tourism or community story.', primary: true }, { to: ['super_admin', 'admin'].includes(role) ? '/admin/editorial/destinations' : '/editorial', icon: MapPinned, label: 'Manage destinations', description: 'Review destination information.' }] : []),
    ...(canViewInquiries ? [{ to: '/admin/inquiries', icon: Inbox, label: 'Review inquiries', description: 'Read questions and continue follow-up.' }] : []),
    ...(canManagePeople ? [{ to: '/admin/team', icon: Users, label: 'Manage team', description: 'Invite members and update access.' }] : []),
    { to: '/', icon: ExternalLink, label: 'View live website', description: 'Open the public website.', external: true },
  ], [canManagePeople, canUseEditorial, canViewInquiries, role]);

  const metrics = [
    ['destinations', 'Published destinations'], ['stories', 'Published stories'],
    ...(canViewInquiries ? [['openInquiries', 'Open inquiries']] : []),
    ...(canManagePeople ? [['team', 'Active team members']] : []),
  ];

  return <AdminLayout>
    <AdminPageHeader eyebrow={`${roleLabel(role)} workspace`} title={`Welcome, ${displayName}`} description="Manage Explore Aklan, creative work, inquiries, and your team from one place." />
    {state.error && <AdminNotice className="mb-6"><div className="flex flex-wrap items-center justify-between gap-3"><span>{state.error}</span><button type="button" onClick={() => setReloadKey((value) => value + 1)} className={`text-sm underline decoration-white/30 underline-offset-4 ${focusLink}`}>Retry</button></div></AdminNotice>}

    <section aria-labelledby="quick-actions-heading"><div className="mb-4"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-200/70">Start here</p><h2 id="quick-actions-heading" className="mt-1 text-xl font-semibold">Primary actions</h2></div><nav className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5" aria-label="Primary actions">{actions.map((action) => <QuickAction key={action.label} {...action} />)}</nav></section>

    <section className="mt-8" aria-labelledby="overview-heading"><div className="mb-4"><h2 id="overview-heading" className="text-xl font-semibold">Overview</h2></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{metrics.map(([key, label]) => <AdminSurface key={key} className="min-h-28"><p className="text-sm text-zinc-400">{label}</p><p className="mt-5 text-3xl font-semibold text-white">{state.loading ? '…' : state.totals[key] ?? '—'}</p></AdminSurface>)}</div></section>

    {state.attention.length > 0 && <AdminSurface className="mt-8" aria-labelledby="attention-heading"><div className="mb-4"><h2 id="attention-heading" className="text-xl font-semibold">Needs attention</h2></div><div className="divide-y divide-white/[0.08]">{state.attention.slice(0, 8).map((item) => <Link key={item.key} to={item.to} className={`flex items-center gap-3 py-4 ${focusLink}`}><span className="min-w-0 flex-1"><span className="block text-sm font-medium text-zinc-200">{item.label}</span><span className="mt-1 block truncate text-xs capitalize text-zinc-500">{item.detail}</span></span><AdminStatusBadge status={item.status} /><ArrowRight size={15} className="text-zinc-600" /></Link>)}</div></AdminSurface>}

    <div className="mt-8">
      <AdminSurface aria-labelledby="activity-heading"><div className="mb-4"><h2 id="activity-heading" className="text-xl font-semibold">Recent work</h2></div>{state.loading ? <p className="py-8 text-sm text-zinc-500">Loading recent work…</p> : state.activity.length ? <div className="divide-y divide-white/[0.08]">{state.activity.map((item) => <Link key={item.key} to={item.to} className={`grid gap-2 py-4 sm:grid-cols-[1fr_auto] sm:items-center ${focusLink}`}><div className="min-w-0"><p className="truncate font-medium text-zinc-100">{item.title}</p><p className="mt-1 text-xs capitalize text-zinc-500">{item.meta}</p></div><AdminStatusBadge status={item.status} /></Link>)}</div> : <AdminEmptyState title="No recent work" message="Recent stories, inquiries, and team updates will appear here." />}</AdminSurface>
    </div>
  </AdminLayout>;
}

function QuickAction({ to, icon: Icon, label, description, primary = false, external = false }) {
  return <Link to={to} target={external ? '_blank' : undefined} rel={external ? 'noreferrer noopener' : undefined} className={`group flex min-h-36 flex-col rounded-lg border p-4 transition ${focusLink} ${primary ? 'border-amber-200/60 bg-amber-300 text-zinc-950 hover:bg-amber-200' : 'border-white/[0.1] bg-zinc-900 text-zinc-200 hover:border-amber-200/30 hover:bg-zinc-800'}`}><Icon size={19} /><span className="mt-5 flex items-center justify-between gap-3 text-sm font-semibold">{label}<ArrowRight size={15} className="opacity-55 transition group-hover:translate-x-0.5" /></span><span className={`mt-2 text-xs leading-5 ${primary ? 'text-zinc-800' : 'text-zinc-500'}`}>{description}</span></Link>;
}
