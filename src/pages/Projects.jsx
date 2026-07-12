import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import EmptyState from '../components/EmptyState';
import LoadingState from '../components/LoadingState';
import ProjectGrid from '../components/ProjectGrid';
import SearchBar from '../components/SearchBar';
import { usePublicContent } from '../lib/contentApi';
import { normalizeBranchQuery, PROJECT_BRANCHES, projectsForBranch } from '../lib/projectBranches';
import { fetchPublicProjectSummaries, readCachedPublicProjectSummaries } from '../lib/publicProjectData';
import { scrollPreservingNavigationState, shouldPushFilter } from '../lib/navigationHistory';

export default function Projects() {
  const [projects, setProjects] = useState(() => readCachedPublicProjectSummaries() || []);
  const [loading, setLoading] = useState(() => !readCachedPublicProjectSummaries());
  const [error, setError] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();
  const { content } = usePublicContent([]);
  const featuredOnly = searchParams.get('featured') === '1';
  const selectedBranch = normalizeBranchQuery(searchParams.get('branch'));
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

  useEffect(() => {
    if (!searchParams.get('branch') || selectedBranch) return;
    const next = new URLSearchParams(searchParams); next.delete('branch'); setSearchParams(next, { replace: true, state: scrollPreservingNavigationState('project-results', window.scrollY) });
  }, [searchParams, selectedBranch, setSearchParams]);

  const visible = useMemo(() => {
    const term = search.toLowerCase();
    return projectsForBranch(projects, selectedBranch).filter((project) => {
      const matchesSearch = !term || project.title.toLowerCase().includes(term) || (project.description || '').toLowerCase().includes(term);
      return matchesSearch && (!featuredOnly || project.featured);
    });
  }, [featuredOnly, projects, search, selectedBranch]);

  function selectBranch(branch) {
    if (!shouldPushFilter(selectedBranch, branch)) return;
    const next = new URLSearchParams(searchParams);
    if (branch) next.set('branch', branch); else next.delete('branch');
    setSearchParams(next, { state: scrollPreservingNavigationState('project-results', window.scrollY) });
  }

  function updateSearch(value) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set('search', value); else next.delete('search');
    setSearchParams(next, { replace: true, state: scrollPreservingNavigationState('project-results', window.scrollY) });
  }

  return (
    <div className="page-shell py-20">
      <div className="mb-12 max-w-3xl">
        <p className="text-xs font-medium uppercase tracking-[0.28em]" style={{ color: content.accentColor }}>{featuredOnly ? 'Selected projects' : 'Projects'}</p>
        <h1 className="mt-5 text-4xl font-semibold leading-tight sm:text-5xl" style={{ color: content.primaryTextColor }}>{featuredOnly ? 'Selected work, arranged by priority.' : 'Published creative and digital work.'}</h1>
        <p className="mt-5 max-w-2xl leading-7" style={{ color: content.secondaryTextColor }}>{featuredOnly ? 'Browse every featured project from the portfolio, including the work highlighted on the homepage.' : 'Search through published portfolio pieces across photography, editing, design, websites, apps, and digital work.'}</p>
        {featuredOnly && <Link to="/projects" className="site-hover-accent mt-5 inline-flex text-sm text-zinc-300">View all projects</Link>}
      </div>
      <div id="project-results" className="major-border-y mb-12 scroll-mt-20 py-5">
        <SearchBar value={search} onChange={updateSearch} />
        <div className="mt-5 flex flex-wrap gap-x-5 gap-y-3" aria-label="Filter projects by branch">
          <button type="button" onClick={() => selectBranch(null)} className={`border-b pb-1 text-sm transition ${!selectedBranch ? 'border-[var(--site-accent)] text-white' : 'border-transparent text-zinc-500 hover:text-zinc-200'}`}>All Projects</button>
          {PROJECT_BRANCHES.map((branch) => <button key={branch.key} type="button" onClick={() => selectBranch(branch.key)} className={`border-b pb-1 text-sm transition ${selectedBranch === branch.key ? 'border-[var(--site-accent)] text-white' : 'border-transparent text-zinc-500 hover:text-zinc-200'}`}>{branch.label}</button>)}
        </div>
      </div>
      {loading && <LoadingState label="Loading projects" />}
      {error && <div className="rounded-md border border-red-400/30 bg-red-500/10 p-4 text-red-100">{error}</div>}
      {!loading && !error && (visible.length ? <ProjectGrid projects={visible} /> : <EmptyState title={selectedBranch ? 'Projects for this branch are being prepared.' : 'No projects found'} message={selectedBranch ? 'Explore another branch or view all current work.' : 'Try another search term.'} />)}
    </div>
  );
}
