import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { normalizeSiteOrigin, oauthConfiguration } from './googleDriveOAuth.js';

export const jsonHeaders = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

export function reply(body: unknown, status = 200, cors = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...jsonHeaders, ...cors } });
}

export function fail(code: string, message: string, status: number, cors = {}) {
  return reply({ success: false, code, message }, status, cors);
}

export function edgeEnvironment() {
  const siteOrigin = normalizeSiteOrigin(Deno.env.get('PUBLIC_SITE_URL'));
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const google = oauthConfiguration({
    GOOGLE_DRIVE_OAUTH_ENABLED: Deno.env.get('GOOGLE_DRIVE_OAUTH_ENABLED'),
    GOOGLE_DRIVE_CLIENT_ID: Deno.env.get('GOOGLE_DRIVE_CLIENT_ID'),
    GOOGLE_DRIVE_CLIENT_SECRET: Deno.env.get('GOOGLE_DRIVE_CLIENT_SECRET'),
    GOOGLE_DRIVE_REDIRECT_URI: Deno.env.get('GOOGLE_DRIVE_REDIRECT_URI'),
  });
  const googleDriveUploadEnabled = Deno.env.get('GOOGLE_DRIVE_UPLOAD_ENABLED') === 'true';
  return { siteOrigin, supabaseUrl, anonKey, serviceKey, google, googleDriveUploadEnabled };
}

export function corsHeaders(request: Request, siteOrigin: string) {
  const origin = request.headers.get('Origin') || '';
  const allowed = new Set([siteOrigin, 'http://localhost:5173', 'http://127.0.0.1:5173'].filter(Boolean));
  return {
    ...(allowed.has(origin) ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

export function serviceClient(env: ReturnType<typeof edgeEnvironment>) {
  return createClient(env.supabaseUrl, env.serviceKey, { auth: { persistSession: false } });
}

export async function authenticatedStorageOwner(request: Request, env: ReturnType<typeof edgeEnvironment>) {
  const authorization = request.headers.get('Authorization') || '';
  const jwt = authorization.replace(/^Bearer\s+/i, '');
  if (!jwt || !env.supabaseUrl || !env.anonKey || !env.serviceKey) return { error: 'INVALID_SESSION', status: 401 };
  const caller = createClient(env.supabaseUrl, env.anonKey, { global: { headers: { Authorization: `Bearer ${jwt}` } }, auth: { persistSession: false } });
  const { data: { user }, error } = await caller.auth.getUser();
  if (error || !user) return { error: 'INVALID_SESSION', status: 401 };
  const admin = serviceClient(env);
  const { data: teamMember, error: memberError } = await admin.from('admin_users')
    .select('id,role,status,creative_member_id').eq('user_id', user.id).eq('status', 'active').maybeSingle();
  if (memberError || !teamMember) return { error: 'NOT_AUTHORIZED', status: 403 };
  const role = teamMember.role === 'owner' ? 'super_admin' : teamMember.role;
  if (role === 'super_admin') return { user, teamMember, role, jwt, admin };
  if (role !== 'creative' || !teamMember.creative_member_id) return { error: 'NOT_AUTHORIZED', status: 403 };
  const { data: creative, error: creativeError } = await admin.from('creative_members')
    .select('id,is_published').eq('id', teamMember.creative_member_id).eq('is_published', true).maybeSingle();
  if (creativeError || !creative) return { error: 'NOT_AUTHORIZED', status: 403 };
  return { user, teamMember, role, jwt, admin };
}

export function safeConnection(connection: any) {
  if (!connection) return null;
  return {
    id: connection.id,
    provider: connection.provider,
    accountEmail: connection.provider_account_email || '',
    displayName: connection.display_name || '',
    status: connection.status,
    connectedAt: connection.connected_at,
    lastVerifiedAt: connection.last_verified_at,
    lastErrorCode: connection.last_error_code,
    lastErrorMessage: connection.last_error_message,
    rootFolderHealth: connection.root_folder_health || 'unknown',
    capabilities: connection.capabilities || {},
  };
}

export const GOOGLE_CONNECTION_SELECT = 'id,owner_user_id,provider,provider_account_id,provider_account_email,display_name,root_folder_id,status,capabilities,connected_at,last_verified_at,last_error_code,last_error_message,root_folder_health,granted_scopes,created_at,updated_at';
