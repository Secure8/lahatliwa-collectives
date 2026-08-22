import { ArrowLeft } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import CreativePostCard from '../components/CreativePostCard';
import FeaturedWorkGallery from '../components/FeaturedWorkGallery';
import FeaturedWorkRequestControl from '../components/FeaturedWorkRequestControl';
import LoadingState from '../components/LoadingState';
import { loadPublicCreativePost } from '../lib/creativePosts';
import { loadFeaturedWorkGallery } from '../lib/featuredWork';
import { applyPublicMetadata } from '../lib/publicMetadata';
import usePublicAccount from '../lib/usePublicAccount';

export default function CreativePostDetails() {
  const { slug } = useParams(); const { account } = usePublicAccount(); const [post, setPost] = useState(null); const [featured, setFeatured] = useState([]); const [error, setError] = useState('');
  useEffect(() => { let active = true; Promise.all([loadPublicCreativePost(slug), loadFeaturedWorkGallery().catch(() => [])]).then(([data, gallery]) => { if (active) { setPost(data); setFeatured(gallery); } }).catch((reason) => { if (active) setError(reason.message); }); return () => { active = false; }; }, [slug]);
  useEffect(() => { if (!post) return; applyPublicMetadata({ title: `${post.title || `Work by ${post.creative_members?.name || 'a Creative'}`} | Lahat Liwa Collectives`, description: post.summary || 'Published Creative work from Lahat Liwa Collectives.', pathname: `/work/${post.slug}`, type: 'article', image: post.creative_post_media?.[0]?.display_url }); }, [post]);
  if (!post && !error) return <div className="page-shell py-20"><LoadingState label="Loading post" /></div>;
  if (error) return <div className="page-shell py-20"><p className="major-border-y py-8 text-zinc-300">{error}</p></div>;
  const creative = post.creative_members;
  return <div className="ll-work-detail-layout">
    <article className="ll-post-route ll-work-route"><Link to={`/creatives/${creative.slug}`} className="ll-back-action"><ArrowLeft size={16} /> {creative.name}</Link><CreativePostCard post={post} creative={creative} /><FeaturedWorkRequestControl post={post} account={account} /></article>
    <aside className="ll-work-detail-featured"><FeaturedWorkGallery items={featured} variant="rail" /></aside>
  </div>;
}
