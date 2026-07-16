import { supabase } from './supabaseClient.js';

const RESULT_MESSAGES = Object.freeze({
  connected: { tone: 'success', message: 'Google Drive is connected. Your Lahat Liwa folders are ready.' },
  reconnected: { tone: 'success', message: 'Google Drive access has been restored.' },
  cancelled: { tone: 'error', message: 'Google Drive authorization was cancelled. Nothing changed.' },
  account_in_use: { tone: 'error', message: 'That Google account is already connected to another eligible Lahat Liwa account.' },
  account_mismatch: { tone: 'error', message: 'Reconnect with the same Google account that was originally connected.' },
  missing_refresh_token: { tone: 'error', message: 'Google did not grant offline access. Reconnect and approve the requested access.' },
  scope_missing: { tone: 'error', message: 'The required Google Drive permission was not granted. Reconnect and approve Drive access.' },
  folder_missing: { tone: 'error', message: 'The managed Lahat Liwa folder is unavailable. Restore it in Drive, then reconnect.' },
  folder_ambiguous: { tone: 'error', message: 'Multiple managed Lahat Liwa folders were found. Contact the Super Admin before reconnecting.' },
  state_expired: { tone: 'error', message: 'The secure Google authorization request expired or was already used. Start again.' },
  state_invalid: { tone: 'error', message: 'The Google authorization request could not be verified. Start again.' },
  provider_error: { tone: 'error', message: 'Google Drive could not finish connecting. Please try again.' },
  configuration_error: { tone: 'error', message: 'Google Drive connection is not configured on the server yet.' },
});

