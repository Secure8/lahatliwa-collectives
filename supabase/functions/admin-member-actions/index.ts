import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { assessDisposableIdentity, deleteIdentityLayers, IdentityDeletionError } from './memberDeletion.js';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
const fail = (code: string, message: string, status: number) => reply({ success: false, code, message }, status);
const knownLifecycleMessages = new Map([
  ['Service role required', 'Member lifecycle database authorization is incomplete.'],
  ['Invalid action', 'The requested member lifecycle action is invalid.'],
  ['Team member not found', 'The selected team member could not be found.'],
  ['Only an active Super Admin may perform this action', 'Only an active Super Admin can perform this action.'],
  ['The last active Super Admin cannot be removed or deleted', 'The last active Super Admin cannot be removed.'],
  ['No access-removal snapshot exists', 'The access-removal restore snapshot is missing.'],
  ['Authentication required.', 'Member lifecycle database authorization is incomplete.'],
  ['You cannot change your own role or access status.', 'The database access guard blocked this member lifecycle action.'],
  ['Only a Super Admin can change a Super Admin account.', 'Only an active Super Admin can perform this action.'],
  ['You cannot downgrade or disable the last active Super Admin.', 'The last active Super Admin cannot be removed.'],
]);
const incompleteDatabaseCodes = new Set(['PGRST202', '42P01', '42703', '42883']);

const normalizeEmail = (value: unknown) => String(value || '').trim().toLowerCase();

async function findAuthUserByEmail(admin: any, email: string) {
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const matches = data.users.filter((candidate: any) => normalizeEmail(candidate.email) === email);
    if (matches.length > 1) throw new Error('Ambiguous Auth identity.');
    if (matches.length === 1) return matches[0];
    if (data.users.length < 1000) return null;
  }
  throw new Error('Auth lookup exceeded its safe page limit.');
}

async function collectDependencies(admin: any, target: any, authUserId: string | null) {
  const checks: Array<{ label: string; request: any }> = [];
  if (authUserId) {
    checks.push(
      { label: 'other Team records', request: admin.from('admin_users').select('id', { count: 'exact', head: true }).neq('id', target.id).or(`user_id.eq.${authUserId},invited_by.eq.${authUserId}`) },
      { label: 'projects', request: admin.from('projects').select('id', { count: 'exact', head: true }).or(`created_by.eq.${authUserId},updated_by.eq.${authUserId},owner_user_id.eq.${authUserId}`) },
      { label: 'project access', request: admin.from('project_access').select('id', { count: 'exact', head: true }).or(`user_id.eq.${authUserId},granted_by.eq.${authUserId}`) },
      { label: 'contributor requests', request: admin.from('contributor_requests').select('id', { count: 'exact', head: true }).or(`requester_user_id.eq.${authUserId},reviewed_by.eq.${authUserId}`) },
      { label: 'upload cleanup history', request: admin.from('storage_cleanup_jobs').select('id', { count: 'exact', head: true }).eq('created_by', authUserId) },
      { label: 'member lifecycle history', request: admin.from('admin_member_lifecycle_snapshots').select('admin_user_id', { count: 'exact', head: true }).eq('removed_by', authUserId) },
    );
  }
  if (target.creative_member_id) {
    checks.push(
      { label: 'project credits', request: admin.from('project_creatives').select('project_id', { count: 'exact', head: true }).or(`creative_member_id.eq.${target.creative_member_id},creative_id.eq.${target.creative_member_id}`) },
      { label: 'creative contributor activity', request: admin.from('contributor_requests').select('id', { count: 'exact', head: true }).eq('creative_member_id', target.creative_member_id) },
    );
  }
  const results = await Promise.all(checks.map(async ({ label, request }) => ({ label, ...(await request) })));
  const failed = results.find((result) => result.error);
  if (failed) throw failed.error;
  return results.map(({ label, count }) => ({ label, count: Number(count || 0) }));
}

