import { Bell, LogIn, LogOut, PenLine, UserRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { usePublicContent } from '../lib/contentApi';
import { preloadPublicRoute } from '../lib/publicRoutePreload';
import usePublicAccount from '../lib/usePublicAccount';
import BrandLogo from './BrandLogo';
import BrandWordmark from './BrandWordmark';
import AppearanceMenuAction from './AppearanceMenuAction';
import MobileTopNavigation from './MobileTopNavigation';
import { supabase } from '../lib/supabaseClient';
import { publicNavigationItems } from '../lib/publicNavigation';

export default function Navbar() {
  const [unreadCount, setUnreadCount] = useState(0);
  const navigate = useNavigate();
  const { content } = usePublicContent([]);
  const { account, authenticated, authorized } = usePublicAccount();
  const navigation = content.websiteNavigation || {};
  const isCreative = account?.role === 'creative';
  const creative = account?.creative_members;
  const primaryLinks = publicNavigationItems(navigation);
  const brandTarget = account?.role === 'super_admin' ? '/admin/website?section=global.brand' : '/';

  useEffect(() => {
    if (!isCreative || !account?.creative_member_id) { setUnreadCount(0); return; }
    let active = true;
    const refresh = () => supabase.from('creative_notifications').select('id', { count: 'exact', head: true }).is('read_at', null).then(({ count }) => { if (active) setUnreadCount(count || 0); });
    refresh();
    const channel = supabase.channel(`creative-notifications-${account.creative_member_id}`).on('postgres_changes', { event: '*', schema: 'public', table: 'creative_notifications', filter: `creative_member_id=eq.${account.creative_member_id}` }, refresh).subscribe();
    return () => { active = false; supabase.removeChannel(channel); };
  }, [account?.creative_member_id, isCreative]);
  async function signOut() { await supabase.auth.signOut({ scope: 'local' }); navigate('/', { replace: true }); }
  return <>
    <header className="ll-public-header">
      <nav className="ll-public-nav" aria-label="Primary navigation">
        <Link to={brandTarget} className={clsx('ll-brand-link', account?.role === 'super_admin' && 'is-admin-editable')} aria-label={account?.role === 'super_admin' ? 'Edit logo and branding' : `${content.displayName} home`} title={account?.role === 'super_admin' ? 'Edit logo and branding' : undefined}>
          {content.logoUrl ? <BrandLogo src={content.logoUrl} alt={content.logoAlt} /> : <span className="ll-brand-mark">{content.initials}</span>}
          <BrandWordmark name={content.displayName} variant="compact" mobileVariant="mobile-compact" />
        </Link>
        <div className="ll-public-nav__links">{primaryLinks.map(([label, href, Icon]) => <NavLink key={href} to={href} title={label} aria-label={label} onPointerEnter={() => preloadPublicRoute(href)} onFocus={() => preloadPublicRoute(href)} className={({ isActive }) => clsx(isActive && 'is-active')}><Icon size={20} /><span>{label}</span></NavLink>)}</div>
        <div className="ll-public-nav__account">
          <AppearanceMenuAction iconOnly className="ll-theme-switch" />
          {isCreative && <Link to="/notifications" className="ll-notification-action" aria-label={unreadCount ? `${unreadCount} unread notifications` : 'Notifications'} title="Notifications"><Bell size={19}/>{unreadCount > 0 && <b>{unreadCount > 99 ? '99+' : unreadCount}</b>}</Link>}
          {isCreative && <Link to="/create" className="ll-create-action"><PenLine size={16} /><span>Create</span></Link>}
          {authorized ? <Link to="/account" className="ll-account-action" aria-label={isCreative ? `Open ${creative?.name || 'your'} profile` : 'Open platform overview'}>
            {(creative?.profile_image_url || account?.avatar_url) ? <img src={creative?.profile_image_url || account.avatar_url} alt="" /> : <UserRound size={18} />}
            <span>{isCreative ? 'My profile' : 'Admin'}</span>
          </Link> : authenticated ? <Link to="/account" className="ll-account-action"><UserRound size={18} /><span>Account</span></Link> : <Link to="/admin/login" className="ll-account-action"><LogIn size={17} /><span>Sign in</span></Link>}
          {authenticated && <button type="button" onClick={signOut} className="ll-signout-action" aria-label="Sign out" title="Sign out"><LogOut size={19}/><span>Sign out</span></button>}
        </div>
      </nav>
    </header>
    <MobileTopNavigation />
  </>;
}
