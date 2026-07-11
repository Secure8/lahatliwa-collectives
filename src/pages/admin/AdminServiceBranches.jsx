import { Edit, Plus, Trash2, Upload } from 'lucide-react';
import { useEffect, useState } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import {
  AdminButton,
  AdminActionButton,
  AdminActionGroup,
  AdminCheckbox,
  AdminEmptyState,
  AdminInput,
  AdminNotice,
  AdminPageHeader,
  AdminStatusBadge,
  AdminSurface,
  AdminTextarea,
} from '../../components/admin/AdminUI';
import LoadingState from '../../components/LoadingState';
import { resolvePublicAssetUrl, uploadSiteAsset } from '../../lib/contentApi';
import { parseList, slugify } from '../../lib/helpers';
import { uploadStatusText } from '../../lib/imageCompression';
import { supabase } from '../../lib/supabaseClient';

const emptyBranch = {
  name: '',
  slug: '',
  description: '',
  included_services: '',
  icon_url: '',
  cta_label: 'Start a project',
  cta_url: '/start-a-project',
  display_order: '',
  is_published: true,
};

function sortBranches(rows) {
  return [...rows].sort((a, b) => {
    const orderA = a.display_order ?? Number.MAX_SAFE_INTEGER;
    const orderB = b.display_order ?? Number.MAX_SAFE_INTEGER;
    if (orderA !== orderB) return orderA - orderB;
    return String(b.created_at || '').localeCompare(String(a.created_at || ''));
  });
}