export function consumeGoogleDriveOAuthResult(location = window.location, history = window.history) {
  const url = new URL(location.href);
  const code = url.searchParams.get('storage_oauth') || '';
  if (!code) return null;
  url.searchParams.delete('storage_oauth');
  history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`);
  return RESULT_MESSAGES[code] || RESULT_MESSAGES.provider_error;
}

export async function invokeStorageFunction(functionName, body) {
  const { data, error } = await supabase.functions.invoke(functionName, { body });
  if (error) {
    let context = null;
    try { context = await error.context?.json(); } catch { context = null; }
    const failure = new Error(context?.message || error.message || 'The storage service could not complete the request.');
    failure.code = context?.code || 'STORAGE_SERVICE_ERROR';
    throw failure;
  }
  if (!data?.success) {
    const failure = new Error(data?.message || 'The storage service could not complete the request.');
    failure.code = data?.code || 'STORAGE_SERVICE_ERROR';
    throw failure;
  }
  return data;
}

export function getGoogleDriveConnectionStatus() {
  return invokeStorageFunction('google-drive-connection-check', { action: 'status' });
}

export function verifyGoogleDriveConnection() {
  return invokeStorageFunction('google-drive-connection-check', { action: 'verify' });
}

export async function startGoogleDriveConnection(connectionId = '') {
  const data = await invokeStorageFunction('google-drive-oauth-start', {
    returnPath: '/admin/storage',
    ...(connectionId ? { connectionId, forceConsent: true } : {}),
  });
  const destination = new URL(data.authorizationUrl);
  if (destination.origin !== 'https://accounts.google.com') throw new Error('The Google authorization destination is invalid.');
  window.location.assign(destination.toString());
}

export function disconnectGoogleDriveConnection(connectionId) {
  return invokeStorageFunction('google-drive-disconnect', { connectionId, confirmation: 'DISCONNECT_GOOGLE_DRIVE' });
}

export const GOOGLE_DRIVE_TEST_UPLOAD_MAX_BYTES = 2 * 1024 * 1024;

export function validateGoogleDriveTestFile(file) {
  const allowed = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
  if (!file) throw new Error('Choose one file to upload.');
  if (!allowed.has(file.type)) throw new Error('Choose a JPEG, PNG, WebP, or PDF file.');
  if (file.size <= 0 || file.size > GOOGLE_DRIVE_TEST_UPLOAD_MAX_BYTES) throw new Error('The test file must be larger than 0 bytes and no more than 2 MB.');
  return file;
}

export function uploadGoogleDriveTestFile(file) {
  validateGoogleDriveTestFile(file);
  const body = new FormData();
  body.append('file', file, file.name);
  body.append('purpose', 'admin_test_upload');
  return invokeStorageFunction('google-drive-upload', body);
}

export function uploadGoogleDriveProjectGalleryOriginal(file, { requestId } = {}) {
  const allowed = new Set(['image/jpeg', 'image/png', 'image/webp']);
  if (!file || !allowed.has(file.type)) throw new Error('Google Drive gallery originals must be JPEG, PNG, or WebP images.');
  if (file.size <= 0 || file.size > GOOGLE_DRIVE_TEST_UPLOAD_MAX_BYTES) throw new Error('The prepared gallery image must be larger than 0 bytes and no more than 2 MB.');
  const body = new FormData();
  body.append('file', file, file.name);
  body.append('purpose', 'project_gallery_original');
  body.append('request_id', requestId);
  return invokeStorageFunction('google-drive-upload', body);
}

export function attachGoogleDriveGalleryPreview(mediaObjectId, previewPath) {
  return invokeStorageFunction('google-drive-media-lifecycle', { action: 'attach_preview', mediaObjectId, previewPath });
}

export function deleteGoogleDriveMedia(mediaObjectId, { projectId = '' } = {}) {
  return invokeStorageFunction('google-drive-media-lifecycle', {
    action: 'delete',
    mediaObjectId,
    ...(projectId ? { projectId } : {}),
  });
}

export function prepareGoogleDriveProjectDeletion(projectId, mediaObjectIds) {
  return invokeStorageFunction('google-drive-media-lifecycle', {
    action: 'prepare_project_delete',
    projectId,
    mediaObjectIds,
  });
}

export function prepareGoogleDriveProjectMediaRemoval(projectId, mediaObjectIds) {
  return invokeStorageFunction('google-drive-media-lifecycle', {
    action: 'prepare_project_media_removal',
    projectId,
    mediaObjectIds,
  });
}

export async function uploadGoogleDriveResumableFile(file, input, { onProgress, signal } = {}) {
  if (!file) throw new Error('Choose a file to upload.');
  const started = await invokeStorageFunction('google-drive-resumable-upload', {
    action: 'initiate',
    category: input.category,
    filename: file.name,
    mimeType: file.type || 'application/octet-stream',
    sizeBytes: file.size,
    ...(input.projectId ? { projectId: input.projectId } : {}),
    ...(input.creativeMemberId ? { creativeMemberId: input.creativeMemberId } : {}),
    ...(input.profileMediaKind ? { profileMediaKind: input.profileMediaKind } : {}),
    ...(input.withPreview ? { withPreview: true } : {}),
    ...(input.replacementMediaObjectId ? { replacementMediaObjectId: input.replacementMediaObjectId } : {}),
  });
  const upload = started.upload;
  const mediaId = upload?.media?.id;
  if (!mediaId || !upload?.sessionUrl) throw new Error('The resumable upload session was not created safely.');
  let uploadedBytes = 0;
  try {
    while (uploadedBytes < file.size) {
      if (signal?.aborted) throw Object.assign(new Error('Upload cancelled.'), { name: 'AbortError' });
      const endExclusive = Math.min(file.size, uploadedBytes + Number(upload.chunkSize || 8 * 1024 * 1024));
      const chunk = file.slice(uploadedBytes, endExclusive);
      const response = await fetch(upload.sessionUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': file.type || 'application/octet-stream',
          'Content-Range': `bytes ${uploadedBytes}-${endExclusive - 1}/${file.size}`,
        },
        body: chunk,
        signal,
        redirect: 'manual',
      });
      if (![200, 201, 308].includes(response.status)) {
        const failure = new Error(response.status === 404 || response.status === 410
          ? 'The upload session expired. Choose the file again to retry.'
          : 'Google Drive interrupted the upload. Choose Retry to start a new secure session.');
        failure.code = 'RESUMABLE_UPLOAD_INTERRUPTED';
        failure.mediaObjectId = mediaId;
        throw failure;
      }
      uploadedBytes = endExclusive;
      onProgress?.({ uploadedBytes, totalBytes: file.size, percent: Math.round((uploadedBytes / file.size) * 100) });
      await invokeStorageFunction('google-drive-resumable-upload', { action: 'progress', mediaObjectId: mediaId, uploadedBytes });
    }
    const finalized = await invokeStorageFunction('google-drive-resumable-upload', { action: 'finalize', mediaObjectId: mediaId });
    return finalized.media;
  } catch (error) {
    await invokeStorageFunction('google-drive-resumable-upload', { action: 'cancel', mediaObjectId: mediaId }).catch(() => null);
    error.mediaObjectId ||= mediaId;
    throw error;
  }
}

export function cancelGoogleDriveResumableUpload(mediaObjectId) {
  return invokeStorageFunction('google-drive-resumable-upload', { action: 'cancel', mediaObjectId });
}

export function listGoogleDriveProjectFiles(projectId) {
  return invokeStorageFunction('google-drive-file-lifecycle', { action: 'list', projectId });
}

export function listGoogleDriveProfileFiles(creativeMemberId) {
  return invokeStorageFunction('google-drive-file-lifecycle', { action: 'list', creativeMemberId });
}

export function attachGoogleDriveExternalPreview(mediaObjectId, previewPath) {
  return invokeStorageFunction('google-drive-file-lifecycle', { action: 'attach_preview', mediaObjectId, previewPath });
}

export function archiveGoogleDriveFile(mediaObjectId, reason = 'manual') {
  return invokeStorageFunction('google-drive-file-lifecycle', { action: 'archive', mediaObjectId, reason });
}

export function restoreGoogleDriveFile(mediaObjectId) {
  return invokeStorageFunction('google-drive-file-lifecycle', { action: 'restore', mediaObjectId });
}

export function removeGoogleDrivePublicPreview(mediaObjectId) {
  return invokeStorageFunction('google-drive-file-lifecycle', { action: 'remove_preview', mediaObjectId });
}

export function permanentlyDeleteGoogleDriveFile(mediaObjectId) {
  return invokeStorageFunction('google-drive-file-lifecycle', { action: 'permanent_delete', mediaObjectId, confirmation: 'PERMANENTLY_DELETE_PRIVATE_FILE' });
}

export function retryGoogleDriveCleanup(mediaObjectId) {
  return invokeStorageFunction('google-drive-file-lifecycle', { action: 'retry_cleanup', mediaObjectId });
}

export function archiveGoogleDriveProjectFiles(projectId) {
  return invokeStorageFunction('google-drive-file-lifecycle', { action: 'archive_project', projectId });
}

export async function accessGoogleDriveFile(mediaObjectId, mode = 'open') {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Your session has expired. Please sign in again.');
  const baseUrl = String(import.meta.env?.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  const response = await fetch(`${baseUrl}/functions/v1/google-drive-file-access`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ mediaObjectId, mode }),
  });
  if (!response.ok) {
    let payload = null; try { payload = await response.json(); } catch { payload = null; }
    throw new Error(payload?.message || 'The private file could not be opened.');
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  if (mode === 'download') {
    const anchor = document.createElement('a');
    anchor.href = url;
    const disposition = response.headers.get('Content-Disposition') || '';
    anchor.download = disposition.match(/filename="([^"]+)"/)?.[1] || 'private-file';
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  } else {
    const opened = window.open(url, '_blank', 'noopener,noreferrer');
    if (!opened) URL.revokeObjectURL(url);
    else window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}

export function googleDriveStatusLabel(status) {
  return ({
    connected: 'Connected', reconnect_required: 'Reconnect required', error: 'Attention needed',
    pending: 'Pending', revoked: 'Disconnected', disabled: 'Disconnected',
  })[status] || 'Not connected';
}
