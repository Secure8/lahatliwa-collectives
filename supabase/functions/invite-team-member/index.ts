import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { canResendInvitation, invitationConflict, invitationRedirectUrl, isActiveSuperAdmin, isExistingAuthUserError, mapInvitationApiError, normalizeInvitationEmail, validateInvitationRole } from './inviteTeamMember.js';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
const fail = (code: string, message: string, status: number, extra: Record<string, unknown> = {}) => reply({ success: false, code, message, ...extra }, status);

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
    if (!['invite', 'resend'].includes(action)) return fail('INVALID_ACTION', 'The requested invitation action is invalid.', 400);

    if (action === 'resend') {
      const memberId = String(body.memberId || '');
      if (!memberId) return fail('MEMBER_NOT_FOUND', 'The invited team member could not be found.', 400);
      const { data: member, error: memberError } = await admin.from('admin_users').select('id, email, role, status').eq('id', memberId).maybeSingle();
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
          const { error: recoveryError } = await admin.auth.resetPasswordForEmail(email, { redirectTo });
          if (!recoveryError) return reply({ success: true, code: 'ACCOUNT_SETUP_EMAIL_SENT', message: 'Account setup email sent again.', memberId: member.id });
          console.error('[team-invite] resend recovery delivery failed', { status: recoveryError.status, code: recoveryError.code || 'AUTH_RECOVERY_ERROR' });
          const safeRecovery = mapInvitationApiError(recoveryError);
          return fail(safeRecovery.code, safeRecovery.message, recoveryError.status === 429 ? 429 : 502, { memberState: 'invited' });
        }
        console.error('[team-invite] resend delivery failed', { status: inviteError.status, code: inviteError.code || 'AUTH_INVITE_ERROR' });
        const safe = mapInvitationApiError(inviteError);
        return fail(safe.code, safe.message, inviteError.status === 429 ? 429 : 502, { memberState: 'invited' });
      }
      return reply({ success: true, code: 'INVITATION_RESENT', message: 'Invitation email sent again.', memberId: member.id });
    }

    const email = normalizeInvitationEmail(body.email);
    const role = String(body.role || '');
    if (!email) return fail('INVALID_EMAIL', 'Enter a valid email address.', 400);
    if (!validateInvitationRole(role)) return fail('INVALID_ROLE', 'Select an assignable team role.', 400);

    const { data: existing, error: existingError } = await admin.from('admin_users').select('id, status').ilike('email', email).maybeSingle();
    if (existingError) {
      console.error('[team-invite] duplicate check failed', { code: existingError.code });
      return fail('DATABASE_ERROR', 'The invitation could not be checked.', 500);
    }
    const conflict = invitationConflict(existing);
    if (conflict) return fail(conflict.code, conflict.message, 409, { memberId: existing.id, memberState: existing.status });

    const payload = {
      email,
      display_name: String(body.displayName || '').trim() || null,
      role,
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
