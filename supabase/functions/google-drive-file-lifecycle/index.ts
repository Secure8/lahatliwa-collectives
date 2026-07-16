import {
  deleteDriveFile,
  fetchGoogleIdentity,
  getDriveFile,
  moveDriveFile,
  refreshGoogleAccessToken,
  tokenGrantedScopes,
} from '../_shared/googleDriveApi.js';
import { readConnectionSecret } from '../_shared/googleDriveDatabase.ts';
import {
  authorizeCreativeProfile,
  authorizeProject,
  authenticatedStorageOwner,
  corsHeaders,
  edgeEnvironment,
  fail,
  reply,
} from '../_shared/googleDriveEdge.ts';
import { safeExternalFileResponse } from '../_shared/externalStorageLifecycle.js';
import { hasRequiredGoogleScopes } from '../_shared/googleDriveOAuth.js';

const BUCKET = 'project-media';
const MEDIA_FIELDS = 'id,owner_user_id,storage_connection_id,provider,external_file_id,external_parent_id,filename,mime_type,size_bytes,status,file_category,project_id,creative_member_id,profile_media_kind,preview_required,preview_provider,preview_bucket,preview_path,replaces_media_object_id,replaced_by_media_object_id,original_parent_role,archived_at,archive_reason,cleanup_status,cleanup_attempt_count,cleanup_error,uploaded_bytes,upload_expires_at,metadata,created_at,updated_at';
const CONNECTION_FIELDS = 'id,owner_user_id,provider_account_id,root_folder_id,folder_ids,status,granted_scopes';

