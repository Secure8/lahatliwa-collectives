import { Menu, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import clsx from 'clsx';
import { usePublicContent } from '../lib/contentApi';
import { preloadPublicRoute } from '../lib/publicRoutePreload';
import BrandWordmark from './BrandWordmark';

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
  const [immersiveVisible, setImmersiveVisible] = useState(false);
  const location = useLocation();
  const { content } = usePublicContent([]);
  const immersiveProfile = /^\/creatives\/[^/]+\/?$/.test(location.pathname);

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
      setOpen(false);
    };
  }

  return (
    <header
      onFocusCapture={() => immersiveProfile && setImmersiveVisible(true)}
      onBlurCapture={(event) => immersiveProfile && !event.currentTarget.contains(event.relatedTarget) && setImmersiveVisible(false)}
      className={clsx(
        'theme-navigation-surface top-0 border-b border-white/[0.08] bg-zinc-950/90 shadow-[0_10px_35px_rgba(0,0,0,0.12)] xl:bg-zinc-950/75 xl:backdrop-blur-xl',
        immersiveProfile ? 'fixed inset-x-0 z-50 xl:transition-[transform,opacity] xl:duration-300 xl:ease-out motion-reduce:transition-none' : 'sticky z-40',
        immersiveProfile && (immersiveVisible ? 'xl:translate-y-0 xl:opacity-100' : 'xl:pointer-events-none xl:-translate-y-full xl:opacity-0'),
      )}
    >
      <nav className="page-shell flex min-h-16 items-center justify-between gap-3">
        <Link to="/" onClick={avoidDuplicateNavigation('/')} className="group flex min-w-0 items-center gap-3" aria-label={`${content.displayName} home`}>
          {content.logoUrl ? (
            <img src={content.logoUrl} alt={content.logoAlt} decoding="async" width="32" height="32" className="h-8 w-8 rounded-md object-contain" />
          ) : (
            <span className="site-accent site-border grid h-8 w-8 place-items-center border text-xs font-semibold transition">{content.initials}</span>
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
              className={({ isActive }) =>
                clsx(
                  'relative min-h-11 content-center px-3 py-2 text-xs uppercase tracking-[0.12em] transition after:absolute after:inset-x-3 after:bottom-0 after:h-px after:origin-left after:bg-[var(--site-accent)] after:transition-transform',
                  isActive ? 'site-primary after:scale-x-100' : 'site-muted after:scale-x-0 hover:text-white hover:after:scale-x-100',
                )
              }
            >
              {label}
            </NavLink>
          ))}
        </div>
        <div className="flex items-center gap-2 xl:hidden">
          <button className="grid h-11 w-11 place-items-center border border-white/[0.12] bg-white/[0.035] text-zinc-200 transition hover:border-orange-300/35 hover:bg-white/[0.07]" onClick={() => setOpen((value) => !value)} aria-label={open ? 'Close main menu' : 'Open main menu'} aria-expanded={open} aria-controls="public-mobile-navigation">
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </nav>
      {open && (
        <div id="public-mobile-navigation" className="page-shell grid gap-1 pb-4 xl:hidden">
          {links.map(([label, href]) => (
            <NavLink key={href} to={href} onClick={avoidDuplicateNavigation(href)} onPointerDown={() => preloadPublicRoute(href)} className={({ isActive }) => `border-b py-3 text-sm uppercase tracking-[0.12em] transition ${isActive ? 'border-[var(--site-accent-border)] text-[var(--site-accent-text)]' : 'border-white/[0.06] text-zinc-400'}`}>
              {label}
            </NavLink>
          ))}
        </div>
      )}
    </header>
  );
}
