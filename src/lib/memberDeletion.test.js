import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { assessDisposableIdentity, deleteIdentityLayers } from '../../supabase/functions/admin-member-actions/memberDeletion.js';

const invited = { id: 'team-1', status: 'invited', role: 'creative', user_id: null, creative_member_id: null };
const pendingAuth = { id: 'auth-1', invited_at: '2026-07-13', email_confirmed_at: null, confirmed_at: null, last_sign_in_at: null };

test('successful disposable deletion removes Auth before Team', async () => {
  const calls = [];
  let teamExists = true;
  const result = await deleteIdentityLayers({ memberId: invited.id, authUserId: pendingAuth.id,
    deleteAuthUser: async () => calls.push('auth'),
    deleteTeamRow: async () => { calls.push('team'); teamExists = false; },
    teamRowExists: async () => teamExists,
  });
  assert.deepEqual(calls, ['auth', 'team']);
  assert.deepEqual(result, { status: 'deleted', authDeleted: true, teamDeleted: true });
});

test('failed Auth deletion leaves Team untouched', async () => {
  let teamDeleteCalled = false;
  await assert.rejects(deleteIdentityLayers({ memberId: invited.id, authUserId: pendingAuth.id,
    deleteAuthUser: async () => { throw new Error('failed'); },
    deleteTeamRow: async () => { teamDeleteCalled = true; }, teamRowExists: async () => true,
  }), (error) => error.code === 'AUTH_DELETE_FAILED' && error.layer === 'auth');
  assert.equal(teamDeleteCalled, false);
});

test('failed Team deletion after Auth deletion is explicitly reported', async () => {
  await assert.rejects(deleteIdentityLayers({ memberId: invited.id, authUserId: pendingAuth.id,
    deleteAuthUser: async () => {}, deleteTeamRow: async () => { throw new Error('failed'); }, teamRowExists: async () => true,
  }), (error) => error.code === 'TEAM_DELETE_FAILED_AFTER_AUTH' && error.layer === 'team');
});

test('active, deactivated, linked, referenced, or used accounts cannot be deleted', () => {
  assert.equal(assessDisposableIdentity({ ...invited, status: 'active', user_id: 'auth-1' }, pendingAuth, []).allowed, false);
  assert.equal(assessDisposableIdentity({ ...invited, status: 'disabled' }, pendingAuth, []).code, 'DEACTIVATE_REQUIRED');
  assert.equal(assessDisposableIdentity({ ...invited, creative_member_id: 'creative-1' }, pendingAuth, []).allowed, false);
  assert.equal(assessDisposableIdentity(invited, pendingAuth, [{ label: 'project credits', count: 1 }]).code, 'MEMBER_HAS_REFERENCES');
  assert.equal(assessDisposableIdentity(invited, { ...pendingAuth, last_sign_in_at: '2026-07-13' }, []).code, 'AUTH_ACCOUNT_REVIEW_REQUIRED');
  assert.equal(assessDisposableIdentity(invited, pendingAuth, []).allowed, true);
});

test('frontend waits for server success and refreshes instead of optimistically hiding', async () => {
  const source = await readFile(new URL('../pages/admin/AdminTeam.jsx', import.meta.url), 'utf8');
  assert.match(source, /action === 'permanent_delete' && nextStatus === 'deleted'[\s\S]*?await loadTeam\(\{ showLoading: false \}\)/);
  assert.doesNotMatch(source, /confirmedDeletedIdsRef|removeDeletedTeamMember\(current/);
});
