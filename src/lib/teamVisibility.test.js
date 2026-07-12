import assert from 'node:assert/strict';
import test from 'node:test';
import { filterVisibleTeamMembers, isVisibleTeamMember, removeDeletedTeamMember } from './teamVisibility.js';

const validMembers = [
  { id: 'active', status: 'active', user_id: 'user-1', avatar_url: null, creative_member_id: null },
  { id: 'invited', status: 'invited', user_id: null, avatar_url: null, creative_member_id: null },
  { id: 'disabled', status: 'disabled', user_id: null, avatar_url: null, creative_member_id: null },
];

test('only the authoritative deleted status is hidden', () => {
  assert.deepEqual(filterVisibleTeamMembers([...validMembers, { id: 'deleted', status: 'deleted', display_name: 'Deleted member' }]).map(({ id }) => id), ['active', 'invited', 'disabled']);
});

test('invited, disabled, missing-avatar, and unlinked members remain visible', () => {
  validMembers.forEach((member) => assert.equal(isVisibleTeamMember(member), true));
});

test('backend-confirmed permanent deletion removes the exact local member', () => {
  assert.deepEqual(removeDeletedTeamMember(validMembers, 'active').map(({ id }) => id), ['invited', 'disabled']);
});

test('a stale response cannot reinsert a confirmed deleted member', () => {
  assert.deepEqual(filterVisibleTeamMembers(validMembers, new Set(['active'])).map(({ id }) => id), ['invited', 'disabled']);
});

test('missing identity fields do not create a deleted-member classification', () => {
  assert.equal(isVisibleTeamMember({ id: 'incomplete', status: 'active', email: null, display_name: null }), true);
});

test('the active Super Admin remains visible and protected from filtering', () => {
  assert.equal(isVisibleTeamMember({ id: 'root', role: 'super_admin', status: 'active' }), true);
});
