import assert from 'node:assert/strict';
import test from 'node:test';
import { buildTeamMemberPayload, canAssignTeamRole, EDITORIAL_ASSIGNABLE_ROLES, TEAM_ROLES } from './teamRoles.js';

test('the only invited publishing persona is Creative', () => {
  assert.deepEqual(TEAM_ROLES, ['creative']);
  assert.equal(canAssignTeamRole('super_admin', 'creative'), true);
  for (const role of ['super_admin', 'admin', 'editor', 'writer', 'viewer']) assert.equal(canAssignTeamRole('super_admin', role), false);
});

test('Creative invitations require and preserve a public profile link', () => {
  const payload = buildTeamMemberPayload({ email: ' TEST@example.com ', display_name: '  Artist  ', role: 'creative', status: 'invited', creative_member_id: 'profile-id', editorial_roles: ['writer'] }, 'actor-id');
  assert.equal(payload.email, 'test@example.com');
  assert.equal(payload.display_name, 'Artist');
  assert.equal(payload.creative_member_id, 'profile-id');
  assert.deepEqual(payload.editorial_roles, []);
  assert.throws(() => buildTeamMemberPayload({ email: 'x@example.com', role: 'creative', status: 'invited' }), /Creative Profile/);
});

test('the retired Editorial role overlay has no assignable roles', () => {
  assert.deepEqual(EDITORIAL_ASSIGNABLE_ROLES, []);
});
