import { ArrowRight, PenLine, UsersRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import CreativeFeed from '../components/CreativeFeed';
import LoadingState from '../components/LoadingState';
import { usePublicContent } from '../lib/contentApi';
import { loadPublicCreativeFeed, moderateCreativePost } from '../lib/creativePosts';
import { supabase } from '../lib/supabaseClient';
import usePublicAccount from '../lib/usePublicAccount';
import InlineWebsiteText from '../components/InlineWebsiteText';

export default function Home() {
  const { content } = usePublicContent(['home']);
  const { account } = usePublicAccount();
  const [state, setState] = useState({ loading: true, posts: [], creatives: [], error: '' });
  const page = content.websitePages?.home || {};

  useEffect(() => {
    let active = true;
    Promise.all([
      loadPublicCreativeFeed({ limit: 36 }),
      supabase.from('creative_members').select('id,name,slug,role,short_bio,profile_image_url,skills,is_featured').eq('is_published', true).order('is_featured', { ascending: false }).order('display_order', { ascending: true, nullsFirst: false }).limit(10),
    ]).then(([posts, creativeResult]) => {
      if (!active) return;
      setState({ loading: false, posts, creatives: creativeResult.data || [], error: '' });
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
  const structuredData = { '@context': 'https://schema.org', '@type': 'WebSite', name: content.displayName, url: 'https://www.lahatliwa.studio/', description: 'A curated portfolio of Creative work from Aklan.', publisher: { '@type': 'Organization', name: content.displayName } };

  return <div data-creative-network-home className="ll-network-home">
    <script type="application/ld+json">{JSON.stringify(structuredData)}</script>
    <section className="ll-feed-intro">
      <div className="ll-feed-intro__copy">
        <InlineWebsiteText as="p" className="ll-kicker" section="page.home" field="heroEyebrow" value={page.heroEyebrow || 'Curated Creative work from Aklan'} label="Edit feed eyebrow" />
        <InlineWebsiteText as="h1" section="page.home" field="heroTitle" value={page.heroTitle || 'Work worth discovering.'} label="Edit feed heading" />
        <InlineWebsiteText as="p" section="page.home" field="heroDescription" type="textarea" value={page.heroDescription || 'Explore selected photography, film, design, writing, and digital work—then connect directly with the Creative behind it.'} label="Edit feed introduction" />
      </div>
      <div className="ll-feed-intro__actions">
        {isCreative ? <Link to="/create" className="ll-primary-action ll-mobile-redundant-create"><PenLine size={17} /> Add work</Link> : <Link to="/creatives" className="ll-primary-action"><UsersRound size={17} /> Explore Creatives</Link>}
        <Link to="/inquiry" className="ll-text-action">Work with us <ArrowRight size={16} /></Link>
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
        {state.loading ? <LoadingState label="Loading Creative work" /> : <CreativeFeed posts={state.posts} creativeOwner={isCreative} moderator={isModerator} onModeratePost={moderatePost} copy={page} editableSection="page.home" />}
      </main>
    </div>
  </div>;
}
