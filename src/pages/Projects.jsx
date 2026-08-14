import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import EmptyState from '../components/EmptyState';
import LoadingState from '../components/LoadingState';
import ProjectGrid from '../components/ProjectGrid';
import SearchBar from '../components/SearchBar';
import { usePublicContent } from '../lib/contentApi';
import { fetchPublicProjectSummaries, readCachedPublicProjectSummaries } from '../lib/publicProjectData';
import { scrollPreservingNavigationState } from '../lib/navigationHistory';
import PublicInlineEditButton from '../components/PublicInlineEditButton';

export default function Projects() {
  const [projects, setProjects] = useState(() => readCachedPublicProjectSummaries('completed') || []);
  const [loading, setLoading] = useState(() => !readCachedPublicProjectSummaries('completed'));
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
        const rows = await fetchPublicProjectSummaries({ workStatus: 'completed' });
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
    <div className="page-shell ll-portfolio-page">
      <header className="ll-directory-intro relative">
        <PublicInlineEditButton section="page.projects" label="Edit Portfolio introduction" />
        <p className="ll-kicker">{featuredOnly ? 'Selected projects' : (page.eyebrow || 'Completed work')}</p>
        <h1>{featuredOnly ? 'Selected completed work.' : (page.title || 'The permanent project portfolio.')}</h1>
        <p>{featuredOnly ? 'A focused selection of completed work with contributor credits and full output links when available.' : (page.description || 'Projects move here when the active work is complete, preserving their outputs, progress, and contributor credits for permanent viewing.')}</p>
        {featuredOnly && <Link to="/projects" className="ll-text-action">View all</Link>}
      </header>

      <section id="project-results" className="ll-portfolio-search" aria-label="Project search">
        <div>
          <SearchBar value={search} onChange={updateSearch} />
        </div>
        <span>{visible.length} {visible.length === 1 ? 'project' : 'projects'}</span>
      </section>

      <section className="ll-portfolio-results" aria-live="polite">
        {loading && <LoadingState label="Loading projects" />}
        {error && <div className="border-y border-red-400/30 py-5 text-red-100">{error}</div>}
        {!loading && !error && (visible.length ? <ProjectGrid projects={visible} /> : <EmptyState title="No projects found" message="Try another search term." />)}
      </section>
    </div>
  );
}
