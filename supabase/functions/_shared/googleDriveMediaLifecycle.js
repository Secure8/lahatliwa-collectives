export const PROJECT_MEDIA_BUCKET = 'project-media';
export const PROJECT_GALLERY_PREVIEW_PREFIX = 'projects/gallery/';
export const PROJECT_GALLERY_ORIGINAL_PURPOSE = 'project_gallery_original';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_IMAGE_EXTENSION = /\.(?:jpe?g|png|webp)$/i;

export function isSafeUuid(value) {
  return UUID_PATTERN.test(String(value || '').trim());
}

export function normalizeProjectGalleryPreviewPath(value = '') {
  if (typeof value !== 'string') return '';
  let path = value.trim().replace(/^\/+/, '').split(/[?#]/)[0];
  try { path = decodeURIComponent(path); } catch { return ''; }
  if (!path.startsWith(PROJECT_GALLERY_PREVIEW_PREFIX) || path.length > 512 || path.includes('..') || path.includes('\\') || !SAFE_IMAGE_EXTENSION.test(path)) return '';
  return path;
}

export function projectGalleryMediaObjectId(item = {}) {
  const media = item?.media || item?.media_reference || {};
  if (media.provider !== 'google_drive') return '';
  const id = media.mediaObjectId || media.media_object_id || media.id;
  return isSafeUuid(id) ? id : '';
}

export function projectReferencesMediaObject(project = {}, mediaObjectId = '') {
  if (!isSafeUuid(mediaObjectId)) return false;
  return (Array.isArray(project.gallery_items) ? project.gallery_items : [])
    .some((item) => projectGalleryMediaObjectId(item) === mediaObjectId);
}

export function safeExternalMediaResponse(row = {}) {
  const previewPath = normalizeProjectGalleryPreviewPath(row.preview_path);
  return {
    id: row.id,
    provider: 'google_drive',
    filename: row.filename || '',
    mimeType: row.mime_type || '',
    sizeBytes: Number(row.size_bytes || 0),
    status: row.status,
    preview: previewPath ? {
      provider: 'supabase',
      bucket: PROJECT_MEDIA_BUCKET,
      storagePath: previewPath,
    } : null,
  };
}

export function validCleanupAuthorization(metadata = {}, { actorUserId, projectId, now = Date.now() } = {}) {
  const authorization = metadata?.cleanup_authorization;
  if (!authorization || authorization.actor_user_id !== actorUserId || authorization.project_id !== projectId) return false;
  const expiresAt = new Date(authorization.expires_at || '').getTime();
  return Number.isFinite(expiresAt) && expiresAt > now;
}
