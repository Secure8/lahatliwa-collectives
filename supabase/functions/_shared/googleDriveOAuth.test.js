import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  GOOGLE_DRIVE_SCOPES,
  buildGoogleAuthorizationUrl,
  hasRequiredGoogleScopes,
  isRecentSessionJwt,
  normalizeReturnPath,
  oauthConfiguration,
  randomBase64Url,
  sha256Base64Url,
  validateOAuthStateRecord,
} from './googleDriveOAuth.js';
import {
  GOOGLE_DRIVE_SUBFOLDERS,
  ensureManagedFolderTree,
  refreshGoogleAccessToken,
} from './googleDriveApi.js';

const projectRoot = new URL('../../../', import.meta.url);
const source = (path) => readFile(new URL(path, projectRoot), 'utf8');
const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

test('OAuth URL uses exact least-privilege scopes, PKCE, offline access, and opaque state', async () => {
  const state = randomBase64Url(32);
  const verifier = randomBase64Url(64);
  const challenge = await sha256Base64Url(verifier);
  const url = new URL(buildGoogleAuthorizationUrl({
    clientId: 'client.apps.googleusercontent.com',
    redirectUri: 'http://127.0.0.1:54321/functions/v1/google-drive-oauth-callback',
    state,
    codeChallenge: challenge,
    forceConsent: true,
  }));
  assert.equal(url.origin, 'https://accounts.google.com');
  assert.equal(url.searchParams.get('state'), state);
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('code_challenge'), challenge);
  assert.equal(url.searchParams.get('access_type'), 'offline');
  assert.equal(url.searchParams.get('prompt'), 'consent');
  assert.deepEqual(url.searchParams.get('scope').split(' '), GOOGLE_DRIVE_SCOPES);
  assert.equal(url.searchParams.get('scope').split(' ').includes('https://www.googleapis.com/auth/drive'), false);
});

test('provider configuration is disabled unless every server value is present', () => {
  assert.equal(oauthConfiguration({ GOOGLE_DRIVE_OAUTH_ENABLED: 'true' }).configured, false);
  assert.equal(oauthConfiguration({
    GOOGLE_DRIVE_OAUTH_ENABLED: 'true', GOOGLE_DRIVE_CLIENT_ID: 'id', GOOGLE_DRIVE_CLIENT_SECRET: 'secret',
    GOOGLE_DRIVE_REDIRECT_URI: 'https://example.supabase.co/functions/v1/google-drive-oauth-callback',
  }).configured, true);
  assert.equal(oauthConfiguration({
    GOOGLE_DRIVE_OAUTH_ENABLED: 'false', GOOGLE_DRIVE_CLIENT_ID: 'id', GOOGLE_DRIVE_CLIENT_SECRET: 'secret',
    GOOGLE_DRIVE_REDIRECT_URI: 'https://example.test/callback',
  }).configured, false);
});

test('OAuth state rejects missing, consumed, and expired records', () => {
  const future = new Date(Date.now() + 60_000).toISOString();
  const valid = { owner_user_id: 'owner', pkce_verifier: 'verifier', expires_at: future, consumed_at: null };
  assert.deepEqual(validateOAuthStateRecord(valid), { ok: true });
  assert.equal(validateOAuthStateRecord(null).code, 'OAUTH_STATE_REUSED');
  assert.equal(validateOAuthStateRecord({ ...valid, consumed_at: new Date().toISOString() }).code, 'OAUTH_STATE_REUSED');
  assert.equal(validateOAuthStateRecord({ ...valid, expires_at: new Date(Date.now() - 1).toISOString() }).code, 'OAUTH_STATE_EXPIRED');
});

test('return paths cannot leave the Storage page', () => {
  assert.equal(normalizeReturnPath('/admin/storage?tab=google'), '/admin/storage');
  assert.equal(normalizeReturnPath('https://evil.example/admin/storage'), '/admin/storage');
  assert.equal(normalizeReturnPath('/admin/team'), '/admin/storage');
});

test('required scopes cannot be weakened or replaced with arbitrary strings', () => {
  assert.equal(hasRequiredGoogleScopes(GOOGLE_DRIVE_SCOPES), true);
  assert.equal(hasRequiredGoogleScopes(['openid', 'https://www.googleapis.com/auth/userinfo.email', 'https://www.googleapis.com/auth/userinfo.profile', 'https://www.googleapis.com/auth/drive.file']), true);
  assert.equal(hasRequiredGoogleScopes(GOOGLE_DRIVE_SCOPES.filter((scope) => !scope.endsWith('/drive.file'))), false);
  assert.equal(hasRequiredGoogleScopes([...GOOGLE_DRIVE_SCOPES, 'arbitrary']), true);
});

test('recent-auth check accepts a verified-style recent JWT payload and rejects stale or malformed values', () => {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const now = 1_900_000_000;
  assert.equal(isRecentSessionJwt(`x.${encode({ iat: now - 60 })}.x`, 900, now), true);
  assert.equal(isRecentSessionJwt(`x.${encode({ iat: now - 60, amr: [{ method: 'password', timestamp: now - 901 }] })}.x`, 900, now), false);
  assert.equal(isRecentSessionJwt(`x.${encode({ iat: now - 901 })}.x`, 900, now), false);
  assert.equal(isRecentSessionJwt('invalid', 900, now), false);
});

