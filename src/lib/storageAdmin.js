export const STORAGE_PAGE_ROLES = Object.freeze(['super_admin', 'creative']);
export const SAFE_STORAGE_OPERATION_FIELDS = Object.freeze([
  'provider',
  'provider_account_email',
  'display_name',
  'status',
  'is_default',
  'connected_at',
  'last_verified_at',
  'last_error_code',
  'last_error_message',
]);

function normalizeStorageRole(role = '') {
  return role === 'owner' ? 'super_admin' : role || 'viewer';
}

export function canSeeStorageNavigation(access = {}) {
  const role = normalizeStorageRole(access.role);
  if (role === 'super_admin') return true;
  return role === 'creative' && Boolean(access.adminUser?.creative_member_id);
}

export function canAccessStoragePage({ role, creativeMemberId, isPublished } = {}) {
  const normalized = normalizeStorageRole(role);
  if (normalized === 'super_admin') return true;
  return normalized === 'creative' && Boolean(creativeMemberId) && isPublished === true;
}

export function storagePageMode(role) {
  return normalizeStorageRole(role) === 'super_admin' ? 'operations' : 'owner';
}
