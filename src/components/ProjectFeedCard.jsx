import { ArrowUpRight, MessageCircle } from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { excerpt } from '../lib/helpers';
import { publicLocationState } from '../lib/navigationHistory';
import { preloadPublicRoute } from '../lib/publicRoutePreload';
import { publicImageVariant } from '../lib/publicImages';
import { getPublicImageUrl } from '../lib/storage';

export default function ProjectFeedCard({ project, author }) {
  const location = useLocation();
  const [imageFailed, setImageFailed] = useState(false);
  const image = publicImageVariant(getPublicImageUrl(project.cover_image), 'display');
  const projectPath = `/projects/${project.slug}`;
  const state = publicLocationState(location, `feed-project-${project.id}`);
  const roles = author?.roles?.filter(Boolean) || [];

  return <div className="ll-project-post">
    <Link className="ll-project-post__media" to={projectPath} state={state} aria-label={`Open ${project.title}`} onPointerEnter={() => preloadPublicRoute('/projects/:slug')} onFocus={() => preloadPublicRoute('/projects/:slug')}>
      {image && !imageFailed
        ? <img src={image} alt={project.title} loading="lazy" decoding="async" onError={() => setImageFailed(true)} />
        : <span>Project image coming soon</span>}
    </Link>
    <div className="ll-project-post__actions">
      <Link to={`/inquiry?project=${encodeURIComponent(project.slug)}`}><MessageCircle size={18}/><span>Ask about this work</span></Link>
      <Link to={projectPath} state={state}><span>Open project</span><ArrowUpRight size={18}/></Link>
    </div>
    <div className="ll-project-post__caption">
      <p><Link to={projectPath} state={state}>{project.title}</Link>{project.description && <> <span>{excerpt(project.description, 190)}</span></>}</p>
      <small>{[project.category, ...roles].filter(Boolean).join(' · ')}</small>
    </div>
  </div>;
}
