import assert from 'node:assert/strict';
import test from 'node:test';
import { buildTeamMemberPayload, canAssignTeamRole, EDITORIAL_ASSIGNABLE_ROLES, TEAM_ROLES } from './teamRoles.js';

test('all supported roles survive the team-member payload unchanged', () => {
  TEAM_ROLES.forEach((role) => assert.equal(buildTeamMemberPayload({ email: ' TEST@example.com ', role, status: 'invited' }).role, role));
});

test('only Super Admin can assign supported non-privileged roles', () => {
  assert.equal(canAssignTeamRole('super_admin', 'admin'), true);
  assert.equal(canAssignTeamRole('super_admin', 'viewer'), true);
  assert.equal(canAssignTeamRole('super_admin', 'super_admin'), false);
  assert.equal(canAssignTeamRole('super_admin', 'owner'), false);
  assert.equal(canAssignTeamRole('admin', 'super_admin'), false);
  assert.equal(canAssignTeamRole('admin', 'editor'), false);
});

test('payload normalizes identity fields without creating a creative link', () => {
  const payload = buildTeamMemberPayload({ email: ' TEST@example.com ', display_name: '  Editor  ', role: 'editor', status: 'invited', creative_member_id: '' }, 'actor-id');
  assert.equal(payload.email, 'test@example.com');
  assert.equal(payload.display_name, 'Editor');
  assert.equal(payload.role, 'editor');
  assert.equal(payload.creative_member_id, null);
  assert.equal(payload.invited_by, 'actor-id');
  assert.equal(typeof payload.updated_at, 'string');
});

test('payload accepts flexible Creative, Writer, and Editor combinations only', () => {
  assert.deepEqual(EDITORIAL_ASSIGNABLE_ROLES, ['creative', 'writer', 'editor']);
  const payload = buildTeamMemberPayload({ email: 'multi@example.com', role: 'creative', status: 'active', editorial_roles: ['writer', 'editor', 'writer', 'viewer'] });
  assert.deepEqual(payload.editorial_roles, ['writer', 'editor']);
});
