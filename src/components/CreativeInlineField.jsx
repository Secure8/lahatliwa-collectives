import { Check, LoaderCircle, X } from 'lucide-react';
import { createElement, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CREATIVE_SHORT_BIO_MAX_LENGTH, creativeDisciplineError, normalizeCreativeDisciplines } from '../lib/creativeProfile';
import { supabase } from '../lib/supabaseClient';

const lineList = (value) => String(value || '').split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
const lines = (value) => Array.isArray(value) ? value.join('\n') : String(value || '');

function editorPosition(element) {
  const rect = element?.getBoundingClientRect();
  const width = Math.min(360, window.innerWidth - 24);
  if (!rect) return { width, left: 12, top: 12 };
  const left = Math.min(Math.max(12, rect.left), window.innerWidth - width - 12);
  const below = rect.bottom + 8;
  return { width, left, top: below + 230 < window.innerHeight ? below : Math.max(12, rect.top - 238) };
}

export default function CreativeInlineField({
  creative, owner = false, field, value = '', label = 'Edit profile detail', type = 'text',
  as = 'span', children, className = '', style, options = [], maxLength, onSaved, ...props
}) {
  const targetRef = useRef(null);
  const inputRef = useRef(null);
  const editorId = useId();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(type === 'list' ? lines(value) : String(value ?? ''));
  const [position, setPosition] = useState({ width: 360, left: 12, top: 12 });
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) setDraft(type === 'list' ? lines(value) : String(value ?? ''));
  }, [open, type, value]);
  useEffect(() => {
    if (!open) return undefined;
    const place = () => setPosition(editorPosition(targetRef.current));
    place(); inputRef.current?.focus(); inputRef.current?.select?.();
    const close = (event) => { if (event.key === 'Escape' && !working) setOpen(false); };
    window.addEventListener('resize', place); window.addEventListener('scroll', place, true); window.addEventListener('keydown', close);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); window.removeEventListener('keydown', close); };
  }, [open, working]);

  async function save(event) {
    event.preventDefault();
    if (working) return;
    setWorking(true); setError('');
    try {
      let nextValue = type === 'list' ? lineList(draft) : draft.trim();
      if (field === 'skills') {
        nextValue = normalizeCreativeDisciplines(nextValue);
        const disciplineError = creativeDisciplineError(nextValue);
        if (disciplineError) throw new Error(disciplineError);
      }
      if (field === 'short_bio' && nextValue.length > CREATIVE_SHORT_BIO_MAX_LENGTH) throw new Error(`Keep the short bio within ${CREATIVE_SHORT_BIO_MAX_LENGTH} characters.`);
      if (['name', 'role'].includes(field) && !nextValue) throw new Error(`${label.replace(/^Edit /, '')} is required.`);
      const payload = field.startsWith('professional_details.')
        ? { professional_details: { ...(creative.professional_details || {}), [field.split('.')[1]]: nextValue } }
        : { [field]: nextValue || null };
      const { data, error: updateError } = await supabase.from('creative_members').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', creative.id).select('*').single();
      if (updateError) throw updateError;
      onSaved?.(data); setOpen(false);
    } catch (saveError) { setError(saveError?.message || 'This profile detail could not be saved.'); }
    finally { setWorking(false); }
  }

  const content = children ?? value;
  const editableProps = owner ? {
    ...props, ref: targetRef, className: `ll-creative-inline-field ${open ? 'is-editing' : ''} ${className}`.trim(), style,
    role: 'button', tabIndex: 0, title: label, 'aria-controls': open ? editorId : undefined, 'aria-expanded': open,
    onClick: (event) => { event.preventDefault(); event.stopPropagation(); setDraft(type === 'list' ? lines(value) : String(value ?? '')); setError(''); setOpen(true); },
    onKeyDown: (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setOpen(true); } },
  } : { ...props, className, style };

  return <>
    {createElement(as, editableProps, content)}
    {owner && open && createPortal(<div id={editorId} className="ll-creative-inline-popover" style={position} role="dialog" aria-label={label} onClick={(event) => event.stopPropagation()}>
      <form onSubmit={save}>
        <header><strong>{label}</strong><button type="button" onClick={() => setOpen(false)} disabled={working} aria-label="Cancel editing"><X size={16}/></button></header>
        {type === 'select' ? <select ref={inputRef} value={draft} onChange={(event) => setDraft(event.target.value)}>{options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}</select>
          : ['textarea', 'list'].includes(type) ? <textarea ref={inputRef} rows={type === 'list' ? 5 : 4} value={draft} maxLength={maxLength} onChange={(event) => setDraft(event.target.value)}/>
            : <input ref={inputRef} value={draft} maxLength={maxLength} onChange={(event) => setDraft(event.target.value)}/>}
        {type === 'list' && <small>Use one item per line.</small>}
        {error && <p role="alert">{error}</p>}
        <footer><button type="button" onClick={() => setOpen(false)} disabled={working}>Cancel</button><button type="submit" disabled={working}>{working ? <LoaderCircle className="animate-spin" size={15}/> : <Check size={15}/>}Save</button></footer>
      </form>
    </div>, document.body)}
  </>;
}
