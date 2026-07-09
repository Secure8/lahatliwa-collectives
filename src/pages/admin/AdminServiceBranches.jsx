import { Edit, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import EmptyState from '../../components/EmptyState';
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
      <div className="mb-8">
        <p className="text-sm text-amber-200">Collective services</p>
        <h1 className="mt-2 text-3xl font-bold">Service Branches</h1>
      </div>
      {error && <div className="mb-5 rounded-lg border border-red-400/30 bg-red-500/10 p-4 text-red-100">{error}</div>}
      <form onSubmit={save} className="mb-8 grid gap-5 rounded-lg border border-white/10 bg-zinc-900/70 p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{editingId ? 'Edit branch' : 'Add branch'}</h2>
          {editingId && <button type="button" onClick={resetForm} className="text-sm text-zinc-400 hover:text-white">Cancel edit</button>}
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          <Field label="Branch name" required value={form.name} onChange={(value) => update('name', value)} />
          <Field label="Slug" required value={form.slug} onChange={(value) => update('slug', slugify(value))} />
          <Field label="Icon/image URL" value={form.icon_url || ''} onChange={(value) => update('icon_url', value)} />
          <Field label="Display order" type="number" value={form.display_order ?? ''} onChange={(value) => update('display_order', value)} />
          <Field label="CTA label" value={form.cta_label || ''} onChange={(value) => update('cta_label', value)} />
          <Field label="CTA URL" value={form.cta_url || ''} onChange={(value) => update('cta_url', value)} />
        </div>
        <label className="grid gap-2 text-sm text-zinc-300">
          Description
          <textarea className="min-h-24 rounded-md border border-white/10 bg-zinc-950 px-3 py-3 text-white outline-none focus:border-amber-300/70" value={form.description || ''} onChange={(event) => update('description', event.target.value)} />
        </label>
        <Field label="Included services, comma-separated" value={form.included_services || ''} onChange={(value) => update('included_services', value)} />
        <label className="flex items-center gap-2 text-sm text-zinc-300"><input type="checkbox" checked={form.is_published} onChange={(event) => update('is_published', event.target.checked)} /> Published</label>
        <button disabled={saving} className="inline-flex w-fit items-center gap-2 rounded-md bg-amber-300 px-5 py-3 text-sm font-semibold text-zinc-950 disabled:opacity-60"><Plus size={17} /> {saving ? 'Saving...' : 'Save branch'}</button>
      </form>

      {loading && <LoadingState label="Loading service branches" />}
      {!loading && (branches.length ? (
        <div className="grid gap-3">
          {branches.map((branch) => (
            <article key={branch.id} className="grid gap-4 rounded-lg border border-white/10 bg-zinc-900/70 p-4 md:grid-cols-[1fr_auto] md:items-center">
              <div>
                <h3 className="font-semibold text-white">{branch.name}</h3>
                <p className="mt-2 text-sm text-zinc-500">/{branch.slug} · {branch.is_published ? 'Published' : 'Draft'}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => editBranch(branch)} className="inline-flex items-center gap-2 rounded-md border border-white/10 px-3 py-2 text-sm text-zinc-200 hover:border-amber-300/60 hover:text-amber-200"><Edit size={16} /> Edit</button>
                <button onClick={() => deleteBranch(branch)} className="inline-flex items-center gap-2 rounded-md border border-red-400/20 px-3 py-2 text-sm text-red-200 hover:bg-red-500/10"><Trash2 size={16} /> Delete</button>
              </div>
            </article>
          ))}
        </div>
      ) : <EmptyState title="No service branches yet" message="Add branches like Studio, Social, Web, and Creative." />)}
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
