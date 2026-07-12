import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { assessDisposableIdentity, deleteIdentityLayers, requireSuccessfulDependencyQueries } from '../../supabase/functions/admin-member-actions/memberDeletion.js';

const invited = { id: 'team-1', status: 'invited', role: 'creative', user_id: null, creative_member_id: null };
const active = { ...invited, status: 'active', user_id: 'auth-1', creative_member_id: 'creative-1' };
const pendingAuth = { id: 'auth-1', invited_at: '2026-07-13', email_confirmed_at: null, confirmed_at: null, last_sign_in_at: null };

test('successful disposable deletion removes Auth before Team', async () => {
  const calls = [];
  let teamExists = true;
  const result = await deleteIdentityLayers({ memberId: invited.id, authUserId: pendingAuth.id, cleanupDisposableRows: async () => calls.push('cleanup'), verifyNoOwnedStorage: async () => calls.push('storage'),
    deleteAuthUser: async () => calls.push('auth'),
    authIdentityExists: async () => false, deleteTeamRow: async () => { calls.push('team'); teamExists = false; },
    deleteProfile: async () => calls.push('profile'), verifyIdentityAbsent: async () => !teamExists,
  });
  assert.deepEqual(calls, ['cleanup', 'storage', 'auth', 'team', 'profile']);
  assert.deepEqual(result, { status: 'deleted', authDeleted: true, teamDeleted: true, profileDeleted: true });
});

test('failed Auth deletion leaves Team untouched', async () => {
  let teamDeleteCalled = false;
  await assert.rejects(deleteIdentityLayers({ memberId: invited.id, authUserId: pendingAuth.id,
    cleanupDisposableRows: async () => {}, verifyNoOwnedStorage: async () => {},
    deleteAuthUser: async () => { throw new Error('failed'); },
    authIdentityExists: async () => true, deleteTeamRow: async () => { teamDeleteCalled = true; }, deleteProfile: async () => {}, verifyIdentityAbsent: async () => false,
  }), (error) => error.code === 'AUTH_DELETE_FAILED' && error.layer === 'auth');
  assert.equal(teamDeleteCalled, false);
});

test('failed Team deletion after Auth deletion is explicitly reported', async () => {
  await assert.rejects(deleteIdentityLayers({ memberId: invited.id, authUserId: pendingAuth.id,
    cleanupDisposableRows: async () => {}, verifyNoOwnedStorage: async () => {}, deleteAuthUser: async () => {}, authIdentityExists: async () => false,
    deleteTeamRow: async () => { throw new Error('failed'); }, deleteProfile: async () => {}, verifyIdentityAbsent: async () => false,
  }), (error) => error.code === 'TEAM_DELETE_FAILED_AFTER_AUTH' && error.layer === 'team');
});

test('sign-in, email confirmation, password setup, active status, and an empty profile do not block deletion', () => {
  const usedAuth = { ...pendingAuth, email_confirmed_at: '2026-07-13', confirmed_at: '2026-07-13', last_sign_in_at: '2026-07-13', encrypted_password: 'set' };
  assert.equal(assessDisposableIdentity(active, usedAuth, []).allowed, true);
  assert.equal(assessDisposableIdentity({ ...active, status: 'disabled' }, usedAuth, []).allowed, true);
});

test('protected business and Storage dependencies block deletion with categories', () => {
  const result = assessDisposableIdentity(active, pendingAuth, [{ label: 'project credits', count: 1 }, { label: 'owned Storage objects', count: 1 }]);
  assert.equal(result.code, 'PROTECTED_DEPENDENCIES');
  assert.deepEqual(result.categories, ['project credits', 'owned Storage objects']);
});

test('failed dependency queries fail closed', () => {
  assert.throws(() => requireSuccessfulDependencyQueries([{ label: 'project ownership', error: new Error('offline') }]), (error) => error.code === 'DEPENDENCY_CHECK_FAILED');
});

test('frontend waits for server success and refreshes instead of optimistically hiding', async () => {
  const source = await readFile(new URL('../pages/admin/AdminTeam.jsx', import.meta.url), 'utf8');
  assert.match(source, /action === 'permanent_delete' && nextStatus === 'deleted'[\s\S]*?await loadTeam\(\{ showLoading: false \}\)/);
  assert.doesNotMatch(source, /confirmedDeletedIdsRef|removeDeletedTeamMember\(current/);
  assert.doesNotMatch(source, /soft.?delete/i);
});
