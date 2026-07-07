import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Save } from 'lucide-react';
import { categories, parseList, slugify } from '../../lib/helpers';
import { supabase } from '../../lib/supabaseClient';
import { uploadCoverImage, uploadGalleryImages } from '../../lib/storage';
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
  const [form, setForm] = useState(emptyProject);
  const [coverFile, setCoverFile] = useState(null);
  const [galleryFiles, setGalleryFiles] = useState([]);
  const [slugTouched, setSlugTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (initialProject) {
      setForm({
        ...emptyProject,
        ...initialProject,
        tools: Array.isArray(initialProject.tools) ? initialProject.tools.join(', ') : initialProject.tools || '',
        gallery_images: initialProject.gallery_images || [],
      });
    }
  }, [initialProject]);

  function update(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  function updateTitle(value) {
    setForm((current) => ({
      ...current,
      title: value,
      slug: slugTouched || mode === 'edit' ? current.slug : slugify(value),
    }));
  }

  function updateSlug(value) {
    setSlugTouched(true);
    update('slug', slugify(value));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');

    try {
      const coverPath = coverFile ? await uploadCoverImage(coverFile) : form.cover_image;
      const galleryUploads = galleryFiles.length ? await uploadGalleryImages(galleryFiles) : [];
      const payload = {
        title: form.title,
        slug: form.slug || slugify(form.title),
        category: form.category,
        description: form.description,
        tools: parseList(form.tools),
        cover_image: coverPath,
        gallery_images: [...(form.gallery_images || []), ...galleryUploads],
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
        <ImageUploader label={coverFile ? coverFile.name : 'Upload cover image'} onChange={(files) => setCoverFile(files?.[0] || null)} />
        <ImageUploader label={galleryFiles.length ? `${galleryFiles.length} gallery image(s) selected` : 'Upload gallery images'} multiple onChange={(files) => setGalleryFiles(Array.from(files || []))} />
      </div>

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
        <button disabled={saving} className="inline-flex items-center gap-2 rounded-md bg-amber-300 px-5 py-3 text-sm font-semibold text-zinc-950 disabled:opacity-60">
          <Save size={17} /> {saving ? 'Saving...' : 'Save project'}
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
