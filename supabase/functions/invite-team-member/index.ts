import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { canRecreatePendingInvitation, canResendInvitation, invitationConflict, invitationRedirectUrl, isActiveSuperAdmin, isExistingAuthUserError, mapInvitationApiError, mapPasswordResetApiError, normalizeEditorialRoles, normalizeInvitationEmail, orphanedAuthConflict, validateInvitationRole } from './inviteTeamMember.js';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
const fail = (code: string, message: string, status: number, extra: Record<string, unknown> = {}) => reply({ success: false, code, message, ...extra }, status);

async function findAuthUserByEmail(admin: any, email: string) {
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const user = data.users.find((candidate: any) => normalizeInvitationEmail(candidate.email) === email);
    if (user) return user;
    if (data.users.length < 1000) return null;
  }
  throw new Error('Auth user lookup exceeded its safe page limit.');
}

async function authUserHasActivity(admin: any, userId: string) {
  const checks = await Promise.all([
    admin.from('admin_users').select('id', { count: 'exact', head: true }).or(`user_id.eq.${userId},invited_by.eq.${userId}`),
    admin.from('projects').select('id', { count: 'exact', head: true }).or(`created_by.eq.${userId},updated_by.eq.${userId},owner_user_id.eq.${userId}`),
    admin.from('project_access').select('id', { count: 'exact', head: true }).or(`user_id.eq.${userId},granted_by.eq.${userId}`),
    admin.from('contributor_requests').select('id', { count: 'exact', head: true }).or(`requester_user_id.eq.${userId},reviewed_by.eq.${userId}`),
    admin.from('storage_cleanup_jobs').select('id', { count: 'exact', head: true }).eq('created_by', userId),
    admin.from('admin_member_lifecycle_snapshots').select('admin_user_id', { count: 'exact', head: true }).eq('removed_by', userId),
  ]);
  const failed = checks.find((result) => result.error);
  if (failed?.error) throw failed.error;
  return checks.some((result) => Number(result.count || 0) > 0);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return reply({ success: true });
  if (req.method !== 'POST') return fail('METHOD_NOT_ALLOWED', 'Method not allowed.', 405);

  const authorization = req.headers.get('Authorization');
  if (!authorization) return fail('MISSING_AUTH', 'Your session has expired. Please sign in again.', 401);

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const siteUrl = Deno.env.get('PUBLIC_SITE_URL');
  if (!url || !anonKey || !serviceKey || !siteUrl) return fail('SERVER_CONFIGURATION', 'The invitation service is not configured.', 500);
  let redirectTo = '';
  try {
    redirectTo = invitationRedirectUrl(siteUrl);
  } catch {
    return fail('SERVER_CONFIGURATION', 'The invitation service redirect is not configured.', 500);
  }

  try {
    const callerClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
    const { data: { user }, error: userError } = await callerClient.auth.getUser();
    if (userError || !user) return fail('INVALID_SESSION', 'Your session has expired. Please sign in again.', 401);

    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    const { data: caller, error: callerError } = await admin.from('admin_users').select('id, role, status').eq('user_id', user.id).maybeSingle();
    if (callerError) {
      console.error('[team-invite] caller lookup failed', { code: callerError.code });
      return fail('DATABASE_ERROR', 'The invitation service could not verify your access.', 500);
    }
    if (!isActiveSuperAdmin(caller)) return fail('NOT_SUPER_ADMIN', 'Only the active Super Admin can invite team members.', 403);

    const body = await req.json();
    const action = String(body.action || 'invite');
    if (!['invite', 'resend', 'password_reset'].includes(action)) return fail('INVALID_ACTION', 'The requested invitation action is invalid.', 400);

    if (action === 'password_reset') {
      const memberId = String(body.memberId || '');
      const { data: member, error: memberError } = await admin.from('admin_users').select('id, email, user_id, status').eq('id', memberId).maybeSingle();
      if (memberError) return fail('DATABASE_ERROR', 'The member account could not be checked.', 500);
      if (!member || member.status !== 'active' || !member.user_id) return fail('NOT_ACTIVE', 'Password resets are available only for activated members.', 409);
      const email = normalizeInvitationEmail(member.email);
      if (!email) return fail('INVALID_EMAIL', 'The team member has an invalid email address.', 409);
      const { error: resetError } = await admin.auth.resetPasswordForEmail(email, { redirectTo });
      if (resetError) {
        console.error('[team-invite] password reset delivery failed', { status: resetError.status, code: resetError.code || 'AUTH_RECOVERY_ERROR' });
        const safe = mapPasswordResetApiError(resetError);
        return fail(safe.code, safe.message, resetError.status === 429 ? 429 : 502);
      }
      return reply({ success: true, code: 'PASSWORD_RESET_SENT', message: 'Password reset email sent.', memberId: member.id });
    }

    if (action === 'resend') {
      const memberId = String(body.memberId || '');
      if (!memberId) return fail('MEMBER_NOT_FOUND', 'The invited team member could not be found.', 400);
      const { data: member, error: memberError } = await admin.from('admin_users').select('id, email, user_id, role, status').eq('id', memberId).maybeSingle();
      if (memberError) {
        console.error('[team-invite] resend lookup failed', { code: memberError.code });
        return fail('DATABASE_ERROR', 'The invitation could not be checked.', 500);
      }
      if (!member) return fail('MEMBER_NOT_FOUND', 'The invited team member could not be found.', 404);
      if (!canResendInvitation(member)) return fail('NOT_INVITED', 'Only pending invitations with an assignable role can be resent.', 409);
      const email = normalizeInvitationEmail(member.email);
      if (!email) return fail('INVALID_EMAIL', 'The invited team member has an invalid email address.', 409);

      const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo });
      if (inviteError) {
        if (isExistingAuthUserError(inviteError)) {
          const authUser = await findAuthUserByEmail(admin, email);
          const hasActivity = authUser ? await authUserHasActivity(admin, authUser.id) : true;
          if (!canRecreatePendingInvitation(member, authUser, hasActivity)) {
            return fail('INVITATION_NOT_RECREATABLE', 'This invitation cannot be resent because the Auth account is no longer an untouched pending invitation.', 409, { memberState: 'invited' });
          }
          const { error: deleteError } = await admin.auth.admin.deleteUser(authUser.id, false);
          if (deleteError) {
            console.error('[team-invite] pending Auth invitation removal failed', { status: deleteError.status, code: deleteError.code || 'AUTH_DELETE_ERROR' });
            return fail('INVITATION_RESEND_FAILED', 'The pending invitation could not be safely refreshed.', 502, { memberState: 'invited' });
          }
          const { error: reinviteError } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo });
          if (!reinviteError) return reply({ success: true, code: 'INVITATION_RESENT', message: 'Invitation email sent again.', memberId: member.id });
          console.error('[team-invite] refreshed invitation delivery failed', { status: reinviteError.status, code: reinviteError.code || 'AUTH_INVITE_ERROR' });
          const safeReinvite = mapInvitationApiError(reinviteError);
          return fail(safeReinvite.code, 'The pending Auth invitation was refreshed, but its email could not be sent. Try Resend invitation again.', reinviteError.status === 429 ? 429 : 502, { memberState: 'invited' });
        }
        console.error('[team-invite] resend delivery failed', { status: inviteError.status, code: inviteError.code || 'AUTH_INVITE_ERROR' });
        const safe = mapInvitationApiError(inviteError);
        return fail(safe.code, safe.message, inviteError.status === 429 ? 429 : 502, { memberState: 'invited' });
      }
      return reply({ success: true, code: 'INVITATION_RESENT', message: 'Invitation email sent again.', memberId: member.id });
    }

    const email = normalizeInvitationEmail(body.email);
    const role = String(body.role || '');
    const editorialRoles = normalizeEditorialRoles(body.editorialRoles);
    if (!email) return fail('INVALID_EMAIL', 'Enter a valid email address.', 400);
    if (!validateInvitationRole(role)) return fail('INVALID_ROLE', 'Select an assignable team role.', 400);

    const { data: existing, error: existingError } = await admin.from('admin_users').select('id, status').ilike('email', email).maybeSingle();
    if (existingError) {
      console.error('[team-invite] duplicate check failed', { code: existingError.code });
      return fail('DATABASE_ERROR', 'The invitation could not be checked.', 500);
    }
    const conflict = invitationConflict(existing);
    if (conflict) return fail(conflict.code, conflict.message, 409, { memberId: existing.id, memberState: existing.status });

    const existingAuthUser = await findAuthUserByEmail(admin, email);
    const authConflict = orphanedAuthConflict(existingAuthUser);
    if (authConflict) return fail(authConflict.code, authConflict.message, 409, { memberState: 'auth_only' });

    const payload = {
      email,
      display_name: String(body.displayName || '').trim() || null,
      role,
      editorial_roles: editorialRoles,
      status: 'invited',
      creative_member_id: body.creativeMemberId || null,
      invited_by: user.id,
      updated_at: new Date().toISOString(),
    };
    const { data: member, error: insertError } = await admin.from('admin_users').insert(payload).select('id, email, role, status').single();
    if (insertError) {
      console.error('[team-invite] team row creation failed', { code: insertError.code });
      if (insertError.code === '23505') return fail('MEMBER_EXISTS', 'A team record already exists for this email.', 409);
      return fail('DATABASE_ERROR', 'The Team invitation record could not be created.', 500);
    }

    const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo });
    if (inviteError) {
      console.error('[team-invite] delivery failed after team row creation', { status: inviteError.status, code: inviteError.code || 'AUTH_INVITE_ERROR' });
      const safe = mapInvitationApiError(inviteError);
      return fail(safe.code, safe.message, inviteError.status === 429 ? 429 : 502, { memberId: member.id, memberState: 'invited' });
    }

    return reply({ success: true, code: 'INVITATION_SENT', message: 'Team member added and invitation email sent.', memberId: member.id });
  } catch (error) {
    console.error('[team-invite] unexpected failure', { name: error instanceof Error ? error.name : 'UnknownError' });
    return fail('INVITATION_FAILED', 'The team invitation could not be completed.', 500);
  }
});
