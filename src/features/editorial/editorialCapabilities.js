const ROLE_ALIASES = Object.freeze({ owner: 'super_admin' });

export const EDITORIAL_ROLES = Object.freeze(['super_admin', 'admin', 'editor', 'writer']);

export function editorialRole(role = '') {
  const value = String(role || '').trim().toLowerCase();
  return ROLE_ALIASES[value] || value;
}

export function editorialCapabilities(role = '') {
  const normalized = editorialRole(role);
  const isSuperAdmin = normalized === 'super_admin';
  const isAdmin = normalized === 'admin';
  const isEditor = normalized === 'editor';
  const isWriter = normalized === 'writer';
  const canEnter = isSuperAdmin || isAdmin || isEditor || isWriter;
  return Object.freeze({
    role: normalized,
    canEnter,
    canCreate: canEnter,
    canEditOwnDrafts: canEnter,
    canEditAssigned: canEnter,
    canSubmit: canEnter,
    canReview: isSuperAdmin || isAdmin || isEditor,
    canSchedule: isSuperAdmin || isAdmin || isEditor,
    canPublish: isSuperAdmin || isAdmin || isEditor,
    canUnpublish: isSuperAdmin || isAdmin || isEditor,
    canArchive: isSuperAdmin || isAdmin || isEditor,
    canManageSources: isSuperAdmin || isAdmin || isEditor,
    canManageHomepage: isSuperAdmin || isAdmin || isEditor,
    canManageTaxonomy: isSuperAdmin || isAdmin,
    canManageContributors: isSuperAdmin || isAdmin,
    canManageSettings: isSuperAdmin || isAdmin,
    canViewAudit: isSuperAdmin || isAdmin,
    canManageAllContent: isSuperAdmin || isAdmin || isEditor,
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
