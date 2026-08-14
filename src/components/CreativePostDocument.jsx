import { safeExternalUrl } from '../lib/externalUrls';
import { normalizeCreativePostDocument, postMediaById } from '../lib/creativePosts';
import CreativePostGallery from './CreativePostGallery';

function RichText({ segments = [] }) {
  return segments.map((segment, index) => {
    let node = segment.text;
    if (segment.marks?.includes('bold')) node = <strong>{node}</strong>;
    if (segment.marks?.includes('italic')) node = <em>{node}</em>;
    const href = safeExternalUrl(segment.href);
    if (href) node = <a href={href} target="_blank" rel="noopener noreferrer" className="text-orange-200 underline decoration-orange-300/40 underline-offset-4 hover:decoration-orange-200">{node}</a>;
    return <span key={`${index}-${segment.text.slice(0, 16)}`}>{node}</span>;
  });
}

export default function CreativePostDocument({ document, media = [] }) {
  const normalized = normalizeCreativePostDocument(document);
  const mediaMap = postMediaById(media);
  return <div className="creative-post-document grid gap-6 text-zinc-200">
    {normalized.blocks.map((block) => {
      if (block.type === 'heading') { const Heading = block.level === 3 ? 'h3' : 'h2'; return <Heading key={block.id} className="text-balance text-2xl font-semibold leading-tight tracking-[-0.025em] text-white sm:text-3xl"><RichText segments={block.content} /></Heading>; }
      if (block.type === 'paragraph') return <p key={block.id} className="whitespace-pre-wrap text-[1.02rem] leading-8 text-zinc-200"><RichText segments={block.content} /></p>;
      if (block.type === 'quote') return <blockquote key={block.id} className="border-l-2 border-orange-300 pl-5 text-xl italic leading-8 text-zinc-100"><RichText segments={block.content} /></blockquote>;
      if (block.type === 'bullet_list') return <ul key={block.id} className="grid list-disc gap-2 pl-6 leading-7">{block.items.map((item, i) => <li key={`${block.id}-${i}`}>{item}</li>)}</ul>;
      if (block.type === 'numbered_list') return <ol key={block.id} className="grid list-decimal gap-2 pl-6 leading-7">{block.items.map((item, i) => <li key={`${block.id}-${i}`}>{item}</li>)}</ol>;
      if (block.type === 'divider') return <hr key={block.id} className="my-2 border-white/10" />;
      if (block.type === 'image_group') return <CreativePostGallery key={block.id} items={block.mediaIds.map((id) => mediaMap.get(id)).filter(Boolean)} />;
      if (block.type === 'external_embed') return <a key={block.id} href={block.url} target="_blank" rel="noopener noreferrer" className="group rounded-xl border border-white/10 bg-white/[0.035] p-5 transition hover:border-orange-300/35"><span className="block text-xs uppercase tracking-[0.16em] text-orange-300">External showcase</span><span className="mt-2 block break-words font-medium text-white group-hover:text-orange-100">{block.label || block.url}</span></a>;
      return null;
    })}
  </div>;
}
