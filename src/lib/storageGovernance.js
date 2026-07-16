import { supabase } from './supabaseClient.js';
import { createWebsiteImageDerivatives, validateMigrationImageSource } from './imageCompression.js';

async function invoke(functionName, body) {
  const { data, error } = await supabase.functions.invoke(functionName, { body });
  if (error) {
    let context = null; try { context = await error.context?.json(); } catch { context = null; }
    throw Object.assign(new Error(context?.message || error.message || 'The storage operation failed.'), { code: context?.code || 'STORAGE_OPERATION_FAILED' });
  }
  if (!data?.success) throw Object.assign(new Error(data?.message || 'The storage operation failed.'), { code: data?.code || 'STORAGE_OPERATION_FAILED' });
  return data;
}

export const fetchStorageGovernanceDashboard = () => invoke('storage-governance', { action: 'dashboard' });
export const updateStoragePolicy = (policy) => invoke('storage-governance', { action: 'update_policy', policy });
export const pausePublicMediaMigration = () => invoke('storage-governance', { action: 'pause_migration' });
export const resumePublicMediaMigration = () => invoke('storage-governance', { action: 'resume_migration' });
export const listPublicMediaMigrations = (options = {}) => invoke('storage-governance', { action: 'list_migrations', ...options });
export const inspectPublicMediaMigration = (id) => invoke('storage-governance', { action: 'inspect_migration', id });
export const retryPublicMediaMigration = (id) => invoke('storage-governance', { action: 'retry_migration', id });
export const markPublicMediaMigrationManualReview = (id, reason) => invoke('storage-governance', { action: 'mark_manual_review', id, reason });
export const verifyPublicMediaMigration = (id) => invoke('storage-governance', { action: 'verify_migration', id });
export const discoverPublicMediaMigration = (limit = 50) => invoke('public-media-migration', { action: 'discover', limit });

export async function processOnePublicMediaMigration({ onProgress } = {}) {
  let task = null;
  let stage = 'preparing';
  const progress = (phase, detail = {}) => { stage = phase; onProgress?.({ phase, ...detail }); };
  progress('preparing');
  try {
    const prepared = await invoke('public-media-migration', { action: 'prepare_one' });
    task = prepared.result?.task || null;
    if (!task) return { claimed: 0, result: null };

    progress('downloading', { migrationId: task.migrationId, sourceName: task.source.filename });
    const response = await fetch(task.source.url, { method: 'GET', credentials: 'omit', redirect: 'error', cache: 'no-store' });
    if (!response.ok) throw Object.assign(new Error('The secure source download failed.'), { code: 'SOURCE_DOWNLOAD_FAILED' });
    const contentLength = Number(response.headers.get('content-length') || task.source.sizeBytes || 0);
    if (!Number.isSafeInteger(contentLength) || contentLength <= 0 || contentLength > Number(task.source.maxBytes || 0)) throw Object.assign(new Error('The source download exceeded the safe browser limit.'), { code: 'SOURCE_TOO_LARGE_FOR_BROWSER' });
    const blob = await response.blob();
    if (blob.size !== Number(task.source.sizeBytes)) throw Object.assign(new Error('The downloaded source size changed after preparation.'), { code: 'SOURCE_SIZE_CHANGED' });
    const source = new File([blob], task.source.filename, { type: task.source.mimeType, lastModified: Date.now() });
    await validateMigrationImageSource(source, { maxBytes: task.source.maxBytes });

    const derivatives = await createWebsiteImageDerivatives(source, {
      label: 'Migration source',
      onStatus: (status) => {
        if (status.phase === 'transforming') progress(status.variant, { migrationId: task.migrationId, variant: status.variant });
      },
    });
    await invoke('public-media-migration', {
      action: 'authorize_variants', migrationId: task.migrationId, token: task.token,
      variants: derivatives.map(({ variant, mimeType, sizeBytes, width, height }) => ({ variant, mimeType, sizeBytes, width, height })),
    });

    progress('uploading', { migrationId: task.migrationId, completed: 0, total: 3 });
    for (let index = 0; index < task.uploads.length; index += 1) {
      const upload = task.uploads[index]; const derivative = derivatives.find((item) => item.variant === upload.variant);
      if (!derivative) throw Object.assign(new Error('A prepared derivative is missing.'), { code: 'DERIVATIVE_MISSING' });
      const form = new FormData(); form.append('mediaId', upload.mediaId); form.append('groupId', task.mediaGroupId);
      form.append('migrationId', task.migrationId); form.append('migrationToken', task.token);
      form.append('file', derivative.file, `${upload.variant}.webp`);
      const { data, error } = await supabase.functions.invoke('r2-media-upload', { body: form });
      if (error || !data?.success) throw Object.assign(new Error(data?.message || error?.message || `${upload.variant} upload failed.`), { code: data?.code || 'MIGRATION_UPLOAD_FAILED' });
      progress('uploading', { migrationId: task.migrationId, variant: upload.variant, completed: index + 1, total: 3 });
    }

    progress('verifying', { migrationId: task.migrationId });
    const finalized = await invoke('public-media-migration', { action: 'finalize_one', migrationId: task.migrationId, token: task.token });
    progress('activating', { migrationId: task.migrationId });
    progress('retained', { migrationId: task.migrationId, retainedUntil: finalized.result?.retainedUntil });
    return { claimed: 1, result: finalized.result };
  } catch (error) {
    if (task?.migrationId && task?.token) {
      await invoke('public-media-migration', { action: 'fail_one', migrationId: task.migrationId, token: task.token, stage, errorCode: error.code || 'BROWSER_MIGRATION_FAILED', message: error.message }).catch(() => null);
    }
    throw Object.assign(error, { stage, migrationId: task?.migrationId || null });
  }
}
export async function reconcilePublicMediaProviders() {
  const [r2, supabaseResult] = await Promise.all([
    invoke('public-media-migration', { action: 'reconcile' }),
    invoke('supabase-media-reconciliation', { action: 'reconcile' }),
  ]);
  return { success: true, providers: { r2: r2.result, supabase: supabaseResult.result } };
}
