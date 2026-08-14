import { ArrowLeft } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import CreativePostCard from '../components/CreativePostCard';
import LoadingState from '../components/LoadingState';
import { loadPublicCreativePost } from '../lib/creativePosts';
import { applyPublicMetadata } from '../lib/publicMetadata';

export default function CreativePostDetails() {
  const { slug } = useParams(); const [post, setPost] = useState(null); const [error, setError] = useState('');
  useEffect(() => { let active = true; loadPublicCreativePost(slug).then((data) => { if (active) setPost(data); }).catch((reason) => { if (active) setError(reason.message); }); return () => { active = false; }; }, [slug]);
  useEffect(() => { if (!post) return; applyPublicMetadata({ title: `Post by ${post.creative_members?.name || 'a Creative'} | Lahat Liwa Collectives`, description: 'A published creative story from Lahat Liwa Collectives.', pathname: `/posts/${post.slug}`, type: 'article', image: post.creative_post_media?.[0]?.display_url }); }, [post]);
  if (!post && !error) return <div className="page-shell py-20"><LoadingState label="Loading post" /></div>;
  if (error) return <div className="page-shell py-20"><p className="major-border-y py-8 text-zinc-300">{error}</p></div>;
  const creative = post.creative_members;
  return <article className="ll-post-route"><Link to={`/creatives/${creative.slug}`} className="ll-back-action"><ArrowLeft size={16} /> Back to {creative.name}</Link><CreativePostCard post={post} creative={creative} /></article>;
}