function cleanBody(value: any) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
function bodyHasOnly(body: any, fields: string[]) { const allowed = new Set(fields); return Object.keys(body).every((key) => allowed.has(key)); }
function safePreviewPath(value = '') {
  const raw = String(value || '').trim().replace(/^\/+/, '').split(/[?#]/)[0];
  let path = ''; try { path = decodeURIComponent(raw); } catch { return ''; }
  if (path.length > 512 || path.includes('..') || path.includes('\\') || !/\.(?:jpe?g|png|webp)$/i.test(path)) return '';
  return path.startsWith('projects/gallery/') || path.startsWith('creative-profiles/') ? path : '';
}

async function authorizeTarget(actor: any, media: any, mode: 'view' | 'edit' | 'manage') {
  if (media.project_id) return authorizeProject(actor, media.project_id, mode);
  if (media.creative_member_id) return authorizeCreativeProfile(actor, media.creative_member_id);
  return null;
}

async function loadMedia(actor: any, mediaObjectId: string) {
  const { data, error } = await actor.admin.from('external_media_objects').select(MEDIA_FIELDS)
    .eq('id', mediaObjectId).eq('provider', 'google_drive').maybeSingle();
  return error ? null : data;
}

async function loadConnection(actor: any, media: any) {
  const { data } = await actor.admin.from('storage_connections').select(CONNECTION_FIELDS)
    .eq('id', media.storage_connection_id).eq('owner_user_id', media.owner_user_id).maybeSingle();
  return data;
}

async function accessToken(env: any, connection: any) {
  const refreshToken = await readConnectionSecret(connection.owner_user_id, connection.id);
  if (!refreshToken) throw Object.assign(new Error('Credential missing'), { code: 'TOKEN_REVOKED' });
  const tokens = await refreshGoogleAccessToken(fetch, env.google, refreshToken);
  const scopes = tokenGrantedScopes(tokens, connection.granted_scopes || []);
  if (!hasRequiredGoogleScopes(scopes)) throw Object.assign(new Error('Scope missing'), { code: 'SCOPE_MISSING' });
  const identity = await fetchGoogleIdentity(fetch, tokens.access_token);
  if (identity.sub !== connection.provider_account_id) throw Object.assign(new Error('Account mismatch'), { code: 'ACCOUNT_MISMATCH' });
  return tokens.access_token;
}

async function verifyPreview(admin: any, path: string, mimeType: string) {
  const parts = path.split('/'); const name = parts.pop() || ''; const folder = parts.join('/');
  const { data, error } = await admin.storage.from(BUCKET).list(folder, { limit: 100, search: name });
  if (error) throw Object.assign(new Error('Preview lookup failed'), { code: 'PREVIEW_LOOKUP_FAILED' });
  const object = (data || []).find((candidate: any) => candidate.name === name && (candidate.id || candidate.metadata));
  const size = Number(object?.metadata?.size || 0);
  const storedType = object?.metadata?.mimetype || object?.metadata?.contentType || '';
  if (!object || size <= 0 || size > 1024 * 1024 || (storedType && storedType !== mimeType)) throw Object.assign(new Error('Preview invalid'), { code: 'PREVIEW_INVALID' });
}

async function listFiles(request: Request, env: any, cors: any, body: any) {
  if (!bodyHasOnly(body, ['action','projectId','creativeMemberId'])) return fail('INVALID_REQUEST', 'The file list request is invalid.', 400, cors);
  const actor = await authenticatedStorageOwner(request, env);
  if ('error' in actor) return fail(actor.error, 'Your account is not eligible to view private files.', actor.status, cors);
  const target = body.projectId ? { project_id: String(body.projectId) } : body.creativeMemberId ? { creative_member_id: String(body.creativeMemberId) } : null;
  if (!target || !await authorizeTarget(actor, target, 'view')) return fail('TARGET_NOT_AUTHORIZED', 'You do not have permission to view these private files.', 403, cors);
  let expired = actor.admin.from('external_media_objects').update({ status: 'abandoned', cleanup_status: 'retry_required', cleanup_error: 'RESUMABLE_SESSION_EXPIRED' })
    .eq('provider', 'google_drive').in('status', ['initiating','uploading']).lt('upload_expires_at', new Date().toISOString());
  expired = body.projectId ? expired.eq('project_id', body.projectId) : expired.eq('creative_member_id', body.creativeMemberId);
  await expired;
  let query = actor.admin.from('external_media_objects').select(MEDIA_FIELDS).eq('provider', 'google_drive')
    .not('status', 'in', '(deleted,cancelled)').order('created_at', { ascending: false });
  query = body.projectId ? query.eq('project_id', body.projectId) : query.eq('creative_member_id', body.creativeMemberId);
  const { data, error } = await query;
  if (error) return fail('MEDIA_LOOKUP_FAILED', 'Private file metadata could not be loaded.', 500, cors);
  return reply({ success: true, files: (data || []).map(safeExternalFileResponse) }, 200, cors);
}

async function attachPreview(request: Request, env: any, cors: any, body: any) {
  if (!bodyHasOnly(body, ['action','mediaObjectId','previewPath'])) return fail('INVALID_REQUEST', 'The preview request is invalid.', 400, cors);
  const actor = await authenticatedStorageOwner(request, env);
  if ('error' in actor) return fail(actor.error, 'Your account is not eligible to attach previews.', actor.status, cors);
  const media = await loadMedia(actor, String(body.mediaObjectId || ''));
  const previewPath = safePreviewPath(body.previewPath);
  if (!media || !previewPath || !media.preview_required || !['processing','available'].includes(media.status)) return fail('MEDIA_NOT_AVAILABLE', 'The private original is not waiting for this preview.', 409, cors);
  if (!await authorizeTarget(actor, media, 'edit')) return fail('TARGET_NOT_AUTHORIZED', 'You do not have permission to update this preview.', 403, cors);
  if (media.preview_path) {
    if (media.preview_path !== previewPath) return fail('PREVIEW_ALREADY_ATTACHED', 'This original already has a different preview.', 409, cors);
    return reply({ success: true, media: safeExternalFileResponse(media) }, 200, cors);
  }
  try {
    await verifyPreview(actor.admin, previewPath, media.mime_type);
    const old = media.replaces_media_object_id ? await loadMedia(actor, media.replaces_media_object_id) : null;
    if (media.replaces_media_object_id && (!old || old.storage_connection_id !== media.storage_connection_id || old.status !== 'available')) {
      throw Object.assign(new Error('Replacement unavailable'), { code: 'REPLACEMENT_NOT_AVAILABLE' });
    }
    const { data, error } = await actor.admin.from('external_media_objects').update({
      preview_provider: 'supabase', preview_bucket: BUCKET, preview_path: previewPath,
      status: 'available', cleanup_status: 'none', cleanup_error: null,
    }).eq('id', media.id).select(MEDIA_FIELDS).single();
    if (error) throw Object.assign(new Error('Preview finalization failed'), { code: 'PREVIEW_FINALIZATION_FAILED' });

    if (old?.preview_path && media.project_id) {
      const { data: project, error: projectError } = await actor.admin.from('projects').select('id,gallery_images,gallery_items').eq('id', media.project_id).maybeSingle();
      if (projectError || !project) throw Object.assign(new Error('Project replacement lookup failed'), { code: 'PROJECT_REPLACEMENT_FAILED' });
      const nextImages = (Array.isArray(project.gallery_images) ? project.gallery_images : []).map((path: string) => path === old.preview_path ? previewPath : path);
      let replaced = false;
      const nextItems = (Array.isArray(project.gallery_items) ? project.gallery_items : []).map((item: any) => {
        if (item?.url !== old.preview_path) return item;
        replaced = true;
        return {
          ...item,
          url: previewPath,
          media: {
            provider: 'google_drive', mediaObjectId: data.id, filename: data.filename, mimeType: data.mime_type, status: 'available',
            preview: { provider: 'supabase', bucket: BUCKET, storagePath: previewPath },
          },
        };
      });
      if (!replaced) throw Object.assign(new Error('Old public reference not found'), { code: 'PROJECT_REPLACEMENT_REFERENCE_MISSING' });
      const { error: switchError } = await actor.admin.from('projects').update({ gallery_images: nextImages, gallery_items: nextItems, updated_at: new Date().toISOString() }).eq('id', media.project_id);
      if (switchError) throw Object.assign(new Error('Project replacement switch failed'), { code: 'PROJECT_REPLACEMENT_FAILED' });
    }

    if (media.replaces_media_object_id) {
      const connection = await loadConnection(actor, media);
      const archiveId = connection?.folder_ids?.archive;
      try {
        if (!connection || !archiveId) throw new Error('Archive unavailable');
        const token = await accessToken(env, connection);
        await moveDriveFile(fetch, token, old.external_file_id, old.external_parent_id, archiveId);
        const { error: oldError } = await actor.admin.from('external_media_objects').update({
          status: 'archived', external_parent_id: archiveId, archived_at: new Date().toISOString(), archive_reason: 'replaced', replaced_by_media_object_id: media.id, cleanup_status: 'none', cleanup_error: null,
        }).eq('id', old.id);
        if (oldError) throw oldError;
      } catch {
        await actor.admin.from('external_media_objects').update({ cleanup_status: 'retry_required', cleanup_error: 'REPLACEMENT_ARCHIVE_FAILED' }).eq('id', old.id);
      }
    }
    return reply({ success: true, media: safeExternalFileResponse(data) }, 200, cors);
  } catch (error) {
    await actor.admin.storage.from(BUCKET).remove([previewPath]).catch(() => null);
    await actor.admin.from('external_media_objects').update({ status: 'error', cleanup_status: 'retry_required', cleanup_error: error?.code || 'PREVIEW_FINALIZATION_FAILED' }).eq('id', media.id);
    return fail(error?.code || 'PREVIEW_FINALIZATION_FAILED', 'The new preview could not be activated. The previous public file remains available.', 502, cors);
  }
}

async function moveArchive(request: Request, env: any, cors: any, body: any, restore = false) {
  if (!bodyHasOnly(body, ['action','mediaObjectId','reason'])) return fail('INVALID_REQUEST', 'The archive request is invalid.', 400, cors);
  const actor = await authenticatedStorageOwner(request, env);
  if ('error' in actor) return fail(actor.error, 'Your account is not eligible to manage private files.', actor.status, cors);
  const media = await loadMedia(actor, String(body.mediaObjectId || ''));
  const retryingArchive = media?.cleanup_status === 'retry_required' && /ARCHIVE_FAILED$/.test(media?.cleanup_error || '');
  if (!media || (!retryingArchive && (restore ? media.status !== 'archived' : media.status !== 'available'))) return fail('MEDIA_NOT_AVAILABLE', `The file cannot be ${restore ? 'restored' : 'archived'}.`, 409, cors);
  if (!await authorizeTarget(actor, media, 'edit')) return fail('TARGET_NOT_AUTHORIZED', 'You do not have permission to manage this file.', 403, cors);
  const connection = await loadConnection(actor, media);
  const destination = restore ? connection?.folder_ids?.[media.original_parent_role] : connection?.folder_ids?.archive;
  if (!connection || !destination) return fail('FOLDER_MISSING', 'The managed Google Drive folder is unavailable.', 409, cors);
  try {
    await actor.admin.from('external_media_objects').update({ status: restore ? 'restoring' : 'archiving' }).eq('id', media.id);
    const token = await accessToken(env, connection);
    const providerFile = await getDriveFile(fetch, token, media.external_file_id);
    if (!Array.isArray(providerFile.parents) || !providerFile.parents.includes(destination)) {
      await moveDriveFile(fetch, token, media.external_file_id, providerFile.parents?.[0] || media.external_parent_id, destination);
    }
    const { data, error } = await actor.admin.from('external_media_objects').update({
      status: 'available', external_parent_id: destination,
      ...(restore ? { archived_at: null, archive_reason: null } : { status: 'archived', archived_at: new Date().toISOString(), archive_reason: String(body.reason || 'manual').slice(0, 120) }),
      cleanup_status: 'none', cleanup_error: null,
    }).eq('id', media.id).select(MEDIA_FIELDS).single();
    if (error) throw Object.assign(new Error('Archive finalization failed'), { code: 'ARCHIVE_FINALIZATION_FAILED' });
    return reply({ success: true, media: safeExternalFileResponse(data) }, 200, cors);
  } catch (error) {
    await actor.admin.from('external_media_objects').update({ status: restore ? 'archived' : 'available', cleanup_status: 'retry_required', cleanup_error: error?.code || 'ARCHIVE_MOVE_FAILED', cleanup_attempt_count: Number(media.cleanup_attempt_count || 0) + 1 }).eq('id', media.id);
    return fail('ARCHIVE_MOVE_FAILED', `The file could not be ${restore ? 'restored' : 'moved to Archive'}. It remains recorded for retry.`, 502, cors);
  }
}

async function detachPublicReference(actor: any, env: any, media: any) {
  if (!media.preview_path) return;
  if (media.project_id) {
    const { data: project, error: projectError } = await actor.admin.from('projects').select('gallery_images,gallery_items').eq('id', media.project_id).maybeSingle();
    if (projectError || !project) throw Object.assign(new Error('Project lookup failed'), { code: 'PROJECT_UPDATE_FAILED' });
    const { error } = await actor.admin.from('projects').update({
      gallery_images: (Array.isArray(project.gallery_images) ? project.gallery_images : []).filter((path: string) => path !== media.preview_path),
      gallery_items: (Array.isArray(project.gallery_items) ? project.gallery_items : []).filter((item: any) => item?.url !== media.preview_path),
      updated_at: new Date().toISOString(),
    }).eq('id', media.project_id);
    if (error) throw Object.assign(new Error('Project update failed'), { code: 'PROJECT_UPDATE_FAILED' });
  }
  if (media.creative_member_id && media.profile_media_kind) {
    const field = media.profile_media_kind === 'cover' ? 'cover_image' : 'profile_image_url';
    const publicUrl = `${env.supabaseUrl}/storage/v1/object/public/${BUCKET}/${media.preview_path}`;
    const { data: profile } = await actor.admin.from('creative_members').select(`id,${field}`).eq('id', media.creative_member_id).maybeSingle();
    if (profile?.[field] === publicUrl || profile?.[field] === media.preview_path) {
      const { error } = await actor.admin.from('creative_members').update({ [field]: null }).eq('id', media.creative_member_id);
      if (error) throw Object.assign(new Error('Profile update failed'), { code: 'PROFILE_UPDATE_FAILED' });
    }
  }
}

async function removePreview(request: Request, env: any, cors: any, body: any) {
  if (!bodyHasOnly(body, ['action','mediaObjectId'])) return fail('INVALID_REQUEST', 'The preview removal request is invalid.', 400, cors);
  const actor = await authenticatedStorageOwner(request, env);
  if ('error' in actor) return fail(actor.error, 'Your account is not eligible to manage previews.', actor.status, cors);
  const media = await loadMedia(actor, String(body.mediaObjectId || ''));
  if (!media || !media.preview_path || !await authorizeTarget(actor, media, 'edit')) return fail('MEDIA_NOT_AVAILABLE', 'The preview is unavailable.', 409, cors);
  try { await detachPublicReference(actor, env, media); }
  catch { return fail('REFERENCE_UPDATE_FAILED', 'The public reference could not be updated before preview removal.', 500, cors); }
  const { error } = await actor.admin.storage.from(BUCKET).remove([media.preview_path]);
  if (error) {
    await actor.admin.from('external_media_objects').update({ cleanup_status: 'retry_required', cleanup_error: 'PREVIEW_CLEANUP_FAILED' }).eq('id', media.id);
    return fail('PREVIEW_CLEANUP_FAILED', 'The public preview could not be removed. The private original was not changed.', 502, cors);
  }
  const { data } = await actor.admin.from('external_media_objects').update({ preview_provider: null, preview_bucket: null, preview_path: null, preview_required: false, cleanup_status: 'none', cleanup_error: null }).eq('id', media.id).select(MEDIA_FIELDS).single();
  return reply({ success: true, media: safeExternalFileResponse(data) }, 200, cors);
}

async function permanentlyDelete(request: Request, env: any, cors: any, body: any, retry = false) {
  const fields = retry ? ['action','mediaObjectId'] : ['action','mediaObjectId','confirmation'];
  if (!bodyHasOnly(body, fields) || (!retry && body.confirmation !== 'PERMANENTLY_DELETE_PRIVATE_FILE')) return fail('CONFIRMATION_REQUIRED', 'Permanent deletion requires explicit confirmation.', 400, cors);
  const actor = await authenticatedStorageOwner(request, env);
  if ('error' in actor) return fail(actor.error, 'Your account is not eligible to delete private files.', actor.status, cors);
  const media = await loadMedia(actor, String(body.mediaObjectId || ''));
  if (!media || !await authorizeTarget(actor, media, 'manage')) return fail('TARGET_NOT_AUTHORIZED', 'You do not have permission to permanently delete this file.', 403, cors);
  try {
    await actor.admin.from('external_media_objects').update({ status: 'deleting', cleanup_status: 'pending', cleanup_attempt_count: Number(media.cleanup_attempt_count || 0) + 1 }).eq('id', media.id);
    await detachPublicReference(actor, env, media);
    if (media.external_file_id) {
      const connection = await loadConnection(actor, media);
      if (!connection) throw Object.assign(new Error('Connection unavailable'), { code: 'CONNECTION_NOT_FOUND' });
      const token = await accessToken(env, connection);
      await deleteDriveFile(fetch, token, media.external_file_id);
    }
    if (media.preview_path) {
      const { error } = await actor.admin.storage.from(BUCKET).remove([media.preview_path]);
      if (error) throw Object.assign(new Error('Preview cleanup failed'), { code: 'PREVIEW_CLEANUP_FAILED' });
    }
    await actor.admin.from('external_media_objects').update({
      status: 'deleted', external_file_id: null, external_parent_id: null, preview_provider: null, preview_bucket: null, preview_path: null,
      cleanup_status: 'complete', cleanup_error: null,
    }).eq('id', media.id);
    return reply({ success: true, deleted: true, mediaObjectId: media.id }, 200, cors);
  } catch (error) {
    await actor.admin.from('external_media_objects').update({ status: 'error', cleanup_status: 'retry_required', cleanup_error: error?.code || 'DELETE_FAILED' }).eq('id', media.id);
    return fail('DELETE_FAILED', 'Permanent deletion did not finish. The item remains visible for a safe retry.', 502, cors);
  }
}

async function archiveProject(request: Request, env: any, cors: any, body: any) {
  if (!bodyHasOnly(body, ['action','projectId'])) return fail('INVALID_REQUEST', 'The project archive request is invalid.', 400, cors);
  const actor = await authenticatedStorageOwner(request, env);
  if ('error' in actor) return fail(actor.error, 'Your account is not eligible to archive private files.', actor.status, cors);
  if (!await authorizeProject(actor, String(body.projectId || ''), 'manage')) return fail('TARGET_NOT_AUTHORIZED', 'You do not have permission to archive this project.', 403, cors);
  const { data: rows, error } = await actor.admin.from('external_media_objects').select(MEDIA_FIELDS).eq('project_id', body.projectId).eq('provider', 'google_drive').eq('status', 'available');
  if (error) return fail('MEDIA_LOOKUP_FAILED', 'Project files could not be prepared for archive.', 500, cors);
  let archived = 0; let failed = 0;
  for (const media of rows || []) {
    try {
      const connection = await loadConnection(actor, media); const archiveId = connection?.folder_ids?.archive;
      if (!connection || !archiveId) throw new Error('Archive unavailable');
      const token = await accessToken(env, connection);
      await moveDriveFile(fetch, token, media.external_file_id, media.external_parent_id, archiveId);
      await actor.admin.from('external_media_objects').update({ status: 'archived', external_parent_id: archiveId, archived_at: new Date().toISOString(), archive_reason: 'project_archived' }).eq('id', media.id);
      archived += 1;
    } catch (archiveError) {
      failed += 1;
      await actor.admin.from('external_media_objects').update({ cleanup_status: 'retry_required', cleanup_error: 'PROJECT_ARCHIVE_FAILED' }).eq('id', media.id);
    }
  }
  return reply({ success: failed === 0, archived, failed, message: failed ? 'Some private files still need archive retry.' : 'Private project files moved to Archive. Public previews were preserved.' }, failed ? 207 : 200, cors);
}

async function retryCleanup(request: Request, env: any, cors: any, body: any) {
  if (!bodyHasOnly(body, ['action','mediaObjectId'])) return fail('INVALID_REQUEST', 'The cleanup retry request is invalid.', 400, cors);
  const actor = await authenticatedStorageOwner(request, env);
  if ('error' in actor) return fail(actor.error, 'Your account is not eligible to retry cleanup.', actor.status, cors);
  const media = await loadMedia(actor, String(body.mediaObjectId || ''));
  if (!media || !['retry_required','manual_required'].includes(media.cleanup_status)) return fail('CLEANUP_NOT_REQUIRED', 'This file does not require cleanup.', 409, cors);
  if (/ARCHIVE_FAILED$/.test(media.cleanup_error || '')) {
    return moveArchive(request, env, cors, { action: 'archive', mediaObjectId: media.id, reason: 'cleanup_retry' }, false);
  }
  return permanentlyDelete(request, env, cors, { action: 'retry_cleanup', mediaObjectId: media.id }, true);
}

Deno.serve(async (request) => {
  const env = edgeEnvironment(); const cors = corsHeaders(request, env.siteOrigin);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return fail('METHOD_NOT_ALLOWED', 'Method not allowed.', 405, cors);
  if (!cors['Access-Control-Allow-Origin']) return fail('ORIGIN_NOT_ALLOWED', 'This request origin is not allowed.', 403, cors);
  if (!env.google.configured || !env.googleDriveUploadEnabled) return fail('GOOGLE_DRIVE_UPLOAD_DISABLED', 'Google Drive file management is unavailable.', 503, cors);
  const body = cleanBody(await request.json().catch(() => ({})));
  if (body.action === 'list') return listFiles(request, env, cors, body);
  if (body.action === 'attach_preview') return attachPreview(request, env, cors, body);
  if (body.action === 'archive') return moveArchive(request, env, cors, body, false);
  if (body.action === 'restore') return moveArchive(request, env, cors, body, true);
  if (body.action === 'remove_preview') return removePreview(request, env, cors, body);
  if (body.action === 'permanent_delete') return permanentlyDelete(request, env, cors, body, false);
  if (body.action === 'retry_cleanup') return retryCleanup(request, env, cors, body);
  if (body.action === 'archive_project') return archiveProject(request, env, cors, body);
  return fail('ACTION_NOT_ALLOWED', 'The requested file action is unavailable.', 400, cors);
});
