import { ArrowRight, CalendarDays, ExternalLink } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import EmptyState from '../components/EmptyState';
import LoadingState from '../components/LoadingState';
import PublicPageHeader from '../components/PublicPageHeader';
import { usePublicContent } from '../lib/contentApi';
import { fetchPublicProjectSummaries } from '../lib/publicProjectData';
import { latestProjectUpdate, normalizeProjectUpdates } from '../lib/projectProgress';
import { getPublicImageUrl } from '../lib/storage';
import { publicImageVariant } from '../lib/publicImages';
import { currentWorkPageCopy } from '../lib/brandContent';

const typeLabel = { progress: 'Progress', content: 'Content published', event: 'Event coverage', milestone: 'Milestone' };

export default function CurrentWork() {
  const { content } = usePublicContent(['explore']);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    fetchPublicProjectSummaries({ workStatus: 'active' }).then((rows) => {
      if (active) setProjects(rows);
    }).catch((loadError) => {
      if (active) setError(loadError.message || 'Current work could not be loaded.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const page = currentWorkPageCopy(content.websitePages?.explore);
  return <div className="page-shell py-16 sm:py-20">
    <PublicPageHeader eyebrow={page.eyebrow} title={page.title} description={page.description} />
    <div className="public-panel mt-10 flex flex-wrap gap-3 py-5 text-sm text-[var(--site-muted-text)]"><span className="font-medium text-[var(--site-accent-text)]">Active now: {projects.length}</span><span aria-hidden="true">·</span><Link to="/projects" className="fine-link text-[var(--site-primary-text)]">View completed portfolio</Link></div>
    {loading && <div className="py-12"><LoadingState label="Loading current work" /></div>}
    {error && <p className="mt-8 border-y border-red-300/25 py-5 text-red-100">{error}</p>}
    {!loading && !error && (projects.length ? <div className="mt-12 grid gap-12">
      {projects.map((project) => <WorkProject key={project.id} project={project} />)}
    </div> : <EmptyState title="No public projects are active right now" message="New client work and event coverage will appear here as soon as an active project is published." />)}
  </div>;
}

function WorkProject({ project }) {
  const updates = normalizeProjectUpdates(project.progress_updates);
  const latest = latestProjectUpdate(project);
  const cover = publicImageVariant(getPublicImageUrl(project.cover_image), 'display');
  return <article className="grid gap-7 border-b border-[var(--site-divider)] pb-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
    <div className="group"><Link to={`/projects/${project.slug}`} aria-label={`Open ${project.title}`} className="block rounded-xl transition duration-500 hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-4 focus-visible:ring-offset-[var(--theme-page-surface)] motion-reduce:transform-none motion-reduce:transition-none">{cover ? <div className="relative overflow-hidden rounded-xl"><img src={cover} alt={project.title} loading="lazy" decoding="async" width="900" height="900" className="aspect-square w-full object-cover transition duration-700 group-hover:scale-[1.025] motion-reduce:transition-none" /><div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" /></div> : <div aria-hidden="true" className="aspect-square w-full rounded-xl border border-[var(--site-divider)] bg-[radial-gradient(circle_at_75%_20%,rgba(251,146,60,0.22),transparent_32%),linear-gradient(145deg,#27272a,#09090b)]" />}<p className="public-eyebrow mt-5">In progress · {project.category}</p><h2 className="mt-3 text-3xl font-semibold text-[var(--site-primary-text)] transition group-hover:text-[var(--site-accent-text)]">{project.title}</h2><p className="mt-4 text-sm leading-7 text-[var(--site-secondary-text)]">{project.description}</p><span className="fine-link mt-6 inline-flex min-h-11 items-center gap-2 text-sm text-[var(--site-primary-text)]">Open project <ArrowRight size={15} /></span></Link></div>
    <div><div className="flex items-end justify-between gap-4"><div><p className="text-xs uppercase tracking-[0.18em] text-[var(--site-muted-text)]">Public progress</p><h3 className="mt-2 text-xl font-medium text-[var(--site-primary-text)]">{latest ? 'Latest updates' : 'Work has started'}</h3></div><span className="text-xs text-[var(--site-muted-text)]">{updates.length} {updates.length === 1 ? 'update' : 'updates'}</span></div>
      {updates.length ? <ol className="mt-5 grid gap-3">{updates.slice(0, 4).map((update) => <li key={update.id} className="public-card border-l-2 px-5 py-4"><div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.15em] text-[var(--site-accent-text)]"><span>{typeLabel[update.type]}</span>{update.date && <span className="inline-flex items-center gap-1 text-[var(--site-muted-text)]"><CalendarDays size={12} />{update.date}</span>}</div><h4 className="mt-2 font-medium text-[var(--site-primary-text)]">{update.title}</h4><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--site-secondary-text)]">{update.body}</p>{update.linkUrl && <a href={update.linkUrl} target="_blank" rel="noopener noreferrer" className="fine-link mt-3 inline-flex min-h-11 items-center gap-2 text-sm text-[var(--site-primary-text)]">{update.linkLabel || 'View update'} <ExternalLink size={14} /></a>}</li>)}</ol> : <p className="public-panel mt-5 py-5 text-sm leading-6 text-[var(--site-muted-text)]">This project is public and active. Progress notes will appear here as the work moves forward.</p>}
    </div>
  </article>;
}
