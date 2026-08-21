import { PenLine } from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';
import clsx from 'clsx';
import usePublicAccount from '../lib/usePublicAccount';
import { usePublicContent } from '../lib/contentApi';
import { publicNavigationItems } from '../lib/publicNavigation';

export default function MobileTopNavigation() {
  const location = useLocation();
  const { account } = usePublicAccount();
  const { content } = usePublicContent([]);
  const isCreative = account?.role === 'creative';
  const links = publicNavigationItems(content.websiteNavigation || {});
  const active = (href) => href === '/' ? location.pathname === '/' : location.pathname === href || location.pathname.startsWith(`${href}/`);
  return <>
    <nav data-mobile-top-navigation className="ll-mobile-dock" aria-label="Primary mobile navigation" style={{ gridTemplateColumns: `repeat(${links.length}, minmax(0, 1fr))` }}>
      {links.map(([label, href, Icon], index) => <NavLink key={`${href}-${index}`} to={href} aria-label={label} aria-current={active(href) ? 'page' : undefined} className={clsx(active(href) && 'is-active')}><span><Icon size={21} strokeWidth={active(href) ? 2.35 : 1.85} /></span><small>{label}</small></NavLink>)}
    </nav>
    {isCreative && <NavLink to="/create" className="ll-mobile-create-fab" aria-label="Create work" title="Create work"><PenLine size={22}/></NavLink>}
  </>;
}
