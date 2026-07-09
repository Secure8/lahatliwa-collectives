import { Edit, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import {
  AdminButton,
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
import { parseList, slugify } from '../../lib/helpers';
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

export default function AdminServiceBranches() {
  const [branches, setBranches] = useState([]);
  const [form, setForm] = useState(emptyBranch);
  const [editingId, setEditingId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    const payload = {
      name: form.name,
      slug: form.slug || slugify(form.name),
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
      ? supabase.from('service_branches').update(payload).eq('id', editingId)
      : supabase.from('service_branches').insert(payload);
    const { error: saveError } = await query;
    if (saveError) setError(saveError.message);
    else {
      resetForm();
      await loadBranches();
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
          <AdminInput label="Slug" required value={form.slug} onChange={(value) => update('slug', slugify(value))} />
          <AdminInput label="Icon/image URL" value={form.icon_url || ''} onChange={(value) => update('icon_url', value)} />
          <AdminInput label="Display order" type="number" value={form.display_order ?? ''} onChange={(value) => update('display_order', value)} />
          <AdminInput label="CTA label" value={form.cta_label || ''} onChange={(value) => update('cta_label', value)} />
          <AdminInput label="CTA URL" value={form.cta_url || ''} onChange={(value) => update('cta_url', value)} />
        </div>
        <AdminTextarea label="Description" value={form.description || ''} onChange={(value) => update('description', value)} />
        <AdminInput label="Included services, comma-separated" value={form.included_services || ''} onChange={(value) => update('included_services', value)} />
        <AdminCheckbox label="Published" checked={form.is_published} onChange={(value) => update('is_published', value)} />
        <AdminButton disabled={saving} type="submit" variant="primary" className="w-fit">
          <Plus size={17} /> {saving ? 'Saving...' : 'Save branch'}
        </AdminButton>
      </AdminSurface>

      {loading && <LoadingState label="Loading service branches" />}
      {!loading && (branches.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {branches.map((branch) => (
            <AdminSurface key={branch.id} as="article" className="grid gap-5">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold text-white">{branch.name}</h3>
                  <AdminStatusBadge status={branch.is_published ? 'published' : 'draft'}>{branch.is_published ? 'Published' : 'Draft'}</AdminStatusBadge>
                  {branch.display_order != null && <AdminStatusBadge>Order {branch.display_order}</AdminStatusBadge>}
                </div>
                <p className="mt-2 text-sm leading-6 text-zinc-400">{branch.description}</p>
                <p className="mt-2 text-xs text-zinc-600">/{branch.slug}</p>
                {Array.isArray(branch.included_services) && branch.included_services.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {branch.included_services.map((service) => <span key={service} className="rounded-full bg-white/[0.055] px-2.5 py-1 text-xs text-zinc-400">{service}</span>)}
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <AdminButton onClick={() => editBranch(branch)} variant="secondary"><Edit size={16} /> Edit</AdminButton>
                <AdminButton onClick={() => deleteBranch(branch)} variant="danger"><Trash2 size={16} /> Delete</AdminButton>
              </div>
            </AdminSurface>
          ))}
        </div>
      ) : (
        <AdminEmptyState
          title="No service branches yet"
          message="Add branches like Studio, Social, Web, and Creative."
          action={<AdminButton onClick={resetForm} variant="primary"><Plus size={17} /> Add branch</AdminButton>}
        />
      ))}
    </AdminLayout>
  );
}
