import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Save, Trash2 } from 'lucide-react';
import { categories, parseList, slugify } from '../../lib/helpers';
import { supabase } from '../../lib/supabaseClient';
import { deleteImages, getPublicImageUrl, isPdfFile, uploadCoverImage, uploadGalleryImages } from '../../lib/storage';
import ImageUploader from './ImageUploader';

const emptyProject = {
  title: '',
  slug: '',
  category: categories[0],
  description: '',
  tools: '',
  cover_image: '',
  gallery_images: [],
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
  const [error, setError] = useState('');

  useEffect(() => {
    setDraftReady(false);
    setDirty(false);
    const baseForm = initialProject
      ? {
          ...emptyProject,
          ...initialProject,
          tools: Array.isArray(initialProject.tools) ? initialProject.tools.join(', ') : initialProject.tools || '',
          gallery_images: initialProject.gallery_images || [],
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

  async function uploadGallery(files) {
    if (!files?.length) return;
    setUploadingImages(true);
    setError('');
    try {
      const paths = await uploadGalleryImages(files);
      setForm((current) => ({ ...current, gallery_images: [...(current.gallery_images || []), ...paths] }));
      setDirty(true);
    } catch (uploadError) {
      setError(uploadError.message || 'Gallery image upload failed.');
    } finally {
      setUploadingImages(false);
    }
  }

  function removeGalleryFile(path) {
    setForm((current) => ({
      ...current,
      gallery_images: (current.gallery_images || []).filter((image) => image !== path),
    }));
    setDirty(true);
    setRemovedGalleryPaths((current) => current.includes(path) ? current : [...current, path]);
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

    try {
      const payload = {
        title: form.title,
        slug: form.slug || slugify(form.title),
        category: form.category,
        description: form.description,
        tools: parseList(form.tools),
        cover_image: form.cover_image,
        gallery_images: form.gallery_images || [],
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
      clearDraft();
      setDirty(false);
      navigate('/admin/projects');
    } catch (saveError) {
      setError(saveError.message || 'Something went wrong while saving this project.');
    } finally {
      setSaving(false);
    }
  }

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
        <ImageUploader label={uploadingImages ? 'Uploading files...' : form.gallery_images?.length ? `${form.gallery_images.length} gallery file(s) uploaded` : 'Upload gallery images or PDFs'} accept="image/*,application/pdf" multiple onChange={uploadGallery} />
      </div>
      {(form.cover_image || form.gallery_images?.length > 0) && (
        <div className="grid gap-4 rounded-md border border-white/10 bg-zinc-950 p-4">
          {form.cover_image && (
            <div>
              <p className="mb-2 text-xs text-zinc-500">Cover image</p>
              <img src={getPublicImageUrl(form.cover_image)} alt="" className="h-24 max-w-full object-cover" />
            </div>
          )}
          {form.gallery_images?.length > 0 && (
            <div>
              <p className="mb-2 text-xs text-zinc-500">Gallery files</p>
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
        </div>
      )}

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
          <Save size={17} /> {saving ? 'Saving...' : uploadingImages ? 'Uploading...' : 'Save project'}
        </button>
        <button type="button" onClick={() => navigate('/admin/projects')} className="rounded-md border border-white/10 px-5 py-3 text-sm text-zinc-200 hover:bg-white/5">
          Cancel
        </button>
      </div>
    </form>
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
