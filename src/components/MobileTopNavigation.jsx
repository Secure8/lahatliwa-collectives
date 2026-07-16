import { GalleryHorizontalEnd, House, MessageSquarePlus, PanelsTopLeft, UsersRound } from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';
import clsx from 'clsx';
import { PUBLIC_PRIMARY_DESTINATIONS, publicDestinationIsActive } from '../lib/mobileAppShell';
import { preloadPublicRoute } from '../lib/publicRoutePreload';

const icons = {
  Home: House,
  Services: PanelsTopLeft,
  Projects: GalleryHorizontalEnd,
  Creatives: UsersRound,
  Inquiry: MessageSquarePlus,
};

export default function MobileTopNavigation() {
  const location = useLocation();

  return (
    <nav aria-label="Primary mobile navigation" data-mobile-top-navigation className="page-shell lg:hidden">
      <div className="grid grid-cols-5">
        {PUBLIC_PRIMARY_DESTINATIONS.map(([label, href]) => {
          const Icon = icons[label];
          const active = publicDestinationIsActive(location.pathname, href);
          return (
            <NavLink
              key={href}
              to={href}
              aria-label={label}
              aria-current={active ? 'page' : undefined}
              title={label}
              onPointerEnter={() => preloadPublicRoute(href)}
              onFocus={() => preloadPublicRoute(href)}
              className={clsx(
                'mobile-nav-item relative flex min-h-[3.25rem] min-w-0 items-center justify-center px-1 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)]',
                active ? 'text-[var(--site-accent-text)]' : 'text-zinc-500 hover:text-zinc-200',
              )}
            >
              <span className="grid h-9 w-12 place-items-center transition">
                <Icon className="mobile-nav-icon" size={21} strokeWidth={active ? 2.25 : 1.8} aria-hidden="true" />
              </span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
