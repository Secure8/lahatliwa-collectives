import { ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function FeaturedWorkGallery({ items = [], variant = 'rail' }) {
  if (!items.length) return null;
  return <section className={`ll-featured-work ll-featured-work--${variant}`} aria-label="Featured work">
    <header><p className="ll-kicker">Selected by Liwa</p><h2>Featured work</h2></header>
    <div className="ll-featured-work__grid">
      {items.map(({ id, post, media }) => <Link key={id} to={`/work/${post.slug}`} className="ll-featured-work__item">
        <img src={media.thumbnail_url || media.display_url || media.expanded_url} alt={media.alt_text || post.title || ''} loading="lazy" />
        <span><strong>{post.title || 'Untitled work'}</strong><small>{post.creative_members?.name}</small></span>
        <ArrowUpRight size={14} aria-hidden="true" />
      </Link>)}
    </div>
  </section>;
}
