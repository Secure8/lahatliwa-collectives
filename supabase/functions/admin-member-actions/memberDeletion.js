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
  if (['super_admin', 'owner'].includes(member.role)) {
    return { allowed: false, code: 'PROTECTED_MEMBER', message: 'A privileged member account cannot be permanently deleted.' };
  }
  const references = dependencies.filter((item) => Number(item.count || 0) > 0);
  if (references.length) {
    const categories = references.map((item) => item.label);
    return { allowed: false, code: 'PROTECTED_DEPENDENCIES', categories, message: `Permanent deletion is blocked by: ${categories.join(', ')}. Deactivate this member instead.` };
  }
  return { allowed: true };
}

export function requireSuccessfulDependencyQueries(results) {
  const failed = results.find((result) => result.error);
  if (failed) throw new IdentityDeletionError('DEPENDENCY_CHECK_FAILED', `The ${failed.label} dependency check failed. No deletion was performed.`, 'dependencies', failed.error);
  return results.map(({ label, count }) => ({ label, count: Number(count || 0) }));
}

export async function deleteIdentityLayers({ memberId, authUserId, cleanupDisposableRows, verifyNoOwnedStorage, deleteAuthUser, authIdentityExists, deleteTeamRow, deleteProfile, verifyIdentityAbsent }) {
  try {
    await cleanupDisposableRows();
    await verifyNoOwnedStorage();
  } catch (error) {
    throw new IdentityDeletionError('DISPOSABLE_CLEANUP_FAILED', 'Disposable account records could not be cleaned up. The identity was not deleted.', 'database', error);
  }
  if (authUserId) {
    try {
      await deleteAuthUser(authUserId);
    } catch (error) {
      throw new IdentityDeletionError('AUTH_DELETE_FAILED', 'The Auth account could not be deleted. The Team record remains visible; retry or review the disposable pre-cleanup records.', 'auth', error);
    }
    if (await authIdentityExists()) throw new IdentityDeletionError('AUTH_DELETE_INCOMPLETE', 'Supabase Authentication still contains this account. The Team record was left visible for repair.', 'auth');
  }
  try {
    await deleteTeamRow(memberId);
  } catch (error) {
    throw new IdentityDeletionError('TEAM_DELETE_FAILED_AFTER_AUTH', authUserId
      ? 'The Auth account was deleted, but the Team record could not be deleted. This identity requires manual repair.'
      : 'The Team record could not be deleted.', 'team', error);
  }
  try {
    await deleteProfile();
    if (!(await verifyIdentityAbsent())) throw new Error('Application identity records still exist.');
  } catch (error) {
    throw new IdentityDeletionError('APPLICATION_CLEANUP_INCOMPLETE', 'Auth and Team deletion completed, but a disposable profile or verification record remains. This identity requires manual repair.', 'profile', error);
  }
  return { status: 'deleted', authDeleted: Boolean(authUserId), teamDeleted: true, profileDeleted: true };
}
