import {
  attachGoogleDriveExternalPreview,
  getGoogleDriveConnectionStatus,
  listGoogleDriveProfileFiles,
  permanentlyDeleteGoogleDriveFile,
  uploadGoogleDriveResumableFile,
} from './googleDriveStorage.js';
import { commitManagedMediaReplacement, requestManagedMediaDeletion, uploadManagedWebsiteImage } from './r2Media.js';

export async function uploadProfileWebsiteMedia(file, { creativeMemberId, kind, userId, onStatus } = {}) {
  const category = kind === 'cover' ? 'profile_cover' : 'profile_photo';
  const managed = await uploadManagedWebsiteImage(file, { category, creativeMemberId, onStatus });
  return { url: managed.primaryUrl, managedMedia: managed, provider: 'managed_media' };
}

export function cleanupReplacedProfileWebsiteMedia(oldUrl, newUrl = '') {
  return newUrl ? commitManagedMediaReplacement(newUrl, oldUrl) : requestManagedMediaDeletion(oldUrl);
}

export async function runProfileMediaUpload(file, {
  driveAvailable,
  replacementMediaObjectId = '',
  creativeMemberId,
  kind,
  userId,
  onStatus,
  dependencies,
} = {}) {
  const deps = dependencies || {};
  const isCover = kind === 'cover';
  const folder = `creative-profiles/${userId}/${isCover ? 'cover' : 'profile'}`;
  const limitKey = isCover ? 'creativeCover' : 'creativeProfile';
  if (!driveAvailable) {
    const preview = await deps.uploadPreview(file, folder, limitKey, { onStatus });
    return { url: preview.url, path: preview.path, externallyBackedUp: false, media: null };
  }
  let uploaded = null;
  let preview = null;
  try {
    uploaded = await deps.uploadOriginal(file, {
      category: 'profile_original', creativeMemberId, profileMediaKind: kind, withPreview: true, replacementMediaObjectId,
    }, { onProgress: (progress) => onStatus?.({ phase: 'uploading', message: `Private original ${progress.percent}% uploaded.` }) });
    preview = await deps.uploadPreview(file, folder, limitKey, { onStatus });
    const attached = await deps.attachPreview(uploaded.id, preview.path);
    return { url: preview.url, path: preview.path, externallyBackedUp: true, media: attached.media };
  } catch (error) {
    if (uploaded?.id) await deps.cleanup(uploaded.id).catch(() => null);
    throw error;
  }
}

export async function uploadProfileMediaWithPrivateOriginal(file, {
  creativeMemberId,
  kind,
  userId,
  onStatus,
} = {}) {
  let status = null;
  try { status = await getGoogleDriveConnectionStatus(); } catch { status = null; }
  const driveAvailable = status?.connection?.status === 'connected' && status?.projectGalleryUploadEnabled === true;
  const existing = driveAvailable ? await listGoogleDriveProfileFiles(creativeMemberId).catch(() => ({ files: [] })) : { files: [] };
  const replacement = (existing.files || []).find((item) => item.category === 'profile_original'
    && item.status === 'available' && item.preview && item.profileMediaKind === kind);
  return runProfileMediaUpload(file, {
    driveAvailable,
    replacementMediaObjectId: replacement?.id || '',
    creativeMemberId,
    kind,
    userId,
    onStatus,
    dependencies: {
      uploadOriginal: uploadGoogleDriveResumableFile,
      uploadPreview: uploadSiteAssetWithDetails,
      attachPreview: attachGoogleDriveExternalPreview,
      cleanup: permanentlyDeleteGoogleDriveFile,
    },
  });
}