Deno.serve(async (req) => {
  console.log('[member-action] request received', {
    method: req.method,
    hasAuthorization: Boolean(req.headers.get('Authorization')),
  });

  if (req.method === 'OPTIONS') return reply({ success: true });
  if (req.method !== 'POST') return fail('METHOD_NOT_ALLOWED', 'Method not allowed.', 405);

  const authorization = req.headers.get('Authorization');
  if (!authorization) {
    console.warn('[member-action] missing authorization');
    return fail('MISSING_AUTH', 'Your session has expired. Please sign in again.', 401);
  }

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const expectedPin = Deno.env.get('SUPER_ADMIN_MEMBER_ACTIONS_PIN');
  if (!url || !anonKey || !serviceKey || !expectedPin) {
    console.error('[member-action] database/RPC error', { code: 'SERVER_CONFIGURATION' });
    return fail('DATABASE_ERROR', 'Member lifecycle database setup is incomplete.', 500);
  }

  try {
    const body = await req.json();
    const action = String(body.action || '');
    const targetMemberId = String(body.target_admin_user_id || '');
    const pin = String(body.pin || '');
    console.log('[member-action] payload received', {
      action,
      targetMemberId,
      hasPin: Boolean(pin),
    });

    if (!['remove_access', 'restore_access', 'permanent_delete'].includes(action) || !targetMemberId) {
      console.warn('[member-action] missing target member');
      return fail('MEMBER_NOT_FOUND', 'The selected team member could not be found.', 400);
    }

    const caller = createClient(url, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
    const { data: { user }, error: userError } = await caller.auth.getUser();
    if (userError || !user) {
      console.warn('[member-action] invalid session');
      return fail('INVALID_SESSION', 'Your session has expired. Please sign in again.', 401);
    }

    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    const { data: callerRecord, error: callerError } = await admin.from('admin_users').select('id').eq('user_id', user.id).eq('status', 'active').in('role', ['super_admin', 'owner']).maybeSingle();
    if (callerError) {
      console.error('[member-action] database/RPC error', { code: callerError.code || 'CALLER_LOOKUP' });
      return fail('DATABASE_ERROR', 'Member lifecycle database setup is incomplete.', 500);
    }
    if (!callerRecord) {
      console.warn('[member-action] caller not active Super Admin');
      return fail('NOT_SUPER_ADMIN', 'Only an active Super Admin can perform this action.', 403);
    }

    const a = new TextEncoder().encode(pin); const b = new TextEncoder().encode(expectedPin);
    let difference = a.length ^ b.length;
    for (let i = 0; i < Math.max(a.length, b.length); i++) difference |= (a[i] || 0) ^ (b[i] || 0);
    if (difference !== 0) {
      console.warn('[member-action] invalid PIN');
      return fail('INVALID_PIN', 'Invalid PIN.', 403);
    }
    if (action === 'permanent_delete' && body.confirmation !== 'DELETE') return fail('INVALID_CONFIRMATION', 'Type DELETE to confirm permanent deletion.', 400);

    const { data: target, error: targetError } = await admin.from('admin_users').select('id, user_id, email, role, status, creative_member_id').eq('id', targetMemberId).neq('status', 'deleted').maybeSingle();
    if (targetError) {
      console.error('[member-action] database/RPC error', { code: targetError.code || 'TARGET_LOOKUP' });
      return fail('DATABASE_ERROR', 'Member lifecycle database setup is incomplete.', 500);
    }
    if (!target) {
      console.warn('[member-action] missing target member');
      return fail('MEMBER_NOT_FOUND', 'The selected team member could not be found.', 404);
    }

    if (['remove_access', 'permanent_delete'].includes(action) && target.status === 'active' && ['super_admin', 'owner'].includes(target.role)) {
      const { count, error: countError } = await admin.from('admin_users').select('id', { count: 'exact', head: true }).eq('status', 'active').in('role', ['super_admin', 'owner']);
      if (countError) {
        console.error('[member-action] database/RPC error', { code: countError.code || 'SUPER_ADMIN_COUNT' });
        return fail('DATABASE_ERROR', 'Member lifecycle database setup is incomplete.', 500);
      }
      if ((count || 0) <= 1) {
        console.warn('[member-action] protected last Super Admin');
        return fail('LAST_SUPER_ADMIN', 'The last active Super Admin cannot be removed.', 409);
      }
    }

    if (action === 'permanent_delete') {
      let authUser = null;
      try {
        if (target.user_id) {
          const { data: authData, error: authError } = await admin.auth.admin.getUserById(target.user_id);
          if (authError) throw authError;
          authUser = authData.user;
        } else {
          authUser = await findAuthUserByEmail(admin, normalizeEmail(target.email));
        }
        if (authUser && normalizeEmail(authUser.email) !== normalizeEmail(target.email)) throw new Error('Auth email does not match Team identity.');
        const dependencies = await collectDependencies(admin, target, authUser?.id || null);
        const assessment = assessDisposableIdentity(target, authUser, dependencies);
        if (!assessment.allowed) return fail(assessment.code, assessment.message, 409);
        const result = await deleteIdentityLayers({
          memberId: target.id,
          authUserId: authUser?.id || null,
          deleteAuthUser: async (id: string) => { const { error } = await admin.auth.admin.deleteUser(id, false); if (error) throw error; },
          deleteTeamRow: async (id: string) => { const { error } = await admin.from('admin_users').delete().eq('id', id); if (error) throw error; },
          teamRowExists: async (id: string) => { const { data, error } = await admin.from('admin_users').select('id').eq('id', id).maybeSingle(); if (error) throw error; return Boolean(data); },
        });
        return reply({ success: true, result });
      } catch (error) {
        if (error instanceof IdentityDeletionError) {
          console.error('[member-action] identity deletion failed', { action, targetMemberId, code: error.code, layer: error.layer });
          return fail(error.code, error.message, 500);
        }
        console.error('[member-action] deletion safety check failed', { action, targetMemberId, code: (error as any)?.code || 'SAFETY_CHECK_FAILED' });
        return fail('SAFETY_CHECK_FAILED', 'The member could not be safely checked for deletion. No deletion was performed.', 500);
      }
    }

    const { data, error: rpcError } = await admin.rpc('execute_admin_member_lifecycle', { p_action: action, p_target_admin_user_id: targetMemberId, p_actor_user_id: user.id });
    if (rpcError) {
      console.error('[member-action] database/RPC error', {
        action,
        targetMemberId,
        code: rpcError.code,
        message: rpcError.message,
        details: rpcError.details,
        hint: rpcError.hint,
      });
      const knownMessage = knownLifecycleMessages.get(rpcError.message || '');
      if (knownMessage) return fail('DATABASE_RULE_FAILED', knownMessage, 409);
      if (incompleteDatabaseCodes.has(rpcError.code || '')) return fail('DATABASE_RULE_FAILED', 'Member lifecycle database setup is incomplete.', 500);
      return fail('DATABASE_ERROR', 'The member action could not be completed.', 500);
    }
    return reply({ success: true, result: data });
  } catch {
    console.error('[member-action] database/RPC error', { code: 'UNEXPECTED_ERROR' });
    return fail('DATABASE_ERROR', 'The member action could not be completed.', 500);
  }
});
