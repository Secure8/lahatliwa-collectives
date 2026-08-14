import { Edit3, Inbox, ShieldCheck, UsersRound } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import usePublicAccount from '../lib/usePublicAccount';

const sectionForPath = (pathname) => {
  if (pathname === '/') return 'page.home';
  if (pathname === '/about') return 'page.about';
  if (pathname === '/work') return 'page.explore';
  if (pathname === '/projects') return 'page.projects';
  if (pathname === '/creatives') return 'page.creatives';
  if (pathname === '/contact' || pathname === '/services') return 'page.inquiries';
  if (pathname === '/privacy') return 'page.privacy';
  return 'overview';
};

export default function PublicAdminBar() {
  const { pathname } = useLocation();
  const { account } = usePublicAccount();
  if (account?.role !== 'super_admin') return null;
  const section = sectionForPath(pathname);
  return <aside className="ll-public-admin-bar" aria-label="Super Admin website controls">
    <span><ShieldCheck size={15} /> Super Admin view</span>
    <Link to={`/admin/website${section === 'overview' ? '' : `?section=${section}`}`}><Edit3 size={15} /> Edit this page</Link>
    <Link to="/admin/inquiries"><Inbox size={15} /> Inquiries</Link>
    <Link to="/admin/team"><UsersRound size={15} /> Team</Link>
  </aside>;
}
