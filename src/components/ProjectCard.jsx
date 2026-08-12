import { ArrowUpRight } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { getGalleryItemMediaUrl, getGalleryItemThumbnailUrl, normalizeProjectGallery } from '../lib/galleryItems';
import { excerpt } from '../lib/helpers';
import { getPublicImageUrl } from '../lib/storage';
import { projectCreditSummary } from '../lib/fairProjectExposure';
import { publicLocationState } from '../lib/navigationHistory';
import { useState } from 'react';
import { preloadPublicRoute } from '../lib/publicRoutePreload';
import { publicImageVariant } from '../lib/publicImages';

export default function ProjectCard({ project, index = 0 }) {
  const location = useLocation();
  const linkState = publicLocationState(location, `project-${project.id}`);
  const [imageFailed, setImageFailed] = useState(false);
  const galleryPreview = normalizeProjectGallery(project).find((item) => item.type === 'image' || getGalleryItemThumbnailUrl(item));
  const image = publicImageVariant(getPublicImageUrl(project.cover_image), 'display')
    || (galleryPreview?.type === 'image' ? getGalleryItemMediaUrl(galleryPreview) : getGalleryItemThumbnailUrl(galleryPreview));
  const creditSummary = projectCreditSummary(project);

  return (
      <article id={`project-${project.id}`} className="mobile-app-card group flex h-full min-w-0 scroll-mt-24 flex-col">
        <Link
          to={`/projects/${project.slug}`}
          state={linkState}
          onPointerEnter={() => preloadPublicRoute('/projects/:slug')}
          onFocus={() => preloadPublicRoute('/projects/:slug')}
          aria-label={`View ${project.title}`}
          className="flex h-full min-w-0 flex-col rounded-[10px] transition duration-500 hover:-translate-y-1 hover:shadow-[0_18px_58px_-28px_rgba(251,146,60,0.48)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300 motion-reduce:transform-none motion-reduce:transition-none"
        >
          <div className="relative overflow-hidden rounded-[10px] bg-zinc-900 after:pointer-events-none after:absolute after:inset-0 after:rounded-[10px] after:border after:border-transparent after:transition after:duration-500 group-hover:after:border-orange-300/25">
            {image && !imageFailed ? (
              <img className="aspect-[4/3] w-full object-cover opacity-95 transition duration-500 group-hover:scale-[1.025] group-hover:opacity-100 motion-reduce:transition-none" src={image} alt={project.title} loading={index === 0 ? 'eager' : 'lazy'} decoding="async" fetchpriority={index === 0 ? 'high' : 'low'} sizes="(max-width: 639px) calc(100vw - 24px), (max-width: 1023px) 50vw, 33vw" width="800" height="600" onError={() => setImageFailed(true)} />
            ) : (
              <span className="grid aspect-[4/3] place-items-center bg-[radial-gradient(circle_at_75%_20%,rgba(251,146,60,0.2),transparent_32%),linear-gradient(145deg,#27272a,#09090b)] px-6 text-center text-sm text-zinc-400 transition group-hover:text-orange-200">Project image coming soon</span>
            )}
          </div>

          <div className="project-card-body relative grid flex-1 border-b border-white/[0.09] pb-6 pt-4 after:absolute after:bottom-[-1px] after:left-0 after:h-px after:w-0 after:bg-orange-300 after:shadow-[0_0_12px_rgba(253,186,116,0.8)] after:transition-all after:duration-500 group-hover:after:w-24 motion-reduce:after:transition-none sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-6">
          <div className="min-w-0">
            {project.featured && <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Selected</p>}
            <h2 className="mt-2 [overflow-wrap:anywhere] text-xl font-medium leading-snug text-white">{project.title}</h2>
            {project.description && <p className="mt-3 line-clamp-2 max-w-2xl text-sm leading-6 text-zinc-500">{excerpt(project.description, 150)}</p>}
            {creditSummary && (
              <div className="mt-4 min-w-0 border-l border-orange-300/45 pl-3" title={creditSummary.fullNames}>
                <p className="text-[9px] font-medium uppercase tracking-[0.18em] text-zinc-600">Contributor credit</p>
                <p className="mt-1 truncate text-sm font-semibold text-zinc-100">{creditSummary.names}</p>
                {creditSummary.roles && <p className="mt-1 line-clamp-2 text-[10px] font-medium uppercase leading-4 tracking-[0.13em] text-orange-200">{creditSummary.roles}</p>}
              </div>
            )}
          </div>
            <span className="mt-3 inline-flex min-h-11 items-center gap-2 self-end border-b border-white/[0.14] text-sm text-zinc-300 transition group-hover:border-orange-300/55 group-hover:text-orange-200 sm:mt-0">View <ArrowUpRight size={15} /></span>
          </div>
        </Link>
      </article>
  );
}
