import { fetchDriveFileContent, fetchGoogleIdentity, refreshGoogleAccessToken, tokenGrantedScopes } from '../_shared/googleDriveApi.js';
import { readConnectionSecret } from '../_shared/googleDriveDatabase.ts';
import {
  authorizeCreativeProfile,
  authorizeProject,
  authenticatedStorageOwner,
  corsHeaders,
  edgeEnvironment,
  fail,
} from '../_shared/googleDriveEdge.ts';
import { hasRequiredGoogleScopes } from '../_shared/googleDriveOAuth.js';

const MEDIA_FIELDS = 'id,owner_user_id,storage_connection_id,external_file_id,filename,mime_type,size_bytes,status,file_category,project_id,creative_member_id';
const CONNECTION_FIELDS = 'id,owner_user_id,provider_account_id,status,granted_scopes';

function safeDispositionFilename(value = '') {
  const ascii = String(value).replace(/[^a-zA-Z0-9._ -]/g, '-').trim().slice(0, 160) || 'private-file';
  return ascii.replace(/["\\]/g, '-');
}

Deno.serve(async (request) => {
  const env = edgeEnvironment();
  const cors = corsHeaders(request, env.siteOrigin);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return fail('METHOD_NOT_ALLOWED', 'Method not allowed.', 405, cors);
  if (!cors['Access-Control-Allow-Origin']) return fail('ORIGIN_NOT_ALLOWED', 'This request origin is not allowed.', 403, cors);
  if (!env.google.configured) return fail('GOOGLE_DRIVE_DISABLED', 'Google Drive access is unavailable.', 503, cors);

  const actor = await authenticatedStorageOwner(request, env);
  if ('error' in actor) return fail(actor.error, actor.status === 401 ? 'Your session has expired. Please sign in again.' : 'Your account is not eligible to access private storage.', actor.status, cors);
  const body = await request.json().catch(() => ({}));
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some((key) => !['mediaObjectId','mode'].includes(key))) {
    return fail('INVALID_REQUEST', 'The private file request is invalid.', 400, cors);
  }
  const mode = body.mode === 'open' ? 'inline' : body.mode === 'download' ? 'attachment' : '';
  if (!mode) return fail('INVALID_MODE', 'Choose open or download.', 400, cors);

  const { data: media, error } = await actor.admin.from('external_media_objects').select(MEDIA_FIELDS)
    .eq('id', String(body.mediaObjectId || '')).eq('provider', 'google_drive').maybeSingle();
  if (error) return fail('MEDIA_LOOKUP_FAILED', 'The private file could not be checked.', 500, cors);
  if (!media || !media.external_file_id || !['available','archived'].includes(media.status)) return fail('MEDIA_NOT_FOUND', 'The private file is unavailable.', 404, cors);
  const authorized = media.project_id
    ? await authorizeProject(actor, media.project_id, 'view')
    : media.creative_member_id ? await authorizeCreativeProfile(actor, media.creative_member_id) : null;
  if (!authorized) {
    console.warn('[google-drive-file-access] denied', { actorUserId: actor.user.id, mediaObjectId: media.id });
    return fail('FILE_ACCESS_DENIED', 'You do not have permission to access this private file.', 403, cors);
  }

  const { data: connection } = await actor.admin.from('storage_connections').select(CONNECTION_FIELDS)
    .eq('id', media.storage_connection_id).eq('owner_user_id', media.owner_user_id).maybeSingle();
  if (!connection || !['connected','reconnect_required'].includes(connection.status)) return fail('CONNECTION_NOT_FOUND', 'The file owner must reconnect Google Drive before this file can be opened.', 409, cors);
  try {
    const refreshToken = await readConnectionSecret(media.owner_user_id, connection.id);
    if (!refreshToken) throw Object.assign(new Error('Credential missing'), { code: 'TOKEN_REVOKED' });
    const tokens = await refreshGoogleAccessToken(fetch, env.google, refreshToken);
    const scopes = tokenGrantedScopes(tokens, connection.granted_scopes || []);
    if (!hasRequiredGoogleScopes(scopes)) throw Object.assign(new Error('Scope missing'), { code: 'SCOPE_MISSING' });
    const identity = await fetchGoogleIdentity(fetch, tokens.access_token);
    if (identity.sub !== connection.provider_account_id) throw Object.assign(new Error('Account mismatch'), { code: 'ACCOUNT_MISMATCH' });
    const range = request.headers.get('Range') || '';
    if (range && !/^bytes=\d*-\d*$/.test(range)) return fail('INVALID_RANGE', 'The requested file range is invalid.', 416, cors);
    const provider = await fetchDriveFileContent(fetch, tokens.access_token, media.external_file_id, range);
    if (!provider.ok && provider.status !== 206) return fail('PROVIDER_DOWNLOAD_FAILED', 'Google Drive could not provide this private file.', provider.status === 404 ? 404 : 502, cors);
    const headers = new Headers(cors);
    headers.set('Cache-Control', 'private, no-store, max-age=0');
    headers.set('Content-Type', media.mime_type || 'application/octet-stream');
    headers.set('Content-Disposition', `${mode}; filename="${safeDispositionFilename(media.filename)}"`);
    for (const name of ['content-length','content-range','accept-ranges']) {
      const value = provider.headers.get(name); if (value) headers.set(name, value);
    }
    return new Response(provider.body, { status: provider.status, headers });
  } catch (accessError) {
    const reconnect = ['TOKEN_REVOKED','SCOPE_MISSING','ACCOUNT_MISMATCH'].includes(accessError?.code);
    console.error('[google-drive-file-access] failed', { mediaObjectId: media.id, code: accessError?.code || 'DOWNLOAD_FAILED' });
    return fail(reconnect ? 'RECONNECT_REQUIRED' : 'DOWNLOAD_FAILED', reconnect ? 'The file owner must reconnect Google Drive.' : 'The private file could not be opened.', reconnect ? 409 : 502, cors);
  }
});
