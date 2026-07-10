import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildProjectContributorRow,
  contributorCreditRoles,
  normalizeContributorCreditDetails,
  toggleContributorPresetRole,
} from './projectCredits.js';

test('preset roles accumulate and removing one preserves the others', () => {
  let details = normalizeContributorCreditDetails({});
  details = toggleContributorPresetRole(details, 'Photographer');
  details = toggleContributorPresetRole(details, 'Photo Editor');
  details = toggleContributorPresetRole(details, 'Visual Creator');
  assert.deepEqual(details.roles, ['Photographer', 'Photo Editor', 'Visual Creator']);

  details = toggleContributorPresetRole(details, 'Photo Editor');
  assert.deepEqual(details.roles, ['Photographer', 'Visual Creator']);
});

test('custom roles are trimmed, spacing-normalized, deduplicated, and kept with presets', () => {
  const details = normalizeContributorCreditDetails({
    roles: ['Photographer'],
    customRoles: '  Art   Direction, art direction, , Campaign   Strategy  ',
  });
  assert.deepEqual(details.roles, ['Photographer']);
  assert.equal(details.customRoles, 'Art Direction, Campaign Strategy');
  assert.deepEqual(contributorCreditRoles(details), ['Photographer', 'Art Direction', 'Campaign Strategy']);
});

test('old single-value credit and draft shapes load into multi-role state', () => {
  assert.deepEqual(normalizeContributorCreditDetails({ role: 'Photo Editor', is_primary: true }), {
    roles: ['Photo Editor'],
    customRoles: '',
    isPrimary: true,
    displayOrder: '',
  });
  assert.deepEqual(normalizeContributorCreditDetails({ selectedRole: '  Creative   Producer  ' }).customRoles, 'Creative Producer');
});

test('draft JSON round trip retains every role', () => {
  const original = {
    roles: ['Photographer', 'Page Manager', 'Caption Writer'],
    customRoles: 'Art Direction, Campaign Strategy',
    isPrimary: true,
    displayOrder: 0,
  };
  const restored = normalizeContributorCreditDetails(JSON.parse(JSON.stringify(original)));
  assert.deepEqual(contributorCreditRoles(restored), [
    'Photographer',
    'Page Manager',
    'Caption Writer',
    'Art Direction',
    'Campaign Strategy',
  ]);
});

test('Supabase row sends the complete array while retaining a compatible legacy role', () => {
  const row = buildProjectContributorRow({
    projectId: 'project-1',
    creativeId: 'creative-1',
    details: {
      roles: ['Page Manager', 'Photographer', 'Photo Editor'],
      customRoles: 'Art Direction',
      isPrimary: true,
      displayOrder: 25,
    },
  });
  assert.deepEqual(row.credit_roles, ['Page Manager', 'Photographer', 'Photo Editor', 'Art Direction']);
  assert.equal(row.role, 'Photographer');
  assert.equal(row.contribution_role, 'Photographer');
  assert.equal(row.is_primary, true);
  assert.equal(row.display_order, 25);
});
