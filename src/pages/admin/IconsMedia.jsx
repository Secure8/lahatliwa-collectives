import { Copy, Trash2, Upload } from 'lucide-react';
import { useEffect, useState } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import { AdminActionButton, AdminActionGroup, AdminButton, AdminEmptyState, AdminNotice, AdminPageHeader, AdminSurface } from '../../components/admin/AdminUI';
import LoadingState from '../../components/LoadingState';
import { createMediaAsset, deleteMediaAsset, fetchMediaAssets, uploadMediaAssetFile } from '../../lib/contentApi';
import { uploadStatusText } from '../../lib/imageCompression';
import { validateUploadFile } from '../../lib/uploadLimits';

export default function IconsMedia() {
  const [assets, setAssets] = useState([]);
  const [form, setForm] = useState({ name: '', category: '', altText: '' });
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
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

  function selectFile(nextFile) {
    setError('');
    if (!nextFile) {
      setFile(null);
      return;
    }
    try {
      validateUploadFile(nextFile, 'mediaIcon');
      setFile(nextFile);
    } catch (selectionError) {
      setFile(null);
      setError(selectionError.message);
    }
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
    setUploadStatus('');
    let optimizedMessage = '';
    try {
      const { url, path } = await uploadMediaAssetFile(file, 'icons', {
        onStatus(status) {
          setUploadStatus(uploadStatusText(status));
          if (status?.message) optimizedMessage = status.message;
        },
      });
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
      setMessage(`${optimizedMessage ? `${optimizedMessage}. ` : ''}Icon uploaded. Copy its URL into a service group customIconUrl field.`);
    } catch (uploadError) {
      setError(uploadError.message || 'Icon upload failed.');
    } finally {
      setSaving(false);
      setUploadStatus('');
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
      <AdminPageHeader eyebrow="Website CMS" title="Icons / Media" description="Large PNG and WebP icons are optimized automatically to a 300 KB target. SVG files keep a 300 KB hard limit." />

      <AdminSurface as="form" onSubmit={upload} className="mb-8 grid gap-4 lg:grid-cols-[1fr_1fr_1fr_auto] lg:items-end">
        {message && <AdminNotice tone="success" className="lg:col-span-4">{message}</AdminNotice>}
        {uploadStatus && <AdminNotice tone="success" className="lg:col-span-4">{uploadStatus}</AdminNotice>}
        {error && <AdminNotice className="lg:col-span-4">{error}</AdminNotice>}
        <Field label="Icon name" value={form.name} onChange={(value) => update('name', value)} />
        <Field label="Category" value={form.category} onChange={(value) => update('category', value)} />
        <Field label="Alt text" value={form.altText} onChange={(value) => update('altText', value)} />
        <label className="grid gap-2 text-sm text-zinc-300">
          Icon file
          <span className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-zinc-950/55 px-3 py-3 text-zinc-200 ring-1 ring-white/[0.08] hover:ring-amber-200/30">
            <Upload size={16} /> {file ? file.name : 'Choose file'}
            <input className="sr-only" type="file" accept=".svg,image/svg+xml,image/png,image/webp" onChange={(event) => selectFile(event.target.files?.[0] || null)} />
          </span>
        </label>
        <AdminButton disabled={saving} type="submit" variant="primary" className="lg:col-span-4 lg:w-fit">
          {saving ? 'Uploading...' : 'Upload icon'}
        </AdminButton>
      </AdminSurface>

      {loading ? <LoadingState label="Loading icons" /> : (
        assets.length ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {assets.map((asset) => (
            <AdminSurface key={asset.id} as="article">
              <div className="flex items-start gap-4">
                <div className="grid h-16 w-16 shrink-0 place-items-center rounded-lg bg-zinc-950/55 ring-1 ring-white/[0.07]">
                  <img src={asset.url} alt={asset.alt_text || asset.name} loading="lazy" decoding="async" className="max-h-10 max-w-10 object-contain" />
                </div>
                <div className="min-w-0">
                  <h2 className="truncate font-semibold text-white">{asset.name}</h2>
                  <p className="mt-1 text-xs text-zinc-500">{asset.category || 'Uncategorized'}</p>
                  <p className="mt-2 break-all text-xs text-zinc-500">{asset.url}</p>
                </div>
              </div>
              <AdminActionGroup className="mt-4">
                <AdminActionButton onClick={() => copyUrl(asset.url)}>
                  <Copy size={14} /> Copy URL
                </AdminActionButton>
                <AdminActionButton onClick={() => remove(asset)} variant="danger">
                  <Trash2 size={14} /> Delete
                </AdminActionButton>
              </AdminActionGroup>
            </AdminSurface>
          ))}
        </div> : <AdminEmptyState title="No media assets yet" message="Uploaded icons and media assets will appear here." />
      )}
    </AdminLayout>
  );
}

function Field({ label, value, onChange }) {
  return (
    <label className="grid gap-2 text-sm text-zinc-300">
      {label}
      <input value={value} onChange={(event) => onChange(event.target.value)} className="rounded-md bg-zinc-950/55 px-3 py-3 text-white outline-none ring-1 ring-white/[0.08] transition focus:ring-amber-200/45" />
    </label>
  );
}

