import { useEffect, useMemo, useRef, useState } from 'react';
import { Archive, Download, ExternalLink, FileArchive, FileUp, ImageUp, RefreshCw, RotateCcw, Trash2, X } from 'lucide-react';
import {
  accessGoogleDriveFile,
  archiveGoogleDriveFile,
  attachGoogleDriveExternalPreview,
  listGoogleDriveProjectFiles,
  permanentlyDeleteGoogleDriveFile,
  removeGoogleDrivePublicPreview,
  restoreGoogleDriveFile,
  retryGoogleDriveCleanup,
  uploadGoogleDriveResumableFile,
} from '../../lib/googleDriveStorage';
import { createProjectGalleryMediaReference } from '../../lib/mediaReferences';
import { deleteImages, prepareGalleryImageForUpload, uploadPreparedGalleryFile } from '../../lib/storage';
import { useAdminConfirmation } from './AdminDialog';

const CATEGORY_GROUPS = [
  { key: 'public', title: 'Public gallery media', description: 'Private Drive originals linked to managed public previews.' },
  { key: 'originals', title: 'Private originals', description: 'Untouched source files kept private without a public preview.' },
  { key: 'project_files', title: 'Drive-only project files', description: 'Source packages, documents, raw media, and deliverables.' },
  { key: 'archived', title: 'Archived files', description: 'Private files moved into the managed Drive Archive folder.' },
];

