import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowDown, ArrowUp, ExternalLink, Plus, Save, Trash2, Upload } from 'lucide-react';
import {
  createExternalGalleryItem,
  createImageGalleryItem,
  detectGalleryPlatform,
  galleryItemTypes,
  normalizeGalleryItem,
  platformLabel,
} from '../../lib/galleryItems';
import { categories, parseList, slugify } from '../../lib/helpers';
import { supabase } from '../../lib/supabaseClient';
import { deleteImages, getPublicImageUrl, isPdfFile, uploadCoverImage, uploadExternalThumbnail, uploadGalleryImages, validateGalleryUploadFile } from '../../lib/storage';
import ImageUploader from './ImageUploader';

const emptyProject = {
  title: '',
  slug: '',
  category: categories[0],
  description: '',
  tools: '',
  cover_image: '',
  gallery_images: [],
  gallery_items: [],
  video_url: '',
  social_post_url: '',
  live_url: '',
  github_url: '',
  project_date: '',
  status: 'draft',
  featured: false,
};

export default function ProjectForm({ initialProject, mode = 'new' }) {
  const navigate = useNavigate();
  const draftKey = useMemo(() => `hevv-project-form-draft-v2:${mode}:${initialProject?.id || 'new'}`, [mode, initialProject?.id]);
  const [form, setForm] = useState(emptyProject);
  const [slugTouched, setSlugTouched] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [removedGalleryPaths, setRemovedGalleryPaths] = useState([]);
  const [pendingGalleryFiles, setPendingGalleryFiles] = useState([]);
  const [externalUrl, setExternalUrl] = useState('');
  const [bulkExternalUrls, setBulkExternalUrls] = useState('');
  const [error, setError] = useState('');
  const pendingGalleryFilesRef = useRef([]);

  useEffect(() => {
    setDraftReady(false);
    setDirty(false);
    setRemovedGalleryPaths([]);
    setPendingGalleryFiles((current) => {
      current.forEach((item) => {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      });
      return [];
    });
    const baseForm = initialProject
      ? {
          ...emptyProject,
          ...initialProject,
          tools: Array.isArray(initialProject.tools) ? initialProject.tools.join(', ') : initialProject.tools || '',
          gallery_images: initialProject.gallery_images || [],
          gallery_items: Array.isArray(initialProject.gallery_items)
            ? initialProject.gallery_items.map(normalizeGalleryItem)
            : [],
        }
      : emptyProject;

    let savedDraft = {};
    try {
      savedDraft = JSON.parse(window.localStorage.getItem(draftKey) || '{}');
    } catch {
      savedDraft = {};
    }

    const hasDraft = Object.keys(savedDraft).length > 0;
    setForm({ ...baseForm, ...savedDraft });
    setDirty(hasDraft);
    setDraftReady(true);
  }, [initialProject, draftKey]);

  useEffect(() => {
    if (!draftReady || !dirty) return;
    try {
      window.localStorage.setItem(draftKey, JSON.stringify(form));
    } catch {
    }
  }, [dirty, draftKey, draftReady, form]);

  useEffect(() => {
    if (!draftReady || !dirty) return undefined;
    const warnBeforeLeaving = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeLeaving);
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving);
  }, [dirty, draftReady]);

  useEffect(() => {
    if (initialProject) {
      setSlugTouched(true);
    }
  }, [initialProject]);

  useEffect(() => {
    pendingGalleryFilesRef.current = pendingGalleryFiles;
  }, [pendingGalleryFiles]);

  useEffect(() => () => {
    pendingGalleryFilesRef.current.forEach((item) => {
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    });
  }, []);

  function update(name, value) {
    setDirty(true);
    setForm((current) => ({ ...current, [name]: value }));
  }

  function updateTitle(value) {
    setForm((current) => ({
      ...current,
      title: value,
      slug: slugTouched || mode === 'edit' ? current.slug : slugify(value),
    }));
    setDirty(true);
  }

  function updateSlug(value) {
    setSlugTouched(true);
    update('slug', slugify(value));
  }

  async function uploadCover(files) {
    const file = files?.[0];
    if (!file) return;
    setUploadingImages(true);
    setError('');
    try {
      const path = await uploadCoverImage(file);
      update('cover_image', path);
    } catch (uploadError) {
      setError(uploadError.message || 'Cover image upload failed.');
    } finally {
      setUploadingImages(false);
    }
  }

  function selectGalleryFiles(files) {
    if (!files?.length) return;
    setError('');
    try {
      const selectedFiles = Array.from(files);
      selectedFiles.forEach(validateGalleryUploadFile);
      setPendingGalleryFiles((current) => [
        ...current,
        ...selectedFiles.map((file) => ({
          id: `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`,
          file,
          isPdf: file.type === 'application/pdf',
          previewUrl: file.type === 'application/pdf' ? '' : URL.createObjectURL(file),
        })),
      ]);
      setDirty(true);
    } catch (uploadError) {
      setError(uploadError.message || 'Gallery file selection failed.');
    }
  }

  function removePendingGalleryFile(id) {
    setPendingGalleryFiles((current) => {
      const removed = current.find((item) => item.id === id);
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      return current.filter((item) => item.id !== id);
    });
    setDirty(true);
  }

  function removeGalleryFile(path) {
    setForm((current) => ({
      ...current,
      gallery_images: (current.gallery_images || []).filter((image) => image !== path),
      gallery_items: (current.gallery_items || []).filter((item) => item.url !== path),
    }));
    setDirty(true);
    setRemovedGalleryPaths((current) => current.includes(path) ? current : [...current, path]);
  }

  function externalGalleryItems() {
    return (form.gallery_items || []).filter((item) => !['image', 'pdf'].includes(item.type));
  }

  function addExternalUrls(urls) {
    const cleanUrls = urls.map((url) => url.trim()).filter(Boolean);
    if (!cleanUrls.length) return;
    setForm((current) => {
      const existing = current.gallery_items || [];
      const nextOrder = existing.length * 100;
      const newItems = cleanUrls.map((url, index) => createExternalGalleryItem(url, nextOrder + index * 100));
      return { ...current, gallery_items: [...existing, ...newItems] };
    });
    setDirty(true);
  }

  function addSingleExternalUrl() {
    addExternalUrls([externalUrl]);
    setExternalUrl('');
  }

  function addBulkExternalUrls() {
    addExternalUrls(bulkExternalUrls.split(/\r?\n/));
    setBulkExternalUrls('');
  }

  function updateExternalItem(id, patch) {
    let removedThumbnailPath = '';
    setForm((current) => ({
      ...current,
      gallery_items: (current.gallery_items || []).map((item) => {
        if (item.id !== id) return item;
        if (
          Object.prototype.hasOwnProperty.call(patch, 'thumbnail_url')
          && patch.thumbnail_storage_path === ''
          && item.thumbnail_storage_path
        ) {
          removedThumbnailPath = item.thumbnail_storage_path;
        }
        const nextItem = { ...item, ...patch };
        if (Object.prototype.hasOwnProperty.call(patch, 'url')) {
          const detected = detectGalleryPlatform(patch.url);
          nextItem.type = detected.type;
          nextItem.platform = detected.platform;
        }
        if (Object.prototype.hasOwnProperty.call(patch, 'type')) {
          nextItem.platform = platformLabel(patch.type);
        }
        return nextItem;
      }),
    }));
    if (removedThumbnailPath) {
      setRemovedGalleryPaths((current) => current.includes(removedThumbnailPath) ? current : [...current, removedThumbnailPath]);
    }
    setDirty(true);
  }

  async function uploadExternalItemThumbnail(item, file) {
    if (!file) return;
    setUploadingImages(true);
    setError('');
    try {
      const path = await uploadExternalThumbnail(file, form.slug || slugify(form.title));
      const oldPath = item.thumbnail_storage_path;
      updateExternalItem(item.id, {
        thumbnail_url: getPublicImageUrl(path),
        thumbnail_storage_path: path,
      });
      if (oldPath) {
        setRemovedGalleryPaths((current) => current.includes(oldPath) ? current : [...current, oldPath]);
      }
    } catch (uploadError) {
      setError(uploadError.message || 'Thumbnail upload failed.');
    } finally {
      setUploadingImages(false);
    }
  }

  function removeExternalItem(id) {
    const item = (form.gallery_items || []).find((galleryItem) => galleryItem.id === id);
    setForm((current) => ({
      ...current,
      gallery_items: (current.gallery_items || []).filter((galleryItem) => galleryItem.id !== id),
    }));
    if (item?.thumbnail_storage_path) {
      setRemovedGalleryPaths((current) => current.includes(item.thumbnail_storage_path) ? current : [...current, item.thumbnail_storage_path]);
    }
    setDirty(true);
  }

  function moveExternalItem(id, direction) {
    const externalItems = externalGalleryItems();
    const currentIndex = externalItems.findIndex((item) => item.id === id);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= externalItems.length) return;

    const reordered = [...externalItems];
    const [moved] = reordered.splice(currentIndex, 1);
    reordered.splice(nextIndex, 0, moved);
    const reorderedMap = new Map(reordered.map((item, index) => [item.id, { ...item, order: 1000 + index * 100 }]));

    setForm((current) => ({
      ...current,
      gallery_items: (current.gallery_items || []).map((item) => reorderedMap.get(item.id) || item),
    }));
    setDirty(true);
  }

  function clearDraft() {
    try {
      window.localStorage.removeItem(draftKey);
    } catch {
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    let uploadedGalleryPaths = [];

    try {
      uploadedGalleryPaths = pendingGalleryFiles.length
        ? await uploadGalleryImages(pendingGalleryFiles.map((item) => item.file))
        : [];
      const updatedGalleryImages = [...(form.gallery_images || []), ...uploadedGalleryPaths];
      const currentItems = form.gallery_items || [];
      const existingItemByUrl = new Map(currentItems.map((item) => [item.url, normalizeGalleryItem(item)]));
      const imageItems = updatedGalleryImages.map((path, index) => (
        existingItemByUrl.get(path) || createImageGalleryItem(path, index * 100)
      ));
      const externalItems = currentItems
        .filter((item) => !['image', 'pdf'].includes(item.type))
        .map(normalizeGalleryItem)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map((item, index) => normalizeGalleryItem({ ...item, order: 1000 + index * 100 }, index));
      const payload = {
        title: form.title,
        slug: form.slug || slugify(form.title),
        category: form.category,
        description: form.description,
        tools: parseList(form.tools),
        cover_image: form.cover_image,
        gallery_images: updatedGalleryImages,
        gallery_items: [...imageItems, ...externalItems],
        video_url: form.video_url || null,
        social_post_url: form.social_post_url || null,
        live_url: form.live_url || null,
        github_url: form.github_url || null,
        project_date: form.project_date || null,
        status: form.status,
        featured: form.featured,
        updated_at: new Date().toISOString(),
      };

      const query = mode === 'edit'
        ? supabase.from('projects').update(payload).eq('id', initialProject.id)
        : supabase.from('projects').insert(payload);
      const { error: saveError } = await query;
      if (saveError) throw saveError;
      if (removedGalleryPaths.length) await deleteImages(removedGalleryPaths);
      pendingGalleryFiles.forEach((item) => {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      });
      setPendingGalleryFiles([]);
      clearDraft();
      setDirty(false);
      navigate('/admin/projects');
    } catch (saveError) {
      if (uploadedGalleryPaths.length) {
        try {
          await deleteImages(uploadedGalleryPaths);
        } catch {
        }
      }
      setError(saveError.message || 'Something went wrong while saving this project.');
    } finally {
      setSaving(false);
    }
  }

  const externalItems = externalGalleryItems().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  return (
    <form onSubmit={handleSubmit} className="grid gap-5">
      {error && <div className="rounded-lg border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-100">{error}</div>}

      <div className="grid gap-5 lg:grid-cols-2">
        <Field label="Title" required value={form.title} onChange={(value) => updateTitle(value)} />
        <Field label="Slug" required value={form.slug} onChange={updateSlug} />
        <label className="grid gap-2 text-sm text-zinc-300">
          Category
          <select className="rounded-md border border-white/10 bg-zinc-950 px-3 py-3 text-white outline-none focus:border-amber-300/70" value={form.category} onChange={(event) => update('category', event.target.value)} required>
            {categories.map((category) => <option key={category}>{category}</option>)}
          </select>
        </label>
        <label className="grid gap-2 text-sm text-zinc-300">
          Status
          <select className="rounded-md border border-white/10 bg-zinc-950 px-3 py-3 text-white outline-none focus:border-amber-300/70" value={form.status} onChange={(event) => update('status', event.target.value)}>
            <option value="draft">draft</option>
            <option value="published">published</option>
          </select>
        </label>
      </div>

      <label className="grid gap-2 text-sm text-zinc-300">
        Description
        <textarea className="min-h-36 rounded-md border border-white/10 bg-zinc-950 px-3 py-3 text-white outline-none focus:border-amber-300/70" value={form.description} onChange={(event) => update('description', event.target.value)} required />
      </label>

      <Field label="Tools used, separated by commas" value={form.tools} onChange={(value) => update('tools', value)} />

      <div className="grid gap-5 lg:grid-cols-2">
        <ImageUploader label={uploadingImages ? 'Uploading image...' : form.cover_image ? 'Replace cover image' : 'Upload cover image'} onChange={uploadCover} />
        <ImageUploader label={pendingGalleryFiles.length ? `${pendingGalleryFiles.length} new file(s) ready to add` : 'Add more gallery images or PDFs'} accept="image/*,application/pdf" multiple onChange={selectGalleryFiles} />
      </div>
      {(form.cover_image || form.gallery_images?.length > 0 || pendingGalleryFiles.length > 0) && (
        <div className="grid gap-4 rounded-md border border-white/10 bg-zinc-950 p-4">
          {form.cover_image && (
            <div>
              <p className="mb-2 text-xs text-zinc-500">Cover image</p>
              <img src={getPublicImageUrl(form.cover_image)} alt="" className="h-24 max-w-full object-cover" />
            </div>
          )}
          {form.gallery_images?.length > 0 && (
            <div>
              <p className="mb-2 text-xs text-zinc-500">Saved gallery files</p>
              <div className="flex flex-wrap gap-2">
                {form.gallery_images.map((file) => (
                  <div key={file} className="relative">
                    {isPdfFile(file)
                      ? <a href={getPublicImageUrl(file)} target="_blank" rel="noreferrer" className="grid h-16 w-20 place-items-center border border-white/10 pr-7 text-xs text-zinc-300">PDF</a>
                      : <img src={getPublicImageUrl(file)} alt="" className="h-16 w-20 object-cover" />}
                    <button
                      type="button"
                      onClick={() => removeGalleryFile(file)}
                      className="absolute right-1 top-1 grid h-6 w-6 place-items-center bg-zinc-950/85 text-zinc-300 transition hover:text-red-200"
                      aria-label="Remove gallery file"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {pendingGalleryFiles.length > 0 && (
            <div>
              <p className="mb-2 text-xs text-zinc-500">New gallery files to add</p>
              <div className="flex flex-wrap gap-2">
                {pendingGalleryFiles.map((item) => (
                  <div key={item.id} className="relative">
                    {item.isPdf
                      ? <div className="grid h-16 w-20 place-items-center border border-white/10 pr-7 text-xs text-zinc-300">PDF</div>
                      : <img src={item.previewUrl} alt="" className="h-16 w-20 object-cover" />}
                    <button
                      type="button"
                      onClick={() => removePendingGalleryFile(item.id)}
                      className="absolute right-1 top-1 grid h-6 w-6 place-items-center bg-zinc-950/85 text-zinc-300 transition hover:text-red-200"
                      aria-label="Remove selected gallery file"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <section className="grid gap-4 rounded-lg border border-white/10 bg-zinc-900/70 p-5">
        <div>
          <h2 className="text-lg font-semibold text-white">Gallery Content</h2>
          <p className="mt-1 text-sm leading-6 text-zinc-500">Add social posts, videos, or website links without uploading the full media set to Supabase.</p>
        </div>

        <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
          <Field label="Add external gallery link" value={externalUrl} onChange={setExternalUrl} />
          <button type="button" onClick={addSingleExternalUrl} className="inline-flex h-fit items-center justify-center gap-2 self-end rounded-md border border-white/10 px-4 py-3 text-sm text-zinc-200 hover:border-amber-300/60 hover:text-amber-200">
            <Plus size={16} /> Add link
          </button>
        </div>

        <label className="grid gap-2 text-sm text-zinc-300">
          Bulk paste external links, one per line
          <textarea className="min-h-24 rounded-md border border-white/10 bg-zinc-950 px-3 py-3 text-white outline-none focus:border-amber-300/70" value={bulkExternalUrls} onChange={(event) => setBulkExternalUrls(event.target.value)} />
        </label>
        <button type="button" onClick={addBulkExternalUrls} className="w-fit rounded-md border border-white/10 px-4 py-2 text-sm text-zinc-200 hover:border-amber-300/60 hover:text-amber-200">
          Add pasted links
        </button>

        {externalItems.length > 0 && (
          <div className="grid gap-4 border-t border-white/10 pt-4">
            {externalItems.map((item, index) => (
              <ExternalGalleryItemEditor
                key={item.id}
                item={item}
                index={index}
                total={externalItems.length}
                saving={saving || uploadingImages}
                onChange={(patch) => updateExternalItem(item.id, patch)}
                onUploadThumbnail={(file) => uploadExternalItemThumbnail(item, file)}
                onMove={moveExternalItem}
                onRemove={removeExternalItem}
              />
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Field label="Video URL" value={form.video_url || ''} onChange={(value) => update('video_url', value)} />
        <Field label="Social media post URL" value={form.social_post_url || ''} onChange={(value) => update('social_post_url', value)} />
        <Field label="Live project URL" value={form.live_url || ''} onChange={(value) => update('live_url', value)} />
        <Field label="GitHub URL" value={form.github_url || ''} onChange={(value) => update('github_url', value)} />
        <Field label="Project date" type="date" value={form.project_date || ''} onChange={(value) => update('project_date', value)} />
        <label className="flex items-center gap-3 rounded-md border border-white/10 bg-zinc-950 px-3 py-3 text-sm text-zinc-300">
          <input type="checkbox" checked={form.featured} onChange={(event) => update('featured', event.target.checked)} />
          Featured project
        </label>
      </div>

      <div className="flex flex-wrap gap-3">
        <button disabled={saving || uploadingImages} className="inline-flex items-center gap-2 rounded-md bg-amber-300 px-5 py-3 text-sm font-semibold text-zinc-950 disabled:opacity-60">
          <Save size={17} /> {saving && pendingGalleryFiles.length ? 'Uploading gallery...' : saving ? 'Saving...' : uploadingImages ? 'Uploading...' : 'Save project'}
        </button>
        <button type="button" onClick={() => navigate('/admin/projects')} className="rounded-md border border-white/10 px-5 py-3 text-sm text-zinc-200 hover:bg-white/5">
          Cancel
        </button>
      </div>
    </form>
  );
}

function ExternalGalleryItemEditor({ item, index, total, saving, onChange, onUploadThumbnail, onMove, onRemove }) {
  return (
    <div className="grid gap-4 rounded-md border border-white/10 bg-zinc-950 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 text-sm text-zinc-300">
          <span className="rounded-md bg-white/5 px-2 py-1 text-xs text-zinc-400">#{index + 1}</span>
          <span>{item.platform || platformLabel(item.type)}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={index === 0 || saving} onClick={() => onMove(item.id, -1)} className="grid h-9 w-9 place-items-center rounded-md border border-white/10 text-zinc-300 disabled:opacity-40 hover:border-amber-300/60 hover:text-amber-200" aria-label="Move link up">
            <ArrowUp size={15} />
          </button>
          <button type="button" disabled={index === total - 1 || saving} onClick={() => onMove(item.id, 1)} className="grid h-9 w-9 place-items-center rounded-md border border-white/10 text-zinc-300 disabled:opacity-40 hover:border-amber-300/60 hover:text-amber-200" aria-label="Move link down">
            <ArrowDown size={15} />
          </button>
          <button type="button" disabled={saving} onClick={() => onRemove(item.id)} className="inline-flex items-center gap-2 rounded-md border border-red-400/20 px-3 py-2 text-sm text-red-200 hover:bg-red-500/10">
            <Trash2 size={15} /> Remove
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Field label="URL" value={item.url || ''} onChange={(value) => onChange({ url: value })} />
        <label className="grid gap-2 text-sm text-zinc-300">
          Platform
          <select className="rounded-md border border-white/10 bg-zinc-950 px-3 py-3 text-white outline-none focus:border-amber-300/70" value={item.type || 'external_link'} onChange={(event) => onChange({ type: event.target.value })}>
            {galleryItemTypes.map((type) => <option key={type} value={type}>{platformLabel(type)}</option>)}
          </select>
        </label>
        <Field label="Optional title" value={item.title || ''} onChange={(value) => onChange({ title: value })} />
        <Field label="Thumbnail URL" value={item.thumbnail_url || ''} onChange={(value) => onChange({ thumbnail_url: value, thumbnail_storage_path: '' })} />
      </div>

      <label className="grid gap-2 text-sm text-zinc-300">
        Optional description
        <textarea className="min-h-20 rounded-md border border-white/10 bg-zinc-950 px-3 py-3 text-white outline-none focus:border-amber-300/70" value={item.description || ''} onChange={(event) => onChange({ description: event.target.value })} />
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-white/10 px-3 py-2 text-sm text-zinc-200 hover:border-amber-300/60">
          <Upload size={15} /> Upload thumbnail
          <input className="sr-only" type="file" accept="image/*" onChange={(event) => {
            onUploadThumbnail(event.target.files?.[0]);
            event.target.value = '';
          }} />
        </label>
        {item.url && (
          <a href={item.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-amber-200">
            <ExternalLink size={15} /> Open source
          </a>
        )}
      </div>

      {item.thumbnail_url && (
        <img src={item.thumbnail_url} alt="" className="h-24 max-w-48 rounded-md object-cover" />
      )}
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', required = false }) {
  return (
    <label className="grid gap-2 text-sm text-zinc-300">
      {label}
      <input
        type={type}
        required={required}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-md border border-white/10 bg-zinc-950 px-3 py-3 text-white outline-none focus:border-amber-300/70"
      />
    </label>
  );
}
