import { ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function CreativeCard({ creative }) {
  const skills = Array.isArray(creative.skills) ? creative.skills.slice(0, 4) : [];

  return (
    <article className="group major-border-top pt-5">
      <Link to={`/creatives/${creative.slug}`} className="block">
        {creative.profile_image_url ? (
          <img src={creative.profile_image_url} alt={creative.name} loading="lazy" decoding="async" width="800" height="1000" className="aspect-[4/5] w-full rounded-lg bg-zinc-900 object-cover opacity-90 transition duration-700 group-hover:scale-[1.01] group-hover:opacity-100" />
        ) : (
          <div className="grid aspect-[4/5] place-items-center rounded-lg bg-zinc-900 text-3xl font-semibold text-zinc-600">
            {creative.name?.slice(0, 1) || 'L'}
          </div>
        )}
      </Link>
      <div className="py-5">
        <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.16em] text-zinc-500">
          <span>{creative.role}</span>
          {creative.is_featured && <span className="site-accent">Featured</span>}
        </div>
        <Link to={`/creatives/${creative.slug}`} className="site-primary mt-2 flex items-start justify-between gap-4">
          <h3 className="text-xl font-medium leading-snug">{creative.name}</h3>
          <ArrowUpRight className="mt-1 shrink-0 text-zinc-500 transition group-hover:text-[var(--site-accent)]" size={17} />
        </Link>
        {creative.short_bio && <p className="site-secondary mt-2 text-sm leading-6">{creative.short_bio}</p>}
        {skills.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {skills.map((skill) => <span key={skill} className="rounded-full border border-white/10 px-3 py-1 text-xs text-zinc-400">{skill}</span>)}
          </div>
        )}
      </div>
    </article>
  );
}
