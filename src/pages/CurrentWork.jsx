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

  const page = content.websitePages?.explore || {};
  return <div className="page-shell py-16 sm:py-20">
    <PublicPageHeader eyebrow={page.eyebrow || 'Current work'} title={page.title || 'Follow the work while it is happening.'} description={page.description || 'See active client projects, content releases, event coverage, and meaningful progress from start to completion. Finished work moves into the permanent project portfolio.'} />
    <div className="mt-10 flex flex-wrap gap-3 border-y border-white/[0.09] py-5 text-sm text-zinc-400"><span className="text-orange-200">Active now: {projects.length}</span><span aria-hidden="true">·</span><Link to="/projects" className="fine-link text-zinc-200">View completed portfolio</Link></div>
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
  return <article className="grid gap-7 border-b border-white/[0.1] pb-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
    <div>{cover && <Link to={`/projects/${project.slug}`}><img src={cover} alt={project.title} loading="lazy" decoding="async" className="aspect-[4/3] w-full rounded-xl object-cover" /></Link>}<p className="mt-5 text-xs font-semibold uppercase tracking-[0.18em] text-orange-300">In progress · {project.category}</p><h2 className="mt-3 text-3xl font-semibold text-white">{project.title}</h2><p className="mt-4 text-sm leading-7 text-zinc-400">{project.description}</p><Link to={`/projects/${project.slug}`} className="fine-link mt-6 inline-flex min-h-11 items-center gap-2 text-sm text-white">Open project <ArrowRight size={15} /></Link></div>
    <div><div className="flex items-end justify-between gap-4"><div><p className="text-xs uppercase tracking-[0.18em] text-zinc-600">Public progress</p><h3 className="mt-2 text-xl font-medium text-white">{latest ? 'Latest updates' : 'Work has started'}</h3></div><span className="text-xs text-zinc-600">{updates.length} {updates.length === 1 ? 'update' : 'updates'}</span></div>
      {updates.length ? <ol className="mt-5 grid gap-3">{updates.slice(0, 4).map((update) => <li key={update.id} className="border-l border-orange-300/35 bg-white/[0.018] px-5 py-4"><div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.15em] text-orange-200"><span>{typeLabel[update.type]}</span>{update.date && <span className="inline-flex items-center gap-1 text-zinc-500"><CalendarDays size={12} />{update.date}</span>}</div><h4 className="mt-2 font-medium text-white">{update.title}</h4><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-400">{update.body}</p>{update.linkUrl && <a href={update.linkUrl} target="_blank" rel="noopener noreferrer" className="fine-link mt-3 inline-flex min-h-11 items-center gap-2 text-sm text-zinc-200">{update.linkLabel || 'View update'} <ExternalLink size={14} /></a>}</li>)}</ol> : <p className="mt-5 border-y border-white/[0.08] py-5 text-sm leading-6 text-zinc-500">This project is public and active. Progress notes will appear here as the work moves forward.</p>}
    </div>
  </article>;
}
