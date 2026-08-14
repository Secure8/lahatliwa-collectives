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
      <article id={`project-${project.id}`} className="ll-portfolio-card group min-w-0 scroll-mt-24">
        <Link
          to={`/projects/${project.slug}`}
          state={linkState}
          onPointerEnter={() => preloadPublicRoute('/projects/:slug')}
          onFocus={() => preloadPublicRoute('/projects/:slug')}
          aria-label={`View ${project.title}`}
          className="ll-portfolio-card__link"
        >
          <div className="ll-portfolio-card__media aspect-square">
            {image && !imageFailed ? (
              <img src={image} alt={project.title} loading={index === 0 ? 'eager' : 'lazy'} decoding="async" fetchpriority={index === 0 ? 'high' : 'low'} sizes="(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 33vw" width="800" height="800" onError={() => setImageFailed(true)} />
            ) : (
              <span>Project image coming soon</span>
            )}
          </div>

          <div className="ll-portfolio-card__body">
          <div>
            <div className="ll-portfolio-card__title"><h2>{project.title}</h2><ArrowUpRight size={17}/></div>
            {project.description && <p>{excerpt(project.description, 130)}</p>}
            {creditSummary && (
              <div className="ll-portfolio-card__credit" title={creditSummary.fullNames}>
                <strong>{creditSummary.names}</strong>
                {creditSummary.roles && <small>{creditSummary.roles}</small>}
              </div>
            )}
          </div>
          </div>
        </Link>
      </article>
  );
}
