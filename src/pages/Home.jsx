import { ArrowRight, PenLine, UsersRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import CreativeFeed from '../components/CreativeFeed';
import LoadingState from '../components/LoadingState';
import { usePublicContent } from '../lib/contentApi';
import { loadPublicCreativeFeed, moderateCreativePost } from '../lib/creativePosts';
import { supabase } from '../lib/supabaseClient';
import usePublicAccount from '../lib/usePublicAccount';
import PublicPageHeader from '../components/PublicPageHeader';
import FeaturedWorkGallery from '../components/FeaturedWorkGallery';
import { loadFeaturedWorkGallery } from '../lib/featuredWork';

export default function Home() {
  const { content } = usePublicContent(['home']);
  const { account } = usePublicAccount();
  const [state, setState] = useState({ loading: true, posts: [], creatives: [], featured: [], error: '' });
  const page = content.websitePages?.home || {};

  useEffect(() => {
    let active = true;
    Promise.all([
      loadPublicCreativeFeed({ limit: 36 }),
      supabase.from('creative_members').select('id,name,slug,role,short_bio,profile_image_url,skills,is_featured').eq('is_published', true).order('is_featured', { ascending: false }).order('display_order', { ascending: true, nullsFirst: false }).limit(10),
      loadFeaturedWorkGallery().catch(() => []),
    ]).then(([posts, creativeResult, featured]) => {
      if (!active) return;
      setState({ loading: false, posts, creatives: creativeResult.data || [], featured, error: '' });
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
    <PublicPageHeader
      eyebrow={page.heroEyebrow || 'Curated Creative work from Aklan'}
      title={page.heroTitle || 'Work worth discovering.'}
      description={page.heroDescription || 'Explore selected photography, film, design, writing, and digital work—then connect directly with the Creative behind it.'}
      backgroundImage={page.heroBackgroundImageUrl}
      backgroundPosition={page.heroBackgroundPosition || 'center'}
      backgroundCredit={page.heroBackgroundCredit || ''}
      edit={{ section: 'page.home', eyebrowField: 'heroEyebrow', titleField: 'heroTitle', descriptionField: 'heroDescription', backgroundField: 'heroBackgroundImageUrl', creditField: 'heroBackgroundCredit' }}
      aside={<div className="ll-feed-intro__actions">
        {isCreative ? <Link to="/create" className="ll-primary-action ll-mobile-redundant-create"><PenLine size={17} /> Add work</Link> : <Link to="/creatives" className="ll-primary-action"><UsersRound size={17} /> Explore Creatives</Link>}
        <Link to="/inquiry" className="ll-text-action">Work with us <ArrowRight size={16} /></Link>
      </div>}
    />

    <FeaturedWorkGallery items={state.featured} variant="mobile" />

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