test('managed Drive folders are created once and reused by appProperties, never by name', async () => {
  const creates = [];
  let rootCreated = false;
  const folderIds = new Map();
  const fetcher = async (url, options = {}) => {
    const parsed = new URL(url);
    if (options.method === 'POST') {
      const body = JSON.parse(options.body);
      creates.push(body);
      const id = body.appProperties.lahatLiwaRole === 'root' ? 'root-id' : `${body.appProperties.lahatLiwaRole}-id`;
      if (body.appProperties.lahatLiwaRole === 'root') rootCreated = true;
      folderIds.set(body.appProperties.lahatLiwaRole, id);
      return jsonResponse({ id, ...body });
    }
    if (parsed.pathname.endsWith('/files/root-id')) return jsonResponse({ id: 'root-id', name: 'Lahat Liwa', mimeType: 'application/vnd.google-apps.folder', trashed: false, appProperties: { lahatLiwaRole: 'root', lahatLiwaSchema: 'v1' } });
    const query = parsed.searchParams.get('q') || '';
    const role = [...folderIds.keys()].find((key) => query.includes(`value='${key}'`));
    if (query.includes("value='root'")) return jsonResponse({ files: rootCreated ? [{ id: 'root-id', name: 'Lahat Liwa', mimeType: 'application/vnd.google-apps.folder', trashed: false, appProperties: { lahatLiwaRole: 'root', lahatLiwaSchema: 'v1' } }] : [] });
    return jsonResponse({ files: role ? [{ id: folderIds.get(role), appProperties: { lahatLiwaRole: role, lahatLiwaSchema: 'v1' } }] : [] });
  };

  const first = await ensureManagedFolderTree(fetcher, 'access-token');
  assert.equal(first.rootFolderId, 'root-id');
  assert.equal(creates.length, 1 + GOOGLE_DRIVE_SUBFOLDERS.length);
  const second = await ensureManagedFolderTree(fetcher, 'access-token', first.rootFolderId);
  assert.equal(second.rootFolderId, 'root-id');
  assert.equal(creates.length, 1 + GOOGLE_DRIVE_SUBFOLDERS.length);
  assert.equal(creates.some((folder) => folder.appProperties?.lahatLiwaRole === 'root'), true);
});

test('missing stored root is actionable and does not create a replacement', async () => {
  let createCalled = false;
  const fetcher = async (_url, options = {}) => {
    if (options.method === 'POST') createCalled = true;
    return jsonResponse({ error: { status: 'NOT_FOUND' } }, 404);
  };
  await assert.rejects(() => ensureManagedFolderTree(fetcher, 'access-token', 'missing-root'), (error) => error.code === 'FOLDER_MISSING');
  assert.equal(createCalled, false);
});

test('revoked refresh token is normalized without exposing provider response details', async () => {
  const fetcher = async () => jsonResponse({ error: 'invalid_grant', error_description: 'sensitive provider detail' }, 400);
  await assert.rejects(() => refreshGoogleAccessToken(fetcher, { clientId: 'id', clientSecret: 'secret' }, 'refresh-token'), (error) => {
    assert.equal(error.code, 'TOKEN_REVOKED');
    assert.equal(error.message.includes('sensitive provider detail'), false);
    return true;
  });
});

test('Edge handlers bind owners, preserve reconnect identity, and never log or return credentials', async () => {
  const [start, callback, check, disconnect, edge, database, page] = await Promise.all([
    source('supabase/functions/google-drive-oauth-start/index.ts'),
    source('supabase/functions/google-drive-oauth-callback/index.ts'),
    source('supabase/functions/google-drive-connection-check/index.ts'),
    source('supabase/functions/google-drive-disconnect/index.ts'),
    source('supabase/functions/_shared/googleDriveEdge.ts'),
    source('supabase/functions/_shared/googleDriveDatabase.ts'),
    source('src/pages/admin/Storage.jsx'),
  ]);
  assert.match(start, /authenticatedStorageOwner/);
  assert.match(start, /createOAuthState/);
  assert.doesNotMatch(start, /owner(?:UserId|_user_id):\s*body/);
  assert.match(start, /ownerUserId: owner\.user\.id/);
  assert.match(callback, /consumeOAuthState/);
  assert.match(callback, /existing\.provider_account_id !== identity\.sub/);
  assert.match(callback, /account_in_use/);
  assert.match(callback, /ensureManagedFolderTree/);
  assert.match(check, /readConnectionSecret/);
  assert.match(check, /reconnect_required/);
  assert.match(disconnect, /isRecentSessionJwt/);
  assert.match(disconnect, /DISCONNECT_GOOGLE_DRIVE/);
  assert.match(disconnect, /revokeGoogleToken/);
  assert.match(database, /SUPABASE_DB_URL/);
  assert.match(database, /private\.server_read_storage_connection_secret/);
  assert.doesNotMatch(database, /public\.server_/);
  assert.doesNotMatch(`${start}${callback}${check}${disconnect}${edge}${database}`, /console\.(?:log|error)\([^\n]*(?:token|authorization|secret|pkce)/i);
  assert.doesNotMatch(page, /credential_secret_id|provider_account_id|root_folder_id|folder_ids|granted_scopes/);
});
