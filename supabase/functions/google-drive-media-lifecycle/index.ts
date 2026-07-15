import {
  deleteDriveFile,
  fetchGoogleIdentity,
  refreshGoogleAccessToken,
  tokenGrantedScopes,
} from '../_shared/googleDriveApi.js';
import { readConnectionSecret } from '../_shared/googleDriveDatabase.ts';
import {
  authenticatedStorageOwner,
  authenticatedTeamMember,
  corsHeaders,
  edgeEnvironment,
  fail,
  reply,
} from '../_shared/googleDriveEdge.ts';
import {
  isSafeUuid,
  normalizeProjectGalleryPreviewPath,
  PROJECT_GALLERY_ORIGINAL_PURPOSE,
  PROJECT_MEDIA_BUCKET,
  projectReferencesMediaObject,
  safeExternalMediaResponse,
  validCleanupAuthorization,
} from '../_shared/googleDriveMediaLifecycle.js';
import { hasRequiredGoogleScopes } from '../_shared/googleDriveOAuth.js';

const MEDIA_FIELDS = 'id,owner_user_id,storage_connection_id,provider,external_file_id,external_parent_id,filename,mime_type,size_bytes,status,visibility,preview_provider,preview_bucket,preview_path,metadata';
const CONNECTION_FIELDS = 'id,owner_user_id,provider,provider_account_id,status,granted_scopes';
const MAX_PROJECT_MEDIA = 50;

function cleanBody(body: any) {
  return body && typeof body === 'object' && !Array.isArray(body) ? body : {};
}

function bodyHasOnly(body: any, fields: string[]) {
  const allowed = new Set(fields);
  return Object.keys(body).every((key) => allowed.has(key));
}

async function verifyPreviewObject(admin: any, path: string, expectedMimeType: string) {
  const segments = path.split('/');
  const name = segments.pop() || '';
  const folder = segments.join('/');
  const { data, error } = await admin.storage.from(PROJECT_MEDIA_BUCKET).list(folder, { limit: 100, search: name });
  if (error) throw Object.assign(new Error('Preview lookup failed'), { code: 'PREVIEW_LOOKUP_FAILED' });
  const object = (data || []).find((candidate: any) => candidate.name === name && (candidate.id || candidate.metadata));
  const size = Number(object?.metadata?.size || 0);
  const mimeType = object?.metadata?.mimetype || object?.metadata?.contentType || '';
  if (!object || size <= 0 || size > 1024 * 1024 || (mimeType && mimeType !== expectedMimeType)) {
    throw Object.assign(new Error('Preview verification failed'), { code: 'PREVIEW_INVALID' });
  }
}

async function attachPreview(request: Request, env: ReturnType<typeof edgeEnvironment>, cors: Record<string, string>, body: any) {
  if (!bodyHasOnly(body, ['action', 'mediaObjectId', 'previewPath'])) return fail('INVALID_REQUEST', 'The preview request contains unsupported fields.', 400, cors);
  const mediaObjectId = String(body.mediaObjectId || '');
  const previewPath = normalizeProjectGalleryPreviewPath(body.previewPath);
  if (!isSafeUuid(mediaObjectId) || !previewPath) return fail('INVALID_REQUEST', 'The media reference or preview path is invalid.', 400, cors);
  const owner = await authenticatedStorageOwner(request, env);
  if ('error' in owner) return fail(owner.error, owner.status === 401 ? 'Your session has expired. Please sign in again.' : 'Your account is not eligible for external storage.', owner.status, cors);
  const { data: media, error } = await owner.admin.from('external_media_objects').select(MEDIA_FIELDS)
    .eq('id', mediaObjectId).eq('owner_user_id', owner.user.id).eq('provider', 'google_drive').maybeSingle();
  if (error) return fail('MEDIA_LOOKUP_FAILED', 'The uploaded media could not be verified.', 500, cors);
  if (!media || media.metadata?.purpose !== PROJECT_GALLERY_ORIGINAL_PURPOSE || media.status !== 'available') {
    return fail('MEDIA_NOT_AVAILABLE', 'The uploaded media is not available for a project gallery.', 409, cors);
  }
  if (media.preview_path) {
    if (media.preview_path !== previewPath) return fail('PREVIEW_ALREADY_ATTACHED', 'This media already has a different public preview.', 409, cors);
    return reply({ success: true, media: safeExternalMediaResponse(media) }, 200, cors);
  }
  try {
    await verifyPreviewObject(owner.admin, previewPath, media.mime_type);
    const { data: finalized, error: updateError } = await owner.admin.from('external_media_objects').update({
      preview_provider: 'supabase',
      preview_bucket: PROJECT_MEDIA_BUCKET,
      preview_path: previewPath,
      metadata: { ...media.metadata, preview_attached_at: new Date().toISOString() },
    }).eq('id', media.id).eq('owner_user_id', owner.user.id).eq('status', 'available').select(MEDIA_FIELDS).maybeSingle();
    if (updateError || !finalized) throw Object.assign(new Error('Preview finalization failed'), { code: 'PREVIEW_FINALIZATION_FAILED' });
    return reply({ success: true, media: safeExternalMediaResponse(finalized) }, 200, cors);
  } catch (previewError) {
    const code = previewError?.code || 'PREVIEW_FINALIZATION_FAILED';
    console.error('[google-drive-media-lifecycle] preview failed', { mediaId: media.id, code });
    return fail(code, 'The public preview could not be safely attached.', 500, cors);
  }
}

