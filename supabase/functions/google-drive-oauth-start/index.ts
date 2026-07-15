import {
  buildGoogleAuthorizationUrl,
  normalizeReturnPath,
  randomBase64Url,
  sha256Base64Url,
} from '../_shared/googleDriveOAuth.js';
import { authenticatedStorageOwner, corsHeaders, edgeEnvironment, fail, reply } from '../_shared/googleDriveEdge.ts';
import { createOAuthState } from '../_shared/googleDriveDatabase.ts';

Deno.serve(async (request) => {
  const env = edgeEnvironment();
  const cors = corsHeaders(request, env.siteOrigin);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return fail('METHOD_NOT_ALLOWED', 'Method not allowed.', 405, cors);
  if (!cors['Access-Control-Allow-Origin']) return fail('ORIGIN_NOT_ALLOWED', 'This request origin is not allowed.', 403, cors);
  if (!env.google.configured) return fail('GOOGLE_DRIVE_DISABLED', 'Google Drive connection is not available yet.', 503, cors);

  const owner = await authenticatedStorageOwner(request, env);
  if ('error' in owner) return fail(owner.error, owner.status === 401 ? 'Your session has expired. Please sign in again.' : 'Your account is not eligible for external storage.', owner.status, cors);

  try {
    const body = await request.json().catch(() => ({}));
    const reconnectConnectionId = typeof body.connectionId === 'string' && /^[0-9a-f-]{36}$/i.test(body.connectionId)
      ? body.connectionId : null;
    const state = randomBase64Url(32);
    const stateHash = await sha256Base64Url(state);
    const codeVerifier = randomBase64Url(64);
    const codeChallenge = await sha256Base64Url(codeVerifier);
    const returnPath = normalizeReturnPath(body.returnPath);
    await createOAuthState({
      ownerUserId: owner.user.id,
      stateHash,
      pkceVerifier: codeVerifier,
      returnPath,
      reconnectConnectionId,
    });
    const authorizationUrl = buildGoogleAuthorizationUrl({
      clientId: env.google.clientId,
      redirectUri: env.google.redirectUri,
      state,
      codeChallenge,
      // A first connection needs explicit consent to reliably issue an offline refresh token.
      forceConsent: !reconnectConnectionId || body.forceConsent === true,
    });
    return reply({ success: true, authorizationUrl }, 200, cors);
  } catch (error) {
    console.error('[google-drive-oauth-start] failed', { code: error?.code || 'START_FAILED' });
    return fail('START_FAILED', 'Google Drive authorization could not be started. Please try again.', 500, cors);
  }
});
