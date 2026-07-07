import { Copy, Trash2, Upload } from 'lucide-react';
import { useEffect, useState } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import LoadingState from '../../components/LoadingState';
import { createMediaAsset, deleteMediaAsset, fetchMediaAssets, uploadMediaAssetFile } from '../../lib/contentApi';

export default function IconsMedia() {
  const [assets, setAssets] = useState([]);
  const [form, setForm] = useState({ name: '', category: '', altText: '' });
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function loadAssets() {
    setLoading(true);
    try {
      setAssets(await fetchMediaAssets('icon'));
    } catch (loadError) {
      setError(loadError.message || 'Unable to load media assets.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAssets();
  }, []);

  function update(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function upload(event) {
    event.preventDefault();
    if (!file) {
      setError('Choose an SVG, PNG, or WebP icon first.');
      return;
    }
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const { url, path } = await uploadMediaAssetFile(file, 'icons');
      const asset = await createMediaAsset({
        name: form.name || file.name,
        type: 'icon',
        category: form.category,
        url,
        storagePath: path,
        altText: form.altText || form.name || file.name,
      });
      setAssets((current) => [asset, ...current]);
      setForm({ name: '', category: '', altText: '' });
      setFile(null);
      setMessage('Icon uploaded. Copy its URL into a service group customIconUrl field.');
    } catch (uploadError) {
      setError(uploadError.message || 'Icon upload failed.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(asset) {
    const confirmed = window.confirm(`Delete "${asset.name}"?`);
    if (!confirmed) return;
    setError('');
    try {
      await deleteMediaAsset(asset);
      setAssets((current) => current.filter((item) => item.id !== asset.id));
    } catch (deleteError) {
      setError(deleteError.message || 'Unable to delete icon.');
    }
  }

  async function copyUrl(url) {
    await navigator.clipboard.writeText(url);
    setMessage('Icon URL copied.');
  }

  return (
    <AdminLayout>
      <div className="mb-8">
        <p className="text-sm text-amber-200">Website CMS</p>
        <h1 className="mt-2 text-3xl font-bold">Icons / Media</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">Upload custom SVG, PNG, or WebP icons under 500 KB. Use copied URLs in Services page content as customIconUrl.</p>
      </div>

      <form onSubmit={upload} className="mb-8 grid gap-4 rounded-lg border border-white/10 bg-zinc-900/70 p-5 lg:grid-cols-[1fr_1fr_1fr_auto] lg:items-end">
        {message && <div className="rounded-md border border-emerald-400/30 bg-emerald-500/10 p-3 text-sm text-emerald-100 lg:col-span-4">{message}</div>}
        {error && <div className="rounded-md border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-100 lg:col-span-4">{error}</div>}
        <Field label="Icon name" value={form.name} onChange={(value) => update('name', value)} />
        <Field label="Category" value={form.category} onChange={(value) => update('category', value)} />
        <Field label="Alt text" value={form.altText} onChange={(value) => update('altText', value)} />
        <label className="grid gap-2 text-sm text-zinc-300">
          Icon file
          <span className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-white/10 px-3 py-3 text-zinc-200 hover:border-amber-300/60">
            <Upload size={16} /> {file ? file.name : 'Choose file'}
            <input className="sr-only" type="file" accept=".svg,image/svg+xml,image/png,image/webp" onChange={(event) => setFile(event.target.files?.[0] || null)} />
          </span>
        </label>
        <button disabled={saving} className="rounded-md bg-amber-300 px-5 py-3 text-sm font-semibold text-zinc-950 disabled:opacity-60 lg:col-span-4 lg:w-fit">
          {saving ? 'Uploading...' : 'Upload icon'}
        </button>
      </form>

      {loading ? <LoadingState label="Loading icons" /> : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {assets.map((asset) => (
            <article key={asset.id} className="rounded-lg border border-white/10 bg-zinc-900/70 p-4">
              <div className="flex items-start gap-4">
                <div className="grid h-16 w-16 shrink-0 place-items-center rounded-md bg-zinc-950">
                  <img src={asset.url} alt={asset.alt_text || asset.name} className="max-h-10 max-w-10 object-contain" />
                </div>
                <div className="min-w-0">
                  <h2 className="truncate font-semibold text-white">{asset.name}</h2>
                  <p className="mt-1 text-xs text-zinc-500">{asset.category || 'Uncategorized'}</p>
                  <p className="mt-2 break-all text-xs text-zinc-500">{asset.url}</p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button onClick={() => copyUrl(asset.url)} className="inline-flex items-center gap-2 rounded-md border border-white/10 px-3 py-2 text-sm text-zinc-300 hover:text-white" type="button">
                  <Copy size={15} /> Copy URL
                </button>
                <button onClick={() => remove(asset)} className="inline-flex items-center gap-2 rounded-md border border-red-400/20 px-3 py-2 text-sm text-red-200 hover:bg-red-500/10" type="button">
                  <Trash2 size={15} /> Delete
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </AdminLayout>
  );
}

function Field({ label, value, onChange }) {
  return (
    <label className="grid gap-2 text-sm text-zinc-300">
      {label}
      <input value={value} onChange={(event) => onChange(event.target.value)} className="rounded-md border border-white/10 bg-zinc-950 px-3 py-3 text-white outline-none focus:border-amber-300/70" />
    </label>
  );
}