async function prepareProjectDelete(request: Request, env: ReturnType<typeof edgeEnvironment>, cors: Record<string, string>, body: any) {
  if (!bodyHasOnly(body, ['action', 'projectId', 'mediaObjectIds'])) return fail('INVALID_REQUEST', 'The project cleanup request contains unsupported fields.', 400, cors);
  const actor = await authenticatedTeamMember(request, env);
  if ('error' in actor) return fail(actor.error, actor.status === 401 ? 'Your session has expired. Please sign in again.' : 'You do not have permission to prepare project cleanup.', actor.status, cors);
  const projectId = String(body.projectId || '');
  const mediaObjectIds = [...new Set(Array.isArray(body.mediaObjectIds) ? body.mediaObjectIds.map(String) : [])];
  if (!isSafeUuid(projectId) || !mediaObjectIds.length || mediaObjectIds.length > MAX_PROJECT_MEDIA || mediaObjectIds.some((id) => !isSafeUuid(id))) {
    return fail('INVALID_REQUEST', 'The project cleanup selection is invalid.', 400, cors);
  }
  const { data: project, error: projectError } = await actor.admin.from('projects').select('id,status,owner_user_id,created_by,gallery_items').eq('id', projectId).maybeSingle();
  if (projectError) return fail('PROJECT_LOOKUP_FAILED', 'The project could not be checked for cleanup.', 500, cors);
  const projectDelete = body.action === 'prepare_project_delete';
  const canPrepare = projectDelete
    ? ['super_admin', 'admin'].includes(actor.role) && project?.status !== 'published'
    : ['super_admin', 'admin'].includes(actor.role) || project?.owner_user_id === actor.user.id || project?.created_by === actor.user.id;
  if (!project || !canPrepare || mediaObjectIds.some((id) => !projectReferencesMediaObject(project, id))) {
    return fail('PROJECT_CLEANUP_NOT_ALLOWED', 'The project media could not be authorized for deletion.', 409, cors);
  }
  const { data: mediaRows, error: mediaError } = await actor.admin.from('external_media_objects').select(MEDIA_FIELDS).in('id', mediaObjectIds).eq('provider', 'google_drive');
  if (mediaError || (mediaRows || []).length !== mediaObjectIds.length || (mediaRows || []).some((row: any) => row.metadata?.purpose !== PROJECT_GALLERY_ORIGINAL_PURPOSE)) {
    return fail('MEDIA_LOOKUP_FAILED', 'The project media could not be verified for cleanup.', 409, cors);
  }
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  const updates = await Promise.all((mediaRows || []).map((row: any) => actor.admin.from('external_media_objects').update({
    metadata: {
      ...row.metadata,
      cleanup_authorization: { project_id: projectId, actor_user_id: actor.user.id, expires_at: expiresAt },
    },
  }).eq('id', row.id).eq('provider', 'google_drive')));
  if (updates.some((result: any) => result.error)) return fail('CLEANUP_AUTHORIZATION_FAILED', 'Project cleanup could not be prepared.', 500, cors);
  return reply({ success: true, authorized: mediaObjectIds.length, expiresAt }, 200, cors);
}

