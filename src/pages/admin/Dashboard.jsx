import { CheckCircle2, Plus, Settings } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AdminLayout from '../../components/admin/AdminLayout';
import DashboardStats from '../../components/admin/DashboardStats';
import LoadingState from '../../components/LoadingState';
import { getSiteContent, saveSiteContent } from '../../data/siteContent';
import { supabase } from '../../lib/supabaseClient';

export default function Dashboard() {
  const [stats, setStats] = useState({ total: 0, published: 0, draft: 0, featured: 0 });
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState(getSiteContent());
  const [saved, setSaved] = useState(false);

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

  function handleChange(event) {
    const { name, value } = event.target;
    setSettings((current) => ({
      ...current,
      [name]: value,
    }));
    setSaved(false);
  }

  function handleNestedChange(event) {
    const { name, value } = event.target;
    const [group, field] = name.split('.');
    setSettings((current) => ({
      ...current,
      [group]: {
        ...current[group],
        [field]: value,
      },
    }));
    setSaved(false);
  }

  function handleSubmit(event) {
    event.preventDefault();
    saveSiteContent(settings);
    setSaved(true);
    window.location.reload();
  }

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
      </div>

      <section className="mt-10 rounded-2xl border border-white/10 bg-zinc-900/70 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-amber-200">Portfolio settings</p>
            <h2 className="mt-1 text-xl font-semibold text-white">Edit public content from here</h2>
          </div>
          {saved && (
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-200">
              <CheckCircle2 size={16} /> Saved and published
            </div>
          )}
        </div>

        <form className="mt-6 grid gap-5 lg:grid-cols-2" onSubmit={handleSubmit}>
          <label className="grid gap-2 text-sm text-zinc-300">
            <span>Display name</span>
            <input name="displayName" value={settings.displayName || ''} onChange={handleChange} className="rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-white outline-none" />
          </label>
          <label className="grid gap-2 text-sm text-zinc-300">
            <span>Legal name</span>
            <input name="legalName" value={settings.legalName || ''} onChange={handleChange} className="rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-white outline-none" />
          </label>
          <label className="grid gap-2 text-sm text-zinc-300">
            <span>Email</span>
            <input name="email" value={settings.email || ''} onChange={handleChange} className="rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-white outline-none" />
          </label>
          <label className="grid gap-2 text-sm text-zinc-300">
            <span>Hero eyebrow</span>
            <input name="hero.eyebrow" value={settings.hero?.eyebrow || ''} onChange={handleNestedChange} className="rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-white outline-none" />
          </label>
          <label className="grid gap-2 text-sm text-zinc-300 lg:col-span-2">
            <span>Hero title</span>
            <input name="hero.title" value={settings.hero?.title || ''} onChange={handleNestedChange} className="rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-white outline-none" />
          </label>
          <label className="grid gap-2 text-sm text-zinc-300 lg:col-span-2">
            <span>Hero description</span>
            <textarea name="hero.description" rows="4" value={settings.hero?.description || ''} onChange={handleNestedChange} className="rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-white outline-none" />
          </label>
          <label className="grid gap-2 text-sm text-zinc-300 lg:col-span-2">
            <span>About title</span>
            <input name="about.title" value={settings.about?.title || ''} onChange={handleNestedChange} className="rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-white outline-none" />
          </label>
          <label className="grid gap-2 text-sm text-zinc-300 lg:col-span-2">
            <span>About intro</span>
            <textarea name="about.intro" rows="4" value={settings.about?.intro || ''} onChange={handleNestedChange} className="rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-white outline-none" />
          </label>
          <label className="grid gap-2 text-sm text-zinc-300 lg:col-span-2">
            <span>About journey</span>
            <textarea name="about.journey" rows="4" value={settings.about?.journey || ''} onChange={handleNestedChange} className="rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-white outline-none" />
          </label>
          <div className="lg:col-span-2">
            <button type="submit" className="inline-flex items-center gap-2 rounded-md bg-amber-300 px-5 py-3 font-semibold text-zinc-950">
              Save portfolio settings
            </button>
          </div>
        </form>
      </section>
    </AdminLayout>
  );
}
