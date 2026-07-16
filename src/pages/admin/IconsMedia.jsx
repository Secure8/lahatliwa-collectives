import { Copy, ExternalLink, Search, Trash2, Upload } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import { AdminButton, AdminEmptyState, AdminNotice, AdminPageHeader } from '../../components/admin/AdminUI';
import { createMediaAsset, deleteMediaAsset, fetchMediaAssets, uploadMediaAssetFile } from '../../lib/contentApi';
import { uploadStatusText } from '../../lib/imageCompression';
import { validateUploadFile } from '../../lib/uploadLimits';
import { useAdminConfirmation } from '../../components/admin/AdminDialog';
import UnsavedChangesGuard from '../../components/admin/UnsavedChangesGuard';

const lineInput = 'w-full border-0 border-b border-white/[0.12] bg-transparent px-0 py-2.5 text-sm text-white outline-none transition placeholder:text-zinc-700 focus:border-amber-200/60';
const actionClass = 'inline-flex h-9 items-center gap-2 rounded-lg border border-white/[0.13] bg-zinc-800/75 px-3 text-sm font-medium text-zinc-200 shadow-sm transition hover:border-amber-200/35 hover:bg-zinc-700/80 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/50';

export default function IconsMedia() {
  const [assets, setAssets] = useState([]);
  const [form, setForm] = useState({ name: '', category: '', altText: '' });
  const [file, setFile] = useState(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [sort, setSort] = useState('newest');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState('');
  const [uploadStatus, setUploadStatus] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const { requestConfirmation, confirmationDialog } = useAdminConfirmation();

  async function loadAssets() {
    setLoading(true);
    setLoadError('');
    try {
      setAssets(await fetchMediaAssets('icon'));
    } catch (nextError) {
      setLoadError(nextError.message || 'Unable to load media assets.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAssets();
  }, []);

  const categories = useMemo(() => [...new Set(assets.map((asset) => asset.category).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [assets]);
  const visibleAssets = useMemo(() => {
    const query = search.trim().toLowerCase();
    return assets
      .filter((asset) => category === 'all' || asset.category === category)
      .filter((asset) => !query || [asset.name, asset.alt_text, asset.category, asset.storage_path, asset.url].some((value) => String(value || '').toLowerCase().includes(query)))
      .sort((a, b) => {
        if (sort === 'name') return String(a.name || '').localeCompare(String(b.name || ''));
        const difference = new Date(b.created_at || 0) - new Date(a.created_at || 0);
        return sort === 'oldest' ? -difference : difference;
      });
  }, [assets, category, search, sort]);

  function update(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
    setError('');
    setMessage('');
  }

  function selectFile(nextFile) {
    setError('');
    setMessage('');
    if (!nextFile) {
      setFile(null);
      return;
    }
    try {
      validateUploadFile(nextFile, 'mediaIcon');
      setFile(nextFile);
    } catch (selectionError) {
      setFile(null);
      setError(selectionError.message || 'This file cannot be uploaded.');
    }
  }

  async function upload(event) {
    event.preventDefault();
    if (saving) return;
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
        name: form.name.trim() || file.name,
        type: 'icon',
        category: form.category.trim(),
        url,
        storagePath: path,
        altText: form.altText.trim() || form.name.trim() || file.name,
      });
      setAssets((current) => [asset, ...current]);
      setForm({ name: '', category: '', altText: '' });
      setFile(null);
      setMessage(`${optimizedMessage ? `${optimizedMessage}. ` : ''}Asset uploaded and saved.`);
    } catch (uploadError) {
      setError(uploadError.message || 'Icon upload failed. Your metadata has been kept so you can retry.');
    } finally {
      setSaving(false);
      setUploadStatus('');
    }
  }

  function remove(asset) {
    requestConfirmation({
      title: `Delete “${asset.name}”?`,
      description: 'This URL may be used in Page Content, service branches, or public pages. Deleting it may break those references.',
      confirmLabel: 'Delete asset',
      destructive: true,
      onConfirm: () => performRemove(asset),
    });
  }

  async function performRemove(asset) {
    setDeletingId(asset.id);
    setError('');
    setMessage('');
    try {
      await deleteMediaAsset(asset);
      setAssets((current) => current.filter((item) => item.id !== asset.id));
      setMessage(`“${asset.name}” was deleted.`);
    } catch (deleteError) {
      setError(deleteError.message || `Unable to delete “${asset.name}”.`);
    } finally {
      setDeletingId('');
    }
  }

  async function copyUrl(asset) {
    try {
      await navigator.clipboard.writeText(asset.url);
      setMessage(`URL copied for “${asset.name}”.`);
      setError('');
    } catch {
      setError('Unable to copy the asset URL.');
    }
  }

  return (
    <AdminLayout>
      <UnsavedChangesGuard dirty={!saving && Boolean(file || form.name || form.category || form.altText)} />
      <div className="w-full max-w-6xl">
        <AdminPageHeader eyebrow="Website CMS" title="Media and Icons" description="Upload and manage reusable visual assets for service and content areas." />

        <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-y border-white/[0.08] py-3 text-xs uppercase tracking-[0.16em] text-zinc-600">
          <span>{visibleAssets.length} visible {visibleAssets.length === 1 ? 'asset' : 'assets'}</span>
          {visibleAssets.length !== assets.length && <span>{assets.length} total</span>}
        </div>

        {message && <AdminNotice tone="success" className="mb-5">{message}</AdminNotice>}
        {uploadStatus && <AdminNotice tone="success" className="mb-5" role="status">{uploadStatus}</AdminNotice>}
        {error && <AdminNotice className="mb-5">{error}</AdminNotice>}

        <section className="border-b border-white/[0.08] py-7 first:pt-2">
          <div className="mb-5">
            <h2 className="text-lg font-semibold text-white">Upload New Asset</h2>
            <p className="mt-1 text-sm leading-6 text-zinc-500">SVG files keep their 300 KB limit; PNG and WebP files use the existing optimization flow.</p>
          </div>
          <form onSubmit={upload} className="grid gap-5 md:grid-cols-2 xl:grid-cols-4 xl:items-end">
            <Field label="Asset name" value={form.name} onChange={(value) => update('name', value)} placeholder="Defaults to filename" />
            <Field label="Category" value={form.category} onChange={(value) => update('category', value)} placeholder="Optional grouping" />
            <Field label="Alt text" value={form.altText} onChange={(value) => update('altText', value)} placeholder="Describe the image" />
            <label className="grid gap-1.5 text-sm text-zinc-300">
              <span>Asset file</span>
              <span className="flex min-w-0 cursor-pointer items-center gap-2 border-b border-white/[0.12] py-2.5 text-zinc-300 transition hover:border-amber-200/40 hover:text-white focus-within:border-amber-200/60">
                <Upload size={16} className="shrink-0" />
                <span className="min-w-0 truncate">{file ? file.name : 'Choose SVG, PNG, or WebP'}</span>
                <input className="sr-only" type="file" accept=".svg,image/svg+xml,image/png,image/webp" disabled={saving} onChange={(event) => { selectFile(event.target.files?.[0] || null); event.target.value = ''; }} />
              </span>
            </label>
            <div className="md:col-span-2 xl:col-span-4">
              <AdminButton disabled={saving || !file} type="submit" variant="primary">
                {saving ? 'Uploading...' : 'Upload Asset'}
              </AdminButton>
            </div>
          </form>
        </section>

        <section className="border-b border-white/[0.08] py-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(14rem,1fr)_12rem_12rem]">
            <label className="grid gap-1.5 text-sm text-zinc-300">
              <span>Search assets</span>
              <span className="flex items-center gap-2 border-b border-white/[0.12]">
                <Search size={15} className="shrink-0 text-zinc-600" />
                <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, alt text, category, or filename" className={lineInput} />
              </span>
            </label>
            <SelectField label="Category" value={category} onChange={setCategory}>
              <option value="all">All categories</option>
              {categories.map((item) => <option key={item} value={item}>{item}</option>)}
            </SelectField>
            <SelectField label="Sort order" value={sort} onChange={setSort}>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="name">Name A–Z</option>
            </SelectField>
          </div>
        </section>

        <section className="py-7">
          <div className="mb-5">
            <h2 className="text-lg font-semibold text-white">Media Library</h2>
            <p className="mt-1 text-sm text-zinc-500">Icons are shown once with their saved metadata and direct public URL actions.</p>
          </div>

          {loading ? <AssetSkeletons /> : loadError ? (
            <div className="border-y border-red-300/15 py-8">
              <p className="text-sm text-red-200">{loadError}</p>
              <button type="button" onClick={loadAssets} className={`${actionClass} mt-3`}>Retry loading</button>
            </div>
          ) : visibleAssets.length ? (
            <div className="grid gap-x-6 sm:grid-cols-2 xl:grid-cols-3">
              {visibleAssets.map((asset) => (
                <AssetItem key={asset.id} asset={asset} deleting={deletingId === asset.id} onCopy={() => copyUrl(asset)} onDelete={() => remove(asset)} />
              ))}
            </div>
          ) : (
            <AdminEmptyState
              title={assets.length ? 'No matching assets' : 'No media assets yet'}
              message={assets.length ? 'Adjust the search or category filter to see more assets.' : 'Upload your first icon or media asset above.'}
            />
          )}
        </section>
      </div>
      {confirmationDialog}
    </AdminLayout>
  );
}

function AssetItem({ asset, deleting, onCopy, onDelete }) {
  const [broken, setBroken] = useState(false);
  return (
    <article className="grid min-w-0 gap-4 border-t border-white/[0.08] py-5">
      <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-4">
        <div className="grid h-[4.5rem] w-[4.5rem] place-items-center overflow-hidden bg-white/[0.025]">
          {!broken ? <img src={asset.url} alt={asset.alt_text || asset.name || 'Media asset'} loading="lazy" decoding="async" onError={() => setBroken(true)} className="max-h-14 max-w-14 object-contain" /> : <span className="px-2 text-center text-[10px] text-zinc-600">Preview unavailable</span>}
        </div>
        <div className="min-w-0">
          <h3 className="truncate font-semibold text-white" title={asset.name}>{asset.name}</h3>
          <p className="mt-1 text-xs text-zinc-500">{asset.type || 'icon'} · {asset.category || 'Uncategorized'}</p>
          {asset.alt_text && <p className="mt-2 line-clamp-2 text-xs leading-5 text-zinc-500">{asset.alt_text}</p>}
        </div>
      </div>
      <p className="truncate font-mono text-[11px] text-zinc-600" title={asset.storage_path || asset.url}>{asset.storage_path || asset.url}</p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <button type="button" onClick={onCopy} className={actionClass}><Copy size={14} /> Copy URL</button>
        <a href={asset.url} target="_blank" rel="noreferrer noopener" className={actionClass}><ExternalLink size={14} /> Open asset</a>
        <button type="button" onClick={onDelete} disabled={deleting} className={`${actionClass} border-red-300/15 text-red-200/80 hover:border-red-300/40 hover:text-red-100 disabled:cursor-not-allowed disabled:opacity-50`}><Trash2 size={14} /> {deleting ? 'Deleting...' : 'Delete'}</button>
      </div>
    </article>
  );
}

function AssetSkeletons() {
  return <div className="grid gap-x-6 sm:grid-cols-2 xl:grid-cols-3" role="status" aria-live="polite" aria-label="Loading media assets">{[0, 1, 2, 3, 4, 5].map((item) => <div key={item} className="grid grid-cols-[4.5rem_1fr] gap-4 border-t border-white/[0.08] py-5"><div className="h-[4.5rem] animate-pulse bg-white/[0.04]" /><div className="grid content-start gap-3 pt-1"><div className="h-3 w-2/3 animate-pulse bg-white/[0.05]" /><div className="h-2 w-1/2 animate-pulse bg-white/[0.04]" /></div></div>)}</div>;
}

function Field({ label, value, onChange, placeholder }) {
  return <label className="grid gap-1.5 text-sm text-zinc-300"><span>{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className={lineInput} /></label>;
}

function SelectField({ label, value, onChange, children }) {
  return <label className="grid gap-1.5 text-sm text-zinc-300"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className={`${lineInput} [color-scheme:dark]`}>{children}</select></label>;
}
