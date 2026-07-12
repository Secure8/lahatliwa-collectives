export const ASSIGNABLE_TEAM_ROLES = ['admin', 'editor', 'creative', 'viewer'];

export function normalizeInvitationEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return null;
  return email;
}

export function validateInvitationRole(role) {
  return ASSIGNABLE_TEAM_ROLES.includes(role);
}

export function isActiveSuperAdmin(record) {
  return Boolean(record && record.role === 'super_admin' && record.status === 'active');
}

export function invitationConflict(record) {
  if (!record) return null;
  if (record.status === 'active') return { code: 'MEMBER_ACTIVE', message: 'This email already belongs to an active team member.' };
  if (record.status === 'invited') return { code: 'MEMBER_ALREADY_INVITED', message: 'This email has already been invited. Use Resend Invitation instead.' };
  return { code: 'MEMBER_EXISTS', message: 'A team record already exists for this email.' };
}

export function mapInvitationApiError(error) {
  const message = String(error?.message || '').toLowerCase();
  if (message.includes('already') || message.includes('registered') || message.includes('exists')) {
    return { code: 'AUTH_USER_EXISTS', message: 'An Auth account already exists for this email. The member can use the manual account setup or password recovery flow.' };
  }
  if (message.includes('rate') || error?.status === 429) {
    return { code: 'EMAIL_RATE_LIMITED', message: 'The invitation email rate limit was reached. Try resending later.' };
  }
  return { code: 'EMAIL_DELIVERY_FAILED', message: 'The Team record is invited, but Supabase could not send the invitation email. Use Resend Invitation or the manual setup flow.' };
}

export function isExistingAuthUserError(error) {
  const message = String(error?.message || '').toLowerCase();
  return error?.code === 'email_exists' || message.includes('already registered') || message.includes('already exists');
}

export function canResendInvitation(record) {
  return Boolean(record && record.status === 'invited' && validateInvitationRole(record.role));
}
