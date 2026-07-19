export const TEAM_ROLES = ['admin', 'editor', 'writer', 'creative', 'viewer'];
export const EDITORIAL_ASSIGNABLE_ROLES = ['creative', 'writer', 'editor'];

export const TEAM_ROLE_LABELS = {
  super_admin: 'Super Admin',
  owner: 'Super Admin',
  admin: 'Admin',
  editor: 'Editor',
  writer: 'Writer',
  creative: 'Creative',
  viewer: 'Viewer',
};

export function canAssignTeamRole(actorRole, targetRole) {
  return actorRole === 'super_admin' && TEAM_ROLES.includes(targetRole);
}

export function buildTeamMemberPayload(form, invitedBy = null) {
  if (!TEAM_ROLES.includes(form.role)) throw new Error('Select a supported team role.');
  const editorialRoles = [...new Set((form.editorial_roles || []).filter((role) => EDITORIAL_ASSIGNABLE_ROLES.includes(role)))];
  return {
    email: String(form.email || '').trim().toLowerCase(),
    display_name: String(form.display_name || '').trim() || null,
    role: form.role,
    editorial_roles: editorialRoles,
    status: form.status,
    creative_member_id: form.creative_member_id || null,
    invited_by: invitedBy || null,
    updated_at: new Date().toISOString(),
  };
}
