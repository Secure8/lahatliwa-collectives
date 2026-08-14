import { Archive, Edit3, ExternalLink, RotateCcw, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import CreativePostDocument from './CreativePostDocument';

export default function CreativePostCard({ post, creative, owner = false, onArchive, onRestore, onDelete }) {
  const date = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium' }).format(new Date(post.published_at || post.updated_at));
  return <article className="overflow-hidden rounded-2xl border border-white/[0.1] bg-zinc-950/75 shadow-[0_22px_70px_-45px_rgba(0,0,0,0.9)]">
    <header className="flex items-center justify-between gap-4 border-b border-white/[0.08] px-4 py-4 sm:px-6">
      <Link to={creative?.slug ? `/creatives/${creative.slug}` : '#'} className="flex min-w-0 items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300">
        {creative?.profile_image_url ? <img src={creative.profile_image_url} alt="" className="h-10 w-10 rounded-full object-cover" /> : <span className="grid h-10 w-10 rounded-full bg-orange-300/15 text-sm font-semibold text-orange-200 place-items-center">{creative?.name?.slice(0, 1) || 'C'}</span>}
        <span className="min-w-0"><strong className="block truncate text-sm text-white">{creative?.name || 'Lahat Liwa Creative'}</strong><span className="text-xs text-zinc-500">{post.status === 'published' ? date : `${post.status} · Updated ${date}`}</span></span>
      </Link>
      {owner && <div className="flex shrink-0 gap-1">{post.status !== 'archived' && <Link to={`/posts/${post.id}/edit`} aria-label="Edit post" className="grid h-10 w-10 place-items-center rounded-lg text-zinc-400 hover:bg-white/[0.06] hover:text-white focus-visible:ring-2 focus-visible:ring-orange-300"><Edit3 size={17} /></Link>}{post.status === 'archived' ? <button type="button" onClick={() => onRestore?.(post)} aria-label="Restore post" className="grid h-10 w-10 place-items-center rounded-lg text-zinc-400 hover:bg-white/[0.06] hover:text-white"><RotateCcw size={17} /></button> : <button type="button" onClick={() => onArchive?.(post)} aria-label="Archive post" className="grid h-10 w-10 place-items-center rounded-lg text-zinc-400 hover:bg-white/[0.06] hover:text-white"><Archive size={17} /></button>}{post.status === 'archived' && <button type="button" onClick={() => onDelete?.(post)} aria-label="Delete post permanently" className="grid h-10 w-10 place-items-center rounded-lg text-red-300 hover:bg-red-300/10"><Trash2 size={17} /></button>}</div>}
    </header>
    <div className="px-4 py-5 sm:px-6"><CreativePostDocument document={post.document} media={post.creative_post_media} /></div>
    {post.status === 'published' && <footer className="border-t border-white/[0.08] px-4 py-3 sm:px-6"><Link to={`/posts/${post.slug}`} className="inline-flex min-h-10 items-center gap-2 text-sm font-medium text-orange-200 hover:text-orange-100">Open post <ExternalLink size={14} /></Link></footer>}
    {post.moderation_reason && <p className="border-t border-red-300/20 bg-red-300/[0.06] px-4 py-3 text-sm text-red-100 sm:px-6">Moderation note: {post.moderation_reason}</p>}
  </article>;
}
