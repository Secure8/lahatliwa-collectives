import { ArrowRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { contentTypeMeta, listTourismHomepageSections } from '../../features/editorial/editorialApi.js';
import { useEditorialFlags } from '../../features/editorial/editorialFlags.js';

export default function TourismHomepageSections() {
  const { flags, loading: flagsLoading } = useEditorialFlags();
  const [sections, setSections] = useState([]);
  useEffect(() => {
    if (flagsLoading || !flags.homepageTourismEnabled) return undefined;
    let active = true;
    listTourismHomepageSections().then((rows) => { if (active) setSections(rows); }).catch(() => { if (active) setSections([]); });
    return () => { active = false; };
  }, [flags.homepageTourismEnabled, flagsLoading]);
  if (flagsLoading || !flags.homepageTourismEnabled || !sections.length) return null;
  return <div data-tourism-homepage-sections>{sections.map((section) => <section key={section.id} className="page-shell py-16" aria-labelledby={`tourism-home-${section.id}`}><div className="mb-8 max-w-2xl"><p className="text-xs uppercase tracking-[0.22em] text-[var(--site-accent-text)]">Explore Aklan</p><h2 id={`tourism-home-${section.id}`} className="mt-3 text-3xl font-semibold text-[var(--site-primary-text)]">{section.heading}</h2>{section.description && <p className="mt-4 leading-7 text-[var(--site-secondary-text)]">{section.description}</p>}</div><div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{section.editorial_homepage_items.map((item) => { const post = item.editorial_posts; const meta = contentTypeMeta(post.content_type); return <article key={item.id} className="overflow-hidden rounded-xl border border-white/[0.09] bg-white/[0.025]">{post.cover_image_url && <img src={post.cover_image_url} alt={post.cover_image_alt || ''} loading="lazy" decoding="async" className="aspect-[16/10] w-full object-cover" />}<div className="p-5"><p className="text-xs uppercase tracking-[0.16em] text-[var(--site-accent-text)]">{item.label || meta.label}</p><h3 className="mt-2 text-xl font-semibold text-[var(--site-primary-text)]">{post.title}</h3>{post.summary && <p className="mt-2 line-clamp-3 text-sm leading-6 text-[var(--site-secondary-text)]">{post.summary}</p>}<Link to={`${meta.path}/${post.slug}`} className="fine-link mt-4 inline-flex min-h-11 items-center gap-2 text-sm text-[var(--site-primary-text)]">Read <ArrowRight size={15} /></Link></div></article>; })}</div></section>)}</div>;
}
