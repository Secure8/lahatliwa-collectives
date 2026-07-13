import { ArrowUpRight } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { getGalleryItemMediaUrl, getGalleryItemThumbnailUrl, normalizeProjectGallery } from '../lib/galleryItems';
import { excerpt } from '../lib/helpers';
import { getPublicImageUrl } from '../lib/storage';
import { branchForKey, projectBranchKey } from '../lib/projectBranches';
import { projectCreditSummary } from '../lib/fairProjectExposure';
import { publicLocationState } from '../lib/navigationHistory';
import { useState } from 'react';
import { preloadPublicRoute } from '../lib/publicRoutePreload';

export default function ProjectCard({ project, variant = 'standard', index = 0 }) {
  const location = useLocation();
  const linkState = publicLocationState(location, `project-${project.id}`);
  const [imageFailed, setImageFailed] = useState(false);
  const galleryPreview = normalizeProjectGallery(project).find((item) => item.type === 'image' || getGalleryItemThumbnailUrl(item));
  const image = getPublicImageUrl(project.cover_image)
    || (galleryPreview?.type === 'image' ? getGalleryItemMediaUrl(galleryPreview) : getGalleryItemThumbnailUrl(galleryPreview));
  const branch = branchForKey(projectBranchKey(project.category));
  const creditSummary = projectCreditSummary(project);

  if (variant === 'editorial') {
    return (
      <article id={`project-${project.id}`} className="group min-w-0 scroll-mt-24">
        <Link
          to={`/projects/${project.slug}`}
          state={linkState}
          onPointerEnter={() => preloadPublicRoute('/projects/:slug')}
          onFocus={() => preloadPublicRoute('/projects/:slug')}
          className="relative block overflow-hidden rounded-[10px] bg-zinc-900 transition duration-500 after:pointer-events-none after:absolute after:inset-0 after:rounded-[10px] after:border after:border-transparent after:transition after:duration-500 hover:shadow-[0_18px_58px_-28px_rgba(251,146,60,0.48)] hover:after:border-orange-300/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300 motion-reduce:transition-none"
        >
          {image && !imageFailed ? (
            <img className="aspect-[4/3] w-full object-cover opacity-95 transition duration-500 group-hover:scale-[1.015] group-hover:opacity-100 motion-reduce:transition-none" src={image} alt={project.title} loading="lazy" decoding="async" fetchpriority={index === 0 ? 'high' : 'low'} sizes="(max-width: 639px) calc(100vw - 24px), (max-width: 1023px) 50vw, 33vw" width="800" height="600" onError={() => setImageFailed(true)} />
          ) : (
            <span className="grid aspect-[4/3] place-items-center px-6 text-center text-sm text-zinc-500 transition group-hover:text-orange-200">Open project</span>
          )}
        </Link>

        <div className="relative grid border-b border-white/[0.09] pb-6 pt-4 after:absolute after:bottom-[-1px] after:left-0 after:h-px after:w-0 after:bg-orange-300 after:shadow-[0_0_12px_rgba(253,186,116,0.8)] after:transition-all after:duration-500 group-hover:after:w-24 motion-reduce:after:transition-none sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-6">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] uppercase tracking-[0.18em] text-orange-300">
              <span>{String(index + 1).padStart(2, '0')} / {branch?.label || project.category}</span>
              {project.featured && <span className="text-zinc-500">Selected</span>}
            </p>
            <h2 className="mt-2 [overflow-wrap:anywhere] text-xl font-medium leading-snug text-white">{project.title}</h2>
            {project.description && <p className="mt-3 line-clamp-2 max-w-2xl text-sm leading-6 text-zinc-500">{excerpt(project.description, 150)}</p>}
            {creditSummary && (
              <div className="mt-4 min-w-0 border-l border-orange-300/45 pl-3" title={creditSummary.fullNames}>
                <p className="text-[9px] font-medium uppercase tracking-[0.18em] text-zinc-600">Creative credit</p>
                <p className="mt-1 truncate text-sm font-semibold text-zinc-100">{creditSummary.names}</p>
                {creditSummary.roles && <p className="mt-1 line-clamp-2 text-[10px] font-medium uppercase leading-4 tracking-[0.13em] text-orange-200">{creditSummary.roles}</p>}
              </div>
            )}
          </div>
          <Link to={`/projects/${project.slug}`} state={linkState} className="mt-3 inline-flex min-h-11 items-center gap-2 self-end text-sm text-zinc-300 transition group-hover:text-orange-200 sm:mt-0">View project <ArrowUpRight size={15} /></Link>
        </div>
      </article>
    );
  }

  return (
    <article id={`project-${project.id}`} className="group flex h-full scroll-mt-24 flex-col">
      {image && !imageFailed ? (
        <Link to={`/projects/${project.slug}`} state={linkState} onPointerEnter={() => preloadPublicRoute('/projects/:slug')} onFocus={() => preloadPublicRoute('/projects/:slug')} className="block overflow-hidden bg-zinc-900">
          <img className="aspect-[4/3] h-full w-full object-cover opacity-90 transition duration-500 group-hover:scale-[1.02] group-hover:opacity-100" src={image} alt={project.title} loading="lazy" decoding="async" fetchpriority="low" sizes="(max-width: 639px) calc(100vw - 2rem), (max-width: 1023px) 50vw, 33vw" width="800" height="600" onError={() => setImageFailed(true)} />
        </Link>
      ) : (
        <Link to={`/projects/${project.slug}`} state={linkState} className="grid aspect-[4/3] place-items-center bg-zinc-900 px-6 text-center text-sm text-zinc-500 transition group-hover:text-[var(--site-accent)]">
          Open project
        </Link>
      )}
      <div className="flex flex-1 flex-col border-b border-white/[0.07] py-5">
        <div className="min-h-5 flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.16em] text-zinc-500">
          <span>{branch?.label || project.category}</span>
          {project.featured && <span className="site-accent">Selected</span>}
        </div>
        <Link to={`/projects/${project.slug}`} state={linkState} className="site-primary mt-2 flex items-start justify-between gap-4">
          <h3 className="line-clamp-2 min-h-14 text-xl font-medium leading-snug">{project.title}</h3>
          <ArrowUpRight className="mt-1 shrink-0 text-zinc-500 transition group-hover:text-[var(--site-accent)]" size={17} />
        </Link>
        <p className="site-secondary mt-2 line-clamp-3 min-h-[4.5rem] max-w-xl text-sm leading-6">{excerpt(project.description, 110)}</p>
        {creditSummary && (
          <div className="mt-3 min-h-11 text-sm leading-5 text-zinc-400" title={creditSummary.fullNames}>
            <p className="truncate text-zinc-300">{creditSummary.names}</p>
            {creditSummary.roles && <p className="mt-0.5 truncate text-xs text-zinc-500">{creditSummary.roles}</p>}
          </div>
        )}
      </div>
    </article>
  );
}