export default function AdminServiceBranches() {
  const [branches, setBranches] = useState([]);
  const [form, setForm] = useState(emptyBranch);
  const [editingId, setEditingId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingIcon, setUploadingIcon] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const [error, setError] = useState('');

  async function loadBranches() {
    setLoading(true);
    const { data, error: loadError } = await supabase
      .from('service_branches')
      .select('*')
      .order('display_order', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false });
    if (loadError) setError(loadError.message);
    else setBranches(data || []);
    setLoading(false);
  }

  useEffect(() => {
    loadBranches();
  }, []);

  function update(name, value) {
    setForm((current) => ({ ...current, [name]: value, slug: name === 'name' && !editingId ? slugify(value) : current.slug }));
  }

  function editBranch(branch) {
    setEditingId(branch.id);
    setForm({
      ...emptyBranch,
      ...branch,
      included_services: Array.isArray(branch.included_services) ? branch.included_services.join(', ') : '',
      display_order: branch.display_order ?? '',
    });
  }

  function resetForm() {
    setEditingId('');
    setForm(emptyBranch);
  }

  async function uploadBranchIcon(file) {
    if (!file) return;
    setUploadingIcon(true);
    setError('');
    setUploadStatus('');
    let optimizedMessage = '';
    try {
      const url = await uploadSiteAsset(file, 'service-branches', 'serviceMedia', {
        onStatus(status) {
          setUploadStatus(uploadStatusText(status));
          if (status?.message) optimizedMessage = status.message;
        },
      });
      update('icon_url', url);
      setUploadStatus(optimizedMessage || 'Service icon uploaded.');
    } catch (uploadError) {
      setError(uploadError.message || 'Service icon upload failed.');
      setUploadStatus('');
    } finally {
      setUploadingIcon(false);
    }
  }

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    const payload = {
      name: form.name,
      slug: slugify(form.slug || form.name),
      description: form.description || null,
      included_services: parseList(form.included_services),
      icon_url: form.icon_url || null,
      cta_label: form.cta_label || null,
      cta_url: form.cta_url || null,
      display_order: form.display_order === '' ? null : Number(form.display_order),
      is_published: form.is_published,
      updated_at: new Date().toISOString(),
    };
    const query = editingId
      ? supabase.from('service_branches').update(payload).eq('id', editingId).select('*').single()
      : supabase.from('service_branches').insert(payload).select('*').single();
    const { data: savedBranch, error: saveError } = await query;
    if (saveError) setError(saveError.message);
    else {
      setBranches((current) => sortBranches(editingId
        ? current.map((branch) => branch.id === editingId ? savedBranch : branch)
        : [savedBranch, ...current]));
      resetForm();
    }
    setSaving(false);
  }

  async function deleteBranch(branch) {
    if (!window.confirm(`Delete "${branch.name}"?`)) return;
    const { error: deleteError } = await supabase.from('service_branches').delete().eq('id', branch.id);
    if (deleteError) setError(deleteError.message);
    else setBranches((current) => current.filter((item) => item.id !== branch.id));
  }

  return (
    <AdminLayout>
      <AdminPageHeader
        eyebrow="Collective services"
        title="Service Branches"
        description="Shape the service modules that appear across the public Services page."
        action={<AdminButton onClick={resetForm} variant="primary"><Plus size={17} /> Add branch</AdminButton>}
      />
      {error && <AdminNotice className="mb-5">{error}</AdminNotice>}

      <AdminSurface as="form" onSubmit={save} className="mb-8 grid gap-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Service module</p>
            <h2 className="mt-2 text-xl font-semibold">{editingId ? 'Edit branch' : 'Add branch'}</h2>
          </div>
          {editingId && <AdminButton type="button" variant="ghost" onClick={resetForm}>Cancel edit</AdminButton>}
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <AdminInput label="Branch name" required value={form.name} onChange={(value) => update('name', value)} />
          <AdminInput label="Slug" required value={form.slug} onChange={(value) => update('slug', value)} onBlur={() => update('slug', slugify(form.slug))} />
          <AdminInput label="Icon/image URL" value={form.icon_url || ''} onChange={(value) => update('icon_url', value)} />
          <AdminInput label="Display order" type="number" value={form.display_order ?? ''} onChange={(value) => update('display_order', value)} />
          <AdminInput label="CTA label" value={form.cta_label || ''} onChange={(value) => update('cta_label', value)} />
          <AdminInput label="CTA URL" value={form.cta_url || ''} onChange={(value) => update('cta_url', value)} />
        </div>
        <AdminTextarea label="Description" value={form.description || ''} onChange={(value) => update('description', value)} />
        <AdminInput label="Included services, comma-separated" value={form.included_services || ''} onChange={(value) => update('included_services', value)} />
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-md bg-white/[0.055] px-4 text-sm text-zinc-200 ring-1 ring-white/[0.08] transition hover:bg-white/[0.085]">
            <Upload size={16} /> {uploadingIcon ? 'Optimizing icon...' : 'Upload icon or image'}
            <input className="sr-only" type="file" accept="image/*" onChange={(event) => {
              uploadBranchIcon(event.target.files?.[0]);
              event.target.value = '';
            }} />
          </label>
          <span className="text-xs text-zinc-500">Raster images are resized to 600px and optimized to 300 KB. SVG files keep a 300 KB hard limit.</span>
          {form.icon_url && <img src={resolvePublicAssetUrl(form.icon_url)} alt="" className="h-12 w-12 object-contain" />}
        </div>
        {uploadStatus && <AdminNotice tone="success">{uploadStatus}</AdminNotice>}
        <AdminCheckbox label="Published" checked={form.is_published} onChange={(value) => update('is_published', value)} />
        <AdminButton disabled={saving || uploadingIcon} type="submit" variant="primary" className="w-fit">
          <Plus size={17} /> {saving ? 'Saving...' : uploadingIcon ? 'Uploading icon...' : 'Save branch'}
        </AdminButton>
      </AdminSurface>

      {loading && <LoadingState label="Loading service branches" />}
      {!loading && (branches.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {branches.map((branch) => (
            <AdminSurface key={branch.id} as="article" className="grid gap-5">
              <div>
                {branch.icon_url && <img src={resolvePublicAssetUrl(branch.icon_url)} alt="" loading="lazy" decoding="async" width="48" height="48" className="mb-4 h-12 w-12 object-contain" />}
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold text-white">{branch.name}</h3>
                  <AdminStatusBadge status={branch.is_published ? 'published' : 'draft'}>{branch.is_published ? 'Published' : 'Draft'}</AdminStatusBadge>
                  {branch.display_order != null && <AdminStatusBadge>Order {branch.display_order}</AdminStatusBadge>}
                </div>
                <p className="mt-2 text-sm leading-6 text-zinc-400">{branch.description}</p>
                <p className="mt-2 text-xs text-zinc-600">/{branch.slug}</p>
                {Array.isArray(branch.included_services) && branch.included_services.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {branch.included_services.map((service) => <span key={service} className="rounded-md bg-white/[0.055] px-2.5 py-1 text-xs text-zinc-400">{service}</span>)}
                  </div>
                )}
              </div>
              <AdminActionGroup>
                <AdminActionButton onClick={() => editBranch(branch)}><Edit size={14} /> Edit</AdminActionButton>
                <AdminActionButton onClick={() => deleteBranch(branch)} variant="danger"><Trash2 size={14} /> Delete</AdminActionButton>
              </AdminActionGroup>
            </AdminSurface>
          ))}
        </div>
      ) : (
        <AdminEmptyState
          title="No service branches yet"
          message="Add branches like Studio, Social, Web, and Tech."
          action={<AdminButton onClick={resetForm} variant="primary"><Plus size={17} /> Add branch</AdminButton>}
        />
      ))}
    </AdminLayout>
  );
}

