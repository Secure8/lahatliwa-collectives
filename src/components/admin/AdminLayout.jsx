import { CircleUserRound, Ellipsis, ExternalLink, FileText, FolderKanban, GalleryHorizontalEnd, HardDrive, House, Images, Inbox, LayoutDashboard, LogOut, MessagesSquare, Settings, User, UserCog, Users, Workflow, X } from 'lucide-react';
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
import useMobileAppBar from '../../lib/useMobileAppBar';
import { canSeeStorageNavigation } from '../../lib/storageAdmin';
import { canAccessEditorial } from '../../features/editorial/editorialCapabilities';
import AdminCommandPalette from './AdminCommandPalette';

const links = [
  ['Overview', [
    ['Dashboard', '/admin/dashboard', LayoutDashboard, () => true],
  ]],
  ['Studio', [
    ['My Profile', '/admin/my-profile', User, ({ role }) => ['super_admin', 'admin', 'editor', 'creative'].includes(role)],
    ['Directory', '/admin/directory', Users, ({ role }) => ['super_admin', 'admin', 'editor', 'creative', 'viewer'].includes(role)],
    ['Projects', '/admin/projects', FolderKanban, ({ role }) => canCreateProjects(role) || role === 'viewer'],
    ['Services', '/admin/service-branches', Workflow, ({ role }) => isPrivilegedRole(role)],
    ['Inquiries', '/admin/inquiries', Inbox, ({ role }) => ['super_admin', 'admin', 'editor', 'creative', 'viewer'].includes(role)],
    ['Storage', '/admin/storage', HardDrive, canSeeStorageNavigation],
  ]],
  ['People', [
    ['Creative Profiles', '/admin/creatives', Users, ({ role }) => isPrivilegedRole(role)],
    ['Team Access', '/admin/team', UserCog, ({ role }) => canManageTeam(role)],
  ]],
  ['Website', [
    ['Editorial', '/admin/editorial', FileText, ({ role }) => ['super_admin', 'admin'].includes(role)],
    ['Content', '/admin/content', FileText, ({ role }) => isPrivilegedRole(role)],
    ['Media', '/admin/media/icons', Images, ({ role }) => isPrivilegedRole(role) || ['editor', 'creative'].includes(role)],
    ['Settings', '/admin/settings', Settings, ({ role }) => canManageSettings(role)],
  ]],
  ['Editorial Studio', [
    ['Open Studio', '/editorial', FileText, ({ role, editorialRoles }) => canAccessEditorial(editorialRoles?.length ? editorialRoles : role)],
  ]],
];

const SIDEBAR_SCROLL_KEY = 'lahat-liwa-admin-sidebar-scroll';
const compactMobilePageLabels = {
  'Creative Profiles': 'Creatives',
  'Team Access': 'Team',
};

