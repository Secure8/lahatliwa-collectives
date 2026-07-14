import { ExternalLink, FileText, FolderKanban, Images, Inbox, LayoutDashboard, LogOut, Menu, Settings, User, UserCog, Users, Workflow, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { canCreateProjects, canManageSettings, canManageTeam, isPrivilegedRole, useAdminAccess } from '../../lib/adminAccess';
import { usePublicContent } from '../../lib/contentApi';
import { supabase } from '../../lib/supabaseClient';

const links = [
  ['Overview', [
    ['Dashboard', '/admin/dashboard', LayoutDashboard, () => true],
  ]],
  ['Studio', [
    ['My Profile', '/admin/my-profile', User, ({ role }) => ['super_admin', 'admin', 'editor', 'creative'].includes(role)],
    ['Directory', '/admin/directory', Users, ({ role }) => ['super_admin', 'admin', 'editor', 'creative', 'viewer'].includes(role)],
    ['Projects', '/admin/projects', FolderKanban, ({ role }) => canCreateProjects(role) || role === 'viewer'],
    ['Creatives', '/admin/creatives', Users, ({ role }) => isPrivilegedRole(role)],
    ['Services', '/admin/service-branches', Workflow, ({ role }) => isPrivilegedRole(role)],
    ['Inquiries', '/admin/inquiries', Inbox, ({ role }) => ['super_admin', 'admin', 'editor', 'creative', 'viewer'].includes(role)],
    ['Team', '/admin/team', UserCog, ({ role }) => canManageTeam(role)],
  ]],
  ['Website', [
    ['Content', '/admin/content', FileText, ({ role }) => isPrivilegedRole(role)],
    ['Media', '/admin/media/icons', Images, ({ role }) => isPrivilegedRole(role) || ['editor', 'creative'].includes(role)],
    ['Settings', '/admin/settings', Settings, ({ role }) => canManageSettings(role)],
  ]],
];

const SIDEBAR_SCROLL_KEY = 'lahat-liwa-admin-sidebar-scroll';

export default function AdminLayout({ children }) {
  const navigate = useNavigate();
  const sidebarNavRef = useRef(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [unreadInquiries, setUnreadInquiries] = useState(0);
  const { content } = usePublicContent([]);
  const access = useAdminAccess();
  const visibleGroups = links
    .map(([group, groupLinks]) => [group, groupLinks.filter(([, , , canShow]) => canShow(access))])
    .filter(([, groupLinks]) => groupLinks.length > 0);

  useEffect(() => {
    if (!['super_admin', 'admin', 'editor', 'creative', 'viewer'].includes(access.role) || !access.adminUser?.id) return undefined;
    let active = true;
    const loadCount = async () => {
      const { count, error } = await supabase.from('inquiry_read_receipts').select('inquiry_id', { count: 'exact', head: true }).eq('team_member_id', access.adminUser.id).eq('is_unread', true);
      if (active && !error) setUnreadInquiries(count || 0);
    };
    loadCount();
    const timer = window.setInterval(loadCount, 60000);
    const channel = supabase.channel(`admin-inquiry-unread-${access.adminUser.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inquiry_read_receipts', filter: `team_member_id=eq.${access.adminUser.id}` }, loadCount)
      .subscribe();
    return () => { active = false; window.clearInterval(timer); supabase.removeChannel(channel); };
  }, [access.adminUser?.id, access.role]);

  useEffect(() => {
    document.documentElement.classList.add('admin-mode');
    return () => document.documentElement.classList.remove('admin-mode');
  }, []);

  useEffect(() => {
    if (!mobileOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [mobileOpen]);

  useLayoutEffect(() => {
    const nav = sidebarNavRef.current;
    if (!nav) return;

    try {
      const savedScroll = Number(window.sessionStorage.getItem(SIDEBAR_SCROLL_KEY) || 0);
      if (savedScroll > 0) nav.scrollTop = savedScroll;
    } catch {
    }
  }, []);

  function rememberSidebarScroll() {
    const nav = sidebarNavRef.current;
    if (!nav) return;

    try {
      window.sessionStorage.setItem(SIDEBAR_SCROLL_KEY, String(nav.scrollTop));
    } catch {
    }
  }

  async function logout() {
    await supabase.auth.signOut();
    navigate('/admin/login', { replace: true });
  }

  return (
    <div className="admin-shell min-h-screen overflow-x-hidden bg-zinc-950 text-white">
      <aside className="fixed inset-x-0 top-0 z-30 border-b border-white/[0.08] bg-zinc-950/95 px-3 py-3 backdrop-blur-md lg:inset-y-4 lg:left-4 lg:right-auto lg:w-72 lg:rounded-md lg:border lg:border-white/[0.08] lg:bg-zinc-900/80 lg:p-4">
        <div className="flex items-center justify-between gap-3 lg:h-full lg:flex-col lg:items-stretch">
          <div className="flex min-w-0 items-center gap-3 lg:block">
            <Link
              to="/admin/dashboard"
              preventScrollReset
              className={clsx(
                'grid h-10 w-10 shrink-0 place-items-center rounded-md text-sm font-bold',
                content.logoUrl ? 'bg-transparent text-white' : 'bg-amber-300 text-zinc-950 '
              )}
            >
              {content.logoUrl ? (
                <img src={content.logoUrl} alt={content.logoAlt || 'Lahat Liwa logo'} decoding="async" width="36" height="36" className="h-9 w-9 object-contain" />
              ) : (
                content.initials || 'LL'
              )}
            </Link>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-white">{content.displayName || 'Lahat Liwa'}</p>
              <p className="truncate text-xs text-zinc-500">Studio control panel</p>
            </div>
          </div>

          <nav ref={sidebarNavRef} onScroll={rememberSidebarScroll} className="admin-sidebar-scroll hidden min-h-0 flex-1 gap-4 overflow-y-auto overscroll-contain py-4 pr-1 lg:grid">
            {visibleGroups.map(([group, groupLinks]) => (
              <div key={group}>
                <p className="px-3 text-[0.66rem] font-medium uppercase tracking-[0.22em] text-zinc-600">{group}</p>
                <div className="mt-2 grid gap-1">
                  {groupLinks.map(([label, href, Icon]) => (
                    <AdminNavLink key={href} label={label} href={href} Icon={Icon} badge={href === '/admin/inquiries' ? unreadInquiries : 0} onBeforeNavigate={rememberSidebarScroll} />
                  ))}
                </div>
              </div>
            ))}
          </nav>

          <div className="hidden gap-2 lg:grid">
            <Link to="/" className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-white/[0.045] px-4 text-sm text-zinc-300 ring-1 ring-white/[0.07] transition-colors duration-150 hover:bg-white/[0.075] hover:text-amber-100">
              <ExternalLink size={16} /> View site
            </Link>
            <button onClick={logout} className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-white/[0.045] px-4 text-sm text-zinc-300 ring-1 ring-white/[0.07] transition-colors duration-150 hover:bg-white/[0.075] hover:text-white">
              <LogOut size={16} /> Logout
            </button>
          </div>

          <div className="flex items-center gap-2 lg:hidden">
            <button type="button" onClick={() => setMobileOpen((current) => !current)} className="grid h-11 w-11 place-items-center rounded-md border border-white/[0.12] bg-white/[0.04] text-zinc-300 transition hover:border-amber-200/30 hover:bg-white/[0.075] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/50" aria-label={mobileOpen ? 'Close admin menu' : 'Open admin menu'} aria-expanded={mobileOpen} aria-controls="admin-mobile-navigation">
              {mobileOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
        {mobileOpen && <div id="admin-mobile-navigation" className="fixed inset-x-0 bottom-0 top-[65px] z-40 grid grid-rows-[1fr_auto] border-t border-white/[0.08] bg-zinc-950 p-4 lg:hidden">
          <nav className="admin-sidebar-scroll min-h-0 overflow-y-auto" aria-label="Admin navigation">
            {visibleGroups.map(([group, groupLinks]) => <div key={group} className="mb-5"><p className="mb-2 text-[0.66rem] uppercase tracking-[0.2em] text-zinc-600">{group}</p><div className="grid gap-1">{groupLinks.map(([label, href, Icon]) => <NavLink key={href} to={href} onClick={() => setMobileOpen(false)} className={({ isActive }) => clsx('flex min-h-12 items-center gap-3 rounded-md border px-3 py-3 text-sm transition', isActive ? 'border-amber-200/25 bg-amber-200/[0.08] text-amber-100' : 'border-transparent text-zinc-400 hover:border-white/[0.08] hover:bg-white/[0.035] hover:text-white')}><Icon size={16} /><span>{label}</span>{href === '/admin/inquiries' && unreadInquiries > 0 && <span className="ml-auto rounded-full bg-amber-300 px-2 py-0.5 text-[10px] font-semibold text-zinc-950" aria-label={`${unreadInquiries} unread inquiries`}>{unreadInquiries > 99 ? '99+' : unreadInquiries}</span>}<span className="sr-only">{label} page</span></NavLink>)}</div></div>)}
          </nav>
          <div className="-mx-4 grid grid-cols-2 gap-3 border-t border-white/[0.1] bg-zinc-900/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 shadow-[0_-16px_40px_rgba(0,0,0,0.32)]"><Link to="/" onClick={() => setMobileOpen(false)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-amber-300 px-3 text-sm font-semibold text-zinc-950 shadow-[0_8px_24px_rgba(0,0,0,0.2)] transition hover:bg-amber-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-100"><ExternalLink size={16} /> View site</Link><button type="button" onClick={logout} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-white/[0.14] bg-white/[0.06] px-3 text-sm font-medium text-zinc-100 transition hover:border-red-200/30 hover:bg-red-300/[0.08] hover:text-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/60"><LogOut size={16} /> Logout</button></div>
        </div>}
      </aside>
      <main className="px-4 pb-10 pt-24 sm:px-5 lg:ml-80 lg:px-8 lg:pt-10">
        <div className="mx-auto max-w-7xl">{children}</div>
      </main>
    </div>
  );
}

function AdminNavLink({ label, href, Icon, badge = 0, onBeforeNavigate }) {
  return (
    <NavLink
      to={href}
      preventScrollReset
      onPointerDown={onBeforeNavigate}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') onBeforeNavigate?.();
      }}
      className={({ isActive }) =>
        clsx(
          'group flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors duration-150',
          isActive
            ? 'bg-amber-200/[0.09] text-amber-50 ring-1 ring-inset ring-amber-200/15'
            : 'text-zinc-400 hover:bg-white/[0.055] hover:text-white'
        )
      }
    >
      <span className="grid h-8 w-8 place-items-center rounded-md bg-white/[0.05] text-zinc-400 transition-colors duration-150 group-hover:text-amber-100">
        <Icon size={16} />
      </span>
      {label}
      {badge > 0 && <span className="ml-auto rounded-full bg-amber-300 px-2 py-0.5 text-[10px] font-semibold text-zinc-950" aria-label={`${badge} unread inquiries`}>{badge > 99 ? '99+' : badge}</span>}
    </NavLink>
  );
}

