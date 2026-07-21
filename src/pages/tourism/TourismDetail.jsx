import { ArrowLeft, CalendarDays, MapPin } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import LoadingState from '../../components/LoadingState.jsx';
import NotFound from '../NotFound.jsx';
import { PublicEditorialGate } from '../../features/editorial/EditorialGate.jsx';
import EditorialDocumentRenderer from '../../features/editorial/EditorialDocumentRenderer.jsx';
import { contentTypeMeta, getPublishedEditorial } from '../../features/editorial/editorialApi.js';
import { applyPublicMetadata } from '../../lib/publicMetadata.js';
import { useEditorialFlags } from '../../features/editorial/editorialFlags.js';
import { contextualInquiryUrl } from '../../lib/inquiryContext.js';

export default function TourismDetail({ type }) {
  return <PublicEditorialGate><TourismDetailContent type={type} /></PublicEditorialGate>;
}

function TourismDetailContent({ type }) {
  const { slug } = useParams();
  const [state, setState] = useState({ loading: true, post: null });
  const { flags } = useEditorialFlags();
  useEffect(() => {
    let active = true;
    getPublishedEditorial(type, slug).then((post) => { if (active) setState({ loading: false, post }); }).catch(() => { if (active) setState({ loading: false, post: null }); });
    return () => { active = false; };
  }, [slug, type]);
  useEffect(() => {
    if (!state.post) return;
    applyPublicMetadata({ title: state.post.revision?.seo_title || `${state.post.title} | Aklan Tourism`, description: state.post.revision?.seo_description || state.post.summary, pathname: `${contentTypeMeta(type).path}/${slug}`, type: 'article', image: state.post.cover_image_url || undefined });
  }, [slug, state.post, type]);
  if (state.loading) return <div className="page-shell py-20"><LoadingState label="Loading story" /></div>;
  if (!state.post) return <NotFound />;
  const post = state.post; const meta = contentTypeMeta(type);
  return <article className="min-h-screen bg-zinc-950 pb-20 text-zinc-100">
    <header className="page-shell pb-10 pt-12 sm:pt-16"><Link to={meta.path} className="inline-flex min-h-11 items-center gap-2 text-sm text-zinc-400 hover:text-[var(--site-accent-text)]"><ArrowLeft size={17} />{meta.plural}</Link><p className="mt-8 text-xs uppercase tracking-[0.2em] text-[var(--site-accent-text)]">{meta.label}{post.editorial_categories?.name ? ` · ${post.editorial_categories.name}` : ''}</p><h1 className="mt-4 max-w-5xl text-4xl font-semibold leading-tight tracking-tight text-[var(--site-primary-text)] sm:text-6xl">{post.title}</h1><p className="mt-5 max-w-3xl text-lg leading-8 text-[var(--site-secondary-text)]">{post.summary}</p><div className="mt-6 flex flex-wrap gap-4 text-sm text-zinc-500">{post.editorial_municipalities?.name && <span className="inline-flex items-center gap-2"><MapPin size={15} />{post.editorial_municipalities.name}</span>}{post.published_at && <time className="inline-flex items-center gap-2" dateTime={post.published_at}><CalendarDays size={15} />{new Intl.DateTimeFormat('en-PH', { dateStyle: 'long' }).format(new Date(post.published_at))}</time>}</div></header>
    {post.cover_image_url && <div className="page-shell"><img src={post.cover_image_url} alt={post.cover_image_alt || ''} className="max-h-[44rem] w-full rounded-2xl object-cover" /></div>}
    {post.details && <DetailsPanel type={type} details={post.details} />}
    <EditorialDocumentRenderer document={post.revision?.document} className="page-shell mt-12" />
    {post.editorial_contributors && <section className="page-shell mt-14"><div className="mx-auto max-w-3xl border-t border-white/[0.1] pt-6"><p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Contributor</p><p className="mt-2 font-semibold text-[var(--site-primary-text)]">{post.editorial_contributors.display_name}</p>{post.editorial_contributors.bio && <p className="mt-2 text-sm leading-6 text-[var(--site-secondary-text)]">{post.editorial_contributors.bio}</p>}</div></section>}
    {post.editorial_corrections?.length > 0 && <section className="page-shell mt-10"><div className="mx-auto max-w-3xl rounded-xl border border-white/[0.1] p-5"><h2 className="font-semibold">Corrections</h2>{post.editorial_corrections.map((item) => <p key={item.id} className="mt-2 text-sm leading-6 text-zinc-400">{item.summary}</p>)}</div></section>}
    {post.editorial_sources?.length > 0 && <section className="page-shell mt-10"><div className="mx-auto max-w-3xl border-t border-white/[0.1] pt-6"><h2 className="font-semibold">Sources</h2><ul className="mt-3 grid gap-2 text-sm">{post.editorial_sources.map((source) => <li key={source.id}>{source.source_url ? <a href={source.source_url} target="_blank" rel="noreferrer" className="fine-link text-[var(--site-secondary-text)] hover:text-[var(--site-accent-text)]">{source.source_name}</a> : <span className="text-[var(--site-secondary-text)]">{source.source_name}</span>}</li>)}</ul></div></section>}
    {flags.publicInquiriesEnabled && <section className="page-shell mt-12"><div className="mx-auto max-w-3xl border-t border-white/[0.1] pt-7"><h2 className="text-xl font-semibold">Ask about this {meta.label.toLowerCase()}</h2><p className="mt-2 text-sm text-zinc-400">Send an inquiry with this published page already attached as context.</p><Link to={contextualInquiryUrl({ context: { id: post.id, type, slug, title: post.title, publicUrl: `${meta.path}/${slug}`, municipality: post.editorial_municipalities?.name || '', sourceAction: 'editorial-detail-inquiry' } })} className="mt-5 inline-flex min-h-11 items-center bg-[var(--site-accent)] px-5 text-sm font-semibold text-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">Ask a Question</Link></div></section>}
  </article>;
}

function DetailsPanel({ type, details }) {
  const items = type === 'event' ? [['Status', details.event_status], ['Starts', details.starts_at && new Intl.DateTimeFormat('en-PH', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(details.starts_at))], ['Venue', details.venue_name], ['Location', details.location_text], ['Organizer', details.organizer], ['Contact', details.official_contact], ['Admission', details.price_note]] : type === 'place' ? [['Type', details.place_type], ['Address', details.address_text], ['Hours', details.opening_hours_note], ['Contact', details.contact_note], ['Accessibility', details.accessibility_note], ['Verification', details.verification_status]] : type === 'activity' ? [['Type', details.activity_type], ['Availability', details.availability_note], ['Duration', details.duration_note], ['Difficulty', details.difficulty], ['Meeting point', details.meeting_point], ['Contact', details.contact_note], ['Safety', details.safety_note], ['Verification', details.verification_status]] : [['Type', details.product_type], ['Maker', details.maker_name], ['Where to buy', details.purchase_location], ['Contact', details.contact_note], ['Price', details.price_note], ['Verification', details.verification_status]];
  return <section className="page-shell mt-8"><dl className="mx-auto grid max-w-3xl gap-px overflow-hidden rounded-xl border border-white/[0.1] bg-white/[0.1] sm:grid-cols-2">{items.filter(([, value]) => value).map(([label, value]) => <div key={label} className="bg-zinc-950 p-4"><dt className="text-xs uppercase tracking-[0.16em] text-[var(--site-accent-text)]">{label}</dt><dd className="mt-2 text-sm leading-6 text-zinc-200">{value}</dd></div>)}</dl></section>;
}
