import {
  deleteDriveFile,
  fetchGoogleIdentity,
  refreshGoogleAccessToken,
  tokenGrantedScopes,
  uploadSmallDriveFile,
  verifyManagedFolder,
  verifyManagedRoot,
} from '../_shared/googleDriveApi.js';
import { readConnectionSecret } from '../_shared/googleDriveDatabase.ts';
import { authenticatedStorageOwner, corsHeaders, edgeEnvironment, fail, reply } from '../_shared/googleDriveEdge.ts';
import { isSafeUuid, safeExternalMediaResponse } from '../_shared/googleDriveMediaLifecycle.js';
import { hasRequiredGoogleScopes } from '../_shared/googleDriveOAuth.js';
import {
  SMALL_DRIVE_REQUEST_MAX_BYTES,
  driveUploadPurposeAllowsMime,
  resolveDriveUploadPurpose,
  validateDriveUploadResult,
  validateSmallDriveUpload,
} from '../_shared/googleDriveUpload.js';

const CONNECTION_FIELDS = 'id,owner_user_id,provider,provider_account_id,root_folder_id,folder_ids,status,granted_scopes,root_folder_health';
const SAFE_FORM_FIELDS = new Set(['file', 'purpose', 'request_id']);

async function markConnection(admin: any, id: string, patch: Record<string, unknown>) {
  await admin.from('storage_connections').update(patch).eq('id', id).eq('provider', 'google_drive');
}

async function markMediaError(admin: any, ownerUserId: string, mediaId: string, metadata: Record<string, unknown>, providerFileId: string | null = null) {
  await admin.from('external_media_objects').update({
    status: 'error',
    external_file_id: providerFileId,
    metadata,
  }).eq('id', mediaId).eq('owner_user_id', ownerUserId);
}

