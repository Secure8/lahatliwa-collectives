import { ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { excerpt } from '../lib/helpers';
import { getPublicImageUrl } from '../lib/storage';

export default function ProjectCard({ project }) {
  const image = getPublicImageUrl(project.cover_image);

  return (
    <article className="group">
      {image && (
        <Link to={`/projects/${project.slug}`} className="block overflow-hidden bg-zinc-900">
          <img className="aspect-[4/3] h-full w-full object-cover opacity-90 transition duration-700 group-hover:scale-[1.035] group-hover:opacity-100" src={image} alt={project.title} />
        </Link>
      )}
      <div className="border-b border-white/[0.07] py-5">
        <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.16em] text-zinc-500">
          <span>{project.category}</span>
          {project.featured && <span className="site-accent">Selected</span>}
        </div>
        <Link to={`/projects/${project.slug}`} className="site-primary mt-2 flex items-start justify-between gap-4">
          <h3 className="text-xl font-medium leading-snug">{project.title}</h3>
          <ArrowUpRight className="mt-1 shrink-0 text-zinc-500 transition group-hover:text-[var(--site-accent)]" size={17} />
        </Link>
        <p className="site-secondary mt-2 max-w-xl text-sm leading-6">{excerpt(project.description, 110)}</p>
      </div>
    </article>
  );
}
