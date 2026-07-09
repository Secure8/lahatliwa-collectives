import { Edit, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import EmptyState from '../../components/EmptyState';
import LoadingState from '../../components/LoadingState';
import { parseList, slugify } from '../../lib/helpers';
import { supabase } from '../../lib/supabaseClient';
import { uploadSiteAsset } from '../../lib/contentApi';

const emptyCreative = {
  name: '',
  slug: '',
  role: '',
  short_bio: '',
  full_bio: '',
  profile_image_url: '',
  skills: '',
  social_links: '',
  availability_status: '',
  is_featured: false,
  is_published: true,
  display_order: '',
};

export default function AdminCreatives() {
  const [creatives, setCreatives] = useState([]);
  const [form, setForm] = useState(emptyCreative);
  const [editingId, setEditingId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function loadCreatives() {
    setLoading(true);
    const { data, error: loadError } = await supabase
      .from('creative_members')
      .select('*')
      .order('display_order', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false });
    if (loadError) setError(loadError.message);
    else setCreatives(data || []);
    setLoading(false);
  }

  useEffect(() => {
    loadCreatives();
  }, []);

  function update(name, value) {
    setForm((current) => ({ ...current, [name]: value, slug: name === 'name' && !editingId ? slugify(value) : current.slug }));
  }

  function editCreative(creative) {
    setEditingId(creative.id);
    setForm({
      ...emptyCreative,
      ...creative,
      skills: Array.isArray(creative.skills) ? creative.skills.join(', ') : '',
      social_links: Array.isArray(creative.social_links) ? creative.social_links.map((link) => `${link.label}: ${link.href}`).join('\n') : '',
      display_order: creative.display_order ?? '',
    });
  }

  function resetForm() {
    setEditingId('');
    setForm(emptyCreative);
  }

  async function uploadProfile(file) {
    if (!file) return;
    setSaving(true);
    setError('');
    try {
      const url = await uploadSiteAsset(file, 'creatives');
      update('profile_image_url', url);
    } catch (uploadError) {
      setError(uploadError.message || 'Profile upload failed.');
    } finally {
      setSaving(false);
    }
  }

  function socialLinksFromText(value) {
    return value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [label, ...rest] = line.split(':');
        const href = rest.join(':').trim();
        return { label: href ? label.trim() : 'Link', href: href || line };
      });
  }

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    const payload = {
      name: form.name,
      slug: form.slug || slugify(form.name),
      role: form.role,
      short_bio: form.short_bio || null,
      full_bio: form.full_bio || null,
      profile_image_url: form.profile_image_url || null,
      skills: parseList(form.skills),
      social_links: socialLinksFromText(form.social_links || ''),
      availability_status: form.availability_status || null,
      is_featured: form.is_featured,
      is_published: form.is_published,
      display_order: form.display_order === '' ? null : Number(form.display_order),
      updated_at: new Date().toISOString(),
    };

    const query = editingId
      ? supabase.from('creative_members').update(payload).eq('id', editingId)
      : supabase.from('creative_members').insert(payload);
    const { error: saveError } = await query;
    if (saveError) setError(saveError.message);
    else {
      resetForm();
      await loadCreatives();
    }
    setSaving(false);
  }

  async function deleteCreative(creative) {
    if (!window.confirm(`Delete "${creative.name}"?`)) return;
    const { error: deleteError } = await supabase.from('creative_members').delete().eq('id', creative.id);
    if (deleteError) setError(deleteError.message);
    else setCreatives((current) => current.filter((item) => item.id !== creative.id));
  }

  return (
    <AdminLayout>
      <div className="mb-8">
        <p className="text-sm text-amber-200">Collective</p>
        <h1 className="mt-2 text-3xl font-bold">Creatives</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">Manage published creative member profiles for the public Creatives page.</p>
      </div>

      {error && <div className="mb-5 rounded-lg border border-red-400/30 bg-red-500/10 p-4 text-red-100">{error}</div>}

      <form onSubmit={save} className="mb-8 grid gap-5 rounded-lg border border-white/10 bg-zinc-900/70 p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{editingId ? 'Edit creative' : 'Add creative'}</h2>
          {editingId && <button type="button" onClick={resetForm} className="text-sm text-zinc-400 hover:text-white">Cancel edit</button>}
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          <Field label="Name" required value={form.name} onChange={(value) => update('name', value)} />
          <Field label="Slug" required value={form.slug} onChange={(value) => update('slug', slugify(value))} />
          <Field label="Role / title" required value={form.role} onChange={(value) => update('role', value)} />
          <Field label="Availability status" value={form.availability_status || ''} onChange={(value) => update('availability_status', value)} />
          <Field label="Skills, comma-separated" value={form.skills || ''} onChange={(value) => update('skills', value)} />
          <Field label="Display order" type="number" value={form.display_order ?? ''} onChange={(value) => update('display_order', value)} />
        </div>
        <label className="grid gap-2 text-sm text-zinc-300">
          Short bio
          <textarea className="min-h-20 rounded-md border border-white/10 bg-zinc-950 px-3 py-3 text-white outline-none focus:border-amber-300/70" value={form.short_bio || ''} onChange={(event) => update('short_bio', event.target.value)} />
        </label>
        <label className="grid gap-2 text-sm text-zinc-300">
          Full bio
          <textarea className="min-h-28 rounded-md border border-white/10 bg-zinc-950 px-3 py-3 text-white outline-none focus:border-amber-300/70" value={form.full_bio || ''} onChange={(event) => update('full_bio', event.target.value)} />
        </label>
        <label className="grid gap-2 text-sm text-zinc-300">
          Social links, one per line as Label: URL
          <textarea className="min-h-24 rounded-md border border-white/10 bg-zinc-950 px-3 py-3 text-white outline-none focus:border-amber-300/70" value={form.social_links || ''} onChange={(event) => update('social_links', event.target.value)} />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <label className="cursor-pointer rounded-md border border-white/10 px-3 py-2 text-sm text-zinc-200 hover:border-amber-300/60">
            Upload profile photo
            <input className="sr-only" type="file" accept="image/*" onChange={(event) => uploadProfile(event.target.files?.[0])} />
          </label>
          {form.profile_image_url && <img src={form.profile_image_url} alt="" className="h-14 w-14 rounded-md object-cover" />}
          <label className="flex items-center gap-2 text-sm text-zinc-300"><input type="checkbox" checked={form.is_featured} onChange={(event) => update('is_featured', event.target.checked)} /> Featured</label>
          <label className="flex items-center gap-2 text-sm text-zinc-300"><input type="checkbox" checked={form.is_published} onChange={(event) => update('is_published', event.target.checked)} /> Published</label>
        </div>
        <button disabled={saving} className="inline-flex w-fit items-center gap-2 rounded-md bg-amber-300 px-5 py-3 text-sm font-semibold text-zinc-950 disabled:opacity-60">
          <Plus size={17} /> {saving ? 'Saving...' : editingId ? 'Save creative' : 'Add creative'}
        </button>
      </form>

      {loading && <LoadingState label="Loading creatives" />}
      {!loading && (creatives.length ? (
        <div className="grid gap-3">
          {creatives.map((creative) => (
            <article key={creative.id} className="grid gap-4 rounded-lg border border-white/10 bg-zinc-900/70 p-4 md:grid-cols-[1fr_auto] md:items-center">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold text-white">{creative.name}</h3>
                  <span className="rounded-md bg-white/5 px-2 py-1 text-xs text-zinc-300">{creative.role}</span>
                  {creative.is_featured && <span className="rounded-md bg-amber-400/15 px-2 py-1 text-xs text-amber-200">Featured</span>}
                  <span className="rounded-md bg-white/5 px-2 py-1 text-xs text-zinc-300">{creative.is_published ? 'Published' : 'Draft'}</span>
                </div>
                <p className="mt-2 text-sm text-zinc-500">/{creative.slug}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => editCreative(creative)} className="inline-flex items-center gap-2 rounded-md border border-white/10 px-3 py-2 text-sm text-zinc-200 hover:border-amber-300/60 hover:text-amber-200"><Edit size={16} /> Edit</button>
                <button onClick={() => deleteCreative(creative)} className="inline-flex items-center gap-2 rounded-md border border-red-400/20 px-3 py-2 text-sm text-red-200 hover:bg-red-500/10"><Trash2 size={16} /> Delete</button>
              </div>
            </article>
          ))}
        </div>
      ) : <EmptyState title="No creatives yet" message="Add the first creative member profile above." />)}
    </AdminLayout>
  );
}

function Field({ label, value, onChange, type = 'text', required = false }) {
  return (
    <label className="grid gap-2 text-sm text-zinc-300">
      {label}
      <input type={type} required={required} value={value} onChange={(event) => onChange(event.target.value)} className="rounded-md border border-white/10 bg-zinc-950 px-3 py-3 text-white outline-none focus:border-amber-300/70" />
    </label>
  );
}
