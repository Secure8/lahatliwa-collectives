import { ArrowUp, ArrowDown, Bold, Check, Eye, Heading2, ImagePlus, Italic, Link2, List, ListOrdered, Minus, MoreHorizontal, Plus, Quote, Send, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import CreativePostDocument from '../components/CreativePostDocument';
import LoadingState from '../components/LoadingState';
import { createCreativePostDraft, createPostBlock, creativePostHasContent, CREATIVE_POST_MAX_IMAGES, emptyCreativePostDocument, loadCreativePostForEdit, normalizeCreativePostDocument, publishCreativePost, removeCreativePostMedia, saveCreativePost, updateCreativePostMedia, uploadCreativePostImage } from '../lib/creativePosts';
import { useAdminAccess } from '../lib/adminAccess';
import { supabase } from '../lib/supabaseClient';
import { useAdminConfirmation } from '../components/admin/AdminDialog';

const insertChoices = [
  ['heading', 'Heading', Heading2], ['quote', 'Quote', Quote], ['bullet_list', 'Bulleted list', List],
  ['numbered_list', 'Numbered list', ListOrdered], ['divider', 'Divider', Minus], ['external_embed', 'External link', Link2],
];

export default function CreativePostEditor({ create = false }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const { adminUser } = useAdminAccess();
  const [post, setPost] = useState(null);
  const [document, setDocument] = useState(null);
  const [media, setMedia] = useState([]);
  const [creative, setCreative] = useState(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('saved');
  const [publishing, setPublishing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(false);
  const [insertOpen, setInsertOpen] = useState(false);
  const [selectedMediaId, setSelectedMediaId] = useState(null);
  const fileRef = useRef(null);
  const revisionRef = useRef(0);
  const savedRevisionRef = useRef(0);
  const savingRef = useRef(false);
  const postRef = useRef(null);
  const documentRef = useRef(null);
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

  const markDirty = useCallback((updater) => {
    setDocument((current) => {
      const next = typeof updater === 'function' ? updater(current) : updater;
      documentRef.current = next;
      revisionRef.current += 1;
      setStatus('unsaved');
      return next;
    });
  }, []);

  const ensureDraft = useCallback(async () => {
    if (postRef.current?.id) return postRef.current;
    const created = await createCreativePostDraft();
    postRef.current = created; setPost(created);
    return created;
  }, []);

  const saveNow = useCallback(async () => {
    if (!documentRef.current || savingRef.current || savedRevisionRef.current === revisionRef.current) return postRef.current?.id ? postRef.current : null;
    if (!creativePostHasContent(documentRef.current, media)) {
      savedRevisionRef.current = revisionRef.current;
      setStatus('not_saved');
      return null;
    }
    const savingRevision = revisionRef.current;
    savingRef.current = true; setStatus('saving'); setError('');
    try {
      const persisted = await ensureDraft();
      const saved = await saveCreativePost(persisted, documentRef.current);
      postRef.current = { ...postRef.current, ...saved }; setPost(postRef.current);
      savedRevisionRef.current = savingRevision;
      setStatus(savedRevisionRef.current === revisionRef.current ? 'saved' : 'unsaved');
      if (create) navigate(`/posts/${saved.id}/edit`, { replace: true });
      return postRef.current;
    } catch (reason) { setError(reason.message); setStatus('error'); return null; }
    finally { savingRef.current = false; }
  }, [create, ensureDraft, media, navigate]);

  useEffect(() => {
    if (loading || status !== 'unsaved') return undefined;
    const timer = window.setTimeout(saveNow, 1100);
    return () => window.clearTimeout(timer);
  }, [loading, saveNow, status, document]);

  function updateBlock(index, patch) { markDirty((current) => ({ ...current, blocks: current.blocks.map((block, blockIndex) => blockIndex === index ? { ...block, ...patch } : block) })); }
  function insertBlock(type, afterIndex = (documentRef.current?.blocks.length || 1) - 1) {
    markDirty((current) => { const blocks = [...current.blocks]; blocks.splice(afterIndex + 1, 0, createPostBlock(type)); return { ...current, blocks }; });
    setInsertOpen(false);
  }
  function removeBlock(index) { markDirty((current) => ({ ...current, blocks: current.blocks.length === 1 ? [createPostBlock('paragraph')] : current.blocks.filter((_, blockIndex) => blockIndex !== index) })); }
  function addParagraphAfter(index) { insertBlock('paragraph', index); window.setTimeout(() => document.querySelector(`[data-composer-block="${index + 1}"] textarea`)?.focus(), 0); }

  async function publish() {
    setPublishing(true); setError('');
    try {
      if (!creativePostHasContent(documentRef.current, media)) throw new Error('Add some text or at least one photo before publishing.');
      const saved = await saveNow();
      if (!saved) throw new Error('Wait for the draft to finish saving, then try again.');
      const published = await publishCreativePost(saved.id);
      navigate(`/posts/${published.slug}`);
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
      const added = [];
      const usedOrders = new Set(media.map((item) => item.display_order));
      for (const file of files) {
        const nextOrder = Array.from({ length: CREATIVE_POST_MAX_IMAGES }, (_, index) => index).find((order) => !usedOrders.has(order));
        usedOrders.add(nextOrder);
        added.push(await uploadCreativePostImage(file, { postId: persisted.id, order: nextOrder, altText: '' }));
      }
      setMedia((current) => [...current, ...added]);
      const nextDocument = (() => {
        const current = documentRef.current;
        const galleryIndex = current.blocks.findIndex((block) => block.type === 'image_group');
        if (galleryIndex >= 0) return { ...current, blocks: current.blocks.map((block, index) => index === galleryIndex ? { ...block, mediaIds: [...block.mediaIds, ...added.map((item) => item.id)] } : block) };
        return { ...current, blocks: [...current.blocks, { ...createPostBlock('image_group'), mediaIds: added.map((item) => item.id) }, createPostBlock('paragraph')] };
      })();
      documentRef.current = nextDocument; setDocument(nextDocument);
      revisionRef.current += 1; setStatus('saving');
      const saved = await saveCreativePost(persisted, nextDocument);
      postRef.current = { ...persisted, ...saved }; setPost(postRef.current);
      savedRevisionRef.current = revisionRef.current; setStatus('saved');
      setSelectedMediaId(added[0]?.id || null);
      if (create) navigate(`/posts/${persisted.id}/edit`, { replace: true });
    } catch (reason) { setError(reason.message); }
    finally { setUploading(false); }
  }

  async function updateImage(item, patch) {
    setMedia((current) => current.map((entry) => entry.id === item.id ? { ...entry, ...patch } : entry));
    try { await updateCreativePostMedia(item.id, patch); } catch (reason) { setError(reason.message); }
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
  const closeComposer = async () => { await saveNow(); navigate(exitPath); };

  return <main className="ll-composer-page ll-composer-modal-layer">
    <button type="button" className="ll-composer-modal-scrim" onClick={closeComposer} aria-label="Close post composer" />
    <section className="ll-composer-modal" role="dialog" aria-modal="true" aria-label={create ? 'Create a post' : 'Edit post'}>
    <header className="ll-composer-header">
      <button type="button" onClick={closeComposer} className="ll-composer-close"><X size={18} /><span>Close</span></button>
      <div className="ll-save-state" role="status">{status === 'saving' ? 'Saving…' : status === 'saved' ? <><Check size={14} /> Saved</> : status === 'not_saved' ? 'Start writing to save' : status === 'error' ? 'Save interrupted' : 'Unsaved changes'}</div>
      <div><button type="button" onClick={() => setPreview((value) => !value)} className="ll-icon-action" aria-label={preview ? 'Return to editing' : 'Preview post'}><Eye size={18} /></button><button type="button" onClick={publish} disabled={publishing || uploading} className="ll-primary-action"><Send size={16} /> {publishing ? 'Publishing…' : 'Publish'}</button></div>
    </header>

    <div className="ll-composer-modal-body"><div className="ll-composer-shell">
      <header className="ll-composer-author">{creative?.profile_image_url ? <img src={creative.profile_image_url} alt="" /> : <span>{creative?.name?.slice(0, 1) || 'C'}</span>}<div><strong>{creative?.name || 'Your Creative profile'}</strong><small>{post.status === 'published' ? 'Editing a published post' : 'New post'}</small></div></header>
      {error && <p className="ll-composer-error" role="alert">{error}</p>}
      {preview ? <section className="ll-composer-preview"><CreativePostDocument document={previewDocument} media={media} /></section> : <section className="ll-natural-canvas" aria-label="Post composition canvas">
        {(document?.blocks || []).map((block, index) => <NaturalBlock key={block.id} block={block} index={index} media={media} onChange={(patch) => updateBlock(index, patch)} onEnter={() => addParagraphAfter(index)} onRemove={() => removeBlock(index)} onSelectMedia={setSelectedMediaId} />)}
        <div className="ll-insert-row"><button type="button" onClick={() => setInsertOpen((value) => !value)} aria-expanded={insertOpen}><Plus size={18} /> Add to post</button>{insertOpen && <div className="ll-insert-menu">{insertChoices.map(([type, label, Icon]) => <button key={type} type="button" onClick={() => insertBlock(type)}><Icon size={17} /> {label}</button>)}</div>}</div>
      </section>}
      {!preview && <div className="ll-composer-add-media"><input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={upload} className="sr-only" /><button type="button" onClick={() => fileRef.current?.click()} disabled={uploading || media.length >= CREATIVE_POST_MAX_IMAGES}><ImagePlus size={19} /><span>{uploading ? 'Uploading photos…' : 'Add photos'}</span><small>{media.length}/{CREATIVE_POST_MAX_IMAGES}</small></button><p>JPEG, PNG, or WebP. Add a short description before publishing.</p></div>}
    </div></div>
    </section>
    {selectedMedia && <ImageInspector item={selectedMedia} order={media.findIndex((item) => item.id === selectedMedia.id)} count={media.length} onClose={() => setSelectedMediaId(null)} onChange={(patch) => updateImage(selectedMedia, patch)} onMove={(delta) => moveImage(selectedMedia.id, delta)} onRemove={() => confirmImageRemoval(selectedMedia)} />}
    {confirmationDialog}
  </main>;
}

function NaturalBlock({ block, index, media, onChange, onEnter, onRemove, onSelectMedia }) {
  const [focused, setFocused] = useState(false);
  const editorRef = useRef(null);
  const text = block.content?.map((segment) => segment.text).join('') || '';
  const runFormat = (command, value = null) => {
    const field = editorRef.current;
    const selection = globalThis.getSelection?.();
    if (!field || !selection || selection.isCollapsed || !field.contains(selection.anchorNode)) return;
    globalThis.document.execCommand('styleWithCSS', false, false);
    globalThis.document.execCommand(command, false, value);
    onChange({ content: readRichTextSegments(field) });
    field.focus();
  };
  const setLink = () => {
    const href = window.prompt('Paste a secure https:// link', 'https://');
    if (href === null) return;
    if (!/^https:\/\//i.test(href.trim())) { window.alert('Use a secure https:// link.'); return; }
    runFormat('createLink', href.trim());
  };
  if (block.type === 'divider') return <div data-composer-block={index} className="ll-natural-divider"><hr /><button type="button" onClick={onRemove} aria-label="Remove divider"><X size={15} /></button></div>;
  if (block.type === 'image_group') { const items = block.mediaIds.map((id) => media.find((item) => item.id === id)).filter(Boolean); return <div data-composer-block={index} className="ll-natural-gallery">{items.map((item, itemIndex) => <button key={item.id} type="button" onClick={() => onSelectMedia(item.id)} aria-label={`Edit photo ${itemIndex + 1}`}><img src={item.display_url || item.thumbnail_url} alt={item.alt_text || ''} /><span><MoreHorizontal size={18} /></span>{!item.alt_text && <small>Description needed</small>}</button>)}</div>; }
  if (block.type === 'external_embed') return <div data-composer-block={index} className="ll-natural-link"><input value={block.label} onChange={(event) => onChange({ label: event.target.value })} placeholder="Give this link a title" /><input value={block.url} onChange={(event) => onChange({ url: event.target.value })} placeholder="https://…" /><button type="button" onClick={onRemove} aria-label="Remove link"><X size={16} /></button></div>;
  if (block.type === 'bullet_list' || block.type === 'numbered_list') return <div data-composer-block={index} className="ll-natural-text is-list"><textarea rows={Math.max(2, block.items.length)} value={block.items.join('\n')} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} onChange={(event) => onChange({ items: event.target.value.split('\n') })} placeholder="One thought per line…" />{focused && <ContextToolbar onRemove={onRemove} />}</div>;
  return <div data-composer-block={index} className={`ll-natural-text is-${block.type}`}>
    {focused && <ContextToolbar onBold={() => runFormat('bold')} onItalic={() => runFormat('italic')} onLink={setLink} onRemove={onRemove} />}
    <RichTextField editorRef={editorRef} content={block.content} placeholder={index === 0 ? 'What are you creating, learning, or sharing?' : block.type === 'heading' ? 'Add a heading…' : block.type === 'quote' ? 'Add a meaningful quote…' : 'Keep writing…'} onChange={(content) => onChange({ content })} onFocus={() => setFocused(true)} onBlur={(event) => { if (!event.currentTarget.parentElement.contains(event.relatedTarget)) setFocused(false); }} onKeyDown={(event) => {
      const shortcut = (event.ctrlKey || event.metaKey) && !event.altKey;
      if (shortcut && event.key.toLowerCase() === 'b') { event.preventDefault(); runFormat('bold'); return; }
      if (shortcut && event.key.toLowerCase() === 'i') { event.preventDefault(); runFormat('italic'); return; }
      if (shortcut && event.key.toLowerCase() === 'k') { event.preventDefault(); setLink(); return; }
      if (event.key === 'Enter' && !event.shiftKey && block.type !== 'quote') { event.preventDefault(); onEnter(); }
      if (event.key === 'Backspace' && !text && index > 0) onRemove();
    }} />
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
  return <div ref={editorRef} className="ll-rich-text-editor" contentEditable suppressContentEditableWarning role="textbox" aria-multiline="true" data-placeholder={placeholder} onInput={emit} onFocus={onFocus} onBlur={onBlur} onKeyDown={onKeyDown} onPaste={(event) => { event.preventDefault(); globalThis.document.execCommand('insertText', false, event.clipboardData.getData('text/plain')); }} />;
}

function writeRichTextSegments(root, content = []) {
  if (!root) return;
  const fragment = globalThis.document.createDocumentFragment();
  for (const segment of content || []) {
    let node = globalThis.document.createTextNode(segment.text || '');
    if (segment.marks?.includes('bold')) { const strong = globalThis.document.createElement('strong'); strong.append(node); node = strong; }
    if (segment.marks?.includes('italic')) { const em = globalThis.document.createElement('em'); em.append(node); node = em; }
    if (/^https:\/\//i.test(segment.href || '')) { const link = globalThis.document.createElement('a'); link.href = segment.href; link.append(node); node = link; }
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
    if (isBold && !nextMarks.includes('bold')) nextMarks.push('bold');
    if (isItalic && !nextMarks.includes('italic')) nextMarks.push('italic');
    const nextHref = tag === 'a' && /^https:\/\//i.test(node.getAttribute('href') || '') ? node.getAttribute('href') : href;
    node.childNodes.forEach((child) => visit(child, nextMarks, nextHref));
  };
  root?.childNodes.forEach((node) => visit(node));
  return segments.length ? segments : [{ text: '', marks: [] }];
}

function ContextToolbar({ onBold, onItalic, onLink, onRemove }) { return <div className="ll-context-toolbar" role="toolbar" aria-label="Text formatting"><button type="button" onMouseDown={(event) => event.preventDefault()} onClick={onBold} disabled={!onBold} aria-label="Bold selected text" title="Bold (Ctrl+B)"><Bold size={15} /></button><button type="button" onMouseDown={(event) => event.preventDefault()} onClick={onItalic} disabled={!onItalic} aria-label="Italicize selected text" title="Italic (Ctrl+I)"><Italic size={15} /></button><button type="button" onMouseDown={(event) => event.preventDefault()} onClick={onLink} disabled={!onLink} aria-label="Link selected text" title="Add link (Ctrl+K)"><Link2 size={15} /></button><span /><button type="button" onMouseDown={(event) => event.preventDefault()} onClick={onRemove} aria-label="Remove this section"><Trash2 size={15} /></button></div>; }

function ImageInspector({ item, order, count, onClose, onChange, onMove, onRemove }) {
  const [alt, setAlt] = useState(item.alt_text || '');
  const [caption, setCaption] = useState(item.caption || '');
  useEffect(() => { setAlt(item.alt_text || ''); setCaption(item.caption || ''); }, [item.id, item.alt_text, item.caption]);
  return <div className="ll-image-inspector-layer" role="dialog" aria-modal="true" aria-label="Photo options"><button className="ll-drawer-scrim" type="button" onClick={onClose} aria-label="Close photo options" /><section className="ll-image-inspector"><header><div><p className="ll-kicker">Photo {order + 1} of {count}</p><h2>Photo details</h2></div><button type="button" onClick={onClose} aria-label="Close"><X size={20} /></button></header><img src={item.display_url || item.thumbnail_url} alt="" /><label><span>Image description <em>Required</em></span><textarea value={alt} onChange={(event) => setAlt(event.target.value)} onBlur={() => onChange({ alt_text: alt, caption })} placeholder="Describe what is visible for people using screen readers." /></label><label><span>Caption <em>Optional</em></span><textarea value={caption} onChange={(event) => setCaption(event.target.value)} onBlur={() => onChange({ alt_text: alt, caption })} placeholder="Add context that appears with this photo." /></label><div className="ll-image-inspector__actions"><button type="button" onClick={() => onMove(-1)} disabled={order === 0}><ArrowUp size={16} /> Earlier</button><button type="button" onClick={() => onMove(1)} disabled={order === count - 1}><ArrowDown size={16} /> Later</button><button type="button" className="is-danger" onClick={onRemove}><Trash2 size={16} /> Remove</button></div><button type="button" className="ll-primary-action" onClick={() => { onChange({ alt_text: alt, caption }); onClose(); }}>Done</button></section></div>;
}
