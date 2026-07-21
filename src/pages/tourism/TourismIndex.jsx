import { ArrowRight, CalendarDays, MapPin, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import EmptyState from '../../components/EmptyState.jsx';
import LoadingState from '../../components/LoadingState.jsx';
import TourismStoryFallback from '../../components/TourismStoryFallback.jsx';
import { PublicEditorialGate } from '../../features/editorial/EditorialGate.jsx';
import { CONTENT_TYPES, contentTypeMeta, listEditorialTaxonomy, listPublishedEditorial } from '../../features/editorial/editorialApi.js';
import { usePublicContent } from '../../lib/contentApi.js';

export default function TourismIndex({ type = '' }) {
  return <PublicEditorialGate><TourismIndexContent type={type} /></PublicEditorialGate>;
}

function TourismIndexContent({ type }) {
  const meta = type ? contentTypeMeta(type) : { plural: 'Explore Aklan', path: '/explore' };
  const { content } = usePublicContent([]);
  const page = content.websitePages?.explore || {};
  const [params, setParams] = useSearchParams();
  const [state, setState] = useState({ loading: true, error: '', posts: [], taxonomy: { municipalities: [], categories: [], tags: [] } });
  const filters = useMemo(() => ({ search: params.get('q') || '', municipality: params.get('municipality') || '', category: params.get('category') || '', tag: params.get('tag') || '', from: params.get('from') || '', to: params.get('to') || '' }), [params]);

  useEffect(() => {
    let active = true;
    setState((current) => ({ ...current, loading: true, error: '' }));
    Promise.all([listPublishedEditorial({ type, ...filters }), listEditorialTaxonomy()])
      .then(([posts, taxonomy]) => { if (active) setState({ loading: false, error: '', posts, taxonomy }); })
      .catch(() => { if (active) setState((current) => ({ ...current, loading: false, error: 'Published stories could not be loaded right now.' })); });
    return () => { active = false; };
  }, [filters, type]);

  function setFilter(key, value) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    setParams(next, { replace: true });
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <section className="page-shell pb-10 pt-16 sm:pt-20">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--site-accent-text)]">{!type && page.eyebrow ? page.eyebrow : 'Aklan Tourism'}</p>
        <h1 className="mt-4 max-w-4xl text-4xl font-semibold tracking-tight text-[var(--site-primary-text)] sm:text-6xl">{!type && page.title ? page.title : meta.plural}</h1>
        <p className="mt-5 max-w-2xl text-base leading-7 text-[var(--site-secondary-text)]">{!type && page.description ? page.description : 'Locally edited guides, stories, events, destinations, activities, and products. Published entries are reviewed before they appear here.'}</p>
        <nav className="mt-8 flex flex-wrap gap-x-5 gap-y-3" aria-label="Tourism sections">
          <Link to="/explore" className="fine-link text-sm text-[var(--site-accent-text)]">Explore</Link>
          {CONTENT_TYPES.map((item) => <Link key={item.key} to={item.path} className="fine-link text-sm text-zinc-300">{item.plural}</Link>)}
        </nav>
      </section>

      <section className="page-shell pb-16">
        <div className="grid gap-3 border-y border-white/[0.1] py-5 md:grid-cols-[minmax(14rem,2fr)_repeat(3,minmax(9rem,1fr))]">
          <label className="relative"><span className="sr-only">Search</span><Search size={17} className="pointer-events-none absolute left-3 top-3 text-zinc-500" /><input value={filters.search} onChange={(event) => setFilter('q', event.target.value)} placeholder="Search" className="h-11 w-full rounded-lg border border-white/[0.12] bg-zinc-900 pl-10 pr-3 text-sm outline-none focus:border-[var(--site-accent-border)] focus:ring-2 focus:ring-[var(--focus-ring)]" /></label>
          <FilterSelect label="Municipality" value={filters.municipality} options={state.taxonomy.municipalities} onChange={(value) => setFilter('municipality', value)} />
          <FilterSelect label="Category" value={filters.category} options={state.taxonomy.categories.filter((item) => !type || !item.content_type || item.content_type === type)} onChange={(value) => setFilter('category', value)} />
          <FilterSelect label="Tag" value={filters.tag} options={state.taxonomy.tags} onChange={(value) => setFilter('tag', value)} />
        </div>
        {type === 'event' && <div className="mt-3 flex flex-wrap gap-3"><DateFilter label="From" value={filters.from} onChange={(value) => setFilter('from', value)} /><DateFilter label="To" value={filters.to} onChange={(value) => setFilter('to', value)} /></div>}

        <div className="mt-10">
          {state.loading ? <LoadingState label="Loading published stories" /> : state.error ? <p className="border-y border-red-300/20 py-5 text-sm text-red-100">{state.error}</p> : state.posts.length ? (
            <div className="grid gap-x-7 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
              {state.posts.map((post) => <TourismCard key={post.id} post={post} />)}
            </div>
          ) : <EmptyState title="No published entries match these filters" message="Clear a filter or return later as the editorial collection grows." />}
        </div>
      </section>
    </div>
  );
}

function FilterSelect({ label, value, options, onChange }) {
  const plural = { Municipality: 'municipalities', Category: 'categories', Tag: 'tags' }[label] || `${label.toLowerCase()}s`;
  return <label><span className="sr-only">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="h-11 w-full rounded-lg border border-white/[0.12] bg-zinc-900 px-3 text-sm text-zinc-200 outline-none focus:border-[var(--site-accent-border)] focus:ring-2 focus:ring-[var(--focus-ring)]"><option value="">All {plural}</option>{options.map((item) => <option key={item.id} value={item.slug}>{item.name}</option>)}</select></label>;
}

function DateFilter({ label, value, onChange }) {
  return <label className="grid gap-1 text-xs text-zinc-500"><span>{label}</span><input type="date" value={value} onChange={(event) => onChange(event.target.value)} className="h-11 rounded-lg border border-white/[0.12] bg-zinc-900 px-3 text-sm text-zinc-200 outline-none focus:ring-2 focus:ring-[var(--focus-ring)]" /></label>;
}

function TourismCard({ post }) {
  const meta = contentTypeMeta(post.content_type);
  return <article className="group"><Link to={`${meta.path}/${post.slug}`} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">{post.cover_image_url ? <img src={post.cover_image_url} alt={post.cover_image_alt || ''} loading="lazy" decoding="async" className="aspect-[4/3] w-full rounded-xl object-cover transition duration-500 group-hover:scale-[1.01]" /> : <TourismStoryFallback className="aspect-[4/3] w-full rounded-xl border border-white/[0.1]" />}<div className="mt-4 flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-[var(--site-accent-text)]"><span>{meta.label}</span>{post.editorial_municipalities?.name && <><span aria-hidden="true">·</span><span className="inline-flex items-center gap-1"><MapPin size={12} />{post.editorial_municipalities.name}</span></>}</div><h2 className="mt-2 text-xl font-semibold leading-7 text-[var(--site-primary-text)]">{post.title}</h2><p className="mt-2 line-clamp-3 text-sm leading-6 text-[var(--site-secondary-text)]">{post.summary}</p><span className="mt-4 inline-flex items-center gap-2 text-sm text-zinc-300">Read <ArrowRight size={15} /></span></Link></article>;
}