export default function AdminLayout({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const sidebarNavRef = useRef(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [headerFocused, setHeaderFocused] = useState(false);
  const [unreadInquiries, setUnreadInquiries] = useState(0);
  const { content } = usePublicContent([]);
  const access = useAdminAccess();
  const visibleGroups = links
    .map(([group, groupLinks]) => [group, groupLinks.filter(([, , , canShow]) => canShow(access))])
    .filter(([, groupLinks]) => groupLinks.length > 0);
  const currentPageTitle = adminPageTitle(location.pathname, visibleGroups);
  const profileDestination = access.role === 'viewer'
    ? ['Directory', '/admin/directory', CircleUserRound]
    : ['Profile', '/admin/my-profile', CircleUserRound];
  const defaultMobilePrimaryLinks = [
    ['Home', '/admin/dashboard', House],
    ['Projects', '/admin/projects', GalleryHorizontalEnd],
    ['Inquiries', '/admin/inquiries', MessagesSquare],
    profileDestination,
  ];
  const mobilePrimaryLinks = access.role === 'writer'
    ? [['Home', '/admin/dashboard', House], ['Studio', '/editorial', FileText]]
    : defaultMobilePrimaryLinks;
  const primaryRouteIsActive = (href) => location.pathname === href || (href !== '/admin/dashboard' && location.pathname.startsWith(`${href}/`));
  const moreIsActive = !mobilePrimaryLinks.some(([, href]) => primaryRouteIsActive(href));
  const morePageLabel = compactMobilePageLabels[currentPageTitle] || currentPageTitle;
  const closeMobileMenu = useCallback(() => setMobileOpen(false), []);
  const mobileAppBar = useMobileAppBar({ locked: mobileOpen || headerFocused, routeKey: `${location.pathname}${location.search}` });
  const isPrimaryHeaderVisible = mobileAppBar.primaryVisible;
  const isSecondaryNavVisible = mobileAppBar.visible;
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
    document.title = `${currentPageTitle} | Admin | ${content.displayName || 'Lahat Liwa Collectives'}`;
  }, [content.displayName, currentPageTitle]);

  useEffect(() => {
    setMobileOpen(false);
    setHeaderFocused(false);
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
    <div className="admin-shell min-h-screen text-white">
      <a href="#admin-main-content" className="skip-link">Skip to admin content</a>
      <aside
        data-admin-mobile-app-bar
        data-mobile-visible={isSecondaryNavVisible ? 'true' : 'false'}
        data-primary-visible={isPrimaryHeaderVisible ? 'true' : 'false'}
        onFocusCapture={() => setHeaderFocused(true)}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setHeaderFocused(false);
        }}
        className={clsx(
          'admin-app-bar theme-navigation-surface sticky inset-x-0 top-0 z-30 transition-[background-color] ease-out motion-reduce:transition-none lg:fixed lg:inset-y-0 lg:left-0 lg:right-auto lg:w-64 lg:border-r lg:border-white/[0.1] lg:bg-zinc-950 lg:p-3',
        )}
      >
        <div
          data-admin-mobile-primary
          data-mobile-visible={isPrimaryHeaderVisible ? 'true' : 'false'}
          className="admin-app-bar__primary theme-navigation-surface relative z-10 px-3 pb-1 pt-[calc(0.75rem+var(--admin-mobile-safe-area-top))] transition-[transform,opacity,background-color] ease-out motion-reduce:transition-none lg:h-full lg:translate-y-0 lg:p-0 lg:opacity-100"
        >
          <div className="flex items-center justify-between gap-3 lg:h-full lg:flex-col lg:items-stretch">
          <Link to="/admin/dashboard" preventScrollReset className="flex min-w-0 items-center gap-3 lg:border-b lg:border-white/[0.08] lg:px-2 lg:pb-3" aria-label={`${content.displayName} admin dashboard`}>
            {content.logoUrl ? (
              <BrandLogo src={content.logoUrl} alt={content.logoAlt} variant="admin" />
            ) : (
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-amber-300 text-sm font-bold text-zinc-950">
                {content.initials || 'LL'}
              </span>
            )}
            <div className="min-w-0">
              <div className="lg:hidden"><p className="text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-amber-200/65">Studio OS</p><p className="mt-0.5 truncate text-sm font-semibold text-zinc-100">{currentPageTitle}</p></div>
              <div className="hidden lg:block"><BrandWordmark name={content.displayName} variant="admin" /><p className="truncate text-xs text-zinc-500">Studio OS</p></div>
            </div>
          </Link>

          <nav ref={sidebarNavRef} onScroll={rememberSidebarScroll} aria-label="Primary admin navigation" className="admin-sidebar-scroll hidden min-h-0 flex-1 gap-4 overflow-y-auto overscroll-contain py-3 pr-1 lg:grid">
            {visibleGroups.map(([group, groupLinks]) => (
              <div key={group}>
                <p className="px-3 text-[0.66rem] font-semibold uppercase tracking-[0.22em] text-amber-200/55">{group}</p>
                <div className="mt-2 grid gap-1">
                  {groupLinks.map(([label, href, Icon]) => (
                    <AdminNavLink key={href} label={label} href={href} Icon={Icon} badge={href === '/admin/inquiries' ? unreadInquiries : 0} onBeforeNavigate={rememberSidebarScroll} />
                  ))}
                </div>
              </div>
            ))}
          </nav>

          <div className="hidden gap-2 border-t border-white/[0.08] px-1 pt-3 lg:grid lg:pb-12">
            <div className="min-w-0 px-2 py-1"><p className="truncate text-xs font-medium text-zinc-300">{access.adminUser?.display_name || access.adminUser?.email || 'Admin account'}</p><p className="mt-0.5 text-[11px] capitalize text-zinc-600">{String(access.role || '').replace('_', ' ')}</p></div>
            <button onClick={logout} className="inline-flex h-9 items-center justify-start gap-2 rounded-md border border-transparent px-3 text-sm font-medium text-zinc-500 transition-colors duration-150 hover:border-red-300/20 hover:bg-red-300/[0.07] hover:text-red-100">
              <LogOut size={16} /> Logout
            </button>
          </div>

            <div className="flex items-center gap-2 lg:hidden">
              <AppearanceMenuAction
                iconOnly
                aria-hidden={mobileOpen ? 'true' : undefined}
                tabIndex={mobileOpen ? -1 : undefined}
                className="inline-grid h-11 w-11 place-items-center text-amber-200 transition hover:text-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/60"
              />
            </div>
          </div>
        </div>
        <nav
          aria-label="Primary admin navigation"
          data-admin-mobile-top-navigation
          data-admin-mobile-secondary
          data-mobile-visible={isSecondaryNavVisible ? 'true' : 'false'}
          data-primary-visible={isPrimaryHeaderVisible ? 'true' : 'false'}
          className="admin-app-bar__secondary theme-navigation-surface relative z-20 border-b border-white/[0.08] transition-[transform,opacity,background-color] ease-out motion-reduce:transition-none lg:hidden"
        >
          <div className={clsx('grid', access.role === 'writer' ? 'grid-cols-3' : 'grid-cols-5')}>
            {mobilePrimaryLinks.map(([label, href, Icon]) => {
              const active = primaryRouteIsActive(href);
              return (
                <NavLink
                  key={href}
                  to={href}
                  aria-label={label}
                  title={label}
                  aria-current={active ? 'page' : undefined}
                  className={clsx('mobile-nav-item relative flex min-h-[3.25rem] min-w-0 flex-col items-center justify-center gap-0.5 px-1 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-200/60', active ? 'text-orange-400' : 'text-zinc-500 hover:text-zinc-200')}
                >
                  <span className="relative grid h-7 w-12 place-items-center transition">
                    <Icon className="mobile-nav-icon" size={21} strokeWidth={active ? 2.25 : 1.8} aria-hidden="true" />
                    {href === '/admin/inquiries' && unreadInquiries > 0 && <span className="absolute right-1 top-0.5 h-2.5 w-2.5 rounded-full border-2 border-zinc-950 bg-amber-300" aria-hidden="true" />}
                  </span>
                  <span className="mobile-nav-current-label" aria-hidden="true">{label}</span>
                  {href === '/admin/inquiries' && unreadInquiries > 0 && <span className="sr-only">{unreadInquiries} unread inquiries</span>}
                </NavLink>
              );
            })}
            <button
              ref={triggerRef}
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Open all admin sections"
              title="More"
              aria-expanded={mobileOpen}
              aria-controls="admin-mobile-navigation"
              aria-current={moreIsActive ? 'page' : undefined}
              className={clsx('mobile-nav-item relative flex min-h-[3.25rem] min-w-0 flex-col items-center justify-center gap-0.5 px-1 transition hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-200/60', moreIsActive ? 'text-orange-400' : 'text-zinc-500')}
            >
              <span className="grid h-7 w-12 place-items-center transition"><Ellipsis className="mobile-nav-icon" size={21} strokeWidth={moreIsActive ? 2.25 : 1.8} aria-hidden="true" /></span>
              <span className="mobile-nav-current-label" aria-hidden="true">{moreIsActive ? morePageLabel : 'More'}</span>
            </button>
          </div>
        </nav>
      </aside>
      <header className="theme-navigation-surface fixed left-64 right-0 top-0 z-20 hidden h-16 items-center justify-between gap-6 border-b border-white/[0.1] bg-zinc-950 px-6 lg:flex">
        <div className="min-w-0"><p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-zinc-600">Workspace</p><p className="mt-0.5 truncate text-sm font-medium text-zinc-200">{currentPageTitle}</p></div>
        <div className="flex items-center gap-2">
          <AdminCommandPalette groups={visibleGroups} />
          <AppearanceMenuAction iconOnly className="inline-grid h-10 w-10 place-items-center text-amber-200 transition hover:text-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/60" />
          <Link to="/" target="_blank" rel="noreferrer noopener" className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-white/[0.1] bg-zinc-900 px-3 text-sm font-medium text-zinc-300 transition hover:border-amber-200/30 hover:text-amber-100"><ExternalLink size={15} /> View site</Link>
        </div>
      </header>
      {mobileOpen && <div className="fixed inset-0 z-50 lg:hidden">
        <button type="button" tabIndex={-1} onClick={closeMobileMenu} className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" aria-label="Close admin menu" />
        <section ref={panelRef} id="admin-mobile-navigation" role="dialog" aria-modal="true" aria-label="Admin menu" className="theme-navigation-surface absolute inset-y-0 right-0 grid w-[min(24rem,calc(100%-0.75rem))] grid-rows-[auto_1fr_auto] overflow-hidden border-l border-white/[0.1] bg-zinc-950/98 shadow-[-24px_0_70px_rgba(0,0,0,0.42)]">
          <div className="flex min-h-16 items-center justify-between gap-4 border-b border-white/[0.08] px-4 pt-[env(safe-area-inset-top)]">
            <div className="min-w-0"><p className="text-[0.66rem] font-medium uppercase tracking-[0.22em] text-amber-200/80">Admin menu</p><p className="mt-1 truncate text-sm font-medium text-white">{currentPageTitle}</p></div>
            <button data-drawer-initial-focus type="button" onClick={closeMobileMenu} className="grid h-11 w-11 shrink-0 place-items-center text-zinc-200 transition hover:text-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/60" aria-label="Close admin menu"><X size={20} /></button>
          </div>
          <nav className="admin-sidebar-scroll min-h-0 overflow-y-auto overscroll-contain px-3 py-4" aria-label="Admin navigation">
            {visibleGroups.map(([group, groupLinks]) => <div key={group} className="mb-5 last:mb-0"><p className="mb-2 px-2 text-[0.66rem] uppercase tracking-[0.2em] text-zinc-600">{group}</p><div className="grid gap-1">{groupLinks.map(([label, href, Icon]) => <NavLink key={href} to={href} onClick={closeMobileMenu} className={({ isActive }) => clsx('flex min-h-12 items-center gap-3 rounded-xl border px-3 py-3 text-sm transition', isActive ? 'border-amber-200/25 bg-amber-200/[0.08] text-amber-100' : 'border-transparent text-zinc-400 hover:border-white/[0.08] hover:bg-white/[0.035] hover:text-white')}><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/[0.04]"><Icon size={16} /></span><span>{label}</span>{href === '/admin/inquiries' && unreadInquiries > 0 && <span className="ml-auto rounded-full bg-amber-300 px-2 py-0.5 text-[10px] font-semibold text-zinc-950" aria-label={`${unreadInquiries} unread inquiries`}>{unreadInquiries > 99 ? '99+' : unreadInquiries}</span>}</NavLink>)}</div></div>)}
          </nav>
          <div className="grid gap-3 border-t border-white/[0.1] bg-zinc-900/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 shadow-[0_-16px_40px_rgba(0,0,0,0.32)]">
            <div className="min-w-0 px-1"><p className="truncate text-sm font-medium text-zinc-200">{access.adminUser?.display_name || access.adminUser?.email || 'Admin account'}</p><p className="mt-0.5 text-xs capitalize text-zinc-500">{String(access.role || '').replace('_', ' ')}</p></div>
            <div className="grid grid-cols-2 gap-3"><Link to="/" onClick={closeMobileMenu} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-amber-300 px-3 text-sm font-semibold text-zinc-950 transition hover:bg-amber-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-100"><ExternalLink size={16} /> View site</Link><button type="button" onClick={logout} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-red-300/20 bg-red-300/[0.04] px-3 text-sm font-medium text-red-100 transition hover:border-red-200/40 hover:bg-red-300/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200/60"><LogOut size={16} /> Logout</button></div>
          </div>
        </section>
      </div>}
      <main id="admin-main-content" tabIndex={-1} className="admin-app-content px-4 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-4 sm:px-5 sm:pt-5 lg:ml-64 lg:px-6 lg:pb-10 lg:pt-24">
        <div className="mx-auto max-w-6xl">{children}</div>
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
          'admin-sidebar-link group flex items-center gap-3 rounded-md border px-2.5 py-2 text-sm font-medium transition-colors duration-150',
          isActive
            ? 'border-amber-200/20 bg-amber-200/[0.1] text-amber-50 shadow-sm shadow-black/10'
            : 'border-transparent text-zinc-400 hover:border-white/[0.08] hover:bg-white/[0.055] hover:text-white'
        )
      }
    >
      <span className="admin-sidebar-icon grid h-7 w-7 place-items-center rounded-md bg-white/[0.035] text-zinc-500 transition-colors duration-150 group-hover:text-amber-100">
        <Icon size={16} />
      </span>
      {label}
      {badge > 0 && <span className="ml-auto rounded-full bg-amber-300 px-2 py-0.5 text-[10px] font-semibold text-zinc-950" aria-label={`${badge} unread inquiries`}>{badge > 99 ? '99+' : badge}</span>}
    </NavLink>
  );
}

