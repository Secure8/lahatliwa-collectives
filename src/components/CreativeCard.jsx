import { ArrowUpRight } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { getPublicImageUrl } from '../lib/storage';
import { publicLocationState } from '../lib/navigationHistory';
import { useState } from 'react';
import { preloadPublicRoute } from '../lib/publicRoutePreload';

export default function CreativeCard({ creative, headingLevel = 'h3' }) {
  const location = useLocation();
  const linkState = publicLocationState(location, `creative-${creative.id}`);
  const profileImage = getPublicImageUrl(creative.profile_image_url);
  const [imageFailed, setImageFailed] = useState(false);
  const allSkills = Array.isArray(creative.skills) ? creative.skills : [];
  const skills = allSkills.slice(0, 4);
  const Heading = headingLevel;

  return (
    <article id={`creative-${creative.id}`} className="mobile-app-card group relative flex h-full scroll-mt-24 flex-col border-t border-white/[0.09] pt-5 after:absolute after:left-0 after:top-[-1px] after:h-px after:w-0 after:bg-orange-300 after:shadow-[0_0_12px_rgba(253,186,116,0.75)] after:transition-all after:duration-500 hover:after:w-20">
      <Link to={`/creatives/${creative.slug}`} state={linkState} onPointerEnter={() => preloadPublicRoute('/creatives/:slug')} onFocus={() => preloadPublicRoute('/creatives/:slug')} className="block rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300">
        {profileImage && !imageFailed ? (
          <img src={profileImage} alt={creative.name} loading="lazy" decoding="async" width="800" height="800" className="mx-auto aspect-square w-full max-w-48 rounded-full border border-white/10 bg-zinc-900 object-cover opacity-95 transition duration-500 group-hover:scale-[1.015] group-hover:border-orange-300/30 group-hover:opacity-100 group-hover:shadow-[0_0_32px_rgba(251,146,60,0.16)]" onError={() => setImageFailed(true)} />
        ) : (
          <div className="mx-auto grid aspect-square w-full max-w-48 place-items-center rounded-full bg-zinc-900 text-3xl font-semibold text-zinc-600">
            {creative.name?.slice(0, 1) || 'L'}
          </div>
        )}
      </Link>
      <div className="flex flex-1 flex-col py-5">
        <div className="flex min-h-10 items-start gap-3 text-[10px] font-medium uppercase tracking-[0.15em] text-orange-200">
          <span className="line-clamp-2">{creative.role}</span>
          {creative.is_featured && <span className="shrink-0 site-accent">Featured</span>}
        </div>
        <Link to={`/creatives/${creative.slug}`} state={linkState} className="site-primary mt-2 flex min-h-11 items-start justify-between gap-4 border-b border-white/[0.12] pb-2 transition hover:border-orange-300/50 hover:text-orange-100">
          <Heading className="line-clamp-2 min-h-7 text-xl font-medium leading-snug">{creative.name}</Heading>
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
