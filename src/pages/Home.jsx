import { ArrowRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import CreativeCard from '../components/CreativeCard.jsx';
import DestinationsFeed from '../components/DestinationsFeed.jsx';
import EmptyState from '../components/EmptyState.jsx';
import ExploreAklanHero from '../components/ExploreAklanHero.jsx';
import LoadingState from '../components/LoadingState.jsx';
import { listExploreHomepageSlides } from '../features/editorial/editorialApi.js';
import { useEditorialFlags } from '../features/editorial/editorialFlags.js';
import { supabase } from '../lib/supabaseClient.js';
import useHorizontalScrollRestoration from '../lib/useHorizontalScrollRestoration.js';
import { usePublicContent } from '../lib/contentApi.js';

export default function Home() {
  const { content } = usePublicContent(['home']);
  const { flags, loading: flagsLoading } = useEditorialFlags();
  const [slides, setSlides] = useState([]);
  const [creatives, setCreatives] = useState([]);
  const [loading, setLoading] = useState(true);
  const creativeRailRef = useHorizontalScrollRestoration('home-featured-creatives');
  const page = content.websitePages?.home || {};

  useEffect(() => {
    let active = true;
    const slideRequest = !flagsLoading && flags.homepageTourismEnabled
      ? listExploreHomepageSlides().catch(() => [])
      : Promise.resolve([]);
    Promise.all([
      slideRequest,
      supabase.from('creative_members').select('id,name,slug,role,short_bio,profile_image_url,skills,is_featured').eq('is_published', true).eq('is_featured', true).order('display_order', { ascending: true, nullsFirst: false }).limit(3),
    ]).then(([slideRows, creativeResult]) => {
      if (!active) return;
      setSlides(slideRows || []);
      setCreatives(creativeResult.data || []);
      setLoading(false);
    });
    return () => { active = false; };
  }, [flags.homepageTourismEnabled, flagsLoading]);

  const structuredData = { '@context': 'https://schema.org', '@type': 'WebSite', name: `Explore Aklan by ${content.displayName}`, url: 'https://www.lahatliwa.studio/', description: content.websitePages?.search?.defaultDescription || 'Independent community stories, destinations, events, activities, and local products across Aklan.', publisher: { '@type': 'Organization', name: content.displayName } };

  return <div data-explore-aklan-homepage className="bg-[var(--theme-page-surface)]">
    <script type="application/ld+json">{JSON.stringify(structuredData)}</script>
    <ExploreAklanHero slides={slides} loading={loading || flagsLoading} />
    {flags.homepageTourismEnabled && <DestinationsFeed />}

    <section className="page-shell py-16 sm:py-20" aria-labelledby="featured-creatives-heading">
      <div className="mb-10 flex flex-col items-start gap-4 sm:flex-row sm:items-end sm:justify-between"><div className="max-w-3xl"><p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--site-accent-text)]">{page.featuredEyebrow || 'Featured Creatives'}</p><h2 id="featured-creatives-heading" className="mt-4 text-4xl font-semibold tracking-[-0.03em] text-[var(--site-primary-text)] sm:text-5xl">{page.featuredTitle || 'Meet the people telling Aklan’s stories.'}</h2><p className="mt-5 text-base leading-7 text-[var(--site-secondary-text)]">{page.featuredDescription || 'Explore published profiles, skills, and credited work from the collective.'}</p></div><Link to="/creatives" className="fine-link inline-flex min-h-11 shrink-0 items-center gap-2 text-sm font-semibold text-[var(--site-primary-text)]">{page.featuredCtaLabel || 'View Creatives'} <ArrowRight size={16} /></Link></div>
      {loading && !creatives.length ? <LoadingState label="Loading creatives" /> : creatives.length ? <div ref={creativeRailRef} data-scroll-restoration-id="home-featured-creatives" className="home-creatives-grid grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">{creatives.map((creative) => <CreativeCard key={creative.id} creative={creative} />)}</div> : <EmptyState title="Featured profiles are being prepared" message="Explore the full creative directory for currently published profiles." />}
    </section>

    <section className="page-shell py-16 sm:py-20" aria-labelledby="home-inquiry-heading">
      <div className="grid gap-8 border-y border-white/[0.1] py-12 lg:grid-cols-[1fr_auto] lg:items-center"><div><p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--site-accent-text)]">{page.inquiryEyebrow || 'Questions and collaborations'}</p><h2 id="home-inquiry-heading" className="mt-4 max-w-3xl text-3xl font-semibold tracking-[-0.025em] text-[var(--site-primary-text)] sm:text-4xl">{page.inquiryTitle || 'Need help finding the right place, story, or creative service?'}</h2><p className="mt-4 max-w-2xl text-base leading-7 text-[var(--site-secondary-text)]">{page.inquiryDescription || 'Choose a tourism question, a creative or digital service, or a general inquiry. We’ll guide you one step at a time.'}</p></div><Link to={page.inquiryCtaUrl || '/inquiry'} className="inline-flex min-h-12 w-fit items-center gap-2 bg-[var(--site-accent)] px-5 text-sm font-semibold text-zinc-950 transition hover:bg-[var(--site-accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">{page.inquiryCtaLabel || 'Ask a Question'} <ArrowRight size={17} /></Link></div>
    </section>
  </div>;
}
