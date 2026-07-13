import { Menu, X } from 'lucide-react';
import { useState } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import clsx from 'clsx';
import { usePublicContent } from '../lib/contentApi';
import { preloadPublicRoute } from '../lib/publicRoutePreload';

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
  const location = useLocation();
  const { content } = usePublicContent([]);

  function avoidDuplicateNavigation(href) {
    return (event) => {
      if (location.pathname === href) event.preventDefault();
      setOpen(false);
    };
  }

  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.08] bg-zinc-950/90 shadow-[0_10px_35px_rgba(0,0,0,0.12)] xl:bg-zinc-950/75 xl:backdrop-blur-xl">
      <nav className="page-shell flex min-h-16 items-center justify-between">
        <Link to="/" onClick={avoidDuplicateNavigation('/')} className="group flex items-center gap-3 font-medium tracking-wide">
          {content.logoUrl ? (
            <img src={content.logoUrl} alt={content.logoAlt} decoding="async" width="32" height="32" className="h-8 w-8 rounded-md object-contain" />
          ) : (
            <span className="site-accent site-border grid h-8 w-8 place-items-center border text-xs font-semibold transition">{content.initials}</span>
          )}
          <span>{content.displayName}</span>
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
                  'relative min-h-11 content-center px-3 py-2 text-xs uppercase tracking-[0.12em] transition after:absolute after:inset-x-3 after:bottom-0 after:h-px after:origin-left after:bg-orange-300 after:transition-transform',
                  isActive ? 'site-primary after:scale-x-100' : 'site-muted after:scale-x-0 hover:text-white hover:after:scale-x-100',
                )
              }
            >
              {label}
            </NavLink>
          ))}
        </div>
        <button className="grid h-11 w-11 place-items-center text-zinc-200 xl:hidden" onClick={() => setOpen((value) => !value)} aria-label="Toggle menu">
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </nav>
      {open && (
        <div className="page-shell grid gap-1 pb-4 xl:hidden">
          {links.map(([label, href]) => (
            <NavLink key={href} to={href} onClick={avoidDuplicateNavigation(href)} onPointerDown={() => preloadPublicRoute(href)} className={({ isActive }) => `border-b py-3 text-sm uppercase tracking-[0.12em] transition ${isActive ? 'border-orange-300 text-white' : 'border-white/[0.06] text-zinc-400'}`}>
              {label}
            </NavLink>
          ))}
        </div>
      )}
    </header>
  );
}
