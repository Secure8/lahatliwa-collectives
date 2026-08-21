import { ArrowLeft } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import CreativePostCard from '../components/CreativePostCard';
import InquiryRail from '../components/InquiryRail';
import LoadingState from '../components/LoadingState';
import { loadPublicCreativePost } from '../lib/creativePosts';
import { applyPublicMetadata } from '../lib/publicMetadata';

export default function CreativePostDetails() {
  const { slug } = useParams(); const [post, setPost] = useState(null); const [error, setError] = useState('');
  useEffect(() => { let active = true; loadPublicCreativePost(slug).then((data) => { if (active) setPost(data); }).catch((reason) => { if (active) setError(reason.message); }); return () => { active = false; }; }, [slug]);
  useEffect(() => { if (!post) return; applyPublicMetadata({ title: `${post.title || `Work by ${post.creative_members?.name || 'a Creative'}`} | Lahat Liwa Collectives`, description: post.summary || 'Published Creative work from Lahat Liwa Collectives.', pathname: `/work/${post.slug}`, type: 'article', image: post.creative_post_media?.[0]?.display_url }); }, [post]);
  if (!post && !error) return <div className="page-shell py-20"><LoadingState label="Loading post" /></div>;
  if (error) return <div className="page-shell py-20"><p className="major-border-y py-8 text-zinc-300">{error}</p></div>;
  const creative = post.creative_members;
  return <article className="ll-post-route ll-work-route"><div className="ll-public-content-with-rail"><div className="ll-public-content-with-rail__content"><Link to={`/creatives/${creative.slug}`} className="ll-back-action"><ArrowLeft size={16} /> {creative.name}</Link><CreativePostCard post={post} creative={creative} /></div><div className="ll-public-inquiry-layout__rail"><InquiryRail context={{ type: 'work', id: post.id, slug: post.slug, title: post.title, creative: creative.slug, creativeId: creative.id, creativeName: creative.name, publicUrl: `/work/${post.slug}`, thumbnail: post.creative_post_media?.[0]?.display_url || '' }} /></div></div></article>;
}
