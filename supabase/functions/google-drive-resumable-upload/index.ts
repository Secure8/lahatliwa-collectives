import {
  cancelResumableDriveUpload,
  createResumableDriveUpload,
  deleteDriveFile,
  fetchGoogleIdentity,
  generateDriveFileId,
  getDriveFile,
  moveDriveFile,
  refreshGoogleAccessToken,
  tokenGrantedScopes,
  verifyManagedFolder,
  verifyManagedRoot,
} from '../_shared/googleDriveApi.js';
import {
  createExternalUploadSession,
  deleteExternalUploadSession,
  readConnectionSecret,
  readExternalUploadSession,
} from '../_shared/googleDriveDatabase.ts';
import {
  authorizeCreativeProfile,
  authorizeProject,
  authenticatedStorageOwner,
  corsHeaders,
  edgeEnvironment,
  fail,
  reply,
} from '../_shared/googleDriveEdge.ts';
import {
  RESUMABLE_CHUNK_BYTES,
  RESUMABLE_SESSION_TTL_MS,
  replacementCanActivate,
  safeExternalFileResponse,
  validateExternalUploadRequest,
} from '../_shared/externalStorageLifecycle.js';
import { hasRequiredGoogleScopes } from '../_shared/googleDriveOAuth.js';

const MEDIA_FIELDS = 'id,owner_user_id,storage_connection_id,provider,external_file_id,external_parent_id,filename,mime_type,size_bytes,status,file_category,project_id,creative_member_id,profile_media_kind,preview_required,preview_provider,preview_bucket,preview_path,replaces_media_object_id,replaced_by_media_object_id,original_parent_role,archived_at,archive_reason,cleanup_status,cleanup_attempt_count,cleanup_error,uploaded_bytes,upload_expires_at,metadata,created_at,updated_at';
const CONNECTION_FIELDS = 'id,owner_user_id,provider,provider_account_id,root_folder_id,folder_ids,status,granted_scopes';

function cleanBody(value: any) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
function bodyHasOnly(body: any, fields: string[]) { const allowed = new Set(fields); return Object.keys(body).every((key) => allowed.has(key)); }

async function authorizeTarget(owner: any, input: any, mode: 'view' | 'edit' = 'edit') {
  if (input.project_id || input.projectId) return authorizeProject(owner, input.project_id || input.projectId, mode);
  if (input.creative_member_id || input.creativeMemberId) return authorizeCreativeProfile(owner, input.creative_member_id || input.creativeMemberId);
  return null;
}

async function accessTokenForConnection(owner: any, env: any, connection: any) {
  const refreshToken = await readConnectionSecret(connection.owner_user_id, connection.id);
  if (!refreshToken) throw Object.assign(new Error('Credential missing'), { code: 'TOKEN_REVOKED' });
  const tokens = await refreshGoogleAccessToken(fetch, env.google, refreshToken);
  const scopes = tokenGrantedScopes(tokens, connection.granted_scopes || []);
  if (!hasRequiredGoogleScopes(scopes)) throw Object.assign(new Error('Scope missing'), { code: 'SCOPE_MISSING' });
  const identity = await fetchGoogleIdentity(fetch, tokens.access_token);
  if (identity.sub !== connection.provider_account_id) throw Object.assign(new Error('Account mismatch'), { code: 'ACCOUNT_MISMATCH' });
  return tokens.access_token;
}

