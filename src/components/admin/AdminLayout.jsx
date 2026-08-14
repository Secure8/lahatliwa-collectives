import { CircleUserRound, ExternalLink, FolderKanban, Handshake, Inbox, LayoutDashboard, LogOut, Menu, PlusSquare, ShieldCheck, UserCog, Users, Workflow, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { canManageTeam, isPrivilegedRole, useAdminAccess } from '../../lib/adminAccess';
import { usePublicContent } from '../../lib/contentApi';
import { supabase } from '../../lib/supabaseClient';
import BrandLogo from '../BrandLogo';
import BrandWordmark from '../BrandWordmark';
import AppearanceMenuAction from '../AppearanceMenuAction';
import { adminPageTitle } from '../../lib/mobileAppShell';
import useModalDrawer from '../../lib/useModalDrawer';

const links = [
  ['Overview', [
    ['Platform Overview', '/admin/dashboard', LayoutDashboard, ({ role }) => role === 'super_admin'],
    ['My Profile', '/account', CircleUserRound, ({ role }) => role === 'creative'],
    ['Create Post', '/create', PlusSquare, ({ role }) => role === 'creative'],
  ]],
  ['Platform', [
    ['Website', '/admin/website', Workflow, ({ role }) => role === 'super_admin'],
    ['Services', '/admin/website?section=page.services', Handshake, ({ role }) => role === 'super_admin'],
    ['Projects', '/admin/projects', FolderKanban, ({ role }) => role === 'super_admin'],
    ['Creatives', '/admin/creatives', Users, ({ role }) => isPrivilegedRole(role)],
    ['Moderation', '/admin/moderation', ShieldCheck, ({ role }) => role === 'super_admin'],
  ]],
  ['Communication', [
    ['Inquiries', '/admin/inquiries', Inbox, ({ role }) => role === 'super_admin'],
  ]],
  ['Access', [
    ['Accounts', '/admin/team', UserCog, ({ role }) => canManageTeam(role)],
  ]],
];

export default function AdminLayout({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [unreadInquiries, setUnreadInquiries] = useState(0);
  const { content } = usePublicContent([]);
  const access = useAdminAccess();
  const visibleGroups = links.map(([group, groupLinks]) => [group, groupLinks.filter(([, , , canShow]) => canShow(access))]).filter(([, groupLinks]) => groupLinks.length);
  const visibleLinks = visibleGroups.flatMap(([, groupLinks]) => groupLinks);
  const currentPageTitle = adminPageTitle(location.pathname, visibleGroups);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const { panelRef, triggerRef } = useModalDrawer({ open: menuOpen, onClose: closeMenu });

  useEffect(() => {
    if (access.role !== 'super_admin' || !access.adminUser?.id) return undefined;
    let active = true;
    const loadCount = async () => { const { count, error } = await supabase.from('inquiry_read_receipts').select('inquiry_id', { count: 'exact', head: true }).eq('team_member_id', access.adminUser.id).eq('is_unread', true); if (active && !error) setUnreadInquiries(count || 0); };
    loadCount();
    const channel = supabase.channel(`admin-inquiry-unread-${access.adminUser.id}`).on('postgres_changes', { event: '*', schema: 'public', table: 'inquiry_read_receipts', filter: `team_member_id=eq.${access.adminUser.id}` }, loadCount).subscribe();
    return () => { active = false; supabase.removeChannel(channel); };
  }, [access.adminUser?.id, access.role]);
  useEffect(() => { document.documentElement.classList.add('admin-mode'); return () => document.documentElement.classList.remove('admin-mode'); }, []);
  useEffect(() => { document.title = `${currentPageTitle} | Admin | ${content.displayName || 'Lahat Liwa Collectives'}`; }, [content.displayName, currentPageTitle]);
  useEffect(() => setMenuOpen(false), [location.key, location.pathname]);
  async function logout() { await supabase.auth.signOut(); navigate('/admin/login', { replace: true }); }

  return <div className="admin-shell ll-admin-shell">
    <a href="#admin-main-content" className="skip-link">Skip to admin content</a>
    <header className="ll-admin-header">
      <div className="ll-admin-header__top">
        <Link to={access.role === 'creative' ? '/account' : '/admin/dashboard'} className="ll-admin-brand">
          {content.logoUrl ? <BrandLogo src={content.logoUrl} alt={content.logoAlt} variant="admin" /> : <span>{content.initials || 'LL'}</span>}
          <div><BrandWordmark name={content.displayName} variant="admin" /><small>{access.role === 'creative' ? 'Creative profile' : 'Platform operations'}</small></div>
        </Link>
        <div className="ll-admin-header__tools"><span className="ll-admin-current-page">{currentPageTitle}</span><AppearanceMenuAction iconOnly className="ll-icon-action" /><Link to="/" target="_blank" rel="noreferrer noopener" className="ll-admin-site-link"><ExternalLink size={15} /> View site</Link><button ref={triggerRef} type="button" onClick={() => setMenuOpen(true)} aria-label="Open admin navigation" aria-expanded={menuOpen} aria-controls="admin-navigation-drawer" className="ll-admin-menu-button"><Menu size={20} /></button></div>
      </div>
      <nav className="ll-admin-tabs" aria-label="Primary admin navigation">{visibleLinks.map(([label, href, Icon]) => <NavLink key={href} to={href} className={({ isActive }) => clsx(isActive && 'is-active')}><Icon size={15} /><span>{label}</span>{href === '/admin/inquiries' && unreadInquiries > 0 && <em>{unreadInquiries > 99 ? '99+' : unreadInquiries}</em>}</NavLink>)}</nav>
    </header>
    <main id="admin-main-content" tabIndex={-1} className="ll-admin-content"><div>{children}</div></main>

    {menuOpen && <div className="ll-drawer-layer"><button type="button" tabIndex={-1} onClick={closeMenu} className="ll-drawer-scrim" aria-label="Close admin navigation" /><section id="admin-navigation-drawer" ref={panelRef} role="dialog" aria-modal="true" aria-label="Admin navigation" className="ll-admin-drawer"><header><div><p className="ll-kicker">Platform operations</p><h2>{currentPageTitle}</h2></div><button data-drawer-initial-focus type="button" onClick={closeMenu} aria-label="Close"><X size={20} /></button></header><nav>{visibleGroups.map(([group, groupLinks]) => <section key={group}><p>{group}</p>{groupLinks.map(([label, href, Icon]) => <NavLink key={href} to={href}><Icon size={17} />{label}{href === '/admin/inquiries' && unreadInquiries > 0 && <em>{unreadInquiries}</em>}</NavLink>)}</section>)}</nav><footer><div><strong>{access.adminUser?.display_name || access.adminUser?.email || 'Admin account'}</strong><small>{String(access.role || '').replace('_', ' ')}</small></div><button type="button" onClick={logout}><LogOut size={16} /> Sign out</button></footer></section></div>}
  </div>;
}
