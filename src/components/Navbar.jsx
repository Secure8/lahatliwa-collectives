import { ArrowRight, Menu, X } from 'lucide-react';
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

const links = [
  ['Home', '/'],
  ['About', '/about'],
  ['Projects', '/projects'],
  ['Services', '/services'],
  ['Creatives', '/creatives'],
  ['Contact', '/contact'],
];

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const [headerFocused, setHeaderFocused] = useState(false);
  const [immersiveVisible, setImmersiveVisible] = useState(false);
  const location = useLocation();
  const { content } = usePublicContent([]);
  const immersiveProfile = /^\/creatives\/[^/]+\/?$/.test(location.pathname);
  const mobileMode = publicAppBarMode(location.pathname);
  const closeMenu = useCallback(() => setOpen(false), []);
  const mobileVisible = useMobileAppBar({ locked: open || headerFocused, routeKey: `${location.pathname}${location.search}` });
  const { panelRef, triggerRef } = useModalDrawer({ open, onClose: closeMenu });

  useEffect(() => {
    setOpen(false);
    setHeaderFocused(false);
  }, [location.key, location.pathname]);

  useEffect(() => {
    if (!immersiveProfile) {
      setImmersiveVisible(false);
      return undefined;
    }
    const revealFromTopEdge = (event) => {
      if (event.pointerType === 'mouse') setImmersiveVisible(event.clientY <= 140);
    };
    window.addEventListener('pointermove', revealFromTopEdge, { passive: true });
    return () => window.removeEventListener('pointermove', revealFromTopEdge);
  }, [immersiveProfile]);

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
        onFocusCapture={() => {
          setHeaderFocused(true);
          if (immersiveProfile) setImmersiveVisible(true);
        }}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) {
            setHeaderFocused(false);
            if (immersiveProfile) setImmersiveVisible(false);
          }
        }}
        className={clsx(
          'public-app-bar theme-navigation-surface fixed inset-x-0 top-0 z-50 border-b border-white/[0.08] shadow-[0_10px_35px_rgba(0,0,0,0.12)] transition-[transform,opacity,background-color] duration-200 ease-out motion-reduce:transition-none xl:inset-x-auto xl:translate-y-0 xl:bg-zinc-950/75 xl:backdrop-blur-xl',
          mobileMode === 'overlay' ? 'public-app-bar--overlay' : 'public-app-bar--surface',
          mobileVisible ? 'translate-y-0' : '-translate-y-full',
          immersiveProfile ? 'creative-profile-navigation xl:fixed xl:inset-x-0 xl:z-50 xl:duration-300' : 'xl:sticky xl:z-40',
          immersiveProfile && open && 'creative-profile-navigation--open',
          immersiveProfile && (immersiveVisible ? 'xl:translate-y-0 xl:opacity-100' : 'xl:pointer-events-none xl:-translate-y-full xl:opacity-0'),
        )}
      >
        <nav className="page-shell flex min-h-14 items-center justify-between gap-3 xl:min-h-16" aria-label="Primary navigation">
          <Link to="/" onClick={avoidDuplicateNavigation('/')} className="group flex min-w-0 items-center gap-3" aria-label={`${content.displayName} home`}>
            {content.logoUrl ? (
              <BrandLogo src={content.logoUrl} alt={content.logoAlt} />
            ) : (
              <span className="site-accent site-border grid h-8 w-8 shrink-0 place-items-center border text-xs font-semibold transition">{content.initials}</span>
            )}
            <BrandWordmark name={content.displayName} variant="compact" mobileVariant="mobile-compact" />
          </Link>
          <div className="hidden items-center gap-1 xl:flex">
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
          </div>
          <button
            ref={triggerRef}
            type="button"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/[0.12] bg-white/[0.045] text-zinc-200 transition hover:border-orange-300/35 hover:bg-white/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] xl:hidden"
            onClick={() => setOpen(true)}
            aria-label="Open main menu"
            aria-expanded={open}
            aria-controls="public-mobile-navigation"
            aria-hidden={open ? 'true' : undefined}
            tabIndex={open ? -1 : undefined}
          >
            <Menu size={22} aria-hidden="true" />
          </button>
        </nav>
      </header>

      {open && (
        <div className="fixed inset-0 z-[60] xl:hidden">
          <button type="button" tabIndex={-1} className="absolute inset-0 bg-black/55 backdrop-blur-[2px]" onClick={closeMenu} aria-label="Close main menu" />
          <section ref={panelRef} id="public-mobile-navigation" role="dialog" aria-modal="true" aria-label="Main menu" className="theme-navigation-surface absolute inset-y-0 right-0 grid w-[min(23rem,calc(100%-1rem))] grid-rows-[auto_1fr_auto] overflow-hidden border-l border-white/[0.1] bg-zinc-950/98 shadow-[-24px_0_70px_rgba(0,0,0,0.38)]">
            <div className="flex min-h-16 items-center justify-between gap-4 border-b border-white/[0.08] px-4 pt-[env(safe-area-inset-top)]">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--site-accent-text)]">Menu</p>
                <p className="mt-1 truncate text-sm text-zinc-400">Explore {content.displayName}</p>
              </div>
              <button data-drawer-initial-focus type="button" onClick={closeMenu} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/[0.12] bg-white/[0.045] text-zinc-200" aria-label="Close main menu"><X size={22} aria-hidden="true" /></button>
            </div>

            <nav className="min-h-0 overflow-y-auto overscroll-contain px-3 py-4" aria-label="Mobile navigation">
              <p className="px-2 text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-600">Explore</p>
              <div className="mt-2 grid gap-1">
                {links.map(([label, href]) => (
                  <NavLink key={href} to={href} onClick={avoidDuplicateNavigation(href)} onPointerDown={() => preloadPublicRoute(href)} className={({ isActive }) => clsx('flex min-h-12 items-center justify-between rounded-xl border px-4 py-3 text-sm font-medium transition', isActive ? 'border-[var(--site-accent-border)] bg-[var(--site-accent-surface)] text-[var(--site-accent-text)]' : 'border-transparent text-zinc-300 hover:border-white/[0.08] hover:bg-white/[0.04] hover:text-white')}>
                    <span>{label}</span><ArrowRight size={16} aria-hidden="true" />
                  </NavLink>
                ))}
              </div>
              <NavLink to="/inquiry" onClick={avoidDuplicateNavigation('/inquiry')} className="site-button mt-5 flex min-h-12 items-center justify-between rounded-xl px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
                <span>Send an inquiry</span><ArrowRight size={17} aria-hidden="true" />
              </NavLink>
            </nav>

            <div className="border-t border-white/[0.08] bg-black/10 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
              <AppearanceMenuAction className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-white/[0.1] bg-white/[0.035] px-4 text-left text-sm text-zinc-300 transition hover:bg-white/[0.07] hover:text-white" />
              <p className="mt-4 text-xs leading-5 text-zinc-600">{content.tagline}</p>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
