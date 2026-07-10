import { ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function CreativeCard({ creative }) {
  const allSkills = Array.isArray(creative.skills) ? creative.skills : [];
  const skills = allSkills.slice(0, 4);

  return (
    <article className="group major-border-top flex h-full flex-col pt-5">
      <Link to={`/creatives/${creative.slug}`} className="block">
        {creative.profile_image_url ? (
          <img src={creative.profile_image_url} alt={creative.name} loading="lazy" decoding="async" width="800" height="800" className="mx-auto aspect-square w-full max-w-48 rounded-full bg-zinc-900 object-cover opacity-90 transition duration-700 group-hover:scale-[1.01] group-hover:opacity-100" />
        ) : (
          <div className="mx-auto grid aspect-square w-full max-w-48 place-items-center rounded-full bg-zinc-900 text-3xl font-semibold text-zinc-600">
            {creative.name?.slice(0, 1) || 'L'}
          </div>
        )}
      </Link>
      <div className="flex flex-1 flex-col py-5">
        <div className="flex min-h-10 items-start gap-3 text-xs uppercase tracking-[0.16em] text-zinc-500">
          <span className="line-clamp-2">{creative.role}</span>
          {creative.is_featured && <span className="shrink-0 site-accent">Featured</span>}
        </div>
        <Link to={`/creatives/${creative.slug}`} className="site-primary mt-2 flex items-start justify-between gap-4">
          <h3 className="line-clamp-2 min-h-7 text-xl font-medium leading-snug">{creative.name}</h3>
          <ArrowUpRight className="mt-1 shrink-0 text-zinc-500 transition group-hover:text-[var(--site-accent)]" size={17} />
        </Link>
        <p className="site-secondary mt-2 line-clamp-3 min-h-[4.5rem] text-sm leading-6">{creative.short_bio || ''}</p>
        <div className="mt-auto flex min-h-8 flex-wrap gap-x-3 gap-y-2 pt-5">
          {skills.length > 0 && (
            <>
            {skills.map((skill) => <span key={skill} className="border-b border-white/[0.12] pb-1 text-xs text-zinc-400">{skill}</span>)}
            {allSkills.length > skills.length && <span className="border-b border-white/[0.12] pb-1 text-xs text-zinc-500">+{allSkills.length - skills.length} more</span>}
            </>
          )}
        </div>
      </div>
    </article>
  );
}
