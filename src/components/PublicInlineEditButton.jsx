import { Edit3 } from 'lucide-react';
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

export default function PublicInlineEditButton({ section, label = 'Edit this content', className = '' }) {
  const { pathname } = useLocation();
  const { account } = usePublicAccount();
  if (account?.role !== 'super_admin') return null;
  const target = section || sectionForPath(pathname);
  return <Link className={`ll-inline-admin-edit ${className}`} to={`/admin/website${target === 'overview' ? '' : `?section=${target}`}`} aria-label={label} title={label}><Edit3 size={17}/></Link>;
}
