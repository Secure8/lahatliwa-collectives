import { ExternalLink, FileText, FolderKanban, Images, Inbox, LayoutDashboard, LogOut, Settings, UserCog, Users, Workflow } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef } from 'react';
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
    ['Projects', '/admin/projects', FolderKanban, ({ role }) => canCreateProjects(role) || role === 'viewer'],
    ['Creatives', '/admin/creatives', Users, ({ role }) => isPrivilegedRole(role)],
    ['Services', '/admin/service-branches', Workflow, ({ role }) => isPrivilegedRole(role)],
    ['Inquiries', '/admin/inquiries', Inbox, ({ role }) => isPrivilegedRole(role)],
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
  const { content } = usePublicContent([]);
  const access = useAdminAccess();
  const visibleGroups = links
    .map(([group, groupLinks]) => [group, groupLinks.filter(([, , , canShow]) => canShow(access))])
    .filter(([, groupLinks]) => groupLinks.length > 0);
  const flatLinks = visibleGroups.flatMap(([, groupLinks]) => groupLinks);

  useEffect(() => {
    document.documentElement.classList.add('admin-mode');
    return () => document.documentElement.classList.remove('admin-mode');
  }, []);

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
    navigate('/admin/login');
  }

  return (
    <div className="admin-shell min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_top_left,rgba(246,213,139,0.07),transparent_30%),linear-gradient(180deg,#101012_0%,#09090b_46%,#111113_100%)] text-white">
      <aside className="fixed inset-x-0 top-0 z-30 bg-zinc-950/88 px-3 py-3 backdrop-blur-md lg:inset-y-4 lg:left-4 lg:right-auto lg:w-72 lg:rounded-lg lg:bg-zinc-900/80 lg:p-4 lg: lg:ring-1 lg:ring-white/[0.08]">
        <div className="flex items-center justify-between gap-3 lg:h-full lg:flex-col lg:items-stretch">
          <div className="flex min-w-0 items-center gap-3 lg:block">
            <Link
              to="/admin/dashboard"
              preventScrollReset
              className={clsx(
                'grid h-10 w-10 shrink-0 place-items-center rounded-lg text-sm font-bold',
                content.logoUrl ? 'bg-transparent text-white' : 'bg-amber-300 text-zinc-950 '
              )}
            >
              {content.logoUrl ? (
                <img src={content.logoUrl} alt={content.logoAlt || 'Lahat Liwa logo'} className="h-9 w-9 object-contain" />
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
                    <AdminNavLink key={href} label={label} href={href} Icon={Icon} onBeforeNavigate={rememberSidebarScroll} />
                  ))}
                </div>
              </div>
            ))}
          </nav>

          <div className="hidden gap-2 lg:grid">
            <Link to="/" className="inline-flex items-center justify-center gap-2 rounded-md bg-white/[0.045] px-4 py-2.5 text-sm text-zinc-300 ring-1 ring-white/[0.07] transition-colors duration-150 hover:bg-white/[0.075] hover:text-amber-100">
              <ExternalLink size={16} /> View site
            </Link>
            <button onClick={logout} className="inline-flex items-center justify-center gap-2 rounded-md bg-white/[0.045] px-4 py-2.5 text-sm text-zinc-300 ring-1 ring-white/[0.07] transition-colors duration-150 hover:bg-white/[0.075] hover:text-white">
              <LogOut size={16} /> Logout
            </button>
          </div>

          <div className="flex items-center gap-2 lg:hidden">
            <Link to="/" className="grid h-10 w-10 place-items-center rounded-md bg-white/[0.06] text-zinc-300 ring-1 ring-white/[0.08]" aria-label="View site">
              <ExternalLink size={16} />
            </Link>
            <button onClick={logout} className="grid h-10 w-10 place-items-center rounded-md bg-white/[0.06] text-zinc-300 ring-1 ring-white/[0.08]" aria-label="Logout">
              <LogOut size={16} />
            </button>
          </div>
        </div>
        <nav className="admin-sidebar-scroll mt-3 flex gap-2 overflow-x-auto overscroll-x-contain pb-1 lg:hidden">
          {flatLinks.map(([label, href, Icon]) => (
            <NavLink key={href} to={href} preventScrollReset className={({ isActive }) => clsx('inline-flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors duration-150', isActive ? 'bg-amber-300 text-zinc-950' : 'bg-white/[0.06] text-zinc-300 ring-1 ring-white/[0.07]')}>
              <Icon size={15} /> {label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="px-4 pb-10 pt-32 sm:px-5 lg:ml-80 lg:px-8 lg:pt-10">
        <div className="mx-auto max-w-7xl">{children}</div>
      </main>
    </div>
  );
}

function AdminNavLink({ label, href, Icon, onBeforeNavigate }) {
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
            ? 'bg-white/[0.09] text-white'
            : 'text-zinc-400 hover:bg-white/[0.055] hover:text-white'
        )
      }
    >
      <span className="grid h-8 w-8 place-items-center rounded-md bg-white/[0.05] text-zinc-400 transition-colors duration-150 group-hover:text-amber-100">
        <Icon size={16} />
      </span>
      {label}
    </NavLink>
  );
}

