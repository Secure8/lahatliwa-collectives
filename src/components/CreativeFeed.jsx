import { ArrowRight, BriefcaseBusiness, Image as ImageIcon, LayoutGrid, Newspaper, PenLine } from 'lucide-react';
import { Link } from 'react-router-dom';
import CreativePostCard from './CreativePostCard';
import EmptyState from './EmptyState';
import ProjectCard from './ProjectCard';

function publishedTime(item) {
  return new Date(item.kind === 'post' ? item.post.published_at || item.post.updated_at : item.project.project_date || item.project.created_at).getTime();
}

export function mergeCreativeFeed(posts = [], projects = []) {
  return [
    ...posts.map((post) => ({ kind: 'post', id: `post-${post.id}`, post })),
    ...projects.map((project) => ({ kind: 'project', id: `project-${project.id}`, project })),
  ].sort((a, b) => publishedTime(b) - publishedTime(a));
}

export default function CreativeFeed({ posts = [], projects = [], filter = 'all', onFilterChange, creativeOwner = false }) {
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
      ? <CreativePostCard key={item.id} post={item.post} creative={item.post.creative_members} feed />
      : <article key={item.id} className="ll-project-feed-item"><div className="ll-project-feed-label"><ImageIcon size={15} /><span>Formal project</span></div><ProjectCard project={item.project} /></article>)}</div>
      : <EmptyState title="The feed is ready for its first story" message="Published Creative posts and formal projects will appear here in chronological order." />}
  </section>;
}
