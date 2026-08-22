import { Check, ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { groupWorkTaxonomy } from '../lib/workTaxonomy';

const taxonomyKinds = ['discipline', 'specialty', 'industry'];

function TaxonomyDropdown({ kind, terms, selectedIds, open, onOpen, onToggle, onClear }) {
  const label = `${kind.slice(0, 1).toUpperCase()}${kind.slice(1)}`;
  const selected = terms.filter((term) => selectedIds.includes(term.id));
  const summary = selected.length === 0
    ? `Choose ${kind}`
    : selected.length === 1
      ? selected[0].name
      : `${selected.length} selected`;
  const menuId = `work-taxonomy-${kind}-menu`;

  return <div className={`ll-taxonomy-dropdown${open ? ' is-open' : ''}`}>
    <button type="button" className="ll-taxonomy-trigger" aria-expanded={open} aria-controls={menuId} onClick={onOpen}>
      <span className="ll-taxonomy-trigger-copy"><small>{label}</small><strong>{summary}</strong></span>
      <span className="ll-taxonomy-trigger-meta">
        {selected.length > 0 && <span className="ll-taxonomy-count" aria-label={`${selected.length} selected`}>{selected.length}</span>}
        <ChevronDown size={18} aria-hidden="true" />
      </span>
    </button>
    {open && <div id={menuId} className="ll-taxonomy-menu" role="group" aria-label={`${label} options`}>
      <header><strong>{label}</strong>{selected.length > 0 && <button type="button" onClick={onClear}>Clear</button>}</header>
      <div className="ll-taxonomy-menu-options">
        {terms.map((term) => {
          const checked = selectedIds.includes(term.id);
          const inputId = `work-taxonomy-${kind}-${term.id}`;
          return <label className={`ll-taxonomy-menu-option${checked ? ' is-selected' : ''}`} key={term.id} htmlFor={inputId}>
            <input id={inputId} className="sr-only" type="checkbox" checked={checked} onChange={() => onToggle(term.id)} />
            <span className="ll-taxonomy-check" aria-hidden="true">{checked && <Check size={14} />}</span>
            <span>{term.name}</span>
          </label>;
        })}
      </div>
    </div>}
  </div>;
}

export default function WorkTaxonomyDropdowns({ terms, selectedIds, onChange }) {
  const [openKind, setOpenKind] = useState('');
  const rootRef = useRef(null);
  const grouped = groupWorkTaxonomy(terms);

  useEffect(() => {
    if (!openKind) return undefined;
    const closeDropdown = (event) => {
      if (event.type === 'keydown') {
        if (event.key === 'Escape') setOpenKind('');
        return;
      }
      if (!rootRef.current?.contains(event.target)) setOpenKind('');
    };
    globalThis.document.addEventListener('pointerdown', closeDropdown);
    globalThis.document.addEventListener('keydown', closeDropdown);
    return () => {
      globalThis.document.removeEventListener('pointerdown', closeDropdown);
      globalThis.document.removeEventListener('keydown', closeDropdown);
    };
  }, [openKind]);

  const toggle = (termId) => onChange(selectedIds.includes(termId)
    ? selectedIds.filter((id) => id !== termId)
    : [...selectedIds, termId]);
  const clear = (kindTerms) => {
    const removedIds = new Set(kindTerms.map((term) => term.id));
    onChange(selectedIds.filter((termId) => !removedIds.has(termId)));
  };

  return <div className="ll-work-taxonomy-dropdowns" ref={rootRef}>
    {taxonomyKinds.map((kind) => <TaxonomyDropdown
      key={kind}
      kind={kind}
      terms={grouped[kind] || []}
      selectedIds={selectedIds}
      open={openKind === kind}
      onOpen={() => setOpenKind((current) => current === kind ? '' : kind)}
      onToggle={toggle}
      onClear={() => clear(grouped[kind] || [])}
    />)}
  </div>;
}
