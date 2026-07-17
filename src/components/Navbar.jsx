import { ArrowRight, Ellipsis, LockKeyhole, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import clsx from 'clsx';
import { usePublicContent } from '../lib/contentApi';
import { publicAppBarMode } from '../lib/mobileAppShell';
import { preloadPublicRoute } from '../lib/publicRoutePreload';
import useMobileAppBar from '../lib/useMobileAppBar';
import useModalDrawer from '../lib/useModalDrawer';
import BrandLogo from './BrandLogo';
import BrandWordmark from './BrandWordmark';
import AppearanceMenuAction from './AppearanceMenuAction';
import MobileTopNavigation from './MobileTopNavigation';

const links = [
  ['Home', '/'],
  ['About', '/about'],
  ['Projects', '/projects'],
  ['Services', '/services'],
  ['Creatives', '/creatives'],
  ['Contact', '/contact'],
];

const mobileSecondaryLinks = [
  ['About', '/about'],
  ['Contact', '/contact'],
  ['Privacy', '/privacy'],
];

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const [headerFocused, setHeaderFocused] = useState(false);
  const location = useLocation();
  const { content } = usePublicContent([]);
  const mobileMode = publicAppBarMode(location.pathname);
  const secondaryDestination = mobileSecondaryLinks.find(([, href]) => location.pathname === href || location.pathname.startsWith(`${href}/`));
  const secondaryRouteIsActive = Boolean(secondaryDestination);
  const secondaryPageLabel = secondaryDestination?.[0] || 'More';
  const closeMenu = useCallback(() => setOpen(false), []);
  const mobileAppBar = useMobileAppBar({ locked: open || headerFocused, routeKey: `${location.pathname}${location.search}` });
  const isPrimaryHeaderVisible = mobileAppBar.primaryVisible;
  const isSecondaryNavVisible = mobileAppBar.visible;
  const { panelRef, triggerRef } = useModalDrawer({ open, onClose: closeMenu });

  useEffect(() => {
    setOpen(false);
    setHeaderFocused(false);
  }, [location.key, location.pathname]);

  function avoidDuplicateNavigation(href) {
    return (event) => {
      if (location.pathname === href) event.preventDefault();
      closeMenu();
    };
  }

  return (
    <>
      <header
        data-mobile-app-bar
        data-mobile-app-bar-mode={mobileMode}
        data-mobile-visible={isSecondaryNavVisible ? 'true' : 'false'}
        onFocusCapture={() => {
          setHeaderFocused(true);
        }}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) {
            setHeaderFocused(false);
          }
        }}
        className={clsx(
        'public-app-bar sticky inset-x-0 top-0 z-50 lg:sticky lg:z-40 lg:inset-x-auto',
        )}
      >
        <div data-public-mobile-primary data-mobile-visible={isPrimaryHeaderVisible ? 'true' : 'false'} className={clsx('public-app-bar__primary theme-navigation-surface relative z-10 transition-[transform,opacity,background-color] ease-out motion-reduce:transition-none lg:translate-y-0 lg:opacity-100 lg:border-b lg:border-white/[0.08] lg:bg-zinc-950/75 lg:shadow-[0_10px_35px_rgba(0,0,0,0.12)] lg:backdrop-blur-xl', mobileMode === 'overlay' ? 'public-app-bar--overlay' : 'public-app-bar--surface')}>
        <nav className="page-shell flex min-h-14 items-center justify-between gap-3 lg:min-h-16" aria-label="Primary navigation">
          <Link to="/" onClick={avoidDuplicateNavigation('/')} className="group flex min-h-11 min-w-0 items-center gap-3" aria-label={`${content.displayName} home`}>
            {content.logoUrl ? (
              <BrandLogo src={content.logoUrl} alt={content.logoAlt} />
            ) : (
              <span className="site-accent site-border grid h-8 w-8 shrink-0 place-items-center border text-xs font-semibold transition">{content.initials}</span>
            )}
            <BrandWordmark name={content.displayName} variant="compact" mobileVariant="mobile-compact" />
          </Link>
          <div className="hidden items-center gap-1 lg:flex">
            {links.map(([label, href]) => (
              <NavLink
                key={href}
                to={href}
                onClick={avoidDuplicateNavigation(href)}
                onPointerEnter={() => preloadPublicRoute(href)}
                onFocus={() => preloadPublicRoute(href)}
                className={({ isActive }) => clsx('relative min-h-11 content-center px-3 py-2 text-xs uppercase tracking-[0.12em] transition after:absolute after:inset-x-3 after:bottom-0 after:h-px after:origin-left after:bg-[var(--site-accent)] after:transition-transform', isActive ? 'site-primary after:scale-x-100' : 'site-muted after:scale-x-0 hover:text-white hover:after:scale-x-100')}
              >
                {label}
              </NavLink>
            ))}
            <Link
              to="/admin/dashboard"
              className="ml-1 grid h-11 w-11 place-items-center text-zinc-500 transition hover:text-[var(--site-accent-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
              aria-label="Open admin dashboard"
              title="Admin dashboard"
            >
              <LockKeyhole size={17} aria-hidden="true" />
            </Link>
          </div>
          <div className="flex items-center gap-2 lg:hidden">
            <AppearanceMenuAction
              iconOnly
              aria-hidden={open ? 'true' : undefined}
              tabIndex={open ? -1 : undefined}
              className="grid h-11 w-11 shrink-0 place-items-center text-[var(--site-accent-text)] transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
            />
            <button
              ref={triggerRef}
              type="button"
              className={clsx('mobile-nav-item relative flex h-11 w-11 shrink-0 flex-col items-center justify-center gap-0.5 transition hover:text-orange-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]', secondaryRouteIsActive ? 'text-orange-400' : 'text-zinc-200')}
              onClick={() => setOpen(true)}
              aria-label="Open more links"
              aria-current={secondaryRouteIsActive ? 'page' : undefined}
              aria-expanded={open}
              aria-controls="public-mobile-navigation"
              aria-hidden={open ? 'true' : undefined}
              tabIndex={open ? -1 : undefined}
            >
              <span className="grid h-6 place-items-center"><Ellipsis className="mobile-nav-icon" size={22} aria-hidden="true" /></span>
              <span className="mobile-nav-current-label" aria-hidden="true">{secondaryPageLabel}</span>
            </button>
          </div>
        </nav>
        </div>
        <div data-public-mobile-secondary data-mobile-visible={isSecondaryNavVisible ? 'true' : 'false'} data-primary-visible={isPrimaryHeaderVisible ? 'true' : 'false'} className={clsx('public-app-bar__secondary theme-navigation-surface relative z-20 border-b border-white/[0.08] shadow-[0_10px_35px_rgba(0,0,0,0.12)] transition-[transform,opacity,background-color] ease-out motion-reduce:transition-none lg:hidden', mobileMode === 'overlay' ? 'public-app-bar--overlay' : 'public-app-bar--surface')}>
          <MobileTopNavigation />
        </div>
      </header>

      {open && (
        <div className="fixed inset-0 z-[60] lg:hidden">
          <button type="button" tabIndex={-1} className="absolute inset-0 bg-black/55 backdrop-blur-[2px]" onClick={closeMenu} aria-label="Close more links" />
          <section ref={panelRef} id="public-mobile-navigation" role="dialog" aria-modal="true" aria-label="More links" className="theme-navigation-surface absolute inset-y-0 right-0 grid w-[min(23rem,calc(100%-1rem))] grid-rows-[auto_1fr_auto] overflow-hidden border-l border-white/[0.1] bg-zinc-950/98 shadow-[-24px_0_70px_rgba(0,0,0,0.38)]">
            <div className="flex min-h-16 items-center justify-between gap-4 border-b border-white/[0.08] px-4 pt-[env(safe-area-inset-top)]">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--site-accent-text)]">More</p>
                <p className="mt-1 truncate text-sm text-zinc-400">About and contact</p>
              </div>
              <button data-drawer-initial-focus type="button" onClick={closeMenu} className="grid h-11 w-11 shrink-0 place-items-center text-zinc-200 transition hover:text-orange-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]" aria-label="Close more links"><X size={22} aria-hidden="true" /></button>
            </div>

            <nav className="min-h-0 overflow-y-auto overscroll-contain px-3 py-4" aria-label="Secondary mobile navigation">
              <p className="px-2 text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-600">Information</p>
              <div className="mt-2 grid gap-1">
                {mobileSecondaryLinks.map(([label, href]) => (
                  <NavLink key={href} to={href} onClick={avoidDuplicateNavigation(href)} onPointerDown={() => preloadPublicRoute(href)} className={({ isActive }) => clsx('flex min-h-12 items-center justify-between rounded-xl border px-4 py-3 text-sm font-medium transition', isActive ? 'border-[var(--site-accent-border)] bg-[var(--site-accent-surface)] text-[var(--site-accent-text)]' : 'border-transparent text-zinc-300 hover:border-white/[0.08] hover:bg-white/[0.04] hover:text-white')}>
                    <span>{label}</span><ArrowRight size={16} aria-hidden="true" />
                  </NavLink>
                ))}
              </div>
            </nav>

            <div className="border-t border-white/[0.08] bg-black/10 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
              <Link to="/admin/dashboard" onClick={closeMenu} aria-label="Open admin dashboard" title="Admin dashboard" className="grid h-11 w-11 place-items-center text-zinc-400 transition hover:text-[var(--site-accent-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
                <LockKeyhole size={18} aria-hidden="true" />
              </Link>
              <p className="mt-4 text-xs leading-5 text-zinc-600">{content.tagline}</p>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
