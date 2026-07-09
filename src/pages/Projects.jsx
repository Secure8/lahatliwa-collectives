import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import EmptyState from '../components/EmptyState';
import LoadingState from '../components/LoadingState';
import ProjectGrid from '../components/ProjectGrid';
import SearchBar from '../components/SearchBar';
import { usePublicContent } from '../lib/contentApi';
import { supabase } from '../lib/supabaseClient';

export default function Projects() {
  const [projects, setProjects] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchParams] = useSearchParams();
  const { content } = usePublicContent([]);
  const featuredOnly = searchParams.get('featured') === '1';

  useEffect(() => {
    async function loadProjects() {
      setLoading(true);
      const { data, error: projectError } = await supabase
        .from('projects')
        .select('id, title, slug, category, description, cover_image, gallery_images, gallery_items, featured, display_order, project_date')
        .eq('status', 'published')
        .order('featured', { ascending: false })
        .order('display_order', { ascending: true, nullsFirst: false })
        .order('project_date', { ascending: false, nullsFirst: false });

      if (projectError) setError(projectError.message);
      else setProjects(data || []);
      setLoading(false);
    }
    loadProjects();
  }, []);

  const visible = useMemo(() => {
    const term = search.toLowerCase();
    return projects.filter((project) => {
      const matchesSearch = !term || project.title.toLowerCase().includes(term) || (project.description || '').toLowerCase().includes(term);
      return matchesSearch && (!featuredOnly || project.featured);
    });
  }, [featuredOnly, projects, search]);

  return (
    <div className="page-shell py-20">
      <div className="mb-12 max-w-3xl">
        <p className="text-xs font-medium uppercase tracking-[0.28em]" style={{ color: content.accentColor }}>{featuredOnly ? 'Selected projects' : 'Projects'}</p>
        <h1 className="mt-5 text-4xl font-semibold leading-tight sm:text-5xl" style={{ color: content.primaryTextColor }}>{featuredOnly ? 'Selected work, arranged by priority.' : 'Published creative and digital work.'}</h1>
        <p className="mt-5 max-w-2xl leading-7" style={{ color: content.secondaryTextColor }}>{featuredOnly ? 'Browse every featured project from the portfolio, including the work highlighted on the homepage.' : 'Search through published portfolio pieces across photography, editing, design, websites, apps, and digital work.'}</p>
        {featuredOnly && <Link to="/projects" className="site-hover-accent mt-5 inline-flex text-sm text-zinc-300">View all projects</Link>}
      </div>
      <div className="major-border-y mb-12 py-5">
        <SearchBar value={search} onChange={setSearch} />
      </div>
      {loading && <LoadingState label="Loading projects" />}
      {error && <div className="rounded-lg border border-red-400/30 bg-red-500/10 p-4 text-red-100">{error}</div>}
      {!loading && !error && (visible.length ? <ProjectGrid projects={visible} /> : <EmptyState title="No projects found" message="Try another search term." />)}
    </div>
  );
}
