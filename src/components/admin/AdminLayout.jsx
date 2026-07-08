import { ExternalLink, FileText, FolderKanban, Images, LayoutDashboard, LogOut, Settings } from 'lucide-react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { supabase } from '../../lib/supabaseClient';

const links = [
  ['Dashboard', '/admin/dashboard', LayoutDashboard],
  ['Projects', '/admin/projects', FolderKanban],
  ['Site Settings', '/admin/settings', Settings],
  ['Page Content', '/admin/content', FileText],
  ['Icons / Media', '/admin/media/icons', Images],
];

export default function AdminLayout({ children }) {
  const navigate = useNavigate();

  async function logout() {
    await supabase.auth.signOut();
    navigate('/admin/login');
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <aside className="fixed inset-x-0 top-0 z-30 border-b border-white/10 bg-zinc-950/90 backdrop-blur-xl lg:inset-y-0 lg:right-auto lg:w-64 lg:border-b-0 lg:border-r">
        <div className="flex h-16 items-center justify-between px-5 lg:h-auto lg:flex-col lg:items-stretch lg:gap-8 lg:py-6">
          <div>
            <p className="text-sm text-zinc-500">Admin</p>
            <h1 className="text-lg font-semibold">Lahat Liwa</h1>
          </div>
          <nav className="hidden gap-2 lg:grid">
            {links.map(([label, href, Icon]) => (
              <NavLink
                key={href}
                to={href}
                className={({ isActive }) =>
                  clsx('flex items-center gap-3 rounded-md px-3 py-2 text-sm text-zinc-300 hover:bg-white/5', isActive && 'bg-white/10 text-white')
                }
              >
                <Icon size={17} /> {label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-2 lg:grid">
            <Link to="/" className="inline-flex items-center gap-2 rounded-md border border-white/10 px-3 py-2 text-sm text-zinc-300 hover:border-amber-300/60 hover:text-amber-200">
              <ExternalLink size={16} /> View site
            </Link>
            <button onClick={logout} className="inline-flex items-center gap-2 rounded-md border border-white/10 px-3 py-2 text-sm text-zinc-300 hover:border-amber-300/60 hover:text-amber-200">
              <LogOut size={16} /> Logout
            </button>
          </div>
        </div>
        <nav className="flex gap-2 overflow-x-auto px-4 pb-3 lg:hidden">
          <Link to="/" className="inline-flex shrink-0 items-center gap-2 rounded-md border border-white/10 px-3 py-2 text-sm text-zinc-300">
            <ExternalLink size={16} /> View site
          </Link>
          {links.map(([label, href, Icon]) => (
            <NavLink key={href} to={href} className="inline-flex shrink-0 items-center gap-2 rounded-md bg-white/5 px-3 py-2 text-sm text-zinc-300">
              <Icon size={16} /> {label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="px-4 pt-28 lg:ml-64 lg:px-8 lg:pt-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
