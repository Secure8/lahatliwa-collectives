import { Archive, ArrowUpRight, Edit3, Ellipsis, MessageCircle, RotateCcw, ShieldAlert, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import CreativePostDocument from './CreativePostDocument';

function displayDate(value) {
  const date = new Date(value);
  const relativeDays = Math.round((date.getTime() - Date.now()) / 86400000);
  if (Math.abs(relativeDays) < 7) return new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(relativeDays, 'day');
  return new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium' }).format(date);
}

export default function CreativePostCard({ post, creative, owner = false, moderator = false, onArchive, onRestore, onDelete, onModerate, feed = false }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [moderationOpen, setModerationOpen] = useState(false);
  const [moderationNote, setModerationNote] = useState('');
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
      {(owner || moderator) && <div ref={menuRef} className="ll-context-menu"><button type="button" onClick={() => setMenuOpen((value) => !value)} aria-expanded={menuOpen} aria-label="Post options"><Ellipsis size={20} /></button>{menuOpen && <div role="menu">
        {owner && <>
        {post.status !== 'archived' && <Link role="menuitem" to={`/posts/${post.id}/edit`}><Edit3 size={16} /> Edit post</Link>}
        {post.status === 'archived' ? <button role="menuitem" type="button" onClick={() => { setMenuOpen(false); onRestore?.(post); }}><RotateCcw size={16} /> Restore draft</button> : <button role="menuitem" type="button" onClick={() => { setMenuOpen(false); onArchive?.(post); }}><Archive size={16} /> Archive</button>}
        <button role="menuitem" type="button" className="is-danger" onClick={() => { setMenuOpen(false); onDelete?.(post); }}><Trash2 size={16} /> {post.status === 'draft' ? 'Delete draft' : 'Delete post'}</button>
        </>}
        {moderator && !owner && <button role="menuitem" type="button" className="is-danger" onClick={() => { setMenuOpen(false); setModerationOpen(true); }}><ShieldAlert size={16} /> Remove from public</button>}
      </div>}</div>}
    </header>
    <div className="ll-post-card__body"><CreativePostDocument document={post.document} media={post.creative_post_media} compact={feed} /></div>
    {post.status === 'published' && <footer className="ll-post-card__actions">
      <Link to={`/inquiry?creative=${encodeURIComponent(creative?.slug || '')}&work=${encodeURIComponent(post.slug || post.id)}`}><MessageCircle size={17} /> Ask about this work</Link>
      <Link to={`/posts/${post.slug}`}><span>Open post</span><ArrowUpRight size={17} /></Link>
    </footer>}
    {post.moderation_reason && <p className="ll-moderation-note">Moderation note: {post.moderation_reason}</p>}
    {moderationOpen && <div className="ll-moderation-dialog" role="dialog" aria-modal="true" aria-label="Remove post from public"><button type="button" className="ll-moderation-dialog__scrim" onClick={() => setModerationOpen(false)} aria-label="Close"/><section><header><div><p className="ll-kicker">Super Admin moderation</p><h3>Remove this post?</h3></div><button type="button" onClick={() => setModerationOpen(false)} aria-label="Close"><X size={19}/></button></header><p>The Creative keeps ownership. Explain what needs attention before the post can return.</p><textarea rows={4} value={moderationNote} onChange={(event) => setModerationNote(event.target.value)} placeholder="Add a clear note (at least 8 characters)"/><footer><button type="button" onClick={() => setModerationOpen(false)}>Cancel</button><button type="button" className="is-danger" disabled={moderationNote.trim().length < 8} onClick={() => { onModerate?.(post, 'remove', moderationNote.trim()); setModerationOpen(false); }}>Remove with note</button></footer></section></div>}
  </article>;
}
