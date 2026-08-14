import { ArrowRight, BriefcaseBusiness, Ellipsis, Image as ImageIcon, LayoutGrid, Newspaper, PenLine, ShieldAlert, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import CreativePostCard from './CreativePostCard';
import EmptyState from './EmptyState';
import ProjectFeedCard from './ProjectFeedCard';

function publishedTime(item) {
  return new Date(item.kind === 'post' ? item.post.published_at || item.post.updated_at : item.project.project_date || item.project.created_at).getTime();
}

export function mergeCreativeFeed(posts = [], projects = []) {
  return [
    ...posts.map((post) => ({ kind: 'post', id: `post-${post.id}`, post })),
    ...projects.map((project) => ({ kind: 'project', id: `project-${project.id}`, project })),
  ].sort((a, b) => publishedTime(b) - publishedTime(a));
}

export default function CreativeFeed({ posts = [], projects = [], filter = 'all', onFilterChange, creativeOwner = false, moderator = false, onModeratePost, onModerateProject }) {
  const items = mergeCreativeFeed(posts, projects).filter((item) => filter === 'all' || (filter === 'posts' ? item.kind === 'post' : item.kind === 'project'));
  return <section aria-labelledby="creative-feed-heading" className="ll-feed-shell">
    <div className="ll-feed-heading">
      <div><p className="ll-kicker"><Newspaper size={14} /> Latest from the network</p><h2 id="creative-feed-heading">Creative feed</h2></div>
      <div className="ll-feed-filters" role="group" aria-label="Filter feed">
        {[['all', 'All', LayoutGrid], ['posts', 'Posts', PenLine], ['projects', 'Projects', BriefcaseBusiness]].map(([value, label, Icon]) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => onFilterChange?.(value)}><Icon size={15} /> {label}</button>)}
      </div>
    </div>
    {creativeOwner && <Link to="/create" className="ll-composer-prompt"><span className="ll-composer-prompt__icon"><PenLine size={19} /></span><span><strong>Share something you made</strong><small>Write, add photos, or document your process.</small></span><ArrowRight size={18} /></Link>}
    {items.length ? <div className="ll-feed-list">{items.map((item) => item.kind === 'post'
      ? <CreativePostCard key={item.id} post={item.post} creative={item.post.creative_members} moderator={moderator} onModerate={onModeratePost} feed />
      : <ProjectFeedItem key={item.id} project={item.project} moderator={moderator} onModerate={onModerateProject} />)}</div>
      : <EmptyState title="The feed is ready for its first story" message="Published Creative posts and formal projects will appear here in chronological order." />}
  </section>;
}

function ProjectFeedItem({ project, moderator, onModerate }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const author = project.credits?.find((credit) => credit.isPrimary) || project.credits?.[0];
  return <article className="ll-project-feed-item">
    <header className="ll-post-card__header ll-project-author-header">
      {author ? <Link to={`/creatives/${author.slug}`} className="ll-author-link">{author.profileImageUrl ? <img src={author.profileImageUrl} alt=""/> : <span>{author.name?.slice(0,1) || 'C'}</span>}<span><strong>{author.name}</strong><small>Published a formal project</small></span></Link> : <div className="ll-project-feed-label"><ImageIcon size={15}/><span>Lahat Liwa project</span></div>}
      {moderator && <button type="button" className="ll-feed-moderate-button" onClick={()=>setOpen(true)} aria-label="Project moderation"><Ellipsis size={20}/></button>}
    </header>
    <ProjectFeedCard project={project} author={author} />
    {open && <div className="ll-moderation-dialog" role="dialog" aria-modal="true" aria-label="Remove project from public"><button type="button" className="ll-moderation-dialog__scrim" onClick={()=>setOpen(false)} aria-label="Close"/><section><header><div><p className="ll-kicker">Super Admin moderation</p><h3>Remove this project?</h3></div><button type="button" onClick={()=>setOpen(false)} aria-label="Close"><X size={19}/></button></header><p>The Creative will see your note and can revise the project before publishing it again.</p><textarea rows={4} value={note} onChange={(event)=>setNote(event.target.value)} placeholder="Add a clear note (at least 8 characters)"/><footer><button type="button" onClick={()=>setOpen(false)}>Cancel</button><button type="button" className="is-danger" disabled={note.trim().length<8} onClick={()=>{onModerate?.(project,note.trim());setOpen(false);}}><ShieldAlert size={15}/> Remove with note</button></footer></section></div>}
  </article>;
}
