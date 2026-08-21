import { Search, SlidersHorizontal } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import CreativePostCard from '../components/CreativePostCard';
import EmptyState from '../components/EmptyState';
import InquiryRail from '../components/InquiryRail';
import LoadingState from '../components/LoadingState';
import { loadPublicCreativeFeed } from '../lib/creativePosts';
import { groupWorkTaxonomy, loadWorkTaxonomy } from '../lib/workTaxonomy';
import { usePublicContent } from '../lib/contentApi';
import InlineWebsiteText from '../components/InlineWebsiteText';

function postTerms(post) {
  return (post.creative_post_taxonomy || []).map((row) => row.creative_taxonomy_terms).filter(Boolean);
}

export default function Discover() {
  const { content } = usePublicContent([]);
  const page = content.websitePages?.discover || {};
  const [state, setState] = useState({ loading: true, works: [], terms: [], error: '' });
  const [filters, setFilters] = useState({ keyword: '', discipline: '', specialty: '', industry: '' });
  useEffect(() => {
    let active = true;
    Promise.all([loadPublicCreativeFeed({ limit: 60 }), loadWorkTaxonomy()]).then(([works, terms]) => {
      if (active) setState({ loading: false, works, terms, error: '' });
    }).catch((error) => { if (active) setState({ loading: false, works: [], terms: [], error: error.message }); });
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

  return <div className="ll-discover-page page-shell">
    <header className="ll-discover-intro">
      <InlineWebsiteText as="p" className="ll-kicker" section="page.discover" field="eyebrow" value={page.eyebrow || 'Discover'} label="Edit Discover eyebrow" />
      <InlineWebsiteText as="h1" section="page.discover" field="title" value={page.title || 'Find Creative work from Aklan.'} label="Edit Discover heading" />
      <InlineWebsiteText as="p" section="page.discover" field="description" type="textarea" value={page.description || 'Browse selected work by discipline, specialty, industry, or the idea you have in mind.'} label="Edit Discover description" />
    </header>
    <section className="ll-discover-filters" aria-label="Filter Creative work">
      <label className="ll-discover-search"><Search size={17}/><span className="sr-only">Search work</span><input type="search" value={filters.keyword} onChange={(event) => update('keyword', event.target.value)} placeholder="Search work, skills, or Creatives"/></label>
      <div><SlidersHorizontal size={16}/>{['discipline','specialty','industry'].map((kind) => <label key={kind}><span className="sr-only">{kind}</span><select value={filters[kind]} onChange={(event) => update(kind, event.target.value)}><option value="">All {kind === 'industry' ? 'industries' : `${kind}s`}</option>{(grouped[kind] || []).map((term) => <option key={term.id} value={term.slug}>{term.name}</option>)}</select></label>)}</div>
    </section>
    {state.loading ? <LoadingState label="Loading Creative work"/> : state.error ? <p className="ll-feed-error" role="alert">{state.error}</p> : <div className="ll-public-content-with-rail"><section className="ll-discover-results" aria-label="Creative work results">{visible.length ? visible.map((work) => <CreativePostCard key={work.id} post={work} creative={work.creative_members} feed/>) : <EmptyState title="No work matches these filters" message="Try a broader keyword or remove one of the filters."/>}</section><div className="ll-public-inquiry-layout__rail"><InquiryRail /></div></div>}
  </div>;
}
