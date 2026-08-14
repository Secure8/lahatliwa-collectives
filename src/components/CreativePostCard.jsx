import { Archive, ArrowUpRight, Edit3, Ellipsis, MessageCircle, RotateCcw, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import CreativePostDocument from './CreativePostDocument';

function displayDate(value) {
  const date = new Date(value);
  const relativeDays = Math.round((date.getTime() - Date.now()) / 86400000);
  if (Math.abs(relativeDays) < 7) return new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(relativeDays, 'day');
  return new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium' }).format(date);
}

export default function CreativePostCard({ post, creative, owner = false, onArchive, onRestore, onDelete, feed = false }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const date = displayDate(post.published_at || post.updated_at);
  useEffect(() => {
    if (!menuOpen) return undefined;
    const close = (event) => { if (!menuRef.current?.contains(event.target)) setMenuOpen(false); };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [menuOpen]);

  return <article className={`ll-post-card${menuOpen ? ' has-open-menu' : ''}`}>
    <header className="ll-post-card__header">
      <Link to={creative?.slug ? `/creatives/${creative.slug}` : '#'} className="ll-author-link">
        {creative?.profile_image_url ? <img src={creative.profile_image_url} alt="" /> : <span>{creative?.name?.slice(0, 1) || 'C'}</span>}
        <span><strong>{creative?.name || 'Lahat Liwa Creative'}</strong><small>{post.status === 'published' ? date : `${post.status} · Updated ${date}`}{creative?.role ? ` · ${creative.role}` : ''}</small></span>
      </Link>
      {owner && <div ref={menuRef} className="ll-context-menu"><button type="button" onClick={() => setMenuOpen((value) => !value)} aria-expanded={menuOpen} aria-label="Post options"><Ellipsis size={20} /></button>{menuOpen && <div role="menu">
        {post.status !== 'archived' && <Link role="menuitem" to={`/posts/${post.id}/edit`}><Edit3 size={16} /> Edit post</Link>}
        {post.status === 'archived' ? <button role="menuitem" type="button" onClick={() => { setMenuOpen(false); onRestore?.(post); }}><RotateCcw size={16} /> Restore draft</button> : <button role="menuitem" type="button" onClick={() => { setMenuOpen(false); onArchive?.(post); }}><Archive size={16} /> Archive</button>}
        {post.status !== 'published' && <button role="menuitem" type="button" className="is-danger" onClick={() => { setMenuOpen(false); onDelete?.(post); }}><Trash2 size={16} /> {post.status === 'draft' ? 'Delete draft' : 'Delete permanently'}</button>}
      </div>}</div>}
    </header>
    <div className="ll-post-card__body"><CreativePostDocument document={post.document} media={post.creative_post_media} compact={feed} /></div>
    {post.status === 'published' && <footer className="ll-post-card__actions">
      <Link to={`/inquiry?work=${encodeURIComponent(post.slug || post.id)}`}><MessageCircle size={17} /> Ask about this work</Link>
      <Link to={`/posts/${post.slug}`}><span>Open post</span><ArrowUpRight size={17} /></Link>
    </footer>}
    {post.moderation_reason && <p className="ll-moderation-note">Moderation note: {post.moderation_reason}</p>}
  </article>;
}
