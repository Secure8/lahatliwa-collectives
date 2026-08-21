import { Contact, Menu, MoreHorizontal, Palette, PanelTop, Settings2 } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import usePublicAccount from '../lib/usePublicAccount';

const pageSection = (pathname) => {
  if (pathname === '/') return ['page.home', 'Feed'];
  if (pathname === '/work') return ['page.explore', 'Current work'];
  if (pathname === '/projects') return ['page.projects', 'Portfolio'];
  if (pathname === '/creatives') return ['page.creatives', 'Creative network'];
  if (pathname === '/about') return ['page.about', 'About'];
  if (pathname === '/services' || pathname === '/contact') return ['page.inquiries', 'Contact'];
  if (pathname === '/privacy') return ['page.privacy', 'Privacy'];
  return ['', 'Public view'];
};

export default function PublicAdminToolbar() {
  const { pathname } = useLocation();
  const { account } = usePublicAccount();
  if (account?.role !== 'super_admin') return null;
  const [, label] = pageSection(pathname);
  const editor = (target) => `/admin/website?section=${target}`;
  return <aside className="ll-admin-authoring-toolbar" aria-label="Website editing toolbar">
    <div className="ll-admin-authoring-toolbar__context"><Settings2 size={16}/><span><small>Editing</small><strong>{label}</strong></span></div>
    <nav aria-label="Website editing tools">
      <Link to={editor('global.brand')}><PanelTop size={16}/><span>Branding</span></Link>
      <Link to={editor('global.navigation')}><Menu size={16}/><span>Navigation</span></Link>
      <Link to={editor('global.appearance')}><Palette size={16}/><span>Colors</span></Link>
      <Link to={editor('page.inquiries')}><Contact size={16}/><span>Contact</span></Link>
    </nav>
    <Link to="/admin/dashboard" className="ll-admin-authoring-toolbar__platform" aria-label="Open Platform tools" title="Platform tools"><MoreHorizontal size={20}/><span className="sr-only">Platform tools</span></Link>
  </aside>;
}