async function initiate(request: Request, env: any, cors: any, body: any) {
  if (!bodyHasOnly(body, ['action','category','filename','mimeType','sizeBytes','projectId','creativeMemberId','profileMediaKind','withPreview','replacementMediaObjectId'])) {
    return fail('INVALID_REQUEST', 'The upload request contains unsupported fields.', 400, cors);
  }
  const owner = await authenticatedStorageOwner(request, env);
  if ('error' in owner) return fail(owner.error, owner.status === 401 ? 'Your session has expired. Please sign in again.' : 'Your account is not eligible for external storage.', owner.status, cors);
  const validation: any = validateExternalUploadRequest(body);
  if (!validation.ok) return fail(validation.code, validation.message, 400, cors);
  const target = await authorizeTarget(owner, validation, 'edit');
  if (!target) return fail('TARGET_NOT_AUTHORIZED', 'You do not have permission to upload private files for this project or profile.', 403, cors);
  const profileMediaKind = validation.category.target === 'profile' ? String(body.profileMediaKind || '') : null;
  if (profileMediaKind && !['profile','cover'].includes(profileMediaKind)) return fail('PROFILE_MEDIA_KIND_INVALID', 'Choose profile or cover media.', 400, cors);

  const { data: connection, error: connectionError } = await owner.admin.from('storage_connections').select(CONNECTION_FIELDS)
    .eq('owner_user_id', owner.user.id).eq('provider', 'google_drive').eq('status', 'connected')
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (connectionError) return fail('STATUS_UNAVAILABLE', 'Storage connection status could not be loaded.', 500, cors);
  if (!connection) return fail('NOT_CONNECTED', 'Connect Google Drive before uploading a private file.', 409, cors);
  const parentId = connection.folder_ids?.[validation.category.folderRole];
  if (!parentId || !connection.root_folder_id) return fail('FOLDER_MISSING', 'The managed Google Drive folder is unavailable. Reconnect Drive.', 409, cors);

  let replacement: any = null;
  if (body.replacementMediaObjectId) {
    const { data, error } = await owner.admin.from('external_media_objects').select(MEDIA_FIELDS)
      .eq('id', String(body.replacementMediaObjectId)).eq('owner_user_id', owner.user.id).maybeSingle();
    if (error || !data || data.file_category !== body.category || data.status !== 'available'
      || data.project_id !== (validation.projectId || null) || data.creative_member_id !== (validation.creativeMemberId || null)) {
      return fail('REPLACEMENT_NOT_ALLOWED', 'The selected file cannot be replaced by this upload.', 409, cors);
    }
    replacement = data;
  }

  const mediaId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + RESUMABLE_SESSION_TTL_MS).toISOString();
  let accessToken = '';
  let fileId = '';
  let uploadUrl = '';
  try {
    accessToken = await accessTokenForConnection(owner, env, connection);
    await verifyManagedRoot(fetch, accessToken, connection.root_folder_id);
    await verifyManagedFolder(fetch, accessToken, parentId, validation.category.folderRole, connection.root_folder_id);
    fileId = await generateDriveFileId(fetch, accessToken);
    const { error: insertError } = await owner.admin.from('external_media_objects').insert({
      id: mediaId,
      owner_user_id: owner.user.id,
      storage_connection_id: connection.id,
      provider: 'google_drive',
      external_file_id: fileId,
      external_parent_id: parentId,
      filename: validation.filename,
      mime_type: validation.mimeType,
      size_bytes: validation.sizeBytes,
      visibility: 'private',
      status: 'initiating',
      file_category: body.category,
      project_id: validation.projectId || null,
      creative_member_id: validation.creativeMemberId || null,
      profile_media_kind: profileMediaKind,
      preview_required: validation.withPreview,
      replaces_media_object_id: replacement?.id || null,
      original_parent_role: validation.category.folderRole,
      upload_expires_at: expiresAt,
      metadata: { upload_transport: 'google_resumable_v1' },
    });
    if (insertError) throw Object.assign(new Error('Registration failed'), { code: 'MEDIA_REGISTRATION_FAILED' });
    uploadUrl = await createResumableDriveUpload(fetch, accessToken, {
      fileId,
      name: validation.filename,
      mimeType: validation.mimeType,
      sizeBytes: validation.sizeBytes,
      parentId,
      mediaObjectId: mediaId,
      category: body.category,
    });
    await createExternalUploadSession({ ownerUserId: owner.user.id, mediaObjectId: mediaId, uploadUrl, expiresAt });
    const { data: row, error: updateError } = await owner.admin.from('external_media_objects').update({ status: 'uploading' })
      .eq('id', mediaId).select(MEDIA_FIELDS).single();
    if (updateError) throw Object.assign(new Error('Session finalization failed'), { code: 'SESSION_REGISTRATION_FAILED' });
    return reply({ success: true, upload: { media: safeExternalFileResponse(row), sessionUrl: uploadUrl, chunkSize: RESUMABLE_CHUNK_BYTES, expiresAt } }, 201, cors);
  } catch (error) {
    if (uploadUrl) await cancelResumableDriveUpload(fetch, uploadUrl).catch(() => null);
    if (fileId && accessToken) await deleteDriveFile(fetch, accessToken, fileId).catch(() => null);
    await deleteExternalUploadSession(owner.user.id, mediaId).catch(() => null);
    await owner.admin.from('external_media_objects').update({ status: 'error', cleanup_status: 'manual_required', cleanup_error: error?.code || 'UPLOAD_INIT_FAILED' }).eq('id', mediaId);
    const reconnect = ['TOKEN_REVOKED','SCOPE_MISSING','ACCOUNT_MISMATCH'].includes(error?.code);
    return fail(reconnect ? 'RECONNECT_REQUIRED' : error?.code || 'UPLOAD_INIT_FAILED', reconnect ? 'Reconnect Google Drive before uploading.' : 'The resumable upload could not be started safely.', reconnect ? 409 : 502, cors);
  }
}

