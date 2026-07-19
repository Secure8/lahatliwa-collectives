import clsx from 'clsx';
import { AlertTriangle, Info, Lightbulb } from 'lucide-react';
import { validateEditorialDocument } from './editorialDocument.js';

export default function EditorialDocumentRenderer({ document, mode = 'public', className = '' }) {
  const { document: safe } = validateEditorialDocument(document);
  return (
    <div data-editorial-renderer data-render-mode={mode} className={clsx('editorial-document mx-auto max-w-3xl space-y-7', className)}>
      {safe.blocks.map((block) => <EditorialBlock key={block.id} block={block} mode={mode} />)}
    </div>
  );
}

function EditorialBlock({ block, mode }) {
  if (block.type === 'paragraph') return <p className="text-base leading-8 text-[var(--site-secondary-text)] sm:text-lg">{block.text}</p>;
  if (block.type === 'heading') {
    const Tag = `h${block.level}`;
    return <Tag className={clsx('font-semibold tracking-tight text-[var(--site-primary-text)]', block.level === 2 ? 'pt-5 text-3xl' : block.level === 3 ? 'pt-3 text-2xl' : 'text-xl')}>{block.text}</Tag>;
  }
  if (block.type === 'quote') return <figure className="border-l-2 border-[var(--site-accent)] pl-5"><blockquote className="text-xl leading-8 text-[var(--site-primary-text)]">{block.text}</blockquote>{block.attribution && <figcaption className="mt-3 text-sm text-[var(--site-secondary-text)]">— {block.attribution}</figcaption>}</figure>;
  if (block.type === 'image') return <figure><img src={block.url} alt={block.alt} loading="lazy" decoding="async" className="w-full rounded-xl object-cover" />{block.caption && <figcaption className="mt-2 text-sm text-[var(--site-secondary-text)]">{block.caption}</figcaption>}</figure>;
  if (block.type === 'gallery') return <div className="grid gap-3 sm:grid-cols-2">{block.images.map((image) => <figure key={image.url}><img src={image.url} alt={image.alt} loading="lazy" decoding="async" className="aspect-[4/3] w-full rounded-lg object-cover" />{image.caption && <figcaption className="mt-2 text-xs text-[var(--site-secondary-text)]">{image.caption}</figcaption>}</figure>)}</div>;
  if (block.type === 'facts') return <dl className="grid gap-px overflow-hidden rounded-xl border border-white/[0.1] bg-white/[0.1] sm:grid-cols-2">{block.items.map((item) => <div key={`${item.label}-${item.value}`} className="bg-zinc-950/70 p-4"><dt className="text-xs uppercase tracking-[0.16em] text-[var(--site-accent-text)]">{item.label}</dt><dd className="mt-2 text-sm leading-6 text-[var(--site-primary-text)]">{item.value}</dd></div>)}</dl>;
  if (block.type === 'callout') {
    const Icon = block.tone === 'warning' ? AlertTriangle : block.tone === 'tip' ? Lightbulb : Info;
    return <aside className="rounded-xl border border-[var(--site-accent-border)] bg-[var(--site-accent-surface)] p-5"><div className="flex gap-3"><Icon className="mt-0.5 shrink-0 text-[var(--site-accent-text)]" size={20} /><div><h3 className="font-semibold text-[var(--site-primary-text)]">{block.title || (block.tone === 'tip' ? 'Tip' : 'Note')}</h3><p className="mt-2 text-sm leading-6 text-[var(--site-secondary-text)]">{block.text}</p>{block.linkUrl && <a href={block.linkUrl} className="mt-3 inline-block text-sm font-semibold text-[var(--site-accent-text)]">{block.linkLabel || 'Learn more'}</a>}</div></div></aside>;
  }
  return <hr className={clsx('border-white/[0.1]', mode === 'edit' && 'border-dashed')} />;
}
