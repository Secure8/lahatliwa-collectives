export const EXTERNAL_FILE_MAX_BYTES = 5 * 1024 * 1024 * 1024;
export const RESUMABLE_CHUNK_BYTES = 8 * 1024 * 1024;
export const RESUMABLE_SESSION_TTL_MS = 60 * 60 * 1000;

export const EXTERNAL_FILE_CATEGORIES = Object.freeze({
  project_original: Object.freeze({ folderRole: 'originals', label: 'Private original', target: 'project', publicPreviewAllowed: true }),
  project_file: Object.freeze({ folderRole: 'project_files', label: 'Drive-only project file', target: 'project', publicPreviewAllowed: false }),
  profile_original: Object.freeze({ folderRole: 'profile_media', label: 'Profile original', target: 'profile', publicPreviewAllowed: true }),
});

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PUBLIC_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const BLOCKED_EXECUTABLE_TYPES = new Set([
  'application/x-msdownload',
  'application/x-dosexec',
  'application/x-executable',
  'application/x-sharedlib',
]);
const BLOCKED_EXECUTABLE_EXTENSION = /\.(?:apk|app|bat|cmd|com|dll|dmg|exe|ipa|jar|msi|ps1|scr|sh)$/i;

export function externalFileCategory(value = '') {
  return EXTERNAL_FILE_CATEGORIES[String(value || '').trim()] || null;
}

export function safeExternalFilename(value = '') {
  const normalized = String(value || '').normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g, '').replace(/[\\/:*?"<>|]/g, '-').trim();
  return normalized.slice(0, 180);
}

export function validateExternalUploadRequest(input = {}) {
  const category = externalFileCategory(input.category);
  const filename = safeExternalFilename(input.filename);
  const mimeType = String(input.mimeType || 'application/octet-stream').trim().toLowerCase().slice(0, 160);
  const sizeBytes = Number(input.sizeBytes || 0);
  const projectId = String(input.projectId || '');
  const creativeMemberId = String(input.creativeMemberId || '');
  const withPreview = input.withPreview === true;

  if (!category) return { ok: false, code: 'CATEGORY_NOT_ALLOWED', message: 'Choose a supported external file category.' };
  if (!filename) return { ok: false, code: 'FILENAME_REQUIRED', message: 'The selected file needs a valid filename.' };
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > EXTERNAL_FILE_MAX_BYTES) {
    return { ok: false, code: 'FILE_SIZE_NOT_ALLOWED', message: 'Files must be larger than 0 bytes and no more than 5 GB.' };
  }
  if (!/^[a-z0-9][a-z0-9!#$&^_.+-]+\/[a-z0-9][a-z0-9!#$&^_.+-]+$/i.test(mimeType) || BLOCKED_EXECUTABLE_TYPES.has(mimeType) || BLOCKED_EXECUTABLE_EXTENSION.test(filename)) {
    return { ok: false, code: 'FILE_TYPE_NOT_ALLOWED', message: 'That executable file type is not accepted.' };
  }
  if (category.target === 'project' && !UUID_PATTERN.test(projectId)) return { ok: false, code: 'PROJECT_REQUIRED', message: 'Save the project before uploading private files.' };
  if (category.target === 'profile' && !UUID_PATTERN.test(creativeMemberId)) return { ok: false, code: 'PROFILE_REQUIRED', message: 'A valid creative profile is required.' };
  if (withPreview && (!category.publicPreviewAllowed || !PUBLIC_IMAGE_TYPES.has(mimeType))) {
    return { ok: false, code: 'PREVIEW_NOT_ALLOWED', message: 'Public previews are available only for supported JPEG, PNG, and WebP originals.' };
  }
  return { ok: true, category, filename, mimeType, sizeBytes, projectId, creativeMemberId, withPreview };
}

export function safeExternalFileResponse(row = {}) {
  return {
    id: row.id,
    provider: 'google_drive',
    filename: row.filename || '',
    mimeType: row.mime_type || '',
    sizeBytes: Number(row.size_bytes || 0),
    category: row.file_category || row.metadata?.purpose || 'project_file',
    categoryLabel: externalFileCategory(row.file_category)?.label || 'Private file',
    status: row.status || 'pending',
    projectId: row.project_id || null,
    creativeMemberId: row.creative_member_id || null,
    profileMediaKind: row.profile_media_kind || null,
    previewStatus: row.preview_path ? 'ready' : row.preview_required ? 'processing' : 'not_required',
    preview: row.preview_path ? { provider: 'supabase', bucket: row.preview_bucket, storagePath: row.preview_path } : null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    archivedAt: row.archived_at || null,
    archiveStatus: row.status === 'archived' ? 'archived' : 'active',
    cleanupStatus: row.cleanup_status || 'none',
    cleanupError: row.cleanup_error || '',
    replacesMediaObjectId: row.replaces_media_object_id || null,
    replacedByMediaObjectId: row.replaced_by_media_object_id || null,
  };
}

export function resumableChunkRange(start, chunkBytes, totalBytes) {
  const safeStart = Math.max(0, Number(start || 0));
  const end = Math.min(totalBytes, safeStart + chunkBytes) - 1;
  return { start: safeStart, end, length: Math.max(0, end - safeStart + 1), final: end + 1 >= totalBytes };
}

export function replacementCanActivate(row = {}) {
  if (!row.replaces_media_object_id) return true;
  return row.preview_required !== true || Boolean(row.preview_path);
}

export function projectPermissionAllowed({ role, userId, creativeMemberId, project, accessLevel = '', contributorCreativeIds = [] } = {}, mode = 'view') {
  if (!project || !userId) return false;
  if (role === 'super_admin' || project.owner_user_id === userId || project.created_by === userId) return true;
  const allowedLevels = mode === 'view' ? ['viewer', 'editor', 'manager'] : mode === 'edit' ? ['editor', 'manager'] : ['manager'];
  if (allowedLevels.includes(accessLevel)) return true;
  return mode === 'view' && Boolean(creativeMemberId) && contributorCreativeIds.includes(creativeMemberId);
}
