import { useEffect, useMemo, useState } from 'react';
import CategoryFilter from '../components/CategoryFilter';
import EmptyState from '../components/EmptyState';
import LoadingState from '../components/LoadingState';
import ProjectGrid from '../components/ProjectGrid';
import SearchBar from '../components/SearchBar';
import { supabase } from '../lib/supabaseClient';

export default function Projects() {
  const [projects, setProjects] = useState([]);
  const [category, setCategory] = useState('All');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
      const matchesCategory = category === 'All' || project.category === category;
      const matchesSearch = !term || project.title.toLowerCase().includes(term) || project.description.toLowerCase().includes(term);
      return matchesCategory && matchesSearch;
    });
  }, [projects, category, search]);

  return (
    <div className="page-shell py-20">
      <div className="mb-12 max-w-3xl">
        <p className="text-xs font-medium uppercase tracking-[0.28em] text-amber-200/80">Projects</p>
        <h1 className="mt-5 text-4xl font-semibold leading-tight text-white sm:text-5xl">Published creative and digital work.</h1>
      </div>
      <div className="mb-12 grid gap-5 border-y border-white/[0.07] py-5">
        <SearchBar value={search} onChange={setSearch} />
        <CategoryFilter value={category} onChange={setCategory} />
      </div>
      {loading && <LoadingState label="Loading projects" />}
      {error && <div className="rounded-lg border border-red-400/30 bg-red-500/10 p-4 text-red-100">{error}</div>}
      {!loading && !error && (visible.length ? <ProjectGrid projects={visible} /> : <EmptyState title="No projects found" message="Try another category or search term." />)}
    </div>
  );
}