function formatBytes(value) {
  const bytes = Number(value || 0);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function statusLabel(file) {
  if (file.cleanupStatus === 'retry_required' || file.cleanupStatus === 'manual_required') return 'Cleanup required';
  return ({ uploading: 'Uploading', processing: 'Processing preview', available: 'Ready', archived: 'Archived', error: 'Failed', abandoned: 'Interrupted' })[file.status] || file.status;
}

function groupFor(file) {
  if (file.status === 'archived') return 'archived';
  if (file.category === 'project_file') return 'project_files';
  return file.preview ? 'public' : 'originals';
}

export default function ExternalProjectFiles({ project, enabled, onGalleryReplacement }) {
  const { requestConfirmation, confirmationDialog } = useAdminConfirmation();
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [progress, setProgress] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const abortRef = useRef(null);
  const originalsInput = useRef(null);
  const projectFilesInput = useRef(null);

  const grouped = useMemo(() => Object.fromEntries(CATEGORY_GROUPS.map((group) => [group.key, files.filter((file) => groupFor(file) === group.key)])), [files]);

  async function load() {
    if (!enabled || !project?.id) return;
    setLoading(true); setError('');
    try { const result = await listGoogleDriveProjectFiles(project.id); setFiles(result.files || []); }
    catch (loadError) { setError(loadError.message || 'Private files could not be loaded.'); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [enabled, project?.id]);

  async function upload(file, category, replacement = null) {
    if (!file) return;
    setError(''); setMessage(''); setProgress({ uploadedBytes: 0, totalBytes: file.size, percent: 0 });
    const controller = new AbortController(); abortRef.current = controller;
    try {
      const needsPreview = Boolean(replacement?.preview);
      const uploaded = await uploadGoogleDriveResumableFile(file, {
        category,
        projectId: project.id,
        withPreview: needsPreview,
        replacementMediaObjectId: replacement?.id || '',
      }, { signal: controller.signal, onProgress: setProgress });

      if (needsPreview) {
        let previewPath = '';
        try {
          const prepared = await prepareGalleryImageForUpload(file);
          previewPath = await uploadPreparedGalleryFile(prepared.file, { projectId: project.id });
          const attached = await attachGoogleDriveExternalPreview(uploaded.id, previewPath);
          const media = attached.media;
          const reference = createProjectGalleryMediaReference({
            mediaObjectId: media.id,
            filename: media.filename,
            mimeType: media.mimeType,
            status: media.status,
            previewPath: media.preview?.storagePath,
          });
          if (!reference) throw new Error('The replacement preview did not produce a safe gallery reference.');
          onGalleryReplacement?.({ oldPreviewPath: replacement.preview.storagePath, newPreviewPath: media.preview.storagePath, mediaReference: reference });
          setMessage('Replacement verified and the project now uses the new public preview. The previous private original moved to Archive.');
        } catch (previewError) {
          if (previewPath) await deleteImages([previewPath]).catch(() => null);
          throw previewError;
        }
      } else {
        setMessage(replacement ? 'Replacement verified. The previous private file moved to Archive.' : 'Private file uploaded and verified in Google Drive.');
      }
      await load();
    } catch (uploadError) {
      setError(uploadError.name === 'AbortError' ? 'Upload cancelled safely.' : uploadError.message || 'Private file upload failed. Choose the file again to retry.');
      await load();
    } finally {
      abortRef.current = null; setProgress(null); setBusyId('');
    }
  }

  async function act(file, action) {
    if (action === 'delete') {
      requestConfirmation({
        title: `Permanently delete “${file.filename}”?`,
        description: `This removes the private Google Drive file${file.preview ? ' and its public Supabase preview' : ''}. This cannot be undone.`,
        confirmLabel: 'Permanently delete',
        destructive: true,
        onConfirm: () => act(file, 'delete_confirmed'),
      });
      return;
    }
    setBusyId(file.id); setError(''); setMessage('');
    try {
      if (action === 'open' || action === 'download') await accessGoogleDriveFile(file.id, action);
      if (action === 'archive') await archiveGoogleDriveFile(file.id, 'manual');
      if (action === 'restore') await restoreGoogleDriveFile(file.id);
      if (action === 'remove_preview') await removeGoogleDrivePublicPreview(file.id);
      if (action === 'retry') await retryGoogleDriveCleanup(file.id);
      if (action === 'delete_confirmed') await permanentlyDeleteGoogleDriveFile(file.id);
      if (!['open','download'].includes(action)) {
        setMessage(action === 'archive' ? 'Private file moved to Archive. Any public preview remains available.' : action === 'restore' ? 'Private file restored to its managed folder.' : 'File lifecycle updated.');
        await load();
      }
    } catch (actionError) { setError(actionError.message || 'The private file action failed.'); }
    finally { setBusyId(''); }
  }

  if (!enabled) return (
    <div className="rounded-lg bg-white/[0.025] p-4 text-sm leading-6 text-zinc-500 ring-1 ring-white/[0.07]">
      Connect Google Drive in Storage to add private originals and Drive-only project files.
    </div>
  );

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => originalsInput.current?.click()} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-amber-200 px-3 text-sm font-medium text-zinc-950"><ImageUp size={16} /> Upload original</button>
        <button type="button" onClick={() => projectFilesInput.current?.click()} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-white/[0.06] px-3 text-sm text-zinc-200 ring-1 ring-white/[0.1]"><FileUp size={16} /> Upload project file</button>
        <button type="button" onClick={load} disabled={loading} className="inline-flex min-h-10 items-center gap-2 px-3 text-sm text-zinc-400"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh</button>
        <input ref={originalsInput} className="sr-only" type="file" onChange={(event) => { upload(event.target.files?.[0], 'project_original'); event.target.value = ''; }} />
        <input ref={projectFilesInput} className="sr-only" type="file" onChange={(event) => { upload(event.target.files?.[0], 'project_file'); event.target.value = ''; }} />
      </div>
      <p className="text-xs leading-5 text-zinc-500">Files up to 5 GB use resumable, direct-to-Drive upload. OAuth credentials remain on the server. Executable file types are blocked.</p>
      {progress && <div role="status" className="grid gap-2"><div className="h-1.5 overflow-hidden rounded-full bg-white/[0.07]"><div className="h-full bg-amber-200 transition-[width]" style={{ width: `${progress.percent}%` }} /></div><div className="flex items-center justify-between text-xs text-zinc-400"><span>{progress.percent}% · {formatBytes(progress.uploadedBytes)} of {formatBytes(progress.totalBytes)}</span><button type="button" onClick={() => abortRef.current?.abort()} className="inline-flex items-center gap-1 text-red-200"><X size={13} /> Cancel</button></div></div>}
      {message && <p role="status" className="text-sm text-emerald-200">{message}</p>}
      {error && <p role="alert" className="text-sm text-red-200">{error}</p>}

      {CATEGORY_GROUPS.map((group) => (
        <section key={group.key} className="grid gap-3 border-t border-white/[0.08] pt-4">
          <div><h3 className="text-sm font-semibold text-zinc-100">{group.title}</h3><p className="mt-1 text-xs leading-5 text-zinc-500">{group.description}</p></div>
          {!grouped[group.key]?.length ? <p className="text-xs text-zinc-600">No files in this section.</p> : (
            <div className="grid gap-2">
              {grouped[group.key].map((file) => (
                <article key={file.id} className="grid gap-3 rounded-lg bg-white/[0.025] p-3 ring-1 ring-white/[0.07] md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                  <div className="min-w-0"><p className="truncate text-sm font-medium text-zinc-100">{file.filename}</p><p className="mt-1 text-xs text-zinc-500">{file.categoryLabel} · {formatBytes(file.sizeBytes)} · Google Drive · {statusLabel(file)} · {file.previewStatus === 'ready' ? 'Public preview ready' : file.previewStatus === 'processing' ? 'Preview processing' : 'No public preview'} · {file.createdAt ? new Date(file.createdAt).toLocaleDateString() : ''}</p>{file.cleanupError && <p className="mt-1 text-xs text-red-200">Cleanup required: {file.cleanupError}</p>}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {['available','archived'].includes(file.status) && <><button type="button" onClick={() => act(file, 'open')} className="inline-flex items-center gap-1.5 px-2 py-1.5 text-xs text-zinc-300"><ExternalLink size={14} /> Open</button><button type="button" onClick={() => act(file, 'download')} className="inline-flex items-center gap-1.5 px-2 py-1.5 text-xs text-zinc-300"><Download size={14} /> Download</button></>}
                    {file.status === 'available' && <label className="inline-flex cursor-pointer items-center gap-1.5 px-2 py-1.5 text-xs text-zinc-300"><RefreshCw size={14} /> Replace<input className="sr-only" type="file" accept={file.preview ? 'image/jpeg,image/png,image/webp' : undefined} onChange={(event) => { upload(event.target.files?.[0], file.category, file); event.target.value = ''; }} /></label>}
                    {file.status === 'available' && <button type="button" onClick={() => act(file, 'archive')} className="inline-flex items-center gap-1.5 px-2 py-1.5 text-xs text-zinc-300"><Archive size={14} /> Archive</button>}
                    {file.status === 'archived' && <button type="button" onClick={() => act(file, 'restore')} className="inline-flex items-center gap-1.5 px-2 py-1.5 text-xs text-zinc-300"><RotateCcw size={14} /> Restore</button>}
                    {file.preview && <button type="button" onClick={() => act(file, 'remove_preview')} className="inline-flex items-center gap-1.5 px-2 py-1.5 text-xs text-zinc-300"><ImageUp size={14} /> Remove preview</button>}
                    {['retry_required','manual_required'].includes(file.cleanupStatus) && <button type="button" onClick={() => act(file, 'retry')} className="inline-flex items-center gap-1.5 px-2 py-1.5 text-xs text-amber-200"><RefreshCw size={14} /> Retry cleanup</button>}
                    <button type="button" disabled={busyId === file.id} onClick={() => act(file, 'delete')} className="inline-flex items-center gap-1.5 px-2 py-1.5 text-xs text-red-200"><Trash2 size={14} /> Delete</button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      ))}
      <div className="flex items-start gap-2 rounded-lg bg-amber-200/[0.05] p-3 text-xs leading-5 text-zinc-400 ring-1 ring-amber-200/10"><FileArchive size={16} className="mt-0.5 shrink-0 text-amber-200" /><span><strong className="text-zinc-200">Archive is reversible.</strong> Removing a preview affects only the managed public copy. Permanent delete removes the private Drive file and any linked preview.</span></div>
      {confirmationDialog}
    </div>
  );
}
