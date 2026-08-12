import { ArrowRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import ActiveWorkHero from '../components/ActiveWorkHero.jsx';
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

  const structuredData = { '@context': 'https://schema.org', '@type': 'WebSite', name: content.displayName, url: 'https://www.lahatliwa.studio/', description: 'Follow current client work, content production, event coverage, and completed projects from Lahat Liwa Collectives.', publisher: { '@type': 'Organization', name: content.displayName } };

  return <div data-current-work-homepage className="bg-[var(--theme-page-surface)]">
    <script type="application/ld+json">{JSON.stringify(structuredData)}</script>
    <ActiveWorkHero projects={activeProjects} loading={loading} page={page} brandName={content.displayName} />

    <section className="page-shell py-16 sm:py-20" aria-labelledby="active-work-heading"><div className="mb-9 flex flex-col items-start gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--site-accent-text)]">Active projects</p><h2 id="active-work-heading" className="mt-4 text-4xl font-semibold tracking-[-0.03em] text-[var(--site-primary-text)]">Latest from the work.</h2></div><Link to="/work" className="fine-link inline-flex min-h-11 items-center gap-2 text-sm text-[var(--site-primary-text)]">View all updates <ArrowRight size={16} /></Link></div>
      {loading ? <LoadingState label="Loading current work" /> : activeProjects.length ? <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{activeProjects.map((project) => {
        const latest = latestProjectUpdate(project);
        const cardCover = publicImageVariant(getPublicImageUrl(project.cover_image), 'display');
        return <article key={project.id} className="group min-w-0">
          <Link to={`/projects/${project.slug}`} aria-label={`Open ${project.title}`} className="relative isolate flex aspect-square overflow-hidden rounded-xl border border-white/15 bg-zinc-900 p-5 text-white shadow-[0_24px_70px_-40px_rgba(0,0,0,0.85)] transition duration-500 hover:-translate-y-1 hover:border-[var(--site-accent-border)] hover:shadow-[0_30px_80px_-38px_rgba(251,146,60,0.35)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-4 focus-visible:ring-offset-[var(--theme-page-surface)] motion-reduce:transform-none motion-reduce:transition-none sm:p-6">
            {cardCover ? <img src={cardCover} alt="" loading="lazy" decoding="async" className="absolute inset-0 -z-20 h-full w-full object-cover transition duration-700 group-hover:scale-[1.035] motion-reduce:transition-none" /> : <div aria-hidden="true" className="absolute inset-0 -z-20 bg-[radial-gradient(circle_at_78%_18%,rgba(251,146,60,0.3),transparent_34%),linear-gradient(145deg,#27272a_0%,#18181b_52%,#09090b_100%)]" />}
            <div aria-hidden="true" className="absolute inset-0 -z-10 bg-gradient-to-t from-black via-black/70 to-black/15 transition duration-500 group-hover:via-black/60" />
            <div className="flex min-w-0 flex-1 flex-col justify-end">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-200">{project.category}</p>
              <h3 className="mt-3 line-clamp-3 text-2xl font-semibold leading-tight text-white">{project.title}</h3>
              <p className="mt-3 line-clamp-2 text-sm leading-6 text-zinc-200 sm:line-clamp-3">{latest?.body || project.description}</p>
              {latest?.date && <p className="mt-4 text-xs text-zinc-400">Updated {latest.date}</p>}
              <span className="mt-5 inline-flex min-h-11 w-fit items-center gap-2 border-b border-white/30 text-sm font-medium text-white transition group-hover:border-orange-300 group-hover:text-orange-200">Open project <ArrowRight size={15} /></span>
            </div>
          </Link>
        </article>;
      })}</div> : <EmptyState title="No current work is public yet" message="Active projects will appear here as soon as their first update is published." />}
    </section>

    <section className="page-shell py-16 sm:py-20" aria-labelledby="featured-creatives-heading"><div className="mb-10 flex flex-col items-start gap-4 sm:flex-row sm:items-end sm:justify-between"><div className="max-w-3xl"><p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--site-accent-text)]">{page.featuredEyebrow || 'Featured creatives'}</p><h2 id="featured-creatives-heading" className="mt-4 text-4xl font-semibold tracking-[-0.03em] text-[var(--site-primary-text)] sm:text-5xl">{page.featuredTitle || 'Meet the people behind the work.'}</h2><p className="mt-5 text-base leading-7 text-[var(--site-secondary-text)]">{page.featuredDescription || 'Explore published profiles, skills, and credited project contributions.'}</p></div><Link to="/creatives" className="fine-link inline-flex min-h-11 shrink-0 items-center gap-2 text-sm font-semibold text-[var(--site-primary-text)]">{page.featuredCtaLabel || 'View creatives'} <ArrowRight size={16} /></Link></div>{loading && !creatives.length ? <LoadingState label="Loading creatives" /> : creatives.length ? <div ref={creativeRailRef} className="home-creatives-grid grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">{creatives.map((creative) => <CreativeCard key={creative.id} creative={creative} />)}</div> : <EmptyState title="Featured profiles are being prepared" message="Explore the full creative directory for currently published profiles." />}</section>

    <section className="page-shell py-16 sm:py-20"><div className="public-panel grid gap-8 py-12 lg:grid-cols-[1fr_auto] lg:items-center"><div><p className="public-eyebrow">{page.inquiryEyebrow || 'Open inquiry'}</p><h2 className="mt-4 max-w-3xl text-3xl font-semibold tracking-[-0.025em] text-[var(--site-primary-text)] sm:text-4xl">{page.inquiryTitle || 'Tell us what you need—in your own words.'}</h2><p className="mt-4 max-w-2xl text-base leading-7 text-[var(--site-secondary-text)]">{page.inquiryDescription || 'No fixed service menu. Share the goal, problem, idea, collaboration, or opportunity, and we will review the best next step.'}</p></div><Link to="/inquiry" className="public-button public-button--primary w-fit">{page.inquiryCtaLabel || 'Send a message'} <ArrowRight size={17} /></Link></div></section>
  </div>;
}
