import assert from 'node:assert/strict';
import test from 'node:test';
import { canRecreatePendingInvitation, canResendInvitation, invitationConflict, invitationRedirectUrl, isActiveSuperAdmin, isExistingAuthUserError, mapInvitationApiError, mapPasswordResetApiError, normalizeInvitationEmail, orphanedAuthConflict, validateInvitationRole } from '../../supabase/functions/invite-team-member/inviteTeamMember.js';

test('invitation roles exclude privileged and unsupported roles', () => {
  ['admin', 'editor', 'creative', 'viewer'].forEach((role) => assert.equal(validateInvitationRole(role), true));
  ['super_admin', 'owner', ''].forEach((role) => assert.equal(validateInvitationRole(role), false));
});

test('email normalization is strict and lowercase', () => {
  assert.equal(normalizeInvitationEmail(' New.Member@Example.COM '), 'new.member@example.com');
  assert.equal(normalizeInvitationEmail('not-an-email'), null);
});

test('invitation redirect uses the configured HTTPS site origin', () => {
  assert.equal(invitationRedirectUrl('https://www.lahatliwa.studio/admin/login'), 'https://www.lahatliwa.studio/set-password');
  assert.equal(invitationRedirectUrl('http://localhost:5173'), 'http://localhost:5173/set-password');
  assert.throws(() => invitationRedirectUrl('http://example.com'), /HTTPS/);
});

test('only an active exact Super Admin passes server authorization', () => {
  assert.equal(isActiveSuperAdmin({ role: 'super_admin', status: 'active' }), true);
  assert.equal(isActiveSuperAdmin({ role: 'admin', status: 'active' }), false);
  assert.equal(isActiveSuperAdmin({ role: 'owner', status: 'active' }), false);
  assert.equal(isActiveSuperAdmin({ role: 'super_admin', status: 'disabled' }), false);
});

test('duplicate invited and active records have distinct safe conflicts', () => {
  assert.equal(invitationConflict({ status: 'invited' }).code, 'MEMBER_ALREADY_INVITED');
  assert.equal(invitationConflict({ status: 'active' }).code, 'MEMBER_ACTIVE');
  assert.equal(invitationConflict({ status: 'disabled' }).code, 'MEMBER_INACTIVE');
});

test('orphaned Auth accounts require explicit review and are never silently recreated', () => {
  assert.equal(orphanedAuthConflict({ invited_at: '2026-07-13', email_confirmed_at: null, last_sign_in_at: null }).code, 'ORPHANED_PENDING_AUTH');
  assert.equal(orphanedAuthConflict({ invited_at: '2026-07-13', email_confirmed_at: '2026-07-13' }).code, 'AUTH_ACCOUNT_REVIEW_REQUIRED');
  assert.equal(orphanedAuthConflict(null), null);
});

test('resend preserves role by accepting only an existing invited assignable record', () => {
  assert.equal(canResendInvitation({ status: 'invited', role: 'creative' }), true);
  assert.equal(canResendInvitation({ status: 'active', role: 'creative' }), false);
  assert.equal(canResendInvitation({ status: 'invited', role: 'super_admin' }), false);
});

test('only an untouched pending Auth invitation may be recreated', () => {
  const member = { email: 'invite@example.com', role: 'creative', status: 'invited', user_id: null };
  const authUser = { id: 'auth-id', email: member.email, invited_at: '2026-07-13', email_confirmed_at: null, confirmed_at: null, last_sign_in_at: null };
  assert.equal(canRecreatePendingInvitation(member, authUser, false), true);
  assert.equal(canRecreatePendingInvitation({ ...member, status: 'active' }, authUser, false), false);
  assert.equal(canRecreatePendingInvitation({ ...member, user_id: 'auth-id' }, authUser, false), false);
  assert.equal(canRecreatePendingInvitation(member, { ...authUser, last_sign_in_at: '2026-07-13' }, false), false);
  assert.equal(canRecreatePendingInvitation(member, authUser, true), false);
});

test('Auth invitation errors map to safe public messages', () => {
  assert.equal(mapInvitationApiError({ status: 429, message: 'rate limit' }).code, 'EMAIL_RATE_LIMITED');
  assert.equal(mapInvitationApiError({ message: 'User already registered' }).code, 'AUTH_USER_EXISTS');
  assert.equal(mapInvitationApiError({ message: 'SMTP rejected request' }).code, 'EMAIL_DELIVERY_FAILED');
});

test('password reset delivery errors use recovery-specific messages', () => {
  assert.equal(mapPasswordResetApiError({ status: 429, message: 'rate limit' }).message, 'The password-reset email rate limit was reached. Try again later.');
  assert.equal(mapPasswordResetApiError({ message: 'SMTP unavailable' }).code, 'EMAIL_DELIVERY_FAILED');
});

test('resend can safely detect an existing Auth user for account recovery fallback', () => {
  assert.equal(isExistingAuthUserError({ code: 'email_exists', message: '' }), true);
  assert.equal(isExistingAuthUserError({ message: 'User already registered' }), true);
  assert.equal(isExistingAuthUserError({ message: 'SMTP unavailable' }), false);
});