Deno.serve(async (request) => {
  const env = edgeEnvironment();
  const cors = corsHeaders(request, env.siteOrigin);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return fail('METHOD_NOT_ALLOWED', 'Method not allowed.', 405, cors);
  if (!cors['Access-Control-Allow-Origin']) return fail('ORIGIN_NOT_ALLOWED', 'This request origin is not allowed.', 403, cors);
  if (!env.google.configured || !env.googleDriveUploadEnabled) return fail('GOOGLE_DRIVE_UPLOAD_DISABLED', 'Google Drive uploads are not enabled.', 503, cors);

  const owner = await authenticatedStorageOwner(request, env);
  if ('error' in owner) return fail(owner.error, owner.status === 401 ? 'Your session has expired. Please sign in again.' : 'Your account is not eligible for external storage.', owner.status, cors);

  const contentType = request.headers.get('content-type') || '';
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (!contentType.toLowerCase().startsWith('multipart/form-data;')) return fail('INVALID_FORM', 'Send one file using the upload form.', 400, cors);
  if (!Number.isFinite(contentLength) || contentLength <= 0 || contentLength > SMALL_DRIVE_REQUEST_MAX_BYTES) {
    return fail('FILE_SIZE_NOT_ALLOWED', 'The complete upload request must be no more than 2 MB.', 413, cors);
  }

  const form = await request.formData().catch(() => null);
  if (!form || [...form.keys()].some((key) => !SAFE_FORM_FIELDS.has(key))) return fail('INVALID_FORM', 'The upload form contains unsupported fields.', 400, cors);
  const files = form.getAll('file');
  const purposes = form.getAll('purpose');
  if (files.length !== 1 || purposes.length !== 1 || typeof purposes[0] !== 'string') return fail('INVALID_FORM', 'Choose one file and one upload purpose.', 400, cors);
  const purposeKey = purposes[0].trim();
  const purpose = resolveDriveUploadPurpose(purposeKey);
  if (!purpose) return fail('PURPOSE_NOT_ALLOWED', 'The selected upload purpose is unavailable.', 400, cors);
  const requestIds = form.getAll('request_id');
  const requestId = requestIds.length === 1 && typeof requestIds[0] === 'string' ? requestIds[0].trim() : '';
  if ((purposeKey === 'project_gallery_original' && (!isSafeUuid(requestId) || requestIds.length !== 1))
    || (purposeKey !== 'project_gallery_original' && requestIds.length)) {
    return fail('INVALID_REQUEST_ID', 'The upload retry reference is invalid.', 400, cors);
  }
  const file = files[0] as File;
  let validation;
  try {
    validation = await validateSmallDriveUpload(file);
  } catch {
    return fail('FILE_VALIDATION_FAILED', 'The selected file could not be safely inspected.', 400, cors);
  }
  if (!validation.ok) return fail(validation.code, validation.message, 400, cors);
  if (!driveUploadPurposeAllowsMime(purpose, validation.mimeType)) {
    return fail('FILE_TYPE_NOT_ALLOWED', 'The selected file type is unavailable for this upload purpose.', 400, cors);
  }

  const { data: connection, error: connectionError } = await owner.admin.from('storage_connections').select(CONNECTION_FIELDS)
    .eq('owner_user_id', owner.user.id).eq('provider', 'google_drive').eq('status', 'connected')
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (connectionError) return fail('STATUS_UNAVAILABLE', 'Storage connection status could not be loaded.', 500, cors);
  if (!connection) return fail('NOT_CONNECTED', 'Connect Google Drive before uploading a file.', 409, cors);

  const parentId = connection.folder_ids?.[purpose.folderRole];
  if (!parentId || !connection.root_folder_id) return fail('FOLDER_MISSING', `The managed ${purpose.folderLabel} folder is unavailable. Reconnect Google Drive.`, 409, cors);

  const baseMetadata = {
    purpose: purposeKey,
    folder_role: purpose.folderRole,
    ...(requestId ? { client_request_id: requestId } : {}),
  };
  let mediaId = crypto.randomUUID();
  let mediaRegistered = false;
  if (requestId) {
    const { data: existing, error: existingError } = await owner.admin.from('external_media_objects').select('id,owner_user_id,provider,external_file_id,filename,mime_type,size_bytes,status,preview_provider,preview_bucket,preview_path,metadata')
      .eq('owner_user_id', owner.user.id).eq('provider', 'google_drive')
      .contains('metadata', { purpose: purposeKey, client_request_id: requestId })
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (existingError) return fail('MEDIA_REGISTRATION_FAILED', 'The upload retry state could not be checked.', 500, cors);
    if (existing?.status === 'available') {
      if (existing.filename !== validation.name || existing.mime_type !== validation.mimeType || Number(existing.size_bytes) !== validation.size) {
        return fail('UPLOAD_RETRY_MISMATCH', 'The upload retry reference belongs to a different file.', 409, cors);
      }
      return reply({ success: true, media: safeExternalMediaResponse(existing) }, 200, cors);
    }
    const reusable = existing && ['deleted', 'error'].includes(existing.status) && !existing.external_file_id
      && ['provider_file_deleted', 'not_required', 'deleted'].includes(existing.metadata?.cleanup_state || 'not_required');
    if (existing && !reusable) return fail('UPLOAD_ALREADY_IN_PROGRESS', 'This upload is already being processed or requires cleanup review.', 409, cors);
    if (reusable) {
      mediaId = existing.id;
      const { error: resetError } = await owner.admin.from('external_media_objects').update({
        external_file_id: null,
        external_parent_id: parentId,
        filename: validation.name,
        mime_type: validation.mimeType,
        size_bytes: validation.size,
        checksum_algorithm: null,
        checksum_value: null,
        preview_provider: null,
        preview_bucket: null,
        preview_path: null,
        visibility: 'private',
        status: 'uploading',
        metadata: baseMetadata,
      }).eq('id', mediaId).eq('owner_user_id', owner.user.id);
      if (resetError) return fail('MEDIA_REGISTRATION_FAILED', 'The upload retry could not be registered.', 500, cors);
      mediaRegistered = true;
    }
  }
  const { error: pendingError } = mediaRegistered
    ? { error: null }
    : await owner.admin.from('external_media_objects').insert({
    id: mediaId,
    owner_user_id: owner.user.id,
    storage_connection_id: connection.id,
    provider: 'google_drive',
    external_parent_id: parentId,
    filename: validation.name,
    mime_type: validation.mimeType,
    size_bytes: validation.size,
    visibility: 'private',
    status: 'uploading',
    metadata: baseMetadata,
  });
  if (pendingError) return fail('MEDIA_REGISTRATION_FAILED', 'The test upload could not be registered.', 500, cors);

  let accessToken = '';
  let uploaded: any = null;
  try {
    const refreshToken = await readConnectionSecret(owner.user.id, connection.id);
    if (!refreshToken) throw Object.assign(new Error('Credential missing'), { code: 'TOKEN_REVOKED' });
    const tokens = await refreshGoogleAccessToken(fetch, env.google, refreshToken);
    const scopes = tokenGrantedScopes(tokens, connection.granted_scopes || []);
    if (!hasRequiredGoogleScopes(scopes)) throw Object.assign(new Error('Scope missing'), { code: 'SCOPE_MISSING' });
    const identity = await fetchGoogleIdentity(fetch, tokens.access_token);
    if (identity.sub !== connection.provider_account_id) throw Object.assign(new Error('Account mismatch'), { code: 'ACCOUNT_MISMATCH' });
    accessToken = tokens.access_token;

    await verifyManagedRoot(fetch, accessToken, connection.root_folder_id);
    await verifyManagedFolder(fetch, accessToken, parentId, purpose.folderRole, connection.root_folder_id);

    uploaded = await uploadSmallDriveFile(fetch, accessToken, {
      name: validation.name,
      mimeType: validation.mimeType,
      parentId,
      mediaObjectId: mediaId,
      purpose: purposeKey,
      bytes: new Uint8Array(await file.arrayBuffer()),
    });
    const providerResult = validateDriveUploadResult(uploaded, {
      mimeType: validation.mimeType,
      size: validation.size,
      parentId,
    });
    if (!providerResult.ok) throw Object.assign(new Error('Provider metadata mismatch'), { code: providerResult.code });

    const { data: finalized, error: finalizeError } = await owner.admin.from('external_media_objects').update({
      external_file_id: uploaded.id,
      external_parent_id: parentId,
      filename: uploaded.name || validation.name,
      mime_type: validation.mimeType,
      size_bytes: providerResult.size,
      checksum_algorithm: uploaded.md5Checksum ? 'md5' : null,
      checksum_value: uploaded.md5Checksum || null,
      status: 'available',
      metadata: { ...baseMetadata, provider_created_at: uploaded.createdTime || null },
    }).eq('id', mediaId).eq('owner_user_id', owner.user.id).select('id').maybeSingle();
    if (finalizeError || !finalized) throw Object.assign(new Error('Media finalize failed'), { code: 'MEDIA_FINALIZATION_FAILED' });

    await markConnection(owner.admin, connection.id, {
      last_verified_at: new Date().toISOString(), last_error_code: null, last_error_message: null,
    });
    return reply({
      success: true,
      media: {
        id: mediaId,
        provider: 'google_drive',
        filename: uploaded.name || validation.name,
        mimeType: validation.mimeType,
        sizeBytes: providerResult.size,
        status: 'available',
        preview: null,
        folder: purpose.folderLabel,
      },
    }, 201, cors);
  } catch (uploadError) {
    const code = uploadError?.code || 'UPLOAD_FAILED';
    let cleanupState = 'not_required';
    let retainedProviderFileId: string | null = null;
    if (uploaded?.id && accessToken) {
      try {
        await deleteDriveFile(fetch, accessToken, uploaded.id);
        cleanupState = 'provider_file_deleted';
      } catch {
        cleanupState = 'manual_cleanup_required';
        retainedProviderFileId = uploaded.id;
      }
    }
    await markMediaError(owner.admin, owner.user.id, mediaId, {
      ...baseMetadata,
      error_code: code,
      cleanup_state: cleanupState,
    }, retainedProviderFileId);

    const reconnect = ['TOKEN_REVOKED', 'SCOPE_MISSING', 'ACCOUNT_MISMATCH'].includes(code);
    const folderMissing = ['FOLDER_MISSING', 'UPLOAD_FOLDER_MISSING'].includes(code);
    if (reconnect || folderMissing) {
      await markConnection(owner.admin, connection.id, {
        status: reconnect ? 'reconnect_required' : 'error',
        root_folder_health: code === 'FOLDER_MISSING' ? 'missing' : connection.root_folder_health,
        last_error_code: code,
        last_error_message: reconnect ? 'Reconnect Google Drive to restore access.' : 'The managed Google Drive upload folder is unavailable.',
      });
    }
    console.error('[google-drive-upload] failed', { connectionId: connection.id, mediaId, code, cleanupState });
    if (reconnect) return fail('RECONNECT_REQUIRED', 'Reconnect Google Drive to restore access.', 409, cors);
    if (folderMissing) return fail('FOLDER_MISSING', `The managed ${purpose.folderLabel} folder is unavailable.`, 409, cors);
    if (code === 'MEDIA_FINALIZATION_FAILED') return fail(code, 'The file could not be safely registered. Any uploaded provider copy was scheduled for cleanup.', 500, cors);
    return fail('UPLOAD_FAILED', 'The file could not be uploaded to Google Drive.', 502, cors);
  }
});
