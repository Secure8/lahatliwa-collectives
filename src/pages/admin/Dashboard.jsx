import { FileText, Plus, Settings } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AdminLayout from '../../components/admin/AdminLayout';
import DashboardStats from '../../components/admin/DashboardStats';
import LoadingState from '../../components/LoadingState';
import { supabase } from '../../lib/supabaseClient';

export default function Dashboard() {
  const [stats, setStats] = useState({ total: 0, published: 0, draft: 0, featured: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadStats() {
      const { data } = await supabase.from('projects').select('status, featured');
      const rows = data || [];
      setStats({
        total: rows.length,
        published: rows.filter((project) => project.status === 'published').length,
        draft: rows.filter((project) => project.status === 'draft').length,
        featured: rows.filter((project) => project.featured).length,
      });
      setLoading(false);
    }
    loadStats();
  }, []);

  return (
    <AdminLayout>
      <div className="mb-8">
        <p className="text-sm text-amber-200">Welcome back</p>
        <h1 className="mt-2 text-3xl font-bold">Dashboard</h1>
      </div>
      {loading ? <LoadingState label="Loading dashboard" /> : <DashboardStats stats={stats} />}
      <div className="mt-8 flex flex-wrap gap-3">
        <Link to="/admin/projects/new" className="inline-flex items-center gap-2 rounded-md bg-amber-300 px-5 py-3 font-semibold text-zinc-950">
          <Plus size={18} /> Add project
        </Link>
        <Link to="/admin/projects" className="inline-flex items-center gap-2 rounded-md border border-white/10 px-5 py-3 font-semibold text-zinc-200 hover:bg-white/5">
          <Settings size={18} /> Manage projects
        </Link>
        <Link to="/admin/settings" className="inline-flex items-center gap-2 rounded-md border border-white/10 px-5 py-3 font-semibold text-zinc-200 hover:bg-white/5">
          <Settings size={18} /> Site settings
        </Link>
        <Link to="/admin/content" className="inline-flex items-center gap-2 rounded-md border border-white/10 px-5 py-3 font-semibold text-zinc-200 hover:bg-white/5">
          <FileText size={18} /> Page content
        </Link>
      </div>
    </AdminLayout>
  );
}
