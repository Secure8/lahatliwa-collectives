import clsx from 'clsx';
import { AlertTriangle, Info, Lightbulb } from 'lucide-react';
import { validateEditorialDocument } from './editorialDocument.js';

export default function EditorialDocumentRenderer({ document, mode = 'public', className = '' }) {
  const { document: safe } = validateEditorialDocument(document);
  return (
    <div data-editorial-renderer data-render-mode={mode} className={clsx('editorial-document mx-auto max-w-3xl space-y-7', className)}>
      {safe.blocks.filter((block) => !block.hidden).map((block) => <EditorialBlock key={block.id} block={block} mode={mode} />)}
    </div>
  );
}

function blockLayout(block) {
  return clsx(
    block.width === 'narrow' && 'mx-auto max-w-2xl',
    block.width === 'wide' && 'relative left-1/2 w-[min(92vw,64rem)] -translate-x-1/2',
    block.width === 'full' && 'relative left-1/2 w-screen -translate-x-1/2 px-4 sm:px-8',
    block.spacing === 'compact' && '!my-3',
    block.spacing === 'relaxed' && '!my-12',
    block.background === 'soft' && 'rounded-2xl bg-white/[0.04] p-5 sm:p-7',
    block.background === 'accent' && 'rounded-2xl border border-[var(--site-accent-border)] bg-[var(--site-accent-surface)] p-5 sm:p-7',
    block.align === 'center' && 'text-center',
    block.align === 'right' && 'text-right',
  );
}

function EditorialBlock({ block, mode }) {
  const layout = blockLayout(block);
  const text = block.linkUrl ? <a href={block.linkUrl} className="underline decoration-[var(--site-accent)] underline-offset-4">{block.text}</a> : block.text;
  if (block.type === 'paragraph') return <p className={clsx('text-base leading-8 text-[var(--site-secondary-text)] sm:text-lg', block.emphasis === 'strong' && 'font-semibold text-[var(--site-primary-text)]', block.emphasis === 'subtle' && 'text-sm opacity-80 sm:text-base', layout)}>{text}</p>;
  if (block.type === 'heading') {
    const Tag = `h${block.level}`;
    return <Tag className={clsx('font-semibold tracking-tight text-[var(--site-primary-text)]', block.level === 2 ? 'pt-5 text-3xl' : block.level === 3 ? 'pt-3 text-2xl' : 'text-xl', layout)}>{text}</Tag>;
  }
  if (block.type === 'quote') return <figure className={clsx('border-l-2 border-[var(--site-accent)] pl-5', layout)}><blockquote className="text-xl leading-8 text-[var(--site-primary-text)]">{block.text}</blockquote>{block.attribution && <figcaption className="mt-3 text-sm text-[var(--site-secondary-text)]">— {block.attribution}</figcaption>}</figure>;
  if (block.type === 'image') return !block.url ? (mode === 'public' ? null : <div className={clsx('grid min-h-48 place-items-center rounded-xl border border-dashed border-white/[0.12] text-sm text-zinc-500', layout)}>Image placeholder</div>) : <figure className={layout}><img src={block.url} alt={block.alt} loading="lazy" decoding="async" className={clsx('w-full rounded-xl', block.fit === 'contain' ? 'object-contain' : 'object-cover', block.aspectRatio === 'square' && 'aspect-square', block.aspectRatio === 'portrait' && 'aspect-[3/4]', block.aspectRatio === 'landscape' && 'aspect-[16/9]', block.imageAlign === 'left' && 'mr-auto', block.imageAlign === 'right' && 'ml-auto')} />{block.caption && <figcaption className="mt-2 text-sm text-[var(--site-secondary-text)]">{block.caption}</figcaption>}</figure>;
  if (block.type === 'gallery') {
    const images = block.images.filter((image) => image.url);
    return !images.length ? (mode === 'public' ? null : <div className={clsx('grid min-h-48 place-items-center rounded-xl border border-dashed border-white/[0.12] text-sm text-zinc-500', layout)}>Gallery placeholder</div>) : <div className={clsx('grid gap-3 sm:grid-cols-2', layout)}>{images.map((image) => <figure key={image.url}><img src={image.url} alt={image.alt} loading="lazy" decoding="async" className={clsx('w-full rounded-lg', block.fit === 'contain' ? 'object-contain' : 'object-cover', block.aspectRatio === 'square' ? 'aspect-square' : block.aspectRatio === 'portrait' ? 'aspect-[3/4]' : 'aspect-[4/3]')} />{image.caption && <figcaption className="mt-2 text-xs text-[var(--site-secondary-text)]">{image.caption}</figcaption>}</figure>)}</div>;
  }
  if (block.type === 'facts') return <dl className={clsx('grid gap-px overflow-hidden rounded-xl border border-white/[0.1] bg-white/[0.1] sm:grid-cols-2', layout)}>{block.items.map((item) => <div key={`${item.label}-${item.value}`} className="bg-zinc-950/70 p-4"><dt className="text-xs uppercase tracking-[0.16em] text-[var(--site-accent-text)]">{item.label}</dt><dd className="mt-2 text-sm leading-6 text-[var(--site-primary-text)]">{item.value}</dd></div>)}</dl>;
  if (block.type === 'callout') {
    const Icon = block.tone === 'warning' ? AlertTriangle : block.tone === 'tip' ? Lightbulb : Info;
    return <aside className={clsx('rounded-xl border border-[var(--site-accent-border)] bg-[var(--site-accent-surface)] p-5', layout)}><div className="flex gap-3"><Icon className="mt-0.5 shrink-0 text-[var(--site-accent-text)]" size={20} /><div><h3 className="font-semibold text-[var(--site-primary-text)]">{block.title || (block.tone === 'tip' ? 'Tip' : 'Note')}</h3><p className="mt-2 text-sm leading-6 text-[var(--site-secondary-text)]">{block.text}</p>{block.linkUrl && <a href={block.linkUrl} className="mt-3 inline-block text-sm font-semibold text-[var(--site-accent-text)]">{block.linkLabel || 'Learn more'}</a>}</div></div></aside>;
  }
  return <hr className={clsx('border-white/[0.1]', mode === 'edit' && 'border-dashed', layout)} />;
}
