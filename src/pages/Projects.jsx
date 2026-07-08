import { useEffect, useMemo, useState } from 'react';
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
  const { content } = usePublicContent([]);

  useEffect(() => {
    async function loadProjects() {
      setLoading(true);
      const { data, error: projectError } = await supabase
        .from('projects')
        .select('*')
        .eq('status', 'published')
        .order('featured', { ascending: false })
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
      const matchesSearch = !term || project.title.toLowerCase().includes(term) || project.description.toLowerCase().includes(term);
      return matchesSearch;
    });
  }, [projects, search]);

  return (
    <div className="page-shell py-20">
      <div className="mb-12 max-w-3xl">
        <p className="text-xs font-medium uppercase tracking-[0.28em]" style={{ color: content.accentColor }}>Projects</p>
        <h1 className="mt-5 text-4xl font-semibold leading-tight sm:text-5xl" style={{ color: content.primaryTextColor }}>Published creative and digital work.</h1>
        <p className="mt-5 max-w-2xl leading-7" style={{ color: content.secondaryTextColor }}>Search through published portfolio pieces across photography, editing, design, websites, apps, and digital work.</p>
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
