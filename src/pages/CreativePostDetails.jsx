import { ArrowLeft } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import CreativePostDocument from '../components/CreativePostDocument';
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
  return <article className="page-shell max-w-4xl py-10 sm:py-16"><Link to={`/creatives/${creative.slug}`} className="inline-flex min-h-11 items-center gap-2 text-sm text-zinc-400 hover:text-orange-200"><ArrowLeft size={16} /> Back to {creative.name}</Link><header className="mt-8 flex items-center gap-4 border-b border-white/10 pb-6">{creative.profile_image_url && <img src={creative.profile_image_url} alt="" className="h-12 w-12 rounded-full object-cover" />}<div><h1 className="font-semibold text-white">{creative.name}</h1><p className="mt-1 text-sm text-zinc-500">{new Intl.DateTimeFormat('en-PH', { dateStyle: 'long' }).format(new Date(post.published_at))}</p></div></header><div className="py-8"><CreativePostDocument document={post.document} media={post.creative_post_media} /></div></article>;
}
