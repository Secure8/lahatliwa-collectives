import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { editorialWorkflowError, safeEditorialWorkflowRequest } from './editorialWorkflow.js';

const jsonHeaders = { 'Content-Type': 'application/json' };
const reply = (body: unknown, status = 200, cors = {}) => new Response(JSON.stringify(body), { status, headers: { ...jsonHeaders, ...cors } });
const fail = (code: string, message: string, status: number, cors = {}) => reply({ success: false, code, message }, status, cors);

function corsHeaders(req: Request, siteUrl: string) {
  const origin = req.headers.get('Origin') || '';
  const allowed = origin === siteUrl || ['http://localhost:5173', 'http://127.0.0.1:5173'].includes(origin) || /^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin);
  return {
    ...(allowed ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

Deno.serve(async (req) => {
  const configuredSiteUrl = Deno.env.get('PUBLIC_SITE_URL') || '';
  let siteUrl = '';
  try { siteUrl = new URL(configuredSiteUrl).origin; } catch { siteUrl = ''; }
  const cors = corsHeaders(req, siteUrl);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return fail('METHOD_NOT_ALLOWED', 'Method not allowed.', 405, cors);
  if (!siteUrl || !cors['Access-Control-Allow-Origin']) return fail('ORIGIN_NOT_ALLOWED', 'This request origin is not allowed.', 403, cors);

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authorization = req.headers.get('Authorization');
  if (!url || !anonKey || !serviceKey || !authorization) return fail('INVALID_SESSION', 'Your session has expired. Please sign in again.', 401, cors);

  try {
    const request = safeEditorialWorkflowRequest(await req.json());
    if (!request) return fail('EDITORIAL_INPUT_INVALID', 'The Editorial request contains invalid or incomplete information.', 400, cors);

    const callerClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
    const { data: { user }, error: userError } = await callerClient.auth.getUser();
    if (userError || !user) return fail('INVALID_SESSION', 'Your session has expired. Please sign in again.', 401, cors);

    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    const { data: caller, error: callerError } = await admin.from('admin_users').select('role,status').eq('user_id', user.id).eq('status', 'active').maybeSingle();
    if (callerError || !caller || !['super_admin', 'owner', 'admin', 'editor', 'writer'].includes(caller.role)) return fail('EDITORIAL_NOT_AUTHORIZED', 'Only an active Editorial team member may perform this action.', 403, cors);

    const { data, error } = await admin.rpc('execute_editorial_action_as_service', {
      p_actor_user_id: user.id,
      p_action: request.action,
      p_payload: request.payload,
    });
    if (error) {
      const safeError = editorialWorkflowError(error);
      console.error('[editorial-workflow] action failed', { action: request.action, code: safeError.code });
      return fail(safeError.code, safeError.message, safeError.status, cors);
    }
    return reply({ success: true, result: data }, 200, cors);
  } catch (error) {
    console.error('[editorial-workflow] request failed', { code: (error as any)?.code || 'UNEXPECTED_ERROR' });
    return fail('EDITORIAL_WORKFLOW_FAILED', 'The Editorial action could not be completed.', 500, cors);
  }
});
