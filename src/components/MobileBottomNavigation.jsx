import { FolderKanban, Home, LayoutGrid, Send, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import clsx from 'clsx';
import { PUBLIC_PRIMARY_DESTINATIONS, publicDestinationIsActive } from '../lib/mobileAppShell';
import useKeyboardVisibility from '../lib/useKeyboardVisibility';
import { preloadPublicRoute } from '../lib/publicRoutePreload';

const icons = { Home, Services: LayoutGrid, Projects: FolderKanban, Creatives: Users, Inquiry: Send };

export default function MobileBottomNavigation() {
  const location = useLocation();
  const keyboardVisible = useKeyboardVisibility();
  const [surfaceOpen, setSurfaceOpen] = useState(false);

  useEffect(() => {
    const update = () => setSurfaceOpen(document.documentElement.classList.contains('mobile-navigation-open') || Boolean(document.querySelector('[role="dialog"][aria-modal="true"]')));
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return (
    <nav
      aria-label="Primary mobile navigation"
      data-mobile-bottom-navigation
      data-hidden={keyboardVisible || surfaceOpen ? 'true' : 'false'}
      className={clsx('mobile-bottom-navigation theme-navigation-surface fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.1] bg-zinc-950/90 px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl transition-[transform,opacity] duration-200 motion-reduce:transition-none lg:hidden', (keyboardVisible || surfaceOpen) && 'pointer-events-none translate-y-full opacity-0')}
    >
      <div className="mx-auto grid max-w-lg grid-cols-5">
        {PUBLIC_PRIMARY_DESTINATIONS.map(([label, href]) => {
          const Icon = icons[label];
          const active = publicDestinationIsActive(location.pathname, href);
          return (
            <NavLink key={href} to={href} aria-label={label} aria-current={active ? 'page' : undefined} onPointerEnter={() => preloadPublicRoute(href)} onFocus={() => preloadPublicRoute(href)} className={clsx('relative flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1 text-[0.66rem] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)]', active ? 'text-[var(--site-accent-text)]' : 'text-zinc-500 hover:text-zinc-200')}>
              <Icon size={19} strokeWidth={active ? 2.2 : 1.8} aria-hidden="true" />
              <span className="max-w-full truncate">{label}</span>
              {active && <span className="absolute inset-x-4 top-0 h-0.5 rounded-full bg-[var(--site-accent)]" aria-hidden="true" />}
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
