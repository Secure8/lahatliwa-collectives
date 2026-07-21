import { ArrowRight, MapPin, ShieldCheck } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { listPublishedDestinations } from '../features/editorial/editorialApi.js';
import { publicImageVariant } from '../lib/publicImages.js';
import { mergeUniqueDestinations } from '../lib/tourismHomepage.js';
import EmptyState from './EmptyState.jsx';
import LoadingState from './LoadingState.jsx';

const PAGE_SIZE = 5;

export default function DestinationsFeed() {
  const [state, setState] = useState({ rows: [], loading: true, loadingMore: false, hasMore: false, nextOffset: 0, error: '' });
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    loadPage(0, false);
    return () => { mounted.current = false; };
  }, []);

  async function loadPage(offset, append) {
    setState((current) => ({ ...current, [append ? 'loadingMore' : 'loading']: true, error: '' }));
    try {
      const page = await listPublishedDestinations({ offset, limit: PAGE_SIZE });
      if (!mounted.current) return;
      setState((current) => ({
        ...current,
        rows: append ? mergeUniqueDestinations(current.rows, page.rows) : page.rows,
        loading: false,
        loadingMore: false,
        hasMore: page.hasMore,
        nextOffset: page.nextOffset,
        error: '',
      }));
    } catch {
      if (mounted.current) setState((current) => ({ ...current, loading: false, loadingMore: false, error: 'Destinations could not be loaded right now.' }));
    }
  }

  return (
    <section className="page-shell py-16 sm:py-20" aria-labelledby="destinations-heading">
      <div className="max-w-3xl">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--site-accent-text)]">Explore Aklan</p>
        <h2 id="destinations-heading" className="mt-4 text-4xl font-semibold tracking-[-0.03em] text-[var(--site-primary-text)] sm:text-5xl">Destinations</h2>
        <p className="mt-5 text-base leading-7 text-[var(--site-secondary-text)]">Discover published places and locally edited destination stories from communities across Aklan.</p>
      </div>

      <div className="mt-12">
        {state.loading ? <LoadingState label="Loading destinations" /> : state.error && !state.rows.length ? <p className="border-y border-red-300/20 py-5 text-sm text-red-100">{state.error}</p> : state.rows.length ? <div className="grid gap-14 sm:gap-16">
          {state.rows.map((post, index) => <DestinationStory key={post.id} post={post} reverse={index % 2 === 1} />)}
        </div> : <EmptyState title="Destination stories are being prepared" message="Published places will appear here as the Explore Aklan collection grows." />}
      </div>

      {state.error && state.rows.length > 0 && <p className="mt-8 text-sm text-red-100">{state.error}</p>}
      {state.hasMore && <div className="mt-12 flex justify-center"><button type="button" disabled={state.loadingMore} onClick={() => loadPage(state.nextOffset, true)} className="inline-flex min-h-12 items-center gap-2 border border-[var(--site-accent-border)] px-5 text-sm font-semibold text-[var(--site-primary-text)] transition hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-50">{state.loadingMore ? 'Loading…' : 'Load More'} <ArrowRight size={16} /></button></div>}
    </section>
  );
}

function DestinationStory({ post, reverse }) {
  const image = publicImageVariant(post.cover_image_url, 'expanded') || post.cover_image_url;
  const placeDetails = Array.isArray(post.editorial_place_details) ? post.editorial_place_details[0] : post.editorial_place_details;
  const verified = placeDetails?.verification_status === 'verified';
  return <article className="grid items-center gap-7 lg:grid-cols-12 lg:gap-12">
    <Link to={`/places/${post.slug}`} preventScrollReset state={{ homepageDestination: true }} className={`group block overflow-hidden bg-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] lg:col-span-7 ${reverse ? 'lg:order-2' : ''}`} aria-label={`View destination: ${post.title}`}>
      <img src={image} alt={post.cover_image_alt || post.title} loading="lazy" decoding="async" width="1280" height="800" sizes="(max-width: 1023px) calc(100vw - 2rem), 58vw" className="aspect-[16/10] w-full object-cover transition duration-700 group-hover:scale-[1.015] motion-reduce:transform-none motion-reduce:transition-none" />
    </Link>
    <div className={`lg:col-span-5 ${reverse ? 'lg:order-1' : ''}`}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-[var(--site-accent-text)]">
        {post.editorial_municipalities?.name && <span className="inline-flex items-center gap-1.5"><MapPin size={15} />{post.editorial_municipalities.name}</span>}
        {post.editorial_categories?.name && <span>{post.editorial_categories.name}</span>}
        {verified && <span className="inline-flex items-center gap-1.5 text-emerald-200"><ShieldCheck size={15} />Verified details</span>}
      </div>
      <h3 className="mt-4 text-3xl font-semibold leading-tight tracking-[-0.025em] text-[var(--site-primary-text)] sm:text-4xl">{post.title}</h3>
      <p className="mt-5 text-base leading-7 text-[var(--site-secondary-text)]">{post.summary}</p>
      <Link to={`/places/${post.slug}`} preventScrollReset state={{ homepageDestination: true }} className="fine-link mt-7 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[var(--site-primary-text)]">View Destination <ArrowRight size={16} /></Link>
    </div>
  </article>;
}
