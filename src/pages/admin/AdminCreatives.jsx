import { Edit, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import { AdminButton, AdminCheckbox, AdminEmptyState, AdminInput, AdminNotice, AdminPageHeader, AdminSoftPanel, AdminStatusBadge, AdminSurface, AdminTextarea } from '../../components/admin/AdminUI';
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
      <AdminPageHeader
        eyebrow="Collective"
        title="Creatives"
        description="Manage the people, roles, profiles, and featured members behind Lahat Liwa Collectives."
        action={<AdminButton variant="primary" onClick={resetForm}><Plus size={17} /> Add Creative</AdminButton>}
      />

      {error && <AdminNotice className="mb-5">{error}</AdminNotice>}

      <AdminSurface as="form" onSubmit={save} className="mb-8 grid gap-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Profile editor</p>
            <h2 className="mt-2 text-xl font-semibold">{editingId ? 'Edit creative' : 'Add creative'}</h2>
          </div>
          {editingId && <AdminButton type="button" variant="ghost" onClick={resetForm}>Cancel edit</AdminButton>}
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          <AdminInput label="Name" required value={form.name} onChange={(value) => update('name', value)} />
          <AdminInput label="Slug" required value={form.slug} onChange={(value) => update('slug', slugify(value))} />
          <AdminInput label="Role / title" required value={form.role} onChange={(value) => update('role', value)} />
          <AdminInput label="Availability status" value={form.availability_status || ''} onChange={(value) => update('availability_status', value)} />
          <AdminInput label="Skills, comma-separated" value={form.skills || ''} onChange={(value) => update('skills', value)} />
          <AdminInput label="Display order" type="number" value={form.display_order ?? ''} onChange={(value) => update('display_order', value)} />
        </div>
        <AdminTextarea label="Short bio" value={form.short_bio || ''} onChange={(value) => update('short_bio', value)} />
        <AdminTextarea label="Full bio" rows={5} value={form.full_bio || ''} onChange={(value) => update('full_bio', value)} />
        <AdminTextarea label="Social links, one per line as Label: URL" value={form.social_links || ''} onChange={(value) => update('social_links', value)} />
        <div className="flex flex-wrap items-center gap-3">
          <label className="cursor-pointer rounded-full bg-white/[0.055] px-4 py-2.5 text-sm text-zinc-200 ring-1 ring-white/[0.08] transition hover:bg-white/[0.085]">
            Upload profile photo
            <input className="sr-only" type="file" accept="image/*" onChange={(event) => uploadProfile(event.target.files?.[0])} />
          </label>
          {form.profile_image_url && <img src={form.profile_image_url} alt="" className="h-14 w-14 rounded-2xl object-cover" />}
          <AdminCheckbox label="Featured" checked={form.is_featured} onChange={(value) => update('is_featured', value)} />
          <AdminCheckbox label="Published" checked={form.is_published} onChange={(value) => update('is_published', value)} />
        </div>
        <AdminButton disabled={saving} type="submit" variant="primary" className="w-fit">
          <Plus size={17} /> {saving ? 'Saving...' : editingId ? 'Save creative' : 'Add creative'}
        </AdminButton>
      </AdminSurface>

      {loading && <LoadingState label="Loading creatives" />}
      {!loading && (creatives.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {creatives.map((creative) => (
            <AdminSurface key={creative.id} as="article" className="flex flex-col gap-5">
              <div className="flex items-start gap-4">
                {creative.profile_image_url ? (
                  <img src={creative.profile_image_url} alt="" className="h-16 w-16 rounded-2xl object-cover" />
                ) : (
                  <div className="grid h-16 w-16 place-items-center rounded-2xl bg-white/[0.055] text-xl font-semibold text-zinc-500">{creative.name?.slice(0, 1) || 'L'}</div>
                )}
                <div className="min-w-0">
                  <h3 className="font-semibold text-white">{creative.name}</h3>
                  <p className="mt-1 text-sm text-zinc-400">{creative.role}</p>
                  <p className="mt-1 truncate text-xs text-zinc-600">/{creative.slug}</p>
                </div>
              </div>
              {Array.isArray(creative.skills) && creative.skills.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {creative.skills.slice(0, 4).map((skill) => <span key={skill} className="rounded-full bg-white/[0.055] px-2.5 py-1 text-xs text-zinc-400">{skill}</span>)}
                </div>
              )}
              <div className="mt-auto flex flex-wrap items-center gap-2">
                {creative.is_featured && <AdminStatusBadge status="featured">Featured</AdminStatusBadge>}
                <AdminStatusBadge status={creative.is_published ? 'published' : 'draft'}>{creative.is_published ? 'Published' : 'Draft'}</AdminStatusBadge>
              </div>
              <AdminSoftPanel className="flex gap-2">
                <AdminButton onClick={() => editCreative(creative)} variant="secondary"><Edit size={16} /> Edit</AdminButton>
                <AdminButton onClick={() => deleteCreative(creative)} variant="danger"><Trash2 size={16} /> Delete</AdminButton>
              </AdminSoftPanel>
            </AdminSurface>
          ))}
        </div>
      ) : <AdminEmptyState title="No creatives yet." message="Add your first creative member." action={<AdminButton variant="primary" onClick={resetForm}><Plus size={17} /> Add Creative</AdminButton>} />)}
    </AdminLayout>
  );
}
