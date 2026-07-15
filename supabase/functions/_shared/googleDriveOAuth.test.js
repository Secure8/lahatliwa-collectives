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
  deleteDriveFile,
  ensureManagedFolderTree,
  refreshGoogleAccessToken,
  uploadSmallDriveFile,
  verifyManagedFolder,
} from './googleDriveApi.js';
import {
  SMALL_DRIVE_UPLOAD_MAX_BYTES,
  detectSmallDriveUploadMime,
  driveUploadPurposeAllowsMime,
  resolveDriveUploadPurpose,
  safeDriveFilename,
  validateDriveUploadResult,
  validateSmallDriveUpload,
} from './googleDriveUpload.js';

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

test('small Drive uploads sniff content, reject MIME spoofing, enforce size, and safely name files', async () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
  const valid = new File([png], ' Client / Proof?.PNG ', { type: 'image/png' });
  assert.deepEqual(await validateSmallDriveUpload(valid), { ok: true, name: 'Client - Proof-.png', mimeType: 'image/png', size: 12 });
  assert.equal(detectSmallDriveUploadMime(png), 'image/png');
  assert.equal(safeDriveFilename(''), 'upload');
  assert.equal((await validateSmallDriveUpload(new File(['x'], 'script.svg', { type: 'image/svg+xml' }))).code, 'FILE_TYPE_NOT_ALLOWED');
  assert.equal((await validateSmallDriveUpload(new File([png], 'spoof.jpg', { type: 'image/jpeg' }))).code, 'FILE_CONTENT_MISMATCH');
  assert.equal((await validateSmallDriveUpload(new File([new Uint8Array(SMALL_DRIVE_UPLOAD_MAX_BYTES + 1)], 'large.pdf', { type: 'application/pdf' }))).code, 'FILE_SIZE_NOT_ALLOWED');
  assert.equal(resolveDriveUploadPurpose('admin_test_upload').folderRole, 'originals');
  assert.equal(resolveDriveUploadPurpose('project_gallery_original').folderRole, 'originals');
  assert.equal(driveUploadPurposeAllowsMime(resolveDriveUploadPurpose('project_gallery_original'), 'image/webp'), true);
  assert.equal(driveUploadPurposeAllowsMime(resolveDriveUploadPurpose('project_gallery_original'), 'application/pdf'), false);
  assert.equal(resolveDriveUploadPurpose('client_parent_id'), null);
});

test('small Drive upload preserves arbitrary binary bytes in multipart media and sets only managed metadata', async () => {
  let request;
  const binary = new Uint8Array([0x00, 0xff, 0x01, 0x80, 0x0d, 0x0a, 0xfe]);
  const fetcher = async (url, options) => {
    const bodyBytes = new Uint8Array(await options.body.arrayBuffer());
    request = { url, options, bodyBytes, bodyText: new TextDecoder().decode(bodyBytes) };
    return jsonResponse({ id: 'drive-file', name: 'proof.webp', mimeType: 'image/webp', size: String(binary.length), parents: ['originals'] });
  };
  const uploaded = await uploadSmallDriveFile(fetcher, 'access-token', {
    name: 'proof.webp', mimeType: 'image/webp', parentId: 'originals', mediaObjectId: 'media-id',
    purpose: 'admin_test_upload', bytes: binary,
  });
  assert.equal(uploaded.id, 'drive-file');
  assert.match(request.url, /uploadType=multipart/);
  assert.match(request.options.headers.Authorization, /^Bearer /);
  assert.match(request.options.headers['Content-Type'], /^multipart\/related; boundary=/);
  assert.match(request.bodyText, /lahatLiwaMediaObjectId/);
  assert.match(request.bodyText, /admin_test_upload/);
  assert.doesNotMatch(request.bodyText, /permissions|anyone|public/);
  const containsBinary = request.bodyBytes.some((_, offset) => binary.every((byte, index) => request.bodyBytes[offset + index] === byte));
  assert.equal(containsBinary, true);
  assert.deepEqual(validateDriveUploadResult(uploaded, { mimeType: 'image/webp', size: binary.length, parentId: 'originals' }), { ok: true, size: binary.length });
  assert.equal(validateDriveUploadResult({ ...uploaded, parents: ['untrusted'] }, { mimeType: 'image/webp', size: binary.length, parentId: 'originals' }).code, 'PROVIDER_METADATA_MISMATCH');
});

test('managed upload folder must retain its role, schema marker, and root parent', async () => {
  const fetcher = async () => jsonResponse({
    id: 'originals', name: 'Originals', mimeType: 'application/vnd.google-apps.folder', trashed: false,
    parents: ['root-id'], appProperties: { lahatLiwaRole: 'originals', lahatLiwaSchema: 'v1' },
  });
  assert.equal((await verifyManagedFolder(fetcher, 'token', 'originals', 'originals', 'root-id')).id, 'originals');
  await assert.rejects(() => verifyManagedFolder(fetcher, 'token', 'originals', 'archive', 'root-id'), (error) => error.code === 'UPLOAD_FOLDER_MISSING');
});

test('failed metadata finalization can delete the newly created private Drive file', async () => {
  let request;
  const fetcher = async (url, options) => {
    request = { url, options };
    return new Response(null, { status: 204 });
  };
  assert.deepEqual(await deleteDriveFile(fetcher, 'access-token', 'new-drive-file'), { deleted: true, alreadyMissing: false });
  assert.equal(request.options.method, 'DELETE');
  assert.match(request.url, /\/drive\/v3\/files\/new-drive-file$/);
  assert.match(request.options.headers.Authorization, /^Bearer /);
});

test('Drive deletion treats an already missing provider file as an idempotent success', async () => {
  const fetcher = async () => jsonResponse({ error: { status: 'NOT_FOUND' } }, 404);
  assert.deepEqual(await deleteDriveFile(fetcher, 'access-token', 'missing-file'), { deleted: true, alreadyMissing: true });
});

test('Edge handlers bind owners, preserve reconnect identity, and never log or return credentials', async () => {
  const [start, callback, check, disconnect, upload, edge, database, page] = await Promise.all([
    source('supabase/functions/google-drive-oauth-start/index.ts'),
    source('supabase/functions/google-drive-oauth-callback/index.ts'),
    source('supabase/functions/google-drive-connection-check/index.ts'),
    source('supabase/functions/google-drive-disconnect/index.ts'),
    source('supabase/functions/google-drive-upload/index.ts'),
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
  assert.match(upload, /authenticatedStorageOwner/);
  assert.match(upload, /GOOGLE_DRIVE_UPLOAD_DISABLED/);
  assert.match(upload, /external_media_objects/);
  assert.match(upload, /status: 'uploading'/);
  assert.match(upload, /status: 'available'/);
  assert.match(upload, /validateSmallDriveUpload/);
  assert.match(upload, /verifyManagedFolder/);
  assert.match(upload, /deleteDriveFile/);
  assert.match(upload, /manual_cleanup_required/);
  assert.doesNotMatch(upload, /owner(?:UserId|_user_id):\s*body/);
  assert.match(database, /SUPABASE_DB_URL/);
  assert.match(database, /private\.server_read_storage_connection_secret/);
  assert.doesNotMatch(database, /public\.server_/);
  assert.doesNotMatch(`${start}${callback}${check}${disconnect}${upload}${edge}${database}`, /console\.(?:log|error)\([^\n]*(?:token|authorization|secret|pkce)/i);
  assert.doesNotMatch(page, /credential_secret_id|provider_account_id|root_folder_id|folder_ids|granted_scopes/);
});
