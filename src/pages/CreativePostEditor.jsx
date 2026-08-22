import { ArrowUp, ArrowDown, Bold, Check, Eye, Heading2, ImagePlus, Italic, Link2, List, ListOrdered, Minus, MoreHorizontal, Plus, Quote, Send, Trash2, Underline, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import CreativePostDocument from '../components/CreativePostDocument';
import LoadingState from '../components/LoadingState';
import WorkTaxonomyDropdowns from '../components/WorkTaxonomyDropdowns';
import { applyCreativePostInlineStyle, createCreativePostDraft, createPostBlock, creativePostHasContent, CREATIVE_POST_MAX_IMAGES, emptyCreativePostDocument, loadCreativePostForEdit, moveCreativePostBlock, normalizeCreativePostDocument, normalizeCreativePostLink, publishCreativePost, removeCreativePostMedia, saveCreativePostEditor, updateCreativePostMedia, uploadCreativePostImage } from '../lib/creativePosts';
import { useAdminAccess } from '../lib/adminAccess';
import { supabase } from '../lib/supabaseClient';
import { useAdminConfirmation } from '../components/admin/AdminDialog';
import { loadWorkTaxonomy, normalizeWorkMetadata } from '../lib/workTaxonomy';

async function mapWithConcurrency(items, limit, task) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await task(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

const insertChoices = [
  ['heading', 'Heading', Heading2], ['quote', 'Quote', Quote], ['bullet_list', 'Bulleted list', List],
  ['numbered_list', 'Numbered list', ListOrdered], ['image', 'Image or gallery', ImagePlus], ['divider', 'Divider', Minus], ['external_embed', 'External gallery', Link2],
];

export default function CreativePostEditor({ create = false }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const { adminUser } = useAdminAccess();
  const [post, setPost] = useState(null);
  const [document, setDocument] = useState(null);
  const [media, setMedia] = useState([]);
  const [creative, setCreative] = useState(null);
  const [metadata, setMetadata] = useState({ title: '', summary: '', work_year: new Date().getFullYear(), external_url: '', tags: '' });
  const [taxonomy, setTaxonomy] = useState([]);
  const [termIds, setTermIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('saved');
  const [publishing, setPublishing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(false);
  const [insertOpen, setInsertOpen] = useState(false);
  const [selectedMediaId, setSelectedMediaId] = useState(null);
  const fileRef = useRef(null);
  const uploadAfterIndexRef = useRef(null);
  const revisionRef = useRef(0);
  const savedRevisionRef = useRef(0);
  const savingRef = useRef(false);
  const savePromiseRef = useRef(null);
  const postRef = useRef(null);
  const documentRef = useRef(null);
  const metadataRef = useRef(metadata);
  const termIdsRef = useRef(termIds);
  const { requestConfirmation, confirmationDialog } = useAdminConfirmation();

  useEffect(() => {
    const previousOverflow = globalThis.document.body.style.overflow;
    globalThis.document.body.style.overflow = 'hidden';
    return () => { globalThis.document.body.style.overflow = previousOverflow; };
  }, []);

  useEffect(() => {
    let active = true;
    async function open() {
      try {
        const loaded = create ? { id: null, status: 'draft', document: emptyCreativePostDocument(), creative_post_media: [] } : await loadCreativePostForEdit(id);
        if (!active) return;
        const normalized = normalizeCreativePostDocument(loaded.document);
        setPost(loaded); postRef.current = loaded;
        setDocument(normalized); documentRef.current = normalized;
        setMedia(loaded.creative_post_media || []);
        const nextMetadata = { title: loaded.title || '', summary: loaded.summary || '', work_year: loaded.work_year || new Date().getFullYear(), external_url: loaded.external_url || '', tags: (loaded.tags || []).join(', ') };
        setMetadata(nextMetadata); metadataRef.current = nextMetadata;
        const nextTermIds = (loaded.creative_post_taxonomy || []).map((row) => row.term_id);
        setTermIds(nextTermIds); termIdsRef.current = nextTermIds;
        if (create) setStatus('not_saved');
      } catch (reason) { if (active) setError(reason.message); }
      finally { if (active) setLoading(false); }
    }
    open();
    return () => { active = false; };
  }, [create, id, navigate]);

  useEffect(() => {
    if (!adminUser?.creative_member_id) return;
    supabase.from('creative_members').select('name,slug,profile_image_url').eq('id', adminUser.creative_member_id).single().then(({ data }) => setCreative(data));
  }, [adminUser?.creative_member_id]);

  useEffect(() => { let active = true; loadWorkTaxonomy().then((items) => { if (active) setTaxonomy(items); }).catch(() => null); return () => { active = false; }; }, []);

  const markDirty = useCallback((updater) => {
    setDocument((current) => {
      const next = typeof updater === 'function' ? updater(current) : updater;
      documentRef.current = next;
      revisionRef.current += 1;
      setStatus('unsaved');
      return next;
    });
  }, []);

  const updateMetadata = (key, value) => {
    const next = { ...metadataRef.current, [key]: value };
    metadataRef.current = next; setMetadata(next); revisionRef.current += 1; setStatus('unsaved');
  };
  const updateTermIds = (next) => {
    if (next.length === termIdsRef.current.length && next.every((termId, index) => termId === termIdsRef.current[index])) return;
    termIdsRef.current = next; setTermIds(next); revisionRef.current += 1; setStatus('unsaved');
  };

  const ensureDraft = useCallback(async () => {
    if (postRef.current?.id) return postRef.current;
    const created = await createCreativePostDraft();
    postRef.current = created; setPost(created);
    return created;
  }, []);

  const saveNow = useCallback(async () => {
    if (savingRef.current) {
      const inFlightResult = await savePromiseRef.current;
      if (inFlightResult && savedRevisionRef.current !== revisionRef.current) return saveNow();
      return inFlightResult;
    }
    if (!documentRef.current || savedRevisionRef.current === revisionRef.current) return postRef.current?.id ? postRef.current : null;
    if (!creativePostHasContent(documentRef.current, media) && !metadataRef.current.title.trim()) {
      savedRevisionRef.current = revisionRef.current;
      setStatus('not_saved');
      return null;
    }
    const savingRevision = revisionRef.current;
    const savingDocument = documentRef.current;
    const savingMetadata = normalizeWorkMetadata(metadataRef.current);
    const savingTermIds = [...termIdsRef.current];
    savingRef.current = true; setStatus('saving'); setError('');
    const operation = (async () => {
      try {
        const persisted = await ensureDraft();
        const saved = await saveCreativePostEditor(persisted, savingDocument, savingMetadata, savingTermIds);
        postRef.current = { ...postRef.current, ...saved }; setPost(postRef.current);
        savedRevisionRef.current = savingRevision;
        setStatus(savedRevisionRef.current === revisionRef.current ? 'saved' : 'unsaved');
        if (create) navigate(`/posts/${saved.id}/edit`, { replace: true });
        return postRef.current;
      } catch (reason) {
        console.error('[CreativePostEditor] Save failed', reason);
        setError(reason.message || 'Your changes could not be saved. Your work is still here; try again.');
        setStatus('error');
        return null;
      } finally {
        savingRef.current = false;
        savePromiseRef.current = null;
      }
    })();
    savePromiseRef.current = operation;
    const result = await operation;
    if (result && savedRevisionRef.current !== revisionRef.current) return saveNow();
    return result;
  }, [create, ensureDraft, media, navigate]);

  useEffect(() => {
    if (loading || status !== 'unsaved') return undefined;
    const timer = window.setTimeout(saveNow, 1100);
    return () => window.clearTimeout(timer);
  }, [loading, saveNow, status, document]);

  function updateBlock(index, patch) { markDirty((current) => ({ ...current, blocks: current.blocks.map((block, blockIndex) => blockIndex === index ? { ...block, ...patch } : block) })); }
  function transformBlock(index, type, level) {
    markDirty((current) => ({ ...current, blocks: current.blocks.map((block, blockIndex) => {
      if (blockIndex !== index) return block;
      if (type === 'bullet_list' || type === 'numbered_list') return { id: block.id, type, items: [block.content?.map((segment) => segment.text).join('') || block.items?.join(' ') || ''] };
      const content = block.content || [{ text: block.items?.join('\n') || '', marks: [] }];
      return { id: block.id, type, ...(type === 'heading' ? { level: level || 2 } : {}), content };
    }) }));
  }
  function moveBlock(blockId, delta) { markDirty((current) => moveCreativePostBlock(current, blockId, delta)); }
  function insertBlock(type, afterIndex = (documentRef.current?.blocks.length || 1) - 1) {
    if (type === 'image') { requestImages(afterIndex); setInsertOpen(false); return; }
    markDirty((current) => { const blocks = [...current.blocks]; blocks.splice(afterIndex + 1, 0, createPostBlock(type)); return { ...current, blocks }; });
    setInsertOpen(false);
  }
  function requestImages(afterIndex = (documentRef.current?.blocks.length || 1) - 1) { uploadAfterIndexRef.current = afterIndex; fileRef.current?.click(); }
  function removeBlock(index) { markDirty((current) => ({ ...current, blocks: current.blocks.length === 1 ? [createPostBlock('paragraph')] : current.blocks.filter((_, blockIndex) => blockIndex !== index) })); }
  function addParagraphAfter(index) { insertBlock('paragraph', index); window.setTimeout(() => globalThis.document.querySelector(`[data-composer-block="${index + 1}"] .ll-rich-text-editor`)?.focus(), 0); }

  async function publish() {
    setPublishing(true); setError('');
    try {
      if (!metadataRef.current.title.trim()) throw new Error('Add a clear title before publishing this work.');
      if (!creativePostHasContent(documentRef.current, media)) throw new Error('Add some text or at least one photo before publishing.');
      const saved = await saveNow();
      if (!saved) throw new Error('Wait for the draft to finish saving, then try again.');
      const published = await publishCreativePost(saved.id);
      navigate(`/work/${published.slug}`);
    } catch (reason) { setError(reason.message); }
    finally { setPublishing(false); }
  }

  async function upload(event) {
    const files = [...(event.target.files || [])]; event.target.value = '';
    if (!files.length) return;
    if (media.length + files.length > CREATIVE_POST_MAX_IMAGES) { setError(`Choose up to ${CREATIVE_POST_MAX_IMAGES} photos for one post.`); return; }
    setUploading(true); setError('');
    try {
      const persisted = await ensureDraft();
      const usedOrders = new Set(media.map((item) => item.display_order));
      const orders = files.map(() => {
        const nextOrder = Array.from({ length: CREATIVE_POST_MAX_IMAGES }, (_, index) => index).find((order) => !usedOrders.has(order));
        usedOrders.add(nextOrder);
        return nextOrder;
      });
      // Two photos at a time is faster while remaining stable on mobile data.
      const added = await mapWithConcurrency(files, 2, (file, index) => uploadCreativePostImage(file, {
        postId: persisted.id, order: orders[index], altText: '',
      }));
      setMedia((current) => [...current, ...added]);
      const nextDocument = (() => {
        const current = documentRef.current;
        const afterIndex = Number.isInteger(uploadAfterIndexRef.current) ? uploadAfterIndexRef.current : current.blocks.length - 1;
        const blocks = [...current.blocks];
        blocks.splice(afterIndex + 1, 0, { ...createPostBlock('image_group'), mediaIds: added.map((item) => item.id) });
        if (afterIndex >= current.blocks.length - 1) blocks.push(createPostBlock('paragraph'));
        return { ...current, blocks };
      })();
      documentRef.current = nextDocument; setDocument(nextDocument);
      revisionRef.current += 1; setStatus('unsaved');
      await saveNow();
      setSelectedMediaId(added[0]?.id || null);
    } catch (reason) { console.error('[CreativePostEditor] Image upload failed', reason); setError(reason.message || 'The image could not be added.'); setStatus('error'); }
    finally { setUploading(false); uploadAfterIndexRef.current = null; }
  }

  async function updateImage(item, patch) {
    setMedia((current) => current.map((entry) => entry.id === item.id ? { ...entry, ...patch } : entry));
    try { await updateCreativePostMedia(item.id, patch); }
    catch (reason) {
      setMedia((current) => current.map((entry) => entry.id === item.id ? item : entry));
      setError(reason.message);
    }
  }
  async function removeImage(item) {
    try {
      await removeCreativePostMedia(item);
      setMedia((current) => current.filter((entry) => entry.id !== item.id));
      setSelectedMediaId(null);
      markDirty((current) => ({ ...current, blocks: current.blocks.map((block) => block.type === 'image_group' ? { ...block, mediaIds: block.mediaIds.filter((mediaId) => mediaId !== item.id) } : block).filter((block) => block.type !== 'image_group' || block.mediaIds.length) }));
    } catch (reason) { setError(reason.message); }
  }
  function confirmImageRemoval(item) { requestConfirmation({ title: 'Remove this photo?', description: 'It will leave this draft and be queued for safe R2 cleanup.', confirmLabel: 'Remove photo', destructive: true, onConfirm: () => removeImage(item) }); }
  function moveImage(itemId, delta) { markDirty((current) => ({ ...current, blocks: current.blocks.map((block) => { if (block.type !== 'image_group') return block; const index = block.mediaIds.indexOf(itemId); const target = index + delta; if (index < 0 || target < 0 || target >= block.mediaIds.length) return block; const mediaIds = [...block.mediaIds]; [mediaIds[index], mediaIds[target]] = [mediaIds[target], mediaIds[index]]; return { ...block, mediaIds }; }) })); }

  const previewDocument = useMemo(() => normalizeCreativePostDocument(document), [document]);
  const selectedMedia = media.find((item) => item.id === selectedMediaId);
  if (loading) return <main className="ll-composer-loading"><LoadingState label="Preparing your post" /></main>;
  if (error && !post) return <main className="ll-composer-loading"><p>{error}</p></main>;

  const exitPath = creative?.slug ? `/creatives/${creative.slug}` : '/account';
  const closeComposer = async () => {
    const requiresSave = savedRevisionRef.current !== revisionRef.current
      && (creativePostHasContent(documentRef.current, media) || metadataRef.current.title.trim());
    const saved = await saveNow();
    if (requiresSave && !saved) return;
    navigate(exitPath);
  };

  return <main className="ll-composer-page ll-composer-modal-layer">
    <button type="button" className="ll-composer-modal-scrim" onClick={closeComposer} aria-label="Close post composer" />
    <section className="ll-composer-modal" role="dialog" aria-modal="true" aria-label={create ? 'Add work' : 'Edit work'}>
    <header className="ll-composer-header">
      <button type="button" onClick={closeComposer} className="ll-composer-close"><X size={18} /><span>Close</span></button>
      <div className="ll-save-state" role="status">{status === 'saving' ? 'Saving…' : status === 'saved' ? <><Check size={14} /> Saved</> : status === 'not_saved' ? 'Start writing to save' : status === 'error' ? 'Save interrupted' : 'Unsaved changes'}</div>
      <div><button type="button" onClick={() => setPreview((value) => !value)} className="ll-icon-action" aria-label={preview ? 'Return to editing' : 'Preview post'}><Eye size={18} /></button><button type="button" onClick={publish} disabled={publishing || uploading} className="ll-primary-action"><Send size={16} /> {publishing ? 'Publishing…' : 'Publish'}</button></div>
    </header>

      <div className="ll-composer-modal-body"><div className="ll-composer-shell">
      <header className="ll-composer-author">{creative?.profile_image_url ? <img src={creative.profile_image_url} alt="" /> : <span>{creative?.name?.slice(0, 1) || 'C'}</span>}<div><strong>{creative?.name || 'Your Creative profile'}</strong><small>{post.status === 'published' ? 'Editing published work' : 'New work'}</small></div></header>
      <section className="ll-work-details-editor" aria-labelledby="work-details-heading"><div><p className="ll-kicker">Portfolio details</p><h2 id="work-details-heading">Describe this work</h2></div><label className="is-wide"><span>Title</span><input value={metadata.title} maxLength={140} onChange={(event) => updateMetadata('title', event.target.value)} placeholder="Give the work a clear title"/></label><label className="is-wide"><span>Short summary</span><textarea rows={2} value={metadata.summary} maxLength={320} onChange={(event) => updateMetadata('summary', event.target.value)} placeholder="What should a visitor understand first?"/></label><label><span>Year</span><input type="number" min="1900" max="2200" value={metadata.work_year || ''} onChange={(event) => updateMetadata('work_year', event.target.value)}/></label><label><span>Tags</span><input value={metadata.tags} onChange={(event) => updateMetadata('tags', event.target.value)} placeholder="Aklan, portrait, festival"/></label><fieldset className="ll-work-taxonomy is-wide"><legend>What kind of work is this about? <small>Select all that apply · Optional</small></legend><WorkTaxonomyDropdowns terms={taxonomy} selectedIds={termIds} onChange={updateTermIds} /></fieldset></section>
      {error && <p className="ll-composer-error" role="alert">{error}</p>}
      {preview ? <section className="ll-composer-preview"><CreativePostDocument document={previewDocument} media={media} /></section> : <section className="ll-natural-canvas" aria-label="Post composition canvas">
        {(document?.blocks || []).map((block, index) => <NaturalBlock key={block.id} block={block} index={index} count={document.blocks.length} media={media} onChange={(patch) => updateBlock(index, patch)} onTransform={(type, level) => transformBlock(index, type, level)} onEnter={() => addParagraphAfter(index)} onInsert={(type) => insertBlock(type, index)} onMove={(delta) => moveBlock(block.id, delta)} onRemove={() => removeBlock(index)} onSelectMedia={setSelectedMediaId} />)}
        <div className="ll-insert-row"><button type="button" onClick={() => setInsertOpen((value) => !value)} aria-expanded={insertOpen}><Plus size={18} /> Add to post</button>{insertOpen && <div className="ll-insert-menu">{insertChoices.map(([type, label, Icon]) => <button key={type} type="button" onClick={() => insertBlock(type)}><Icon size={17} /> {label}</button>)}</div>}</div>
      </section>}
      {!preview && <div className="ll-composer-add-media"><input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={upload} className="sr-only" /><button type="button" onClick={() => requestImages()} disabled={uploading || media.length >= CREATIVE_POST_MAX_IMAGES}><ImagePlus size={19} /><span>{uploading ? 'Uploading photos…' : 'Insert photos at the end'}</span><small>{media.length}/{CREATIVE_POST_MAX_IMAGES}</small></button><p>Use the + between sections to place an image exactly where you want it. JPEG, PNG, or WebP.</p></div>}
    </div></div>
    </section>
    {selectedMedia && <ImageInspector item={selectedMedia} order={media.findIndex((item) => item.id === selectedMedia.id)} count={media.length} onClose={() => setSelectedMediaId(null)} onChange={(patch) => updateImage(selectedMedia, patch)} onMove={(delta) => moveImage(selectedMedia.id, delta)} onRemove={() => confirmImageRemoval(selectedMedia)} />}
    {confirmationDialog}
  </main>;
}

function NaturalBlock({ block, index, count, media, onChange, onTransform, onEnter, onInsert, onMove, onRemove, onSelectMedia }) {
  const [focused, setFocused] = useState(false);
  const editorRef = useRef(null);
  const text = block.content?.map((segment) => segment.text).join('') || '';
  const runFormat = (style, savedSelection = null) => {
    const field = editorRef.current;
    const selection = savedSelection || getRichTextSelectionOffsets(field);
    if (!field || !selection) return;
    const content = applyCreativePostInlineStyle(block.content, selection.start, selection.end, style);
    onChange({ content });
    globalThis.requestAnimationFrame(() => {
      field.focus();
      restoreRichTextSelection(field, selection.start, selection.end);
    });
  };
  const setLink = () => {
    const selection = getRichTextSelectionOffsets(editorRef.current);
    if (!selection) { window.alert('Select the text you want to link first.'); return; }
    const href = window.prompt('Paste a link, or leave blank to remove it', 'https://');
    if (href === null) return;
    if (!href.trim()) { runFormat({ href: '' }, selection); return; }
    const normalizedHref = normalizeCreativePostLink(href);
    if (!normalizedHref) { window.alert('Use a secure https:// link.'); return; }
    runFormat({ href: normalizedHref }, selection);
  };
  const controls = <BlockControls index={index} count={count} onMove={onMove} onRemove={onRemove} />;
  const inserter = <InlineInserter onInsert={onInsert} />;
  if (block.type === 'divider') return <div data-composer-block={index} className="ll-natural-block">{controls}<div className="ll-natural-divider"><hr /></div>{inserter}</div>;
  if (block.type === 'image_group') { const items = block.mediaIds.map((id) => media.find((item) => item.id === id)).filter(Boolean); return <div data-composer-block={index} className="ll-natural-block">{controls}<div className={`ll-natural-gallery ll-natural-gallery--${Math.min(items.length, 5)}`}>{items.map((item, itemIndex) => <button key={item.id} type="button" onClick={() => onSelectMedia(item.id)} aria-label={`Edit photo ${itemIndex + 1}`}><img src={item.display_url || item.thumbnail_url} alt={item.alt_text || ''} /><span><MoreHorizontal size={18} /></span></button>)}</div>{inserter}</div>; }
  if (block.type === 'external_embed') return <div data-composer-block={index} className="ll-natural-block">{controls}<div className="ll-natural-link"><input value={block.label} onChange={(event) => onChange({ label: event.target.value })} placeholder="Give this gallery a title" /><input value={block.url} onChange={(event) => onChange({ url: event.target.value })} placeholder="Gallery URL (https://…)" /></div>{inserter}</div>;
  if (block.type === 'bullet_list' || block.type === 'numbered_list') return <div data-composer-block={index} className="ll-natural-block">{controls}<div className="ll-natural-text is-list"><textarea rows={Math.max(2, block.items.length)} value={block.items.join('\n')} onFocus={() => setFocused(true)} onBlur={(event) => { if (!event.currentTarget.parentElement.contains(event.relatedTarget)) setFocused(false); }} onChange={(event) => onChange({ items: event.target.value.split('\n') })} placeholder="One thought per line…" />{focused && <ContextToolbar block={block} onTransform={onTransform} />}</div>{inserter}</div>;
  return <div data-composer-block={index} className={`ll-natural-text is-${block.type}${block.type === 'heading' ? ` is-heading-${block.level || 2}` : ''}`}>
    {controls}
    {focused && <ContextToolbar block={block} onTransform={onTransform} onBold={() => runFormat({ mark: 'bold' })} onItalic={() => runFormat({ mark: 'italic' })} onUnderline={() => runFormat({ mark: 'underline' })} onLink={setLink} />}
    <RichTextField editorRef={editorRef} content={block.content} placeholder={index === 0 ? 'What are you creating, learning, or sharing?' : block.type === 'heading' ? 'Add a heading…' : block.type === 'quote' ? 'Add a meaningful quote…' : 'Keep writing…'} onChange={(content) => onChange({ content })} onFocus={() => setFocused(true)} onBlur={(event) => { if (!event.currentTarget.parentElement.contains(event.relatedTarget)) setFocused(false); }} onKeyDown={(event) => {
      const shortcut = (event.ctrlKey || event.metaKey) && !event.altKey;
      if (shortcut && event.key.toLowerCase() === 'b') { event.preventDefault(); runFormat({ mark: 'bold' }); return; }
      if (shortcut && event.key.toLowerCase() === 'i') { event.preventDefault(); runFormat({ mark: 'italic' }); return; }
      if (shortcut && event.key.toLowerCase() === 'u') { event.preventDefault(); runFormat({ mark: 'underline' }); return; }
      if (shortcut && event.key.toLowerCase() === 'k') { event.preventDefault(); setLink(); return; }
      if (event.key === 'Enter' && !event.shiftKey && block.type !== 'quote') { event.preventDefault(); onEnter(); }
      if (event.key === 'Backspace' && !text && index > 0) onRemove();
    }} />{inserter}
  </div>;
}

function RichTextField({ editorRef, content, placeholder, onChange, onFocus, onBlur, onKeyDown }) {
  const localSignature = useRef('');
  useEffect(() => {
    const signature = JSON.stringify(content || []);
    if (localSignature.current === signature) { localSignature.current = ''; return; }
    writeRichTextSegments(editorRef.current, content);
  }, [content, editorRef]);
  const emit = () => {
    const next = readRichTextSegments(editorRef.current);
    localSignature.current = JSON.stringify(next);
    onChange(next);
  };
  return <div ref={editorRef} className="ll-rich-text-editor" contentEditable suppressContentEditableWarning role="textbox" aria-multiline="true" data-placeholder={placeholder} onInput={emit} onFocus={onFocus} onBlur={onBlur} onKeyDown={onKeyDown} onPaste={(event) => { event.preventDefault(); insertPlainTextAtSelection(editorRef.current, event.clipboardData.getData('text/plain')); emit(); }} />;
}

function getRichTextSelectionOffsets(root) {
  const selection = globalThis.getSelection?.();
  if (!root || !selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
  const beforeStart = range.cloneRange();
  beforeStart.selectNodeContents(root);
  beforeStart.setEnd(range.startContainer, range.startOffset);
  const beforeEnd = range.cloneRange();
  beforeEnd.selectNodeContents(root);
  beforeEnd.setEnd(range.endContainer, range.endOffset);
  const start = beforeStart.toString().length;
  const end = beforeEnd.toString().length;
  return { start: Math.min(start, end), end: Math.max(start, end) };
}

function restoreRichTextSelection(root, start, end) {
  if (!root) return;
  const walker = globalThis.document.createTreeWalker(root, globalThis.NodeFilter.SHOW_TEXT);
  const range = globalThis.document.createRange();
  let node = walker.nextNode();
  let offset = 0;
  let startPoint = null;
  let endPoint = null;
  while (node) {
    const nextOffset = offset + (node.textContent?.length || 0);
    if (!startPoint && start <= nextOffset) startPoint = [node, Math.max(0, start - offset)];
    if (!endPoint && end <= nextOffset) { endPoint = [node, Math.max(0, end - offset)]; break; }
    offset = nextOffset;
    node = walker.nextNode();
  }
  if (!startPoint || !endPoint) return;
  range.setStart(...startPoint);
  range.setEnd(...endPoint);
  const selection = globalThis.getSelection?.();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function insertPlainTextAtSelection(root, text) {
  const selection = globalThis.getSelection?.();
  if (!root || !selection || selection.rangeCount === 0) return;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer)) return;
  range.deleteContents();
  const node = globalThis.document.createTextNode(text);
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

function writeRichTextSegments(root, content = []) {
  if (!root) return;
  const fragment = globalThis.document.createDocumentFragment();
  for (const segment of content || []) {
    let node = globalThis.document.createTextNode(segment.text || '');
    if (segment.marks?.includes('bold')) { const strong = globalThis.document.createElement('strong'); strong.append(node); node = strong; }
    if (segment.marks?.includes('italic')) { const em = globalThis.document.createElement('em'); em.append(node); node = em; }
    if (segment.marks?.includes('underline')) { const underline = globalThis.document.createElement('u'); underline.append(node); node = underline; }
    const href = normalizeCreativePostLink(segment.href);
    if (href) { const link = globalThis.document.createElement('a'); link.href = href; link.append(node); node = link; }
    fragment.append(node);
  }
  root.replaceChildren(fragment);
}

function readRichTextSegments(root) {
  const segments = [];
  const push = (text, marks, href) => {
    if (!text) return;
    const normalized = text.replaceAll('\u00a0', ' ');
    const previous = segments.at(-1);
    if (previous && previous.href === href && previous.marks.join('|') === marks.join('|')) previous.text += normalized;
    else segments.push({ text: normalized, marks, ...(href ? { href } : {}) });
  };
  const visit = (node, marks = [], href = '') => {
    if (node.nodeType === globalThis.Node.TEXT_NODE) { push(node.textContent || '', marks, href); return; }
    if (node.nodeName === 'BR') { push('\n', marks, href); return; }
    const tag = node.nodeName?.toLowerCase();
    const nextMarks = [...marks];
    const weight = Number.parseInt(node.style?.fontWeight || '', 10);
    const isBold = ['b', 'strong'].includes(tag) || node.style?.fontWeight === 'bold' || weight >= 600;
    const isItalic = ['i', 'em'].includes(tag) || node.style?.fontStyle === 'italic';
    const isUnderline = tag === 'u' || node.style?.textDecorationLine?.includes('underline') || node.style?.textDecoration?.includes('underline');
    if (isBold && !nextMarks.includes('bold')) nextMarks.push('bold');
    if (isItalic && !nextMarks.includes('italic')) nextMarks.push('italic');
    if (isUnderline && !nextMarks.includes('underline')) nextMarks.push('underline');
    const nextHref = tag === 'a' ? normalizeCreativePostLink(node.getAttribute('href')) : href;
    node.childNodes.forEach((child) => visit(child, nextMarks, nextHref));
  };
  root?.childNodes.forEach((node) => visit(node));
  return segments.length ? segments : [{ text: '', marks: [] }];
}

function ContextToolbar({ block, onTransform, onBold, onItalic, onUnderline, onLink }) { return <div className="ll-context-toolbar" role="toolbar" aria-label="Text formatting"><select value={block.type === 'heading' ? `heading-${block.level || 2}` : block.type} onMouseDown={(event) => event.stopPropagation()} onChange={(event) => { const [type, level] = event.target.value.split('-'); onTransform(type, Number(level) || undefined); }} aria-label="Text style"><option value="paragraph">Text</option><option value="heading-2">Large heading</option><option value="heading-3">Small heading</option><option value="quote">Quote</option><option value="bullet_list">Bulleted list</option><option value="numbered_list">Numbered list</option></select><span /><button type="button" onMouseDown={(event) => event.preventDefault()} onClick={onBold} disabled={!onBold} aria-label="Bold selected text" title="Bold (Ctrl+B)"><Bold size={15} /></button><button type="button" onMouseDown={(event) => event.preventDefault()} onClick={onItalic} disabled={!onItalic} aria-label="Italicize selected text" title="Italic (Ctrl+I)"><Italic size={15} /></button><button type="button" onMouseDown={(event) => event.preventDefault()} onClick={onUnderline} disabled={!onUnderline} aria-label="Underline selected text" title="Underline (Ctrl+U)"><Underline size={15} /></button><button type="button" onMouseDown={(event) => event.preventDefault()} onClick={onLink} disabled={!onLink} aria-label="Link selected text" title="Add link (Ctrl+K)"><Link2 size={15} /></button></div>; }

function BlockControls({ index, count, onMove, onRemove }) { return <div className="ll-block-controls" aria-label="Section controls"><button type="button" onClick={() => onMove(-1)} disabled={index === 0} aria-label="Move section earlier" title="Move up"><ArrowUp size={14} /></button><button type="button" onClick={() => onMove(1)} disabled={index === count - 1} aria-label="Move section later" title="Move down"><ArrowDown size={14} /></button><button type="button" onClick={onRemove} aria-label="Remove section" title="Delete section"><Trash2 size={14} /></button></div>; }

function InlineInserter({ onInsert }) { const [open, setOpen] = useState(false); return <div className="ll-inline-inserter"><button type="button" onClick={() => setOpen((value) => !value)} aria-label="Insert content here" aria-expanded={open}><Plus size={15} /></button>{open && <div className="ll-inline-inserter__menu">{insertChoices.map(([type, label, Icon]) => <button key={type} type="button" onClick={() => { onInsert(type); setOpen(false); }}><Icon size={15} /><span>{label}</span></button>)}</div>}</div>; }

function ImageInspector({ item, order, count, onClose, onChange, onMove, onRemove }) {
  const [alt, setAlt] = useState(item.alt_text || '');
  const [caption, setCaption] = useState(item.caption || '');
  useEffect(() => { setAlt(item.alt_text || ''); setCaption(item.caption || ''); }, [item.id, item.alt_text, item.caption]);
  return <div className="ll-image-inspector-layer" role="dialog" aria-modal="true" aria-label="Photo options"><button className="ll-drawer-scrim" type="button" onClick={onClose} aria-label="Close photo options" /><section className="ll-image-inspector"><header><div><p className="ll-kicker">Photo {order + 1} of {count}</p><h2>Photo details</h2></div><button type="button" onClick={onClose} aria-label="Close"><X size={20} /></button></header><img src={item.display_url || item.thumbnail_url} alt="" /><label><span>Image description <em>Optional</em></span><textarea value={alt} onChange={(event) => setAlt(event.target.value)} onBlur={() => onChange({ alt_text: alt, caption })} placeholder="Optionally describe what is visible for people using screen readers." /></label><label><span>Caption <em>Optional</em></span><textarea value={caption} onChange={(event) => setCaption(event.target.value)} onBlur={() => onChange({ alt_text: alt, caption })} placeholder="Add context that appears with this photo." /></label><div className="ll-image-inspector__actions"><button type="button" onClick={() => onMove(-1)} disabled={order === 0}><ArrowUp size={16} /> Earlier</button><button type="button" onClick={() => onMove(1)} disabled={order === count - 1}><ArrowDown size={16} /> Later</button><button type="button" className="is-danger" onClick={onRemove}><Trash2 size={16} /> Remove</button></div><button type="button" className="ll-primary-action" onClick={() => { onChange({ alt_text: alt, caption }); onClose(); }}>Done</button></section></div>;
}
