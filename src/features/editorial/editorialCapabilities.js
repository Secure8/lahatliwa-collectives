const ROLE_ALIASES = Object.freeze({ owner: 'super_admin' });

export const EDITORIAL_ROLES = Object.freeze(['super_admin', 'admin', 'editor', 'writer']);

export function editorialRole(role = '') {
  if (Array.isArray(role)) return role.map(editorialRole).find((value) => EDITORIAL_ROLES.includes(value)) || '';
  const value = String(role || '').trim().toLowerCase();
  return ROLE_ALIASES[value] || value;
}

export function editorialCapabilities(role = '') {
  const normalizedRoles = [...new Set((Array.isArray(role) ? role : [role]).map(editorialRole).filter(Boolean))];
  const normalized = normalizedRoles.find((value) => value === 'super_admin') || normalizedRoles.find((value) => EDITORIAL_ROLES.includes(value)) || '';
  const isSuperAdmin = normalizedRoles.includes('super_admin');
  const isAdmin = normalizedRoles.includes('admin');
  const isEditor = normalizedRoles.includes('editor');
  const isWriter = normalizedRoles.includes('writer');
  const canEnter = isSuperAdmin || isAdmin || isEditor || isWriter;
  return Object.freeze({
    role: normalized,
    roles: Object.freeze(normalizedRoles),
    canEnter,
    canCreate: canEnter,
    canEditOwnDrafts: canEnter,
    canEditAssigned: isSuperAdmin,
    canSubmit: canEnter,
    canReview: canEnter,
    canSchedule: canEnter,
    canPublish: canEnter,
    canUnpublish: canEnter,
    canArchive: canEnter,
    canRestoreOwn: canEnter,
    canDeleteOwn: canEnter,
    canDeleteAny: isSuperAdmin,
    canManageSources: canEnter,
    canManageHomepage: isSuperAdmin || isAdmin || isEditor,
    canManageTaxonomy: isSuperAdmin || isAdmin,
    canManageContributors: isSuperAdmin || isAdmin,
    canManageSettings: isSuperAdmin || isAdmin,
    canViewAudit: isSuperAdmin,
    canManageAllContent: isSuperAdmin,
  });
}

export function canAccessEditorial(role = '') {
  return editorialCapabilities(role).canEnter;
}

export function canPerformEditorialAction(role = '', action = '') {
  const capability = editorialCapabilities(role);
  const key = `can${String(action || '').trim().replace(/(^|[_-])(\w)/g, (_, __, letter) => letter.toUpperCase())}`;
  return capability[key] === true;
}
