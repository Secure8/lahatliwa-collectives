import { revokeGoogleToken } from '../_shared/googleDriveApi.js';
import { isRecentSessionJwt } from '../_shared/googleDriveOAuth.js';
import { authenticatedStorageOwner, corsHeaders, edgeEnvironment, fail, reply } from '../_shared/googleDriveEdge.ts';
import { disconnectGoogleDriveConnection, readConnectionSecret } from '../_shared/googleDriveDatabase.ts';

Deno.serve(async (request) => {
  const env = edgeEnvironment();
  const cors = corsHeaders(request, env.siteOrigin);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return fail('METHOD_NOT_ALLOWED', 'Method not allowed.', 405, cors);
  if (!cors['Access-Control-Allow-Origin']) return fail('ORIGIN_NOT_ALLOWED', 'This request origin is not allowed.', 403, cors);
  const owner = await authenticatedStorageOwner(request, env);
  if ('error' in owner) return fail(owner.error, owner.status === 401 ? 'Your session has expired. Please sign in again.' : 'Your account is not eligible for external storage.', owner.status, cors);
  if (!isRecentSessionJwt(owner.jwt)) return fail('RECENT_AUTH_REQUIRED', 'Please sign in again before disconnecting Google Drive.', 401, cors);

  const body = await request.json().catch(() => ({}));
  if (body.confirmation !== 'DISCONNECT_GOOGLE_DRIVE') return fail('CONFIRMATION_REQUIRED', 'Confirm that you want to disconnect Google Drive.', 400, cors);
  const connectionId = typeof body.connectionId === 'string' ? body.connectionId : '';
  const { data: connection, error } = await owner.admin.from('storage_connections').select('id,status')
    .eq('id', connectionId).eq('owner_user_id', owner.user.id).eq('provider', 'google_drive').maybeSingle();
  if (error || !connection) return fail('NOT_CONNECTED', 'Google Drive connection could not be found.', 404, cors);

  try {
    const refreshToken = await readConnectionSecret(owner.user.id, connection.id);
    const revokedAtProvider = refreshToken ? await revokeGoogleToken(fetch, refreshToken).catch(() => false) : true;
    await disconnectGoogleDriveConnection({
      ownerUserId: owner.user.id, connectionId: connection.id, revokedAtProvider,
    });
    return reply({ success: true, status: revokedAtProvider ? 'revoked' : 'disabled' }, 200, cors);
  } catch (disconnectError) {
    console.error('[google-drive-disconnect] failed', { connectionId: connection.id, code: disconnectError?.code || 'DISCONNECT_FAILED' });
    return fail('DISCONNECT_FAILED', 'Google Drive could not be disconnected safely. Please try again.', 500, cors);
  }
});
