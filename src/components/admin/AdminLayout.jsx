import { ExternalLink, FileText, FolderKanban, Images, Inbox, LayoutDashboard, LogOut, Menu, Settings, User, UserCog, Users, Workflow, X } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { canCreateProjects, canManageSettings, canManageTeam, isPrivilegedRole, useAdminAccess } from '../../lib/adminAccess';
import { usePublicContent } from '../../lib/contentApi';
import { supabase } from '../../lib/supabaseClient';
import BrandLogo from '../BrandLogo';
import BrandWordmark from '../BrandWordmark';
import AppearanceMenuAction from '../AppearanceMenuAction';
import { adminPageTitle } from '../../lib/mobileAppShell';
import useModalDrawer from '../../lib/useModalDrawer';

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
  const location = useLocation();
  const sidebarNavRef = useRef(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [unreadInquiries, setUnreadInquiries] = useState(0);
  const { content } = usePublicContent([]);
  const access = useAdminAccess();
  const visibleGroups = links
    .map(([group, groupLinks]) => [group, groupLinks.filter(([, , , canShow]) => canShow(access))])
    .filter(([, groupLinks]) => groupLinks.length > 0);
  const currentPageTitle = adminPageTitle(location.pathname, visibleGroups);
  const closeMobileMenu = useCallback(() => setMobileOpen(false), []);
  const { panelRef, triggerRef } = useModalDrawer({ open: mobileOpen, onClose: closeMobileMenu });

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
    setMobileOpen(false);
  }, [location.key, location.pathname]);

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
      <aside className="admin-app-bar theme-navigation-surface fixed inset-x-0 top-0 z-30 border-b border-white/[0.08] bg-zinc-950/95 px-3 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] backdrop-blur-md lg:inset-y-4 lg:left-4 lg:right-auto lg:w-72 lg:rounded-md lg:border lg:border-white/[0.08] lg:bg-zinc-900/80 lg:p-4">
        <div className="flex items-center justify-between gap-3 lg:h-full lg:flex-col lg:items-stretch">
          <Link to="/admin/dashboard" preventScrollReset className="flex min-w-0 items-center gap-3 lg:block" aria-label={`${content.displayName} admin dashboard`}>
            {content.logoUrl ? (
              <BrandLogo src={content.logoUrl} alt={content.logoAlt} variant="admin" />
            ) : (
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-amber-300 text-sm font-bold text-zinc-950">
                {content.initials || 'LL'}
              </span>
            )}
            <div className="min-w-0">
              <BrandWordmark name={content.displayName} variant="admin" mobileVariant="mobile-compact" />
              <p className="truncate text-xs text-zinc-500"><span className="lg:hidden">{currentPageTitle}</span><span className="hidden lg:inline">Studio control panel</span></p>
            </div>
          </Link>

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

          <div className="hidden gap-2 lg:grid lg:pb-12">
            <Link to="/" className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-white/[0.045] px-4 text-sm text-zinc-300 ring-1 ring-white/[0.07] transition-colors duration-150 hover:bg-white/[0.075] hover:text-amber-100">
              <ExternalLink size={16} /> View site
            </Link>
            <button onClick={logout} className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-white/[0.045] px-4 text-sm text-zinc-300 ring-1 ring-white/[0.07] transition-colors duration-150 hover:bg-white/[0.075] hover:text-white">
              <LogOut size={16} /> Logout
            </button>
          </div>

          <div className="flex items-center gap-2 lg:hidden">
            <button ref={triggerRef} type="button" onClick={() => setMobileOpen(true)} className="grid h-11 w-11 place-items-center rounded-xl border border-white/[0.12] bg-white/[0.04] text-zinc-300 transition hover:border-amber-200/30 hover:bg-white/[0.075] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/50" aria-label="Open admin menu" aria-expanded={mobileOpen} aria-controls="admin-mobile-navigation" aria-hidden={mobileOpen ? 'true' : undefined} tabIndex={mobileOpen ? -1 : undefined}>
              <Menu size={20} />
            </button>
          </div>
        </div>
      </aside>
      {mobileOpen && <div className="fixed inset-0 z-50 lg:hidden">
        <button type="button" tabIndex={-1} onClick={closeMobileMenu} className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" aria-label="Close admin menu" />
        <section ref={panelRef} id="admin-mobile-navigation" role="dialog" aria-modal="true" aria-label="Admin menu" className="theme-navigation-surface absolute inset-y-0 right-0 grid w-[min(24rem,calc(100%-0.75rem))] grid-rows-[auto_1fr_auto] overflow-hidden border-l border-white/[0.1] bg-zinc-950/98 shadow-[-24px_0_70px_rgba(0,0,0,0.42)]">
          <div className="flex min-h-16 items-center justify-between gap-4 border-b border-white/[0.08] px-4 pt-[env(safe-area-inset-top)]">
            <div className="min-w-0"><p className="text-[0.66rem] font-medium uppercase tracking-[0.22em] text-amber-200/80">Admin menu</p><p className="mt-1 truncate text-sm font-medium text-white">{currentPageTitle}</p></div>
            <button data-drawer-initial-focus type="button" onClick={closeMobileMenu} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/[0.12] bg-white/[0.04] text-zinc-200" aria-label="Close admin menu"><X size={20} /></button>
          </div>
          <nav className="admin-sidebar-scroll min-h-0 overflow-y-auto overscroll-contain px-3 py-4" aria-label="Admin navigation">
            {visibleGroups.map(([group, groupLinks]) => <div key={group} className="mb-5 last:mb-0"><p className="mb-2 px-2 text-[0.66rem] uppercase tracking-[0.2em] text-zinc-600">{group}</p><div className="grid gap-1">{groupLinks.map(([label, href, Icon]) => <NavLink key={href} to={href} onClick={closeMobileMenu} className={({ isActive }) => clsx('flex min-h-12 items-center gap-3 rounded-xl border px-3 py-3 text-sm transition', isActive ? 'border-amber-200/25 bg-amber-200/[0.08] text-amber-100' : 'border-transparent text-zinc-400 hover:border-white/[0.08] hover:bg-white/[0.035] hover:text-white')}><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/[0.04]"><Icon size={16} /></span><span>{label}</span>{href === '/admin/inquiries' && unreadInquiries > 0 && <span className="ml-auto rounded-full bg-amber-300 px-2 py-0.5 text-[10px] font-semibold text-zinc-950" aria-label={`${unreadInquiries} unread inquiries`}>{unreadInquiries > 99 ? '99+' : unreadInquiries}</span>}</NavLink>)}</div></div>)}
          </nav>
          <div className="grid gap-3 border-t border-white/[0.1] bg-zinc-900/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 shadow-[0_-16px_40px_rgba(0,0,0,0.32)]">
            <AppearanceMenuAction className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/[0.12] bg-white/[0.045] px-3 text-sm text-zinc-200" />
            <div className="grid grid-cols-2 gap-3"><Link to="/" onClick={closeMobileMenu} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-amber-300 px-3 text-sm font-semibold text-zinc-950 transition hover:bg-amber-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-100"><ExternalLink size={16} /> View site</Link><button type="button" onClick={logout} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-red-300/20 bg-red-300/[0.04] px-3 text-sm font-medium text-red-100 transition hover:border-red-200/40 hover:bg-red-300/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200/60"><LogOut size={16} /> Logout</button></div>
          </div>
        </section>
      </div>}
      <main className="admin-app-content px-4 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-[calc(5.75rem+env(safe-area-inset-top))] sm:px-5 lg:ml-80 lg:px-8 lg:pb-10 lg:pt-10">
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