async function loadOwnedMedia(owner: any, mediaObjectId: string) {
  const { data, error } = await owner.admin.from('external_media_objects').select(MEDIA_FIELDS)
    .eq('id', mediaObjectId).eq('owner_user_id', owner.user.id).eq('provider', 'google_drive').maybeSingle();
  if (error || !data) return null;
  return data;
}

async function finalize(request: Request, env: any, cors: any, body: any) {
  if (!bodyHasOnly(body, ['action','mediaObjectId'])) return fail('INVALID_REQUEST', 'The finalization request contains unsupported fields.', 400, cors);
  const owner = await authenticatedStorageOwner(request, env);
  if ('error' in owner) return fail(owner.error, 'You are not authorized to finish this upload.', owner.status, cors);
  const media = await loadOwnedMedia(owner, String(body.mediaObjectId || ''));
  if (!media || !['uploading','processing'].includes(media.status)) return fail('MEDIA_NOT_AVAILABLE', 'The upload is not waiting for finalization.', 409, cors);
  if (!await authorizeTarget(owner, media, 'edit')) return fail('TARGET_NOT_AUTHORIZED', 'You no longer have permission to update this file.', 403, cors);
  const { data: connection } = await owner.admin.from('storage_connections').select(CONNECTION_FIELDS).eq('id', media.storage_connection_id).maybeSingle();
  if (!connection) return fail('CONNECTION_NOT_FOUND', 'The storage connection is unavailable.', 409, cors);
  try {
    const accessToken = await accessTokenForConnection(owner, env, connection);
    const providerFile = await getDriveFile(fetch, accessToken, media.external_file_id);
    const valid = providerFile.trashed !== true
      && providerFile.name === media.filename
      && providerFile.mimeType === media.mime_type
      && Number(providerFile.size || 0) === Number(media.size_bytes)
      && Array.isArray(providerFile.parents) && providerFile.parents.includes(media.external_parent_id)
      && providerFile.appProperties?.lahatLiwaMediaObjectId === media.id;
    if (!valid) return fail('UPLOAD_VERIFICATION_FAILED', 'Google Drive could not verify the completed file. Retry the upload.', 409, cors);
    await deleteExternalUploadSession(owner.user.id, media.id);
    const nextStatus = media.preview_required ? 'processing' : 'available';
    const { data: finalized, error } = await owner.admin.from('external_media_objects').update({
      status: nextStatus,
      uploaded_bytes: media.size_bytes,
      upload_expires_at: null,
      checksum_algorithm: providerFile.md5Checksum ? 'md5' : null,
      checksum_value: providerFile.md5Checksum || null,
      cleanup_status: 'none', cleanup_error: null,
    }).eq('id', media.id).select(MEDIA_FIELDS).single();
    if (error) throw Object.assign(new Error('Finalization failed'), { code: 'MEDIA_FINALIZATION_FAILED' });

    if (replacementCanActivate(finalized) && finalized.replaces_media_object_id) {
      const { data: old } = await owner.admin.from('external_media_objects').select(MEDIA_FIELDS).eq('id', finalized.replaces_media_object_id).maybeSingle();
      const archiveId = connection.folder_ids?.archive;
      if (!old || !archiveId || old.storage_connection_id !== connection.id) throw Object.assign(new Error('Replacement archive unavailable'), { code: 'REPLACEMENT_ARCHIVE_FAILED' });
      await moveDriveFile(fetch, accessToken, old.external_file_id, old.external_parent_id, archiveId);
      await owner.admin.from('external_media_objects').update({ status: 'archived', external_parent_id: archiveId, archived_at: new Date().toISOString(), archive_reason: 'replaced', replaced_by_media_object_id: finalized.id }).eq('id', old.id);
    }
    return reply({ success: true, media: safeExternalFileResponse(finalized) }, 200, cors);
  } catch (error) {
    await owner.admin.from('external_media_objects').update({ status: 'error', cleanup_status: 'retry_required', cleanup_error: error?.code || 'FINALIZE_FAILED' }).eq('id', media.id);
    const reconnect = ['TOKEN_REVOKED','SCOPE_MISSING','ACCOUNT_MISMATCH'].includes(error?.code);
    return fail(reconnect ? 'RECONNECT_REQUIRED' : error?.code || 'FINALIZE_FAILED', reconnect ? 'Reconnect Google Drive before retrying.' : 'The uploaded file could not be finalized. The previous active file was preserved.', reconnect ? 409 : 502, cors);
  }
}

