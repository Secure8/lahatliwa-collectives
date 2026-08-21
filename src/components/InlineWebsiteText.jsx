import { Check, LoaderCircle, Pencil, X } from 'lucide-react';
import { createElement, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import usePublicAccount from '../lib/usePublicAccount';
import { fetchWebsiteStudioEntries, liveWebsiteFieldValue, publishWebsiteEntry, saveWebsiteDraft } from '../lib/websiteStudio';

function editorPosition(element) {
  const rect = element?.getBoundingClientRect();
  const width = Math.min(360, window.innerWidth - 24);
  if (!rect) return { width, left: 12, top: 12 };
  const left = Math.min(Math.max(12, rect.left), window.innerWidth - width - 12);
  const below = rect.bottom + 8;
  const top = below + 210 < window.innerHeight ? below : Math.max(12, rect.top - 218);
  return { width, left, top };
}

export default function InlineWebsiteText({ as = 'span', section, field, type = 'text', label = 'Edit text', value = '', children, className = '', style, ...props }) {
  const { account } = usePublicAccount();
  const desktop = typeof window === 'undefined' || window.matchMedia('(min-width: 1024px)').matches;
  const editable = account?.role === 'super_admin' && desktop && Boolean(section && field);
  const targetRef = useRef(null);
  const inputRef = useRef(null);
  const editorId = useId();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(String(value ?? ''));
  const [position, setPosition] = useState({ width: 360, left: 12, top: 12 });
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { if (!open) setDraft(String(value ?? '')); }, [open, value]);
  useEffect(() => {
    if (!open) return undefined;
    const place = () => setPosition(editorPosition(targetRef.current));
    place();
    inputRef.current?.focus();
    inputRef.current?.select();
    const closeOnEscape = (event) => { if (event.key === 'Escape' && !working) setOpen(false); };
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    window.addEventListener('keydown', closeOnEscape);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); window.removeEventListener('keydown', closeOnEscape); };
  }, [open, working]);

  async function publish(event) {
    event.preventDefault();
    if (working) return;
    setWorking(true); setError('');
    try {
      const safeValue = liveWebsiteFieldValue(draft, type);
      const entries = await fetchWebsiteStudioEntries();
      const entry = entries.find((item) => item.entry_key === section);
      if (!entry) throw new Error('This website section is not available for editing yet.');
      const nextData = { ...(entry.draft_data || entry.published_data || {}), [field]: safeValue };
      await saveWebsiteDraft(section, nextData);
      await publishWebsiteEntry(section);
      setOpen(false);
    } catch (saveError) {
      setError(saveError?.message || 'This text could not be published.');
    } finally { setWorking(false); }
  }

  const content = children ?? value;
  const elementProps = editable ? {
    ...props,
    ref: targetRef,
    className: `ll-live-edit-text ${open ? 'is-editing' : ''} ${className}`.trim(),
    style,
    role: 'button',
    tabIndex: 0,
    title: label,
    'aria-controls': open ? editorId : undefined,
    'aria-expanded': open,
    onClick: (event) => { event.preventDefault(); event.stopPropagation(); setDraft(String(value ?? '')); setError(''); setOpen(true); },
    onKeyDown: (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setOpen(true); } },
  } : { ...props, className, style };

  return <>
    {createElement(as, elementProps, content)}
    {editable && open && createPortal(<div id={editorId} className="ll-live-edit-popover" style={position} role="dialog" aria-label={label} onClick={(event) => event.stopPropagation()}>
      <form onSubmit={publish}>
        <header><span><Pencil size={14}/>{label}</span><button type="button" onClick={() => setOpen(false)} disabled={working} aria-label="Cancel editing"><X size={16}/></button></header>
        {type === 'textarea'
          ? <textarea ref={inputRef} rows={4} value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={4000}/>
          : <input ref={inputRef} type="text" value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={500}/>
        }
        {error && <p role="alert">{error}</p>}
        <footer><button type="button" onClick={() => setOpen(false)} disabled={working}>Cancel</button><button type="submit" className="is-primary" disabled={working || !draft.trim()}>{working ? <LoaderCircle className="animate-spin" size={15}/> : <Check size={15}/>} {working ? 'Publishing' : 'Publish'}</button></footer>
      </form>
    </div>, document.body)}
  </>;
}
