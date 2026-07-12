export class IdentityDeletionError extends Error {
  constructor(code, message, layer, cause = null) {
    super(message);
    this.name = 'IdentityDeletionError';
    this.code = code;
    this.layer = layer;
    this.cause = cause;
  }
}

export function assessDisposableIdentity(member, authUser, dependencies = []) {
  if (member.status !== 'invited' || member.user_id) {
    return { allowed: false, code: 'DEACTIVATE_REQUIRED', message: 'Activated or deactivated members must be deactivated, not deleted.' };
  }
  if (['super_admin', 'owner'].includes(member.role)) {
    return { allowed: false, code: 'PROTECTED_MEMBER', message: 'A privileged member account cannot be permanently deleted.' };
  }
  if (member.creative_member_id) {
    return { allowed: false, code: 'MEMBER_HAS_REFERENCES', message: 'This member has a linked creative profile and must be deactivated instead.' };
  }
  const references = dependencies.filter((item) => Number(item.count || 0) > 0);
  if (references.length) {
    return { allowed: false, code: 'MEMBER_HAS_REFERENCES', message: `This member has historical activity in ${references.map((item) => item.label).join(', ')} and must be deactivated instead.` };
  }
  if (authUser && (!authUser.invited_at || authUser.email_confirmed_at || authUser.confirmed_at || authUser.last_sign_in_at)) {
    return { allowed: false, code: 'AUTH_ACCOUNT_REVIEW_REQUIRED', message: 'The Auth account has been activated or used and requires Super Admin review.' };
  }
  return { allowed: true };
}

export async function deleteIdentityLayers({ memberId, authUserId, deleteAuthUser, deleteTeamRow, teamRowExists }) {
  if (authUserId) {
    try {
      await deleteAuthUser(authUserId);
    } catch (error) {
      throw new IdentityDeletionError('AUTH_DELETE_FAILED', 'The Auth account could not be deleted. The Team record was left unchanged.', 'auth', error);
    }
  }
  try {
    await deleteTeamRow(memberId);
    if (await teamRowExists(memberId)) throw new Error('Team record still exists.');
  } catch (error) {
    throw new IdentityDeletionError('TEAM_DELETE_FAILED_AFTER_AUTH', authUserId
      ? 'The Auth account was deleted, but the Team record could not be deleted. This identity requires manual repair.'
      : 'The Team record could not be deleted.', 'team', error);
  }
  return { status: 'deleted', authDeleted: Boolean(authUserId), teamDeleted: true };
}