async function deleteMedia(request: Request, env: ReturnType<typeof edgeEnvironment>, cors: Record<string, string>, body: any) {
  if (!bodyHasOnly(body, ['action', 'mediaObjectId', 'projectId'])) return fail('INVALID_REQUEST', 'The delete request contains unsupported fields.', 400, cors);
  const actor = await authenticatedTeamMember(request, env);
  if ('error' in actor) return fail(actor.error, actor.status === 401 ? 'Your session has expired. Please sign in again.' : 'You do not have permission to delete this media.', actor.status, cors);
  const mediaObjectId = String(body.mediaObjectId || '');
  const projectId = String(body.projectId || '');
  if (!isSafeUuid(mediaObjectId) || (projectId && !isSafeUuid(projectId))) return fail('INVALID_REQUEST', 'The media reference is invalid.', 400, cors);
  const { data: media, error } = await actor.admin.from('external_media_objects').select(MEDIA_FIELDS).eq('id', mediaObjectId).eq('provider', 'google_drive').maybeSingle();
  if (error) return fail('MEDIA_LOOKUP_FAILED', 'The media could not be verified for deletion.', 500, cors);
  if (!media || media.metadata?.purpose !== PROJECT_GALLERY_ORIGINAL_PURPOSE) return fail('MEDIA_NOT_FOUND', 'The project media was not found.', 404, cors);
  if (media.status === 'deleted') return reply({ success: true, deleted: true, mediaObjectId }, 200, cors);

  const ownsMedia = media.owner_user_id === actor.user.id;
  if (ownsMedia) {
    const eligibleOwner = await authenticatedStorageOwner(request, env);
    if ('error' in eligibleOwner) return fail('NOT_AUTHORIZED', 'Your account is not eligible to delete this media.', 403, cors);
  } else if (!['super_admin', 'admin'].includes(actor.role) || !projectId
    || !validCleanupAuthorization(media.metadata, { actorUserId: actor.user.id, projectId })) {
    return fail('NOT_AUTHORIZED', 'You do not have permission to delete this media.', 403, cors);
  }

  const { data: connection, error: connectionError } = await actor.admin.from('storage_connections').select(CONNECTION_FIELDS)
    .eq('id', media.storage_connection_id).eq('owner_user_id', media.owner_user_id).eq('provider', 'google_drive').maybeSingle();
  if (connectionError || !connection) return fail('CONNECTION_NOT_FOUND', 'The storage connection for this media is unavailable.', 409, cors);
  await actor.admin.from('external_media_objects').update({ status: 'deleting' }).eq('id', media.id).neq('status', 'deleted');
  try {
    const refreshToken = await readConnectionSecret(media.owner_user_id, connection.id);
    if (!refreshToken) throw Object.assign(new Error('Credential missing'), { code: 'TOKEN_REVOKED' });
    const tokens = await refreshGoogleAccessToken(fetch, env.google, refreshToken);
    const scopes = tokenGrantedScopes(tokens, connection.granted_scopes || []);
    if (!hasRequiredGoogleScopes(scopes)) throw Object.assign(new Error('Scope missing'), { code: 'SCOPE_MISSING' });
    const identity = await fetchGoogleIdentity(fetch, tokens.access_token);
    if (identity.sub !== connection.provider_account_id) throw Object.assign(new Error('Account mismatch'), { code: 'ACCOUNT_MISMATCH' });
    if (media.external_file_id) await deleteDriveFile(fetch, tokens.access_token, media.external_file_id);
    if (media.preview_provider === 'supabase' && media.preview_bucket === PROJECT_MEDIA_BUCKET && media.preview_path) {
      const { error: previewDeleteError } = await actor.admin.storage.from(PROJECT_MEDIA_BUCKET).remove([media.preview_path]);
      if (previewDeleteError) throw Object.assign(new Error('Preview cleanup failed'), { code: 'PREVIEW_CLEANUP_FAILED' });
    }
    const { error: finalizeError } = await actor.admin.from('external_media_objects').update({
      external_file_id: null,
      external_parent_id: null,
      preview_provider: null,
      preview_bucket: null,
      preview_path: null,
      status: 'deleted',
      metadata: { purpose: PROJECT_GALLERY_ORIGINAL_PURPOSE, cleanup_state: 'deleted', deleted_at: new Date().toISOString() },
    }).eq('id', media.id);
    if (finalizeError) throw Object.assign(new Error('Delete finalization failed'), { code: 'DELETE_FINALIZATION_FAILED' });
    return reply({ success: true, deleted: true, mediaObjectId }, 200, cors);
  } catch (deleteError) {
    const code = deleteError?.code || 'DELETE_FAILED';
    await actor.admin.from('external_media_objects').update({
      status: 'error',
      metadata: { ...media.metadata, error_code: code, cleanup_state: 'manual_cleanup_required' },
    }).eq('id', media.id);
    console.error('[google-drive-media-lifecycle] delete failed', { mediaId: media.id, code });
    const reconnect = ['TOKEN_REVOKED', 'SCOPE_MISSING', 'ACCOUNT_MISMATCH'].includes(code);
    return fail(reconnect ? 'RECONNECT_REQUIRED' : code, reconnect ? 'Reconnect Google Drive before retrying cleanup.' : 'The private original could not be deleted safely. It remains recorded for follow-up.', reconnect ? 409 : 502, cors);
  }
}

Deno.serve(async (request) => {
  const env = edgeEnvironment();
  const cors = corsHeaders(request, env.siteOrigin);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return fail('METHOD_NOT_ALLOWED', 'Method not allowed.', 405, cors);
  if (!cors['Access-Control-Allow-Origin']) return fail('ORIGIN_NOT_ALLOWED', 'This request origin is not allowed.', 403, cors);
  if (!env.google.configured || !env.googleDriveUploadEnabled) return fail('GOOGLE_DRIVE_UPLOAD_DISABLED', 'Google Drive project media is not enabled.', 503, cors);
  const body = cleanBody(await request.json().catch(() => ({})));
  if (body.action === 'attach_preview') return attachPreview(request, env, cors, body);
  if (body.action === 'prepare_project_delete') return prepareProjectDelete(request, env, cors, body);
  if (body.action === 'prepare_project_media_removal') return prepareProjectDelete(request, env, cors, body);
  if (body.action === 'delete') return deleteMedia(request, env, cors, body);
  return fail('ACTION_NOT_ALLOWED', 'The requested media action is unavailable.', 400, cors);
});
