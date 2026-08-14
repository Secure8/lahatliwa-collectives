import { ArrowRight, PenLine, UsersRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import CreativeCard from '../components/CreativeCard';
import CreativeFeed from '../components/CreativeFeed';
import LoadingState from '../components/LoadingState';
import { usePublicContent } from '../lib/contentApi';
import { loadPublicCreativeFeed, moderateCreativePost } from '../lib/creativePosts';
import { fetchPublicProjectSummaries, moderatePublicProject } from '../lib/publicProjectData';
import { supabase } from '../lib/supabaseClient';
import usePublicAccount from '../lib/usePublicAccount';

export default function Home() {
  const { content } = usePublicContent(['home']);
  const { account } = usePublicAccount();
  const [state, setState] = useState({ loading: true, posts: [], projects: [], creatives: [], error: '' });
  const [filter, setFilter] = useState('all');
  const page = content.websitePages?.home || {};

  useEffect(() => {
    let active = true;
    Promise.all([
      loadPublicCreativeFeed({ limit: 36 }),
      fetchPublicProjectSummaries(),
      supabase.from('creative_members').select('id,name,slug,role,short_bio,profile_image_url,skills,is_featured').eq('is_published', true).order('is_featured', { ascending: false }).order('display_order', { ascending: true, nullsFirst: false }).limit(10),
    ]).then(([posts, projects, creativeResult]) => {
      if (!active) return;
      setState({ loading: false, posts, projects: (projects || []).slice(0, 12), creatives: creativeResult.data || [], error: '' });
    }).catch((error) => { if (active) setState((current) => ({ ...current, loading: false, error: error.message || 'The feed could not be refreshed.' })); });
    return () => { active = false; };
  }, []);

  const isCreative = account?.role === 'creative';
  const isModerator = account?.role === 'super_admin';
  async function moderatePost(post, action, reason) {
    try {
      await moderateCreativePost(post.id, action, reason);
      setState((current) => ({ ...current, posts: current.posts.filter((item) => item.id !== post.id) }));
    } catch (moderationError) {
      setState((current) => ({ ...current, error: moderationError.message || 'The post could not be removed.' }));
    }
  }
  async function moderateProject(project, reason) {
    try {
      await moderatePublicProject(project.id, reason);
      setState((current) => ({ ...current, projects: current.projects.filter((item) => item.id !== project.id) }));
    } catch (moderationError) {
      setState((current) => ({ ...current, error: moderationError.message || 'The project could not be removed.' }));
    }
  }
  const structuredData = { '@context': 'https://schema.org', '@type': 'WebSite', name: content.displayName, url: 'https://www.lahatliwa.studio/', description: 'A professional creative network for discovering work, process, stories, and the people behind them.', publisher: { '@type': 'Organization', name: content.displayName } };

  return <div data-creative-network-home className="ll-network-home">
    <script type="application/ld+json">{JSON.stringify(structuredData)}</script>
    <section className="ll-feed-intro">
      <div className="ll-feed-intro__copy"><p className="ll-kicker">{page.heroEyebrow || 'Lahat Liwa creative network'}</p><h1>{page.heroTitle || 'Discover what Creatives are making now.'}</h1><p>{page.heroDescription || 'Follow published work, photography, design, writing, project updates, and creative process from people across the Lahat Liwa network.'}</p></div>
      <div className="ll-feed-intro__actions">
        {isCreative ? <Link to="/create" className="ll-primary-action"><PenLine size={17} /> Create post</Link> : <Link to="/creatives" className="ll-primary-action"><UsersRound size={17} /> Explore Creatives</Link>}
        <Link to="/services" className="ll-text-action">Work with us <ArrowRight size={16} /></Link>
      </div>
    </section>

    {!state.loading && state.creatives.length > 0 && <nav className="ll-creative-strip" aria-label="Featured Creatives">
      {state.creatives.map((creative) => <Link key={creative.id} to={`/creatives/${creative.slug}`} title={creative.name}>
        {creative.profile_image_url ? <img src={creative.profile_image_url} alt="" loading="lazy" /> : <span aria-hidden="true">{creative.name?.slice(0, 1) || 'C'}</span>}
        <small>{creative.name}</small>
      </Link>)}
    </nav>}

    <div className="ll-home-layout">
      <main className="min-w-0">
        {state.error && <p role="alert" className="ll-feed-error">{state.error}</p>}
        {state.loading ? <LoadingState label="Loading the creative feed" /> : <CreativeFeed posts={state.posts} projects={state.projects} filter={filter} onFilterChange={setFilter} creativeOwner={isCreative} moderator={isModerator} onModeratePost={moderatePost} onModerateProject={moderateProject} />}
      </main>
      <aside className="ll-discovery-panel" aria-labelledby="discover-creatives-heading">
        <div className="ll-discovery-panel__heading"><p className="ll-kicker">People to discover</p><h2 id="discover-creatives-heading">Meet the Creatives</h2><p>Open a profile to see their wall, disciplines, and formal project work.</p></div>
        <div className="ll-discovery-list">{state.creatives.map((creative) => <CreativeCard key={creative.id} creative={creative} compact />)}</div>
        <Link to="/creatives" className="ll-text-action">View all Creatives <ArrowRight size={16} /></Link>
      </aside>
    </div>
  </div>;
}
