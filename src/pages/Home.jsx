import { ArrowRight, CalendarDays } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import CreativeCard from '../components/CreativeCard.jsx';
import EmptyState from '../components/EmptyState.jsx';
import LoadingState from '../components/LoadingState.jsx';
import { usePublicContent } from '../lib/contentApi.js';
import { fetchPublicProjectSummaries } from '../lib/publicProjectData.js';
import { latestProjectUpdate } from '../lib/projectProgress.js';
import { publicImageVariant } from '../lib/publicImages.js';
import { getPublicImageUrl } from '../lib/storage.js';
import { supabase } from '../lib/supabaseClient.js';
import useHorizontalScrollRestoration from '../lib/useHorizontalScrollRestoration.js';

export default function Home() {
  const { content } = usePublicContent(['home']);
  const [activeProjects, setActiveProjects] = useState([]);
  const [creatives, setCreatives] = useState([]);
  const [loading, setLoading] = useState(true);
  const creativeRailRef = useHorizontalScrollRestoration('home-featured-creatives');
  const page = content.websitePages?.home || {};

  useEffect(() => {
    let active = true;
    Promise.all([
      fetchPublicProjectSummaries({ workStatus: 'active' }).catch(() => []),
      supabase.from('creative_members').select('id,name,slug,role,short_bio,profile_image_url,skills,is_featured').eq('is_published', true).eq('is_featured', true).order('display_order', { ascending: true, nullsFirst: false }).limit(3),
    ]).then(([projects, creativeResult]) => {
      if (!active) return;
      setActiveProjects(projects || []);
      setCreatives(creativeResult.data || []);
      setLoading(false);
    });
    return () => { active = false; };
  }, []);

  const featured = activeProjects[0] || null;
  const update = featured ? latestProjectUpdate(featured) : null;
  const cover = featured ? publicImageVariant(getPublicImageUrl(featured.cover_image), 'expanded') : '';
  const structuredData = { '@context': 'https://schema.org', '@type': 'WebSite', name: content.displayName, url: 'https://www.lahatliwa.studio/', description: 'Follow current client work, content production, event coverage, and completed projects from Lahat Liwa Collectives.', publisher: { '@type': 'Organization', name: content.displayName } };

  return <div data-current-work-homepage className="bg-[var(--theme-page-surface)]">
    <script type="application/ld+json">{JSON.stringify(structuredData)}</script>
    <section className="relative min-h-[74svh] overflow-hidden bg-zinc-950 text-white">
      {cover && <img src={cover} alt="" className="absolute inset-0 h-full w-full object-cover opacity-45" fetchpriority="high" />}
      <div className="absolute inset-0 bg-gradient-to-r from-black via-black/75 to-black/25" />
      <div className="page-shell relative z-10 flex min-h-[74svh] items-end py-16 sm:py-20">
        <div className="max-w-4xl"><p className="text-sm font-semibold uppercase tracking-[0.2em] text-orange-200">Work in progress</p><h1 className="mt-5 text-4xl font-semibold leading-[0.98] tracking-[-0.04em] sm:text-6xl lg:text-7xl">See what we are building, covering, and publishing now.</h1><p className="mt-6 max-w-2xl text-base leading-7 text-zinc-200 sm:text-lg">Follow active client projects, social content, event coverage, and milestones as the work develops. Completed projects remain in the permanent portfolio.</p>
          {featured && <div className="mt-8 max-w-2xl border-l-2 border-orange-300 pl-5"><p className="text-xs uppercase tracking-[0.18em] text-orange-200">Currently working on</p><p className="mt-2 text-xl font-semibold">{featured.title}</p>{update && <p className="mt-2 inline-flex items-center gap-2 text-sm text-zinc-300"><CalendarDays size={15} />{update.title}</p>}</div>}
          <div className="mt-9 flex flex-wrap gap-3"><Link to="/work" className="inline-flex min-h-12 items-center gap-2 bg-orange-300 px-5 text-sm font-semibold text-zinc-950 hover:bg-orange-200">Follow current work <ArrowRight size={17} /></Link><Link to="/projects" className="inline-flex min-h-12 items-center gap-2 border border-white/20 px-5 text-sm font-semibold text-white hover:border-orange-200/60">Completed portfolio</Link></div>
        </div>
      </div>
    </section>

    <section className="page-shell py-16 sm:py-20" aria-labelledby="active-work-heading"><div className="mb-9 flex flex-col items-start gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--site-accent-text)]">Active projects</p><h2 id="active-work-heading" className="mt-4 text-4xl font-semibold tracking-[-0.03em] text-[var(--site-primary-text)]">Latest from the work.</h2></div><Link to="/work" className="fine-link inline-flex min-h-11 items-center gap-2 text-sm text-[var(--site-primary-text)]">View all updates <ArrowRight size={16} /></Link></div>
      {loading ? <LoadingState label="Loading current work" /> : activeProjects.length ? <div className="grid gap-5 lg:grid-cols-3">{activeProjects.slice(0, 3).map((project) => { const latest = latestProjectUpdate(project); return <article key={project.id} className="border border-white/[0.09] bg-white/[0.02] p-5"><p className="text-xs uppercase tracking-[0.16em] text-orange-300">{project.category}</p><h3 className="mt-3 text-xl font-semibold text-white">{project.title}</h3><p className="mt-3 line-clamp-3 text-sm leading-6 text-zinc-400">{latest?.body || project.description}</p>{latest?.date && <p className="mt-4 text-xs text-zinc-600">Updated {latest.date}</p>}<Link to={`/projects/${project.slug}`} className="fine-link mt-5 inline-flex min-h-11 items-center gap-2 text-sm text-zinc-200">Open project <ArrowRight size={15} /></Link></article>; })}</div> : <EmptyState title="No current work is public yet" message="Active projects will appear here as soon as their first update is published." />}
    </section>

    <section className="page-shell py-16 sm:py-20" aria-labelledby="featured-creatives-heading"><div className="mb-10 flex flex-col items-start gap-4 sm:flex-row sm:items-end sm:justify-between"><div className="max-w-3xl"><p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--site-accent-text)]">{page.featuredEyebrow || 'Featured creatives'}</p><h2 id="featured-creatives-heading" className="mt-4 text-4xl font-semibold tracking-[-0.03em] text-[var(--site-primary-text)] sm:text-5xl">{page.featuredTitle || 'Meet the people behind the work.'}</h2><p className="mt-5 text-base leading-7 text-[var(--site-secondary-text)]">{page.featuredDescription || 'Explore published profiles, skills, and credited project contributions.'}</p></div><Link to="/creatives" className="fine-link inline-flex min-h-11 shrink-0 items-center gap-2 text-sm font-semibold text-[var(--site-primary-text)]">{page.featuredCtaLabel || 'View creatives'} <ArrowRight size={16} /></Link></div>{loading && !creatives.length ? <LoadingState label="Loading creatives" /> : creatives.length ? <div ref={creativeRailRef} className="home-creatives-grid grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">{creatives.map((creative) => <CreativeCard key={creative.id} creative={creative} />)}</div> : <EmptyState title="Featured profiles are being prepared" message="Explore the full creative directory for currently published profiles." />}</section>

    <section className="page-shell py-16 sm:py-20"><div className="grid gap-8 border-y border-white/[0.1] py-12 lg:grid-cols-[1fr_auto] lg:items-center"><div><p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--site-accent-text)]">{page.inquiryEyebrow || 'Open inquiry'}</p><h2 className="mt-4 max-w-3xl text-3xl font-semibold tracking-[-0.025em] text-[var(--site-primary-text)] sm:text-4xl">{page.inquiryTitle || 'Tell us what you need—in your own words.'}</h2><p className="mt-4 max-w-2xl text-base leading-7 text-[var(--site-secondary-text)]">{page.inquiryDescription || 'No fixed service menu. Share the goal, problem, idea, collaboration, or opportunity, and we will review the best next step.'}</p></div><Link to="/inquiry" className="inline-flex min-h-12 w-fit items-center gap-2 bg-[var(--site-accent)] px-5 text-sm font-semibold text-zinc-950 hover:bg-[var(--site-accent-hover)]">{page.inquiryCtaLabel || 'Send a message'} <ArrowRight size={17} /></Link></div></section>
  </div>;
}
