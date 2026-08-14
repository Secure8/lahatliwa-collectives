import { BriefcaseBusiness, ChevronDown, Handshake, House, Images, Info, LogIn, Mail, Menu, MoreHorizontal, PenLine, ShieldCheck, UserRound, UsersRound, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import clsx from 'clsx';
import { usePublicContent } from '../lib/contentApi';
import { preloadPublicRoute } from '../lib/publicRoutePreload';
import useModalDrawer from '../lib/useModalDrawer';
import usePublicAccount from '../lib/usePublicAccount';
import BrandLogo from './BrandLogo';
import BrandWordmark from './BrandWordmark';
import AppearanceMenuAction from './AppearanceMenuAction';
import MobileTopNavigation from './MobileTopNavigation';

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const { content } = usePublicContent([]);
  const { account, authenticated, authorized } = usePublicAccount();
  const navigation = content.websiteNavigation || {};
  const isCreative = account?.role === 'creative';
  const creative = account?.creative_members;
  const closeMenu = useCallback(() => setOpen(false), []);
  const { panelRef, triggerRef } = useModalDrawer({ open, onClose: closeMenu });
  const primaryLinks = [
    [navigation.homeLabel || 'Feed', '/', House],
    [navigation.currentWorkLabel || 'Work', '/work', BriefcaseBusiness],
    [navigation.projectsLabel || 'Portfolio', '/projects', Images],
    [navigation.creativesLabel || 'Creatives', '/creatives', UsersRound],
    [navigation.servicesLabel || 'Services', '/services', Handshake],
  ];
  const moreLinks = [[navigation.aboutLabel || 'About', '/about', Info], [navigation.contactLabel || 'Contact', '/contact', Mail], [navigation.privacyLabel || 'Privacy', '/privacy', ShieldCheck]];

  useEffect(() => setOpen(false), [location.key, location.pathname]);
  return <>
    <header className="ll-public-header">
      <nav className="ll-public-nav" aria-label="Primary navigation">
        <Link to="/" className="ll-brand-link" aria-label={`${content.displayName} home`}>
          {content.logoUrl ? <BrandLogo src={content.logoUrl} alt={content.logoAlt} /> : <span className="ll-brand-mark">{content.initials}</span>}
          <BrandWordmark name={content.displayName} variant="compact" mobileVariant="mobile-compact" />
        </Link>
        <div className="ll-public-nav__links">{primaryLinks.map(([label, href, Icon]) => <NavLink key={href} to={href} title={label} aria-label={label} onPointerEnter={() => preloadPublicRoute(href)} onFocus={() => preloadPublicRoute(href)} className={({ isActive }) => clsx(isActive && 'is-active')}><Icon size={20} /><span>{label}</span></NavLink>)}
          <button type="button" ref={triggerRef} onClick={() => setOpen(true)} aria-label="More pages" title="More" aria-expanded={open} aria-controls="public-more-menu" className="ll-nav-more"><MoreHorizontal size={21} /><span>More</span><ChevronDown className="ll-nav-more__chevron" size={14} /></button>
        </div>
        <div className="ll-public-nav__account">
          <AppearanceMenuAction iconOnly className="ll-icon-action" />
          {isCreative && <Link to="/create" className="ll-create-action"><PenLine size={16} /><span>Create</span></Link>}
          {authorized ? <Link to="/account" className="ll-account-action" aria-label={isCreative ? `Open ${creative?.name || 'your'} profile` : 'Open platform overview'}>
            {(creative?.profile_image_url || account?.avatar_url) ? <img src={creative?.profile_image_url || account.avatar_url} alt="" /> : <UserRound size={18} />}
            <span>{isCreative ? 'My profile' : 'Admin'}</span>
          </Link> : authenticated ? <Link to="/account" className="ll-account-action"><UserRound size={18} /><span>Account</span></Link> : <Link to="/admin/login" className="ll-account-action"><LogIn size={17} /><span>Sign in</span></Link>}
          <button type="button" onClick={() => setOpen(true)} className="ll-mobile-menu-button" aria-label="Open navigation" aria-expanded={open}><Menu size={21} /></button>
        </div>
      </nav>
    </header>
    <MobileTopNavigation />
    {open && <div className="ll-drawer-layer ll-public-menu-layer">
      <button type="button" tabIndex={-1} className="ll-drawer-scrim" onClick={closeMenu} aria-label="Close navigation" />
      <section ref={panelRef} id="public-more-menu" role="dialog" aria-modal="true" aria-label="Navigation" className="ll-public-drawer">
        <header><div><p className="ll-kicker">Explore Lahat Liwa</p><h2>{content.displayName}</h2></div><button data-drawer-initial-focus type="button" onClick={closeMenu} aria-label="Close navigation"><X size={21} /></button></header>
        <nav aria-label="All pages">{[...primaryLinks, ...moreLinks].map(([label, href, Icon]) => <NavLink key={href} to={href} className={({ isActive }) => clsx(isActive && 'is-active')}><span><Icon size={18} />{label}</span><span>→</span></NavLink>)}</nav>
        <footer><p>{content.tagline}</p>{isCreative ? <Link to="/create" className="ll-primary-action"><PenLine size={17} /> Create post</Link> : <Link to="/services" className="ll-primary-action">Start a conversation</Link>}</footer>
      </section>
    </div>}
  </>;
}
