import { Bell, FolderKanban, Images, ShieldCheck, Tags, UsersRound, X } from 'lucide-react';
import { useEffect } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAdminAccess } from '../../lib/adminAccess';
import { usePublicContent } from '../../lib/contentApi';
import { supabase } from '../../lib/supabaseClient';

const operations = [
  ['Projects', '/admin/projects', FolderKanban],
  ['Featured', '/admin/featured', Images],
  ['Inquiries', '/admin/inquiries', Bell],
  ['Moderation', '/admin/moderation', ShieldCheck],
  ['Taxonomy', '/admin/taxonomy', Tags],
  ['Join requests', '/admin/team', UsersRound],
];

const pageTitle = (pathname) => operations.find(([, href]) => pathname.startsWith(href))?.[0] || 'Account';

export default function AdminLayout({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const access = useAdminAccess();
  const { content } = usePublicContent([]);
  const title = pageTitle(location.pathname);

  useEffect(() => {
    document.documentElement.classList.add('admin-mode');
    return () => document.documentElement.classList.remove('admin-mode');
  }, []);
  useEffect(() => { document.title = `${title} | ${content.displayName || 'Lahat Liwa Collectives'}`; }, [content.displayName, title]);

  async function logout() {
    await supabase.auth.signOut();
    navigate('/admin/login', { replace: true });
  }

  const visibleOperations = access.role === 'super_admin' ? operations : [];
  return <main className="ll-operations-page">
    <section className="ll-operations-window" aria-label={`${title} operations`}>
      <header className="ll-operations-window__header">
        <div><p className="ll-kicker">Platform tools</p><h1>Super Admin</h1></div>
        <div className="ll-operations-window__account">
          <span>{access.adminUser?.display_name || access.adminUser?.email || 'Account'}</span>
          <button type="button" onClick={logout}>Sign out</button>
          <Link to="/" aria-label="Close platform tools" title="Close"><X size={20}/></Link>
        </div>
      </header>
      {visibleOperations.length > 0 && <nav className="ll-operations-window__nav" aria-label="Platform tools">
        {visibleOperations.map(([label, href, Icon]) => <NavLink key={href} to={href} className={({ isActive }) => isActive ? 'is-active' : ''}><Icon size={16}/><span>{label}</span></NavLink>)}
      </nav>}
      <div id="admin-main-content" className="ll-operations-window__body">{children}</div>
    </section>
  </main>;
}
