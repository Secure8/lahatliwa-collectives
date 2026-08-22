import { Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import CreativePostCard from '../components/CreativePostCard';
import EmptyState from '../components/EmptyState';
import LoadingState from '../components/LoadingState';
import { loadPublicCreativeFeed } from '../lib/creativePosts';
import { groupWorkTaxonomy, loadWorkTaxonomy } from '../lib/workTaxonomy';
import { usePublicContent } from '../lib/contentApi';
import PublicPageHeader from '../components/PublicPageHeader';
import FeaturedWorkGallery from '../components/FeaturedWorkGallery';
import { loadFeaturedWorkGallery } from '../lib/featuredWork';

function postTerms(post) {
  return (post.creative_post_taxonomy || []).map((row) => row.creative_taxonomy_terms).filter(Boolean);
}

export default function Discover() {
  const { content } = usePublicContent([]);
  const page = content.websitePages?.discover || {};
  const [state, setState] = useState({ loading: true, works: [], terms: [], featured: [], error: '' });
  const [filters, setFilters] = useState({ keyword: '', discipline: '', specialty: '', industry: '' });
  useEffect(() => {
    let active = true;
    Promise.all([
      loadPublicCreativeFeed({ limit: 60 }),
      loadWorkTaxonomy(),
      loadFeaturedWorkGallery().catch(() => []),
    ]).then(([works, terms, featured]) => {
      if (active) setState({ loading: false, works, terms, featured, error: '' });
    }).catch((error) => { if (active) setState({ loading: false, works: [], terms: [], featured: [], error: error.message }); });
    return () => { active = false; };
  }, []);
  const grouped = useMemo(() => groupWorkTaxonomy(state.terms), [state.terms]);
  const visible = useMemo(() => state.works.filter((work) => {
    const terms = postTerms(work);
    const searchable = [work.title, work.summary, ...(work.tags || []), work.creative_members?.name, work.creative_members?.role, ...terms.map((term) => term.name)].join(' ').toLowerCase();
    if (filters.keyword && !searchable.includes(filters.keyword.toLowerCase())) return false;
    return ['discipline', 'specialty', 'industry'].every((kind) => !filters[kind] || terms.some((term) => term.kind === kind && term.slug === filters[kind]));
  }), [filters, state.works]);
  const update = (key, value) => setFilters((current) => ({ ...current, [key]: value }));

  return <div className="ll-discover-page">
    <div className={`ll-featured-split-page${state.featured.length ? ' has-featured' : ''}`}>
      <div className="ll-featured-split-page__main">
        <PublicPageHeader eyebrow={page.eyebrow || 'Discover'} title={page.title || 'Find Creative work from Aklan.'} description={page.description || 'Browse selected work by discipline, specialty, industry, or the idea you have in mind.'} backgroundImage={page.heroBackgroundImageUrl} backgroundPosition={page.heroBackgroundPosition || 'center'} backgroundCredit={page.heroBackgroundCredit || ''} edit={{ section: 'page.discover', eyebrowField: 'eyebrow', titleField: 'title', descriptionField: 'description', backgroundField: 'heroBackgroundImageUrl', creditField: 'heroBackgroundCredit' }} />
        <FeaturedWorkGallery items={state.featured} variant="mobile" />
        <section className="ll-discover-filters" aria-label="Filter Creative work">
          <label className="ll-discover-search"><Search size={17}/><span className="sr-only">Search work</span><input type="search" value={filters.keyword} onChange={(event) => update('keyword', event.target.value)} placeholder="Search work, skills, or Creatives"/></label>
          <div>{['discipline','specialty','industry'].map((kind) => <label key={kind}><span className="sr-only">{kind}</span><select value={filters[kind]} onChange={(event) => update(kind, event.target.value)}><option value="">All {kind === 'industry' ? 'industries' : `${kind}s`}</option>{(grouped[kind] || []).map((term) => <option key={term.id} value={term.slug}>{term.name}</option>)}</select></label>)}</div>
        </section>
        {state.loading ? <LoadingState label="Loading Creative work"/> : state.error ? <p className="ll-feed-error" role="alert">{state.error}</p> : visible.length ? <section className="ll-discover-results" aria-label="Creative work results">{visible.map((work) => <CreativePostCard key={work.id} post={work} creative={work.creative_members} feed/>)}</section> : <EmptyState title="No work matches these filters" message="Try a broader keyword or remove one of the filters."/>}
      </div>
      {state.featured.length > 0 && <aside className="ll-featured-split-page__aside" aria-label="Featured work gallery">
        <FeaturedWorkGallery items={state.featured} variant="sidebar" />
      </aside>}
    </div>
  </div>;
}
