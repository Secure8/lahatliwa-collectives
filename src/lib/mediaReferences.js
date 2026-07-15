export const DEFAULT_STORAGE_PROVIDER = 'supabase';
export const DEFAULT_MEDIA_BUCKET = 'project-media';

export const STORAGE_PROVIDERS = Object.freeze([
  'supabase',
  'google_drive',
  'onedrive',
  'dropbox',
  's3_compatible',
]);

export const STORAGE_CONNECTION_STATUSES = Object.freeze([
  'pending',
  'connected',
  'reconnect_required',
  'revoked',
  'disabled',
  'error',
]);

export const MEDIA_OBJECT_STATUSES = Object.freeze([
  'pending',
  'uploading',
  'available',
  'verification_required',
  'unavailable',
  'deleting',
  'deleted',
  'error',
]);

export const STORAGE_MIGRATION_STATUSES = Object.freeze([
  'queued',
  'copying',
  'verifying',
  'ready_to_switch',
  'switched',
  'retention_period',
  'completed',
  'failed',
  'cancelled',
  'rolled_back',
]);

export const MEDIA_VISIBILITIES = Object.freeze(['public', 'private', 'unlisted']);

const sets = Object.freeze({
  provider: new Set(STORAGE_PROVIDERS),
  connectionStatus: new Set(STORAGE_CONNECTION_STATUSES),
  mediaStatus: new Set(MEDIA_OBJECT_STATUSES),
  migrationStatus: new Set(STORAGE_MIGRATION_STATUSES),
  visibility: new Set(MEDIA_VISIBILITIES),
});

export function isStorageProvider(value) { return sets.provider.has(value); }
export function isStorageConnectionStatus(value) { return sets.connectionStatus.has(value); }
export function isMediaObjectStatus(value) { return sets.mediaStatus.has(value); }
export function isStorageMigrationStatus(value) { return sets.migrationStatus.has(value); }
export function isMediaVisibility(value) { return sets.visibility.has(value); }

export function requireStorageProvider(value) {
  if (!isStorageProvider(value)) throw new Error(`Unsupported storage provider: ${String(value || 'unknown')}`);
  return value;
}

function cleanString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function extractSupabaseStoragePath(value, bucket = DEFAULT_MEDIA_BUCKET) {
  const input = cleanString(value);
  if (!input || /^(data|blob):/i.test(input)) return '';
  if (!/^https?:\/\//i.test(input)) {
    const portable = input.replace(/\\/g, '/').replace(/^\/+/, '').split(/[?#]/)[0];
    return portable.toLowerCase().startsWith(`${bucket.toLowerCase()}/`)
      ? portable.slice(bucket.length + 1)
      : portable;
  }
  try {
    const pathname = new URL(input).pathname;
    const markers = [
      `/storage/v1/object/public/${bucket}/`,
      `/storage/v1/object/sign/${bucket}/`,
      `/object/public/${bucket}/`,
    ];
    const marker = markers.find((candidate) => pathname.includes(candidate));
    return marker ? decodeURIComponent(pathname.slice(pathname.indexOf(marker) + marker.length)) : '';
  } catch {
    return '';
  }
}

export function normalizeMediaReference(input, defaults = {}) {
  const source = typeof input === 'string' ? { storagePath: input } : (input || {});
  const provider = source.provider || defaults.provider || DEFAULT_STORAGE_PROVIDER;
  requireStorageProvider(provider);
  const bucket = source.bucket || defaults.bucket || (provider === 'supabase' ? DEFAULT_MEDIA_BUCKET : null);
  const originalValue = cleanString(source.storagePath || source.storage_path || source.url);
  const storagePath = provider === 'supabase' ? extractSupabaseStoragePath(originalValue, bucket || DEFAULT_MEDIA_BUCKET) : cleanString(source.storagePath || source.storage_path);

  return {
    id: source.id || null,
    provider,
    ownerUserId: source.ownerUserId || source.owner_user_id || defaults.ownerUserId || null,
    storageConnectionId: source.storageConnectionId || source.storage_connection_id || null,
    bucket: bucket || null,
    storagePath: storagePath || null,
    externalFileId: source.externalFileId || source.external_file_id || null,
    externalParentId: source.externalParentId || source.external_parent_id || null,
    filename: source.filename || (storagePath ? storagePath.split('/').pop() : null),
    mimeType: source.mimeType || source.mime_type || null,
    sizeBytes: source.sizeBytes ?? source.size_bytes ?? null,
    checksum: source.checksum || (source.checksum_value ? { algorithm: source.checksum_algorithm || null, value: source.checksum_value } : null),
    width: source.width ?? null,
    height: source.height ?? null,
    duration: source.duration ?? source.duration_seconds ?? null,
    preview: source.preview || (source.preview_provider || source.preview_path ? {
      provider: source.preview_provider || DEFAULT_STORAGE_PROVIDER,
      bucket: source.preview_bucket || DEFAULT_MEDIA_BUCKET,
      storagePath: source.preview_path || null,
    } : null),
    visibility: isMediaVisibility(source.visibility) ? source.visibility : (defaults.visibility || 'public'),
    status: isMediaObjectStatus(source.status) ? source.status : (defaults.status || 'available'),
    createdAt: source.createdAt || source.created_at || null,
    updatedAt: source.updatedAt || source.updated_at || null,
    originalValue: originalValue || null,
  };
}

export function normalizeExistingMedia(value, options = {}) {
  return normalizeMediaReference(value, { provider: DEFAULT_STORAGE_PROVIDER, bucket: DEFAULT_MEDIA_BUCKET, ...options });
}
