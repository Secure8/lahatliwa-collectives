import { createProjectGalleryMediaReference } from './mediaReferences.js';

export const GALLERY_STORAGE_DESTINATIONS = Object.freeze({
  supabase: 'supabase',
  googleDrive: 'google_drive',
});

export function isGoogleDriveGalleryAvailable({ frontendEnabled, serverEnabled, connection }) {
  return frontendEnabled === true && serverEnabled === true && connection?.status === 'connected';
}

export async function runGoogleDriveGalleryImageUpload(file, { onStatus, requestId, projectId, replacementMediaObjectId = '', dependencies } = {}) {
  const deps = dependencies || {};
  for (const required of ['attachPreview', 'deleteMedia', 'deletePreview', 'prepareImage', 'uploadOriginal', 'uploadPreview']) {
    if (typeof deps[required] !== 'function') throw new Error(`Gallery upload dependency is missing: ${required}`);
  }
  const prepared = await deps.prepareImage(file, { onStatus });
  onStatus?.({ phase: 'uploading', ...prepared });
  let media = null;
  let previewPath = '';
  try {
    const original = await deps.uploadOriginal(file, { requestId, projectId, replacementMediaObjectId });
    media = original?.media || original || null;
    if (!media?.id) throw new Error('The private original was uploaded but no safe media reference was returned.');
    if (media.preview?.storagePath) {
      const recoveredReference = createProjectGalleryMediaReference({
        mediaObjectId: media.id,
        filename: media.filename,
        mimeType: media.mimeType,
        status: media.status,
        previewPath: media.preview.storagePath,
      });
      if (!recoveredReference) throw new Error('The recovered upload does not contain a safe public preview.');
      return {
        previewPath: recoveredReference.preview.storagePath,
        mediaReference: recoveredReference,
        optimized: prepared.optimized,
        originalBytes: prepared.originalBytes,
        finalBytes: prepared.finalBytes,
        message: prepared.message,
      };
    }
    previewPath = await deps.uploadPreview(prepared.file, { projectId, onStatus });
    const finalized = await deps.attachPreview(media.id, previewPath);
    const mediaReference = createProjectGalleryMediaReference({
      mediaObjectId: finalized?.media?.id,
      filename: finalized?.media?.filename,
      mimeType: finalized?.media?.mimeType,
      status: finalized?.media?.status,
      previewPath: finalized?.media?.preview?.storagePath,
    });
    if (!mediaReference) throw new Error('The public preview could not be safely attached to the private original.');
    return {
      previewPath: mediaReference.preview.storagePath,
      mediaReference,
      optimized: prepared.optimized,
      originalBytes: prepared.originalBytes,
      finalBytes: prepared.finalBytes,
      message: prepared.message,
    };
  } catch (error) {
    const cleanup = await Promise.allSettled([
      ...(previewPath ? [deps.deletePreview(previewPath)] : []),
      ...(media?.id ? [deps.deleteMedia(media.id)] : []),
    ]);
    const cleanupFailed = cleanup.some((result) => result.status === 'rejected');
    const failure = new Error(cleanupFailed
      ? `${error.message || 'Google Drive gallery upload failed.'} Automatic cleanup needs administrator follow-up.`
      : error.message || 'Google Drive gallery upload failed.');
    failure.code = error.code || 'GOOGLE_DRIVE_GALLERY_UPLOAD_FAILED';
    throw failure;
  }
}

export async function runGoogleDriveArtifactCleanup(artifacts = [], deleteMedia) {
  if (typeof deleteMedia !== 'function') throw new Error('A secure media-delete operation is required.');
  const mediaObjectIds = [...new Set(artifacts.map((artifact) => artifact?.mediaReference?.mediaObjectId).filter(Boolean))];
  const results = await Promise.allSettled(mediaObjectIds.map((mediaObjectId) => deleteMedia(mediaObjectId)));
  return {
    cleaned: results.filter((result) => result.status === 'fulfilled').length,
    failed: results.filter((result) => result.status === 'rejected').length,
  };
}
