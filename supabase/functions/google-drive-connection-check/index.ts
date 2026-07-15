import { fetchGoogleIdentity, refreshGoogleAccessToken, tokenGrantedScopes, verifyManagedRoot } from '../_shared/googleDriveApi.js';
import { hasRequiredGoogleScopes } from '../_shared/googleDriveOAuth.js';
import { authenticatedStorageOwner, corsHeaders, edgeEnvironment, fail, GOOGLE_CONNECTION_SELECT, reply, safeConnection } from '../_shared/googleDriveEdge.ts';
import { readConnectionSecret } from '../_shared/googleDriveDatabase.ts';

async function markConnection(admin: any, id: string, patch: Record<string, unknown>) {
  await admin.from('storage_connections').update(patch).eq('id', id).eq('provider', 'google_drive');
}

Deno.serve(async (request) => {
  const env = edgeEnvironment();
  const cors = corsHeaders(request, env.siteOrigin);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return fail('METHOD_NOT_ALLOWED', 'Method not allowed.', 405, cors);
  if (!cors['Access-Control-Allow-Origin']) return fail('ORIGIN_NOT_ALLOWED', 'This request origin is not allowed.', 403, cors);
  const owner = await authenticatedStorageOwner(request, env);
  if ('error' in owner) return fail(owner.error, owner.status === 401 ? 'Your session has expired. Please sign in again.' : 'Your account is not eligible for external storage.', owner.status, cors);

  const body = await request.json().catch(() => ({}));
  const { data: connection, error } = await owner.admin.from('storage_connections').select(GOOGLE_CONNECTION_SELECT)
    .eq('owner_user_id', owner.user.id).eq('provider', 'google_drive')
    .not('status', 'in', '(revoked,disabled)').order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (error) return fail('STATUS_UNAVAILABLE', 'Storage connection status could not be loaded.', 500, cors);
  if (body.action !== 'verify') return reply({ success: true, configured: env.google.configured, connection: safeConnection(connection) }, 200, cors);
  if (!env.google.configured) return fail('GOOGLE_DRIVE_DISABLED', 'Google Drive connection is not available yet.', 503, cors);
  if (!connection) return fail('NOT_CONNECTED', 'Google Drive is not connected.', 404, cors);

  try {
    const refreshToken = await readConnectionSecret(owner.user.id, connection.id);
    if (!refreshToken) {
      await markConnection(owner.admin, connection.id, { status: 'reconnect_required', last_error_code: 'CREDENTIAL_MISSING', last_error_message: 'Reconnect Google Drive to restore access.' });
      return fail('RECONNECT_REQUIRED', 'Reconnect Google Drive to restore access.', 409, cors);
    }
    const tokens = await refreshGoogleAccessToken(fetch, env.google, refreshToken);
    const scopes = tokenGrantedScopes(tokens, connection.granted_scopes || []);
    if (!hasRequiredGoogleScopes(scopes)) throw Object.assign(new Error('Scope missing'), { code: 'SCOPE_MISSING' });
    const identity = await fetchGoogleIdentity(fetch, tokens.access_token);
    if (identity.sub !== connection.provider_account_id) throw Object.assign(new Error('Account mismatch'), { code: 'ACCOUNT_MISMATCH' });
    await verifyManagedRoot(fetch, tokens.access_token, connection.root_folder_id);
    const now = new Date().toISOString();
    await markConnection(owner.admin, connection.id, {
      status: 'connected', root_folder_health: 'healthy', granted_scopes: scopes,
      last_verified_at: now, last_error_code: null, last_error_message: null,
    });
    return reply({ success: true, configured: true, connection: safeConnection({ ...connection, status: 'connected', root_folder_health: 'healthy', last_verified_at: now, last_error_code: null, last_error_message: null }) }, 200, cors);
  } catch (verifyError) {
    const code = verifyError?.code || 'VERIFY_FAILED';
    const reconnect = ['TOKEN_REVOKED', 'SCOPE_MISSING', 'ACCOUNT_MISMATCH'].includes(code);
    const folderMissing = code === 'FOLDER_MISSING';
    await markConnection(owner.admin, connection.id, {
      status: reconnect ? 'reconnect_required' : 'error',
      root_folder_health: folderMissing ? 'missing' : connection.root_folder_health,
      last_verified_at: new Date().toISOString(),
      last_error_code: code,
      last_error_message: folderMissing ? 'The managed Lahat Liwa folder could not be found. Reconnect after restoring it.' : reconnect ? 'Reconnect Google Drive to restore access.' : 'Google Drive could not be verified. Try again.',
    });
    console.error('[google-drive-connection-check] failed', { connectionId: connection.id, code });
    return fail(reconnect ? 'RECONNECT_REQUIRED' : code, folderMissing ? 'The managed Lahat Liwa folder is unavailable.' : reconnect ? 'Reconnect Google Drive to restore access.' : 'Google Drive could not be verified. Try again.', 409, cors);
  }
});
