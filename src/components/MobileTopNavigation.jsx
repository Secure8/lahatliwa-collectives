import { Compass, Handshake, House, Mail, PenLine, UsersRound } from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';
import clsx from 'clsx';
import usePublicAccount from '../lib/usePublicAccount';

export default function MobileTopNavigation() {
  const location = useLocation();
  const { account } = usePublicAccount();
  const isCreative = account?.role === 'creative';
  const links = [
    ['Feed', '/', House],
    ['Discover', '/discover', Compass],
    ['Creatives', '/creatives', UsersRound],
    ...(isCreative ? [['Create', '/create', PenLine]] : []),
    ['Start a project', '/inquiry', Handshake],
    ['Contact', '/contact', Mail],
  ];
  const active = (href) => href === '/' ? location.pathname === '/' : location.pathname === href || location.pathname.startsWith(`${href}/`);
  return <nav data-mobile-top-navigation className="ll-mobile-dock" aria-label="Primary mobile navigation" style={{ gridTemplateColumns: `repeat(${links.length}, minmax(0, 1fr))` }}>
    {links.map(([label, href, Icon], index) => <NavLink key={`${href}-${index}`} to={href} aria-label={label} aria-current={active(href) ? 'page' : undefined} className={clsx(active(href) && 'is-active', isCreative && href === '/create' && 'is-create')}><span><Icon size={21} strokeWidth={active(href) ? 2.35 : 1.85} /></span><small>{active(href) ? label : ''}</small></NavLink>)}
  </nav>;
}
