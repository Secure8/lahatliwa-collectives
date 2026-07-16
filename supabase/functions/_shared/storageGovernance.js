export const PUBLIC_MEDIA_MIGRATION_STATES = Object.freeze([
  'not_started', 'queued', 'in_progress', 'uploaded', 'verified', 'activated',
  'retained_for_rollback', 'queued_for_source_deletion', 'completed', 'failed', 'manual_review', 'paused',
]);

export const PUBLIC_MEDIA_REFERENCE_TYPES = Object.freeze({
  project_cover: { table: 'projects', field: 'cover_image', category: 'project_cover' },
  project_gallery: { table: 'projects', field: 'gallery_images', category: 'project_gallery' },
  creative_profile: { table: 'creative_members', field: 'profile_image_url', category: 'profile_photo' },
  creative_cover: { table: 'creative_members', field: 'cover_image', category: 'profile_cover' },
  site_setting: { table: 'site_settings', category: 'site_image' },
  service_branch: { table: 'service_branches', category: 'service_image' },
  media_asset: { table: 'media_assets', category: 'site_image' },
});

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp']);
const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const encoder = new TextEncoder();

export function budgetStatus(percent, policy = {}) {
  const value = Number(percent || 0);
  if (value >= Number(policy.blockPercent ?? 100)) return 'blocked';
  if (value >= Number(policy.pauseNonAdminPercent ?? 95)) return 'paused';
  if (value >= Number(policy.restrictLargePercent ?? 90)) return 'restricted';
  if (value >= Number(policy.strongWarningPercent ?? 85)) return 'strong_warning';
  if (value >= Number(policy.warningPercent ?? 75)) return 'warning';
  if (value >= Number(policy.infoPercent ?? 60)) return 'information';
  return 'normal';
}

export function evaluateStorageBudget({ activeBytes = 0, reservedBytes = 0, proposedBytes = 0, reserveBytes = 0, budgetBytes, role = '', override = false, overrideReason = '', largeUploadThresholdBytes = 3 * 1024 * 1024, policy = {} } = {}) {
  const budget = Math.max(1, Number(budgetBytes || 0));
  const projected = Math.max(0, Number(activeBytes)) + Math.max(0, Number(reservedBytes)) + Math.max(0, Number(proposedBytes)) + Math.max(0, Number(reserveBytes));
  const percentAfter = projected / budget * 100;
  const status = budgetStatus(percentAfter, policy);
  const superAdmin = ['owner', 'super_admin'].includes(role);
  const explicitOverride = superAdmin && override === true && String(overrideReason || '').trim().length >= 8;
  let allowed = true;
  let code = '';
  if (percentAfter >= Number(policy.blockPercent ?? 100) && !explicitOverride) { allowed = false; code = 'STORAGE_BUDGET_EXHAUSTED'; }
  else if (percentAfter >= Number(policy.pauseNonAdminPercent ?? 95) && !superAdmin) { allowed = false; code = 'STORAGE_UPLOADS_PAUSED'; }
  else if (percentAfter >= Number(policy.restrictLargePercent ?? 90) && Number(proposedBytes) >= largeUploadThresholdBytes && !superAdmin) { allowed = false; code = 'STORAGE_LARGE_UPLOAD_RESTRICTED'; }
  else if (override && !explicitOverride) { allowed = false; code = 'STORAGE_OVERRIDE_NOT_AUTHORIZED'; }
  return { allowed, code, status, percentAfter, overrideAccepted: allowed && explicitOverride };
}

export function validateLegacyImageSource({ path = '', mimeType = '', sizeBytes = 0, signature = new Uint8Array() } = {}) {
  const portable = String(path || '').replace(/\\/g, '/').replace(/^\/+/, '').split(/[?#]/)[0];
  const extension = portable.split('.').pop()?.toLowerCase() || '';
  const mime = String(mimeType || '').toLowerCase();
  const bytes = signature instanceof Uint8Array ? signature : new Uint8Array(signature || []);
  if (!portable || portable.includes('..') || !IMAGE_EXTENSIONS.has(extension) || !IMAGE_MIMES.has(mime) || Number(sizeBytes) <= 0) {
    return { eligible: false, reason: 'unclassified_or_unsupported' };
  }
  const jpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = bytes.length >= 8 && bytes.slice(0, 8).every((value, index) => value === [137,80,78,71,13,10,26,10][index]);
  const webp = bytes.length >= 12 && String.fromCharCode(...bytes.slice(0,4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8,12)) === 'WEBP';
  if ((mime === 'image/jpeg' && !jpeg) || (mime === 'image/png' && !png) || (mime === 'image/webp' && !webp)) return { eligible: false, reason: 'signature_mismatch' };
  return { eligible: true, extension, mimeType: mime, path: portable };
}

export async function migrationIdentity({ provider = 'supabase', bucket = '', path = '', recordType = '', recordId = '', field = '', checksum = '' } = {}) {
  const value = [provider, bucket, path, recordType, recordId, field, checksum].map((item) => String(item || '').trim()).join('|');
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function classifyStorageState(row = {}, migration = null) {
  if (row.status === 'deleted') return 'successfully_deleted';
  if (row.cleanup_status === 'manual_required') return 'cleanup_manual_review';
  if (row.cleanup_status === 'retry_required') return 'cleanup_retry';
  if (row.status === 'deleting' || row.accounting_state === 'pending_cleanup') return row.replaced_by_media_object_id ? 'replaced_awaiting_cleanup' : 'deleted_awaiting_cleanup';
  if (row.verification_status === 'missing') return row.provider === 'cloudflare_r2' ? 'missing_r2_object' : 'missing_supabase_source';
  if (row.accounting_state === 'provisional' || ['uploading','initiating','processing'].includes(row.status)) return 'provisional_upload';
  if (row.status === 'error' || row.verification_status === 'failed') return 'failed_upload';
  if (migration?.status === 'manual_review') return 'migration_manual_review';
  if (migration?.status === 'failed') return 'failed_migration';
  if (['in_progress','uploaded','verified','activated'].includes(migration?.status)) return 'migration_in_progress';
  if (migration?.status === 'retained_for_rollback') return 'migrated_with_retained_source';
  if (row.provider === 'cloudflare_r2' && row.status === 'available') return 'active_r2';
  if (row.provider === 'supabase' && row.status === 'available') return migration ? 'supabase_pending_migration' : 'active_supabase_legacy';
  if (row.provider === 'google_drive' && row.status === 'available') return 'active_google_drive_legacy';
  return 'inconsistent_or_unclassified';
}

export function sourceCleanupEligible(migration = {}, { now = Date.now(), sourceStillReferenced = true } = {}) {
  return migration.status === 'retained_for_rollback' && Number.isFinite(Date.parse(migration.retain_source_until || ''))
    && Date.parse(migration.retain_source_until) <= now && sourceStillReferenced === false;
}

export function shouldRecheckFinding(finding = {}, now = Date.now()) {
  return ['detected','rechecking'].includes(finding.status) && Date.parse(finding.recheck_after || '') <= now;
}