async function progress(request: Request, env: any, cors: any, body: any) {
  if (!bodyHasOnly(body, ['action','mediaObjectId','uploadedBytes'])) return fail('INVALID_REQUEST', 'The progress update is invalid.', 400, cors);
  const owner = await authenticatedStorageOwner(request, env);
  if ('error' in owner) return fail(owner.error, 'You are not authorized to update this upload.', owner.status, cors);
  const media = await loadOwnedMedia(owner, String(body.mediaObjectId || ''));
  const uploadedBytes = Number(body.uploadedBytes || 0);
  if (!media || media.status !== 'uploading' || !Number.isSafeInteger(uploadedBytes) || uploadedBytes < 0 || uploadedBytes > Number(media.size_bytes)) return fail('INVALID_PROGRESS', 'The upload progress is invalid.', 400, cors);
  await owner.admin.from('external_media_objects').update({ uploaded_bytes: uploadedBytes }).eq('id', media.id);
  return reply({ success: true, uploadedBytes }, 200, cors);
}

async function cancel(request: Request, env: any, cors: any, body: any) {
  if (!bodyHasOnly(body, ['action','mediaObjectId'])) return fail('INVALID_REQUEST', 'The cancellation request is invalid.', 400, cors);
  const owner = await authenticatedStorageOwner(request, env);
  if ('error' in owner) return fail(owner.error, 'You are not authorized to cancel this upload.', owner.status, cors);
  const media = await loadOwnedMedia(owner, String(body.mediaObjectId || ''));
  if (!media || !['initiating','uploading','error'].includes(media.status)) return fail('MEDIA_NOT_AVAILABLE', 'The upload cannot be cancelled.', 409, cors);
  if (!await authorizeTarget(owner, media, 'edit')) return fail('TARGET_NOT_AUTHORIZED', 'You no longer have permission to cancel this upload.', 403, cors);
  try {
    const session: any = await readExternalUploadSession(owner.user.id, media.id);
    if (session?.upload_url) await cancelResumableDriveUpload(fetch, session.upload_url);
    await deleteExternalUploadSession(owner.user.id, media.id);
    const { data: connection } = await owner.admin.from('storage_connections').select(CONNECTION_FIELDS).eq('id', media.storage_connection_id).maybeSingle();
    if (connection && media.external_file_id) {
      const token = await accessTokenForConnection(owner, env, connection);
      await deleteDriveFile(fetch, token, media.external_file_id);
    }
    await owner.admin.from('external_media_objects').update({ status: 'cancelled', external_file_id: null, external_parent_id: null, upload_expires_at: null, cleanup_status: 'complete', cleanup_error: null }).eq('id', media.id);
    return reply({ success: true, cancelled: true, mediaObjectId: media.id }, 200, cors);
  } catch (error) {
    await owner.admin.from('external_media_objects').update({ status: 'abandoned', cleanup_status: 'retry_required', cleanup_error: error?.code || 'UPLOAD_CANCEL_FAILED' }).eq('id', media.id);
    return fail('UPLOAD_CANCEL_FAILED', 'The upload stopped, but provider cleanup needs to be retried.', 502, cors);
  }
}

Deno.serve(async (request) => {
  const env = edgeEnvironment();
  const cors = corsHeaders(request, env.siteOrigin);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return fail('METHOD_NOT_ALLOWED', 'Method not allowed.', 405, cors);
  if (!cors['Access-Control-Allow-Origin']) return fail('ORIGIN_NOT_ALLOWED', 'This request origin is not allowed.', 403, cors);
  if (!env.google.configured || !env.googleDriveUploadEnabled) return fail('GOOGLE_DRIVE_UPLOAD_DISABLED', 'Google Drive uploads are not enabled.', 503, cors);
  const body = cleanBody(await request.json().catch(() => ({})));
  if (body.action === 'initiate') return initiate(request, env, cors, body);
  if (body.action === 'finalize') return finalize(request, env, cors, body);
  if (body.action === 'progress') return progress(request, env, cors, body);
  if (body.action === 'cancel') return cancel(request, env, cors, body);
  return fail('ACTION_NOT_ALLOWED', 'The requested upload action is unavailable.', 400, cors);
});
