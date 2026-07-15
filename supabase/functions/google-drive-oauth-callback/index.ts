import {
  hasRequiredGoogleScopes,
  normalizeReturnPath,
  safeOAuthResultCode,
  sha256Base64Url,
} from '../_shared/googleDriveOAuth.js';
import {
  ensureManagedFolderTree,
  exchangeAuthorizationCode,
  fetchGoogleIdentity,
  revokeGoogleToken,
  tokenGrantedScopes,
} from '../_shared/googleDriveApi.js';
import { edgeEnvironment, GOOGLE_CONNECTION_SELECT, serviceClient } from '../_shared/googleDriveEdge.ts';
import { consumeOAuthState, upsertGoogleDriveConnection } from '../_shared/googleDriveDatabase.ts';

function redirectToStorage(siteOrigin: string, returnPath: string, result: string) {
  if (!siteOrigin) return new Response('OAuth callback configuration is unavailable.', { status: 503 });
  const destination = new URL(normalizeReturnPath(returnPath), siteOrigin);
  destination.searchParams.set('storage_oauth', safeOAuthResultCode(result));
  return Response.redirect(destination.toString(), 303);
}

Deno.serve(async (request) => {
  const env = edgeEnvironment();
  if (request.method !== 'GET') return new Response('Method not allowed.', { status: 405 });
  const requestUrl = new URL(request.url);
  const state = requestUrl.searchParams.get('state') || '';
  if (!env.google.configured || !env.supabaseUrl || !env.serviceKey) return redirectToStorage(env.siteOrigin, '/admin/storage', 'configuration_error');
  if (!state || state.length > 256) return redirectToStorage(env.siteOrigin, '/admin/storage', 'state_invalid');

  const admin = serviceClient(env);
  let oauthState: any = null;
  try {
    const stateHash = await sha256Base64Url(state);
    oauthState = await consumeOAuthState(stateHash);
    if (!oauthState?.owner_user_id || !oauthState?.pkce_verifier) return redirectToStorage(env.siteOrigin, '/admin/storage', 'state_expired');

    const returnPath = normalizeReturnPath(oauthState.return_path);
    if (requestUrl.searchParams.get('error')) return redirectToStorage(env.siteOrigin, returnPath, 'cancelled');
    const code = requestUrl.searchParams.get('code') || '';
    if (!code || code.length > 4096) return redirectToStorage(env.siteOrigin, returnPath, 'provider_error');

    let existing: any = null;
    if (oauthState.reconnect_connection_id) {
      const response = await admin.from('storage_connections').select(GOOGLE_CONNECTION_SELECT)
        .eq('id', oauthState.reconnect_connection_id).eq('owner_user_id', oauthState.owner_user_id)
        .eq('provider', 'google_drive').maybeSingle();
      if (response.error || !response.data) return redirectToStorage(env.siteOrigin, returnPath, 'state_invalid');
      existing = response.data;
    }

    const tokens = await exchangeAuthorizationCode(fetch, env.google, code, oauthState.pkce_verifier);
    const scopes = tokenGrantedScopes(tokens, existing?.granted_scopes || []);
    if (!hasRequiredGoogleScopes(scopes)) {
      if (tokens.refresh_token || tokens.access_token) await revokeGoogleToken(fetch, tokens.refresh_token || tokens.access_token).catch(() => false);
      return redirectToStorage(env.siteOrigin, returnPath, 'scope_missing');
    }
    if (!tokens.refresh_token && !existing) return redirectToStorage(env.siteOrigin, returnPath, 'missing_refresh_token');

    const identity = await fetchGoogleIdentity(fetch, tokens.access_token);
    if (!identity.sub || !identity.email || identity.email_verified === false) return redirectToStorage(env.siteOrigin, returnPath, 'provider_error');
    if (existing?.provider_account_id && existing.provider_account_id !== identity.sub) {
      if (tokens.refresh_token || tokens.access_token) await revokeGoogleToken(fetch, tokens.refresh_token || tokens.access_token).catch(() => false);
      return redirectToStorage(env.siteOrigin, returnPath, 'account_mismatch');
    }

    const folders = await ensureManagedFolderTree(fetch, tokens.access_token, existing?.root_folder_id || '');
    let connectionId = '';
    try {
      connectionId = await upsertGoogleDriveConnection({
        ownerUserId: oauthState.owner_user_id,
        connectionId: existing?.id || null,
        providerAccountId: identity.sub,
        providerAccountEmail: identity.email,
        displayName: identity.name || identity.email,
        rootFolderId: folders.rootFolderId,
        folderIds: folders.folderIds,
        grantedScopes: scopes,
        refreshToken: tokens.refresh_token || null,
      });
    } catch (upsertError) {
      const result = upsertError?.fields?.code === '23505' || upsertError?.code === '23505' ? 'account_in_use'
        : upsertError?.fields?.code === 'P0001' || upsertError?.code === 'P0001' ? 'account_mismatch'
          : upsertError?.fields?.code === 'P0002' || upsertError?.code === 'P0002' ? 'missing_refresh_token' : 'provider_error';
      return redirectToStorage(env.siteOrigin, returnPath, result);
    }
    if (!connectionId) return redirectToStorage(env.siteOrigin, returnPath, 'provider_error');
    return redirectToStorage(env.siteOrigin, returnPath, existing ? 'reconnected' : 'connected');
  } catch (error) {
    const result = error?.code === 'FOLDER_MISSING' ? 'folder_missing'
      : error?.code === 'FOLDER_AMBIGUOUS' ? 'folder_ambiguous' : 'provider_error';
    console.error('[google-drive-oauth-callback] failed', { code: error?.code || 'CALLBACK_FAILED' });
    return redirectToStorage(env.siteOrigin, oauthState?.return_path || '/admin/storage', result);
  }
});
