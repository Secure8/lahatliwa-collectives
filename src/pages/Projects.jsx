import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import EmptyState from '../components/EmptyState';
import LoadingState from '../components/LoadingState';
import ProjectGrid from '../components/ProjectGrid';
import SearchBar from '../components/SearchBar';
import { usePublicContent } from '../lib/contentApi';
import { fetchPublicProjectSummaries, readCachedPublicProjectSummaries } from '../lib/publicProjectData';
import { scrollPreservingNavigationState } from '../lib/navigationHistory';

export default function Projects() {
  const [projects, setProjects] = useState(() => readCachedPublicProjectSummaries() || []);
  const [loading, setLoading] = useState(() => !readCachedPublicProjectSummaries());
  const [error, setError] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();
  const { content } = usePublicContent([]);
  const page = content.websitePages?.projects || {};
  const featuredOnly = searchParams.get('featured') === '1';
  const search = searchParams.get('search') || '';

  useEffect(() => {
    let active = true;
    async function loadProjects() {
      setLoading(true);
      try {
        const rows = await fetchPublicProjectSummaries();
        if (active) setProjects(rows);
      } catch (projectError) {
        if (active) setError(projectError.message || 'Projects could not be loaded.');
      }
      if (active) setLoading(false);
    }
    loadProjects();
    return () => { active = false; };
  }, []);

  const visible = useMemo(() => {
    const term = search.toLowerCase();
    return projects.filter((project) => {
      const matchesSearch = !term || project.title.toLowerCase().includes(term) || (project.description || '').toLowerCase().includes(term);
      return matchesSearch && (!featuredOnly || project.featured);
    });
  }, [featuredOnly, projects, search]);

  function updateSearch(value) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set('search', value); else next.delete('search');
    setSearchParams(next, { replace: true, state: scrollPreservingNavigationState('project-results', window.scrollY) });
  }

  return (
    <div className="page-shell pb-16 pt-14 sm:pb-20 sm:pt-20">
      <header className="border-b border-white/[0.09] pb-9 sm:pb-11">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-end">
          <div className="max-w-4xl">
            <p className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.22em] text-orange-300">
              <span className="h-1.5 w-1.5 rounded-full bg-orange-300 shadow-[0_0_9px_rgba(253,186,116,0.9)]" aria-hidden="true" />
              {featuredOnly ? 'Selected projects' : (page.eyebrow || 'Project archive')}
            </p>
            <h1 className="mt-5 text-4xl font-semibold leading-tight tracking-[-0.035em] sm:text-5xl" style={{ color: 'var(--site-primary-text)' }}>
              {featuredOnly ? 'Selected published work.' : (page.title || 'Published work and credited contributions.')}
            </h1>
          </div>
          <div className="border-l border-orange-300/55 pl-5 lg:pb-1">
            <p className="text-sm leading-6" style={{ color: 'var(--site-secondary-text)' }}>{featuredOnly ? 'A focused selection of published work with contributor credits and full output links when available.' : (page.description || 'Explore complete project records across visual, digital, social, and community work. Open an entry to see its output, contributor credits, and roles.')}</p>
            <p className="mt-4 text-[10px] uppercase tracking-[0.18em] text-zinc-500">{visible.length} {visible.length === 1 ? 'project' : 'projects'} in view</p>
            {featuredOnly && <Link to="/projects" className="mt-4 inline-flex min-h-11 items-center border-b border-white/20 text-sm text-zinc-300 transition hover:border-orange-300/60 hover:text-orange-200">View all</Link>}
          </div>
        </div>
      </header>

      <section id="project-results" className="scroll-mt-20 border-b border-white/[0.09] py-6 sm:py-7" aria-label="Project search">
        <div className="max-w-xl">
          <SearchBar value={search} onChange={updateSearch} />
        </div>
      </section>

      <section className="pt-10 sm:pt-12" aria-live="polite">
        {loading && <LoadingState label="Loading projects" />}
        {error && <div className="border-y border-red-400/30 py-5 text-red-100">{error}</div>}
        {!loading && !error && (visible.length ? <ProjectGrid projects={visible} /> : <EmptyState title="No projects found" message="Try another search term." />)}
      </section>
    </div>
  );
}
