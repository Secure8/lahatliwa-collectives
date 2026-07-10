export const PROJECT_CREDIT_ROLE_PRESETS = [
  'Photographer',
  'Photo Editor',
  'Videographer',
  'Video Editor',
  'Page Manager',
  'Social Media Manager',
  'Content Planner',
  'Caption Writer',
  'Visual Creator',
  'Web Developer',
  'Graphic Designer',
  'Creative Director',
  'Project Lead',
  'Contributor',
];

const LEGACY_CREDIT_ROLES = new Set([
  'Photographer',
  'Photo Editor',
  'Videographer',
  'Video Editor',
  'Social Media Manager',
  'Content Planner',
  'Web Developer',
  'Graphic Designer',
  'Creative Director',
  'Project Lead',
  'Contributor',
]);

const PRESET_BY_KEY = new Map(PROJECT_CREDIT_ROLE_PRESETS.map((role) => [role.toLowerCase(), role]));

function roleValues(value) {
  if (Array.isArray(value)) return value.flatMap(roleValues);
  return typeof value === 'string' ? value.split(',') : [];
}

export function normalizeCreditRoleList(values) {
  const seen = new Set();
  return roleValues(values).map((role) => role.trim().replace(/\s+/g, ' ')).filter((role) => {
    const key = role.toLowerCase();
    if (!role || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function splitProjectCreditRoles(values) {
  const roles = [];
  const customRoles = [];
  normalizeCreditRoleList(values).forEach((role) => {
    const preset = PRESET_BY_KEY.get(role.toLowerCase());
    if (preset) roles.push(preset);
    else customRoles.push(role);
  });
  return { roles, customRoles: customRoles.join(', ') };
}

export function normalizeContributorCreditDetails(details = {}) {
  const modernValues = [details.roles, details.credit_roles, details.creditRoles, details.customRoles];
  const hasModernValues = normalizeCreditRoleList(modernValues).length > 0;
  const sourceValues = hasModernValues
    ? modernValues
    : [details.selectedRole, details.creditRole, details.role, details.contribution_role];
  const normalized = splitProjectCreditRoles(sourceValues);
  return {
    roles: normalized.roles,
    customRoles: normalized.customRoles,
    isPrimary: details.isPrimary === true || details.is_primary === true,
    displayOrder: details.displayOrder ?? details.display_order ?? '',
  };
}

export function contributorCreditRoles(details) {
  const normalized = normalizeContributorCreditDetails(details);
  return normalizeCreditRoleList([normalized.roles, normalized.customRoles]);
}

export function toggleContributorPresetRole(details, role) {
  const normalized = normalizeContributorCreditDetails(details);
  const presetRole = PRESET_BY_KEY.get(String(role).trim().toLowerCase());
  if (!presetRole) return normalized;
  return {
    ...normalized,
    roles: normalized.roles.includes(presetRole)
      ? normalized.roles.filter((currentRole) => currentRole !== presetRole)
      : [...normalized.roles, presetRole],
  };
}

export function buildProjectContributorRow({ projectId, creativeId, details, index = 0 }) {
  const creditRoles = contributorCreditRoles(details);
  const legacyRole = creditRoles.find((role) => LEGACY_CREDIT_ROLES.has(role)) || 'Contributor';
  const normalized = normalizeContributorCreditDetails(details);
  return {
    project_id: projectId,
    creative_id: creativeId,
    creative_member_id: creativeId,
    credit_roles: creditRoles,
    contribution_role: legacyRole,
    role: legacyRole,
    is_primary: normalized.isPrimary,
    display_order: normalized.displayOrder === '' || normalized.displayOrder == null
      ? index * 100
      : Number(normalized.displayOrder),
  };
}
