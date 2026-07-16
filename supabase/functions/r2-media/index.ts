import {
  R2_MEDIA_CATEGORIES,
  R2_PROVIDER,
  createR2ObjectKey,
  deleteR2Object,
  r2Configuration,
  r2ProfilePermissionAllowed,
  r2ProjectPermissionAllowed,
  r2PublicUrl,
  r2SitePermissionAllowed,
  signedR2Request,
  validateR2UploadRequest,
} from '../_shared/r2Media.js';
import { authenticatedTeamMember, corsHeaders, edgeEnvironment, fail, reply } from '../_shared/googleDriveEdge.ts';

const MEDIA_FIELDS = 'id,owner_user_id,provider,external_file_id,filename,mime_type,size_bytes,width,height,status,file_category,project_id,creative_member_id,media_group_id,media_variant,public_url,cleanup_status,cleanup_attempt_count,cleanup_error,metadata,created_at,updated_at';

function config() {
  return r2Configuration({
    R2_MEDIA_ENABLED: Deno.env.get('R2_MEDIA_ENABLED'),
    R2_ACCOUNT_ID: Deno.env.get('R2_ACCOUNT_ID'),
    R2_ACCESS_KEY_ID: Deno.env.get('R2_ACCESS_KEY_ID'),
    R2_SECRET_ACCESS_KEY: Deno.env.get('R2_SECRET_ACCESS_KEY'),
    R2_BUCKET_NAME: Deno.env.get('R2_BUCKET_NAME'),
    R2_PUBLIC_BASE_URL: Deno.env.get('R2_PUBLIC_BASE_URL'),
  });
}

function cleanBody(value: any) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
function only(body: any, fields: string[]) { const allowed = new Set(fields); return Object.keys(body).every((key) => allowed.has(key)); }

async function tokenHash(value: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function authorizeProjectEdit(actor: any, projectId: string) {
  const { data: project } = await actor.admin.from('projects').select('id,status,owner_user_id,created_by,cover_image,gallery_images,gallery_items').eq('id', projectId).maybeSingle();
  if (!project) return null;
  if (r2ProjectPermissionAllowed({ role: actor.role, userId: actor.user.id, project })) return project;
  const { data: access } = await actor.admin.from('project_access').select('access_level').eq('project_id', projectId).eq('user_id', actor.user.id).is('revoked_at', null).maybeSingle();
  return r2ProjectPermissionAllowed({ role: actor.role, userId: actor.user.id, project, accessLevel: access?.access_level }) ? project : null;
}

async function authorizeProfileEdit(actor: any, creativeMemberId: string) {
  if (!r2ProfilePermissionAllowed({ role: actor.role, creativeMemberId: actor.teamMember.creative_member_id, targetCreativeMemberId: creativeMemberId })) return null;
  const { data } = await actor.admin.from('creative_members').select('id,profile_image_url,cover_image').eq('id', creativeMemberId).maybeSingle();
  return data;
}

async function authorizeTarget(actor: any, category: string, projectId = '', creativeMemberId = '') {
  const definition = R2_MEDIA_CATEGORIES[category];
  if (!definition) return null;
  if (definition.target === 'project') return authorizeProjectEdit(actor, projectId);
  if (definition.target === 'profile') return authorizeProfileEdit(actor, creativeMemberId);
  return r2SitePermissionAllowed(actor.role) ? { id: actor.user.id } : null;
}

function safeGroupResponse(rows: any[], category: string) {
  const urls = Object.fromEntries(rows.map((row) => [row.media_variant, row.public_url]));
  const primaryVariant = R2_MEDIA_CATEGORIES[category]?.primaryVariant || 'display';
  return { groupId: rows[0]?.media_group_id, category, status: rows.every((row) => row.status === 'available') ? 'available' : 'uploading', urls, primaryUrl: urls[primaryVariant] || urls.display || urls.expanded || '' };
}

function containsReference(value: any, url: string) {
  if (!url) return false;
  if (typeof value === 'string') return value === url;
  if (Array.isArray(value)) return value.some((item) => containsReference(item, url));
  if (value && typeof value === 'object') return Object.values(value).some((item) => containsReference(item, url));
  return false;
}

async function targetReferences(actor: any, row: any, url: string) {
  if (row.project_id) {
    const { data } = await actor.admin.from('projects').select('cover_image,gallery_images,gallery_items').eq('id', row.project_id).maybeSingle();
    return containsReference(data, url);
  }
  if (row.creative_member_id) {
    const { data } = await actor.admin.from('creative_members').select('profile_image_url,cover_image').eq('id', row.creative_member_id).maybeSingle();
    return containsReference(data, url);
  }
  const results = await Promise.all([
    actor.admin.from('site_settings').select('*'), actor.admin.from('page_content').select('content'),
    actor.admin.from('service_branches').select('icon_url,image_url'), actor.admin.from('media_assets').select('url,storage_path'),
  ]);
  if (results.some((result: any) => result.error)) throw Object.assign(new Error('Reference verification failed'), { code: 'REFERENCE_CHECK_FAILED' });
  return results.some((result: any) => containsReference(result.data, url));
}

async function loadGroup(actor: any, groupId: string) {
  const { data, error } = await actor.admin.from('external_media_objects').select(MEDIA_FIELDS)
    .eq('provider', R2_PROVIDER).eq('media_group_id', groupId).order('media_variant');
  return error || !data?.length ? null : data;
}

async function queueGroupCleanup(actor: any, cfg: any, rows: any[], reason: string) {
  for (const row of rows) {
    const { error } = await actor.admin.from('storage_cleanup_jobs').insert({
      provider: R2_PROVIDER, bucket_name: cfg.bucketName, object_path: row.external_file_id,
      project_id: row.project_id || null, reason, created_by: actor.user.id,
    });
    if (error && error.code !== '23505') throw error;
  }
  await actor.admin.from('external_media_objects').update({ status: 'deleting', cleanup_status: 'pending', cleanup_error: null }).eq('media_group_id', rows[0].media_group_id).eq('provider', R2_PROVIDER);
}

Deno.serve(async (request) => {
  const env = edgeEnvironment();
  const cors = corsHeaders(request, env.siteOrigin);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return fail('METHOD_NOT_ALLOWED', 'Method not allowed.', 405, cors);
  if (!cors['Access-Control-Allow-Origin']) return fail('ORIGIN_NOT_ALLOWED', 'This request origin is not allowed.', 403, cors);
  const cfg = config();
  const body = cleanBody(await request.json().catch(() => ({})));
  const actor = await authenticatedTeamMember(request, env);
  if ('error' in actor) return fail(actor.error, actor.status === 401 ? 'Your session has expired. Please sign in again.' : 'Your account cannot manage website media.', actor.status, cors);

  if (body.action === 'capability') return reply({ success: true, enabled: cfg.configured, provider: cfg.configured ? 'managed_media' : 'supabase_fallback' }, 200, cors);

  if (body.action === 'prepare_project_delete') {
    if (!only(body, ['action','projectId'])) return fail('INVALID_REQUEST', 'The project cleanup request is invalid.', 400, cors);
    const projectId = String(body.projectId || '');
    const project = await authorizeProjectEdit(actor, projectId);
    if (!project || !r2ProjectPermissionAllowed({ role: actor.role, userId: actor.user.id, project }, 'delete')) return fail('TARGET_NOT_AUTHORIZED', 'You do not have permission to delete this project.', 403, cors);
    const { data: rows, error } = await actor.admin.from('external_media_objects').select(MEDIA_FIELDS)
      .eq('provider', R2_PROVIDER).eq('project_id', projectId).neq('status', 'deleted');
    if (error) return fail('MEDIA_LOOKUP_FAILED', 'Project media cleanup could not be prepared.', 500, cors);
    if (!rows?.length) return reply({ success: true, count: 0, authorization: null }, 200, cors);
    if (!cfg.configured) return fail('R2_MEDIA_DISABLED', 'Managed media cleanup is not configured, so this project cannot be safely deleted yet.', 503, cors);
    const authorization = `${crypto.randomUUID()}${crypto.randomUUID()}`;
    const hash = await tokenHash(authorization);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    for (const row of rows) {
      const metadata = { ...(row.metadata || {}), project_delete_id: projectId, project_delete_actor: actor.user.id, project_delete_hash: hash, project_delete_expires_at: expiresAt };
      const { error: updateError } = await actor.admin.from('external_media_objects').update({ metadata }).eq('id', row.id);
      if (updateError) return fail('MEDIA_PREPARATION_FAILED', 'Project media cleanup could not be safely prepared.', 500, cors);
    }
    return reply({ success: true, count: rows.length, authorization }, 200, cors);
  }

  if (!cfg.configured) return fail('R2_MEDIA_DISABLED', 'Managed website media is not enabled on the server.', 503, cors);

  if (body.action === 'finalize_project_delete') {
    if (!only(body, ['action','projectId','authorization'])) return fail('INVALID_REQUEST', 'The project cleanup confirmation is invalid.', 400, cors);
    const projectId = String(body.projectId || '');
    const authorization = String(body.authorization || '');
    const { data: project } = await actor.admin.from('projects').select('id').eq('id', projectId).maybeSingle();
    if (project) return fail('PROJECT_STILL_EXISTS', 'Project media cannot be removed while the project still exists.', 409, cors);
    const { data: rows, error } = await actor.admin.from('external_media_objects').select(MEDIA_FIELDS)
      .eq('provider', R2_PROVIDER).contains('metadata', { project_delete_id: projectId });
    if (error || !rows?.length) return reply({ success: true, queued: 0 }, 200, cors);
    const hash = await tokenHash(authorization);
    const valid = rows.every((row: any) => row.metadata?.project_delete_actor === actor.user.id
      && row.metadata?.project_delete_hash === hash && Date.parse(row.metadata?.project_delete_expires_at || '') > Date.now());
    if (!valid) return fail('DELETE_AUTHORIZATION_INVALID', 'The project cleanup authorization is invalid or expired.', 403, cors);
    const groups = new Map<string, any[]>();
    for (const row of rows) groups.set(row.media_group_id, [...(groups.get(row.media_group_id) || []), row]);
    for (const groupRows of groups.values()) await queueGroupCleanup(actor, cfg, groupRows, 'r2_project_deleted');
    return reply({ success: true, queued: rows.length }, 200, cors);
  }

  if (body.action === 'initiate') {
    if (!only(body, ['action','category','projectId','creativeMemberId','variants'])) return fail('INVALID_REQUEST', 'The media upload request contains unsupported fields.', 400, cors);
    const validation: any = validateR2UploadRequest(body);
    if (!validation.ok) return fail(validation.code, validation.message, 400, cors);
    if (!await authorizeTarget(actor, validation.categoryKey, validation.projectId, validation.creativeMemberId)) return fail('TARGET_NOT_AUTHORIZED', 'You do not have permission to upload media here.', 403, cors);
    const groupId = crypto.randomUUID();
    const targetId = validation.projectId || validation.creativeMemberId || actor.user.id;
    const rows = validation.variants.map((variant: any) => {
      const objectKey = createR2ObjectKey(validation.categoryKey, targetId, groupId, variant.variant);
      return {
        id: crypto.randomUUID(), owner_user_id: actor.user.id, provider: R2_PROVIDER, external_file_id: objectKey,
        filename: `${groupId}-${variant.variant}.webp`, mime_type: variant.mimeType, size_bytes: variant.sizeBytes,
        width: variant.width, height: variant.height, visibility: 'public', status: 'uploading',
        file_category: validation.categoryKey, project_id: validation.projectId || null,
        creative_member_id: validation.creativeMemberId || null, media_group_id: groupId,
        media_variant: variant.variant, public_url: r2PublicUrl(cfg, objectKey), upload_expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        metadata: { upload_transport: 'authenticated_edge_proxy_v1' },
      };
    });
    const { error } = await actor.admin.from('external_media_objects').insert(rows);
    if (error) return fail('MEDIA_REGISTRATION_FAILED', 'The website media upload could not be registered.', 500, cors);
    return reply({ success: true, upload: { groupId, uploads: rows.map((row: any) => ({ mediaId: row.id, variant: row.media_variant })) } }, 201, cors);
  }

  if (body.action === 'finalize') {
    if (!only(body, ['action','groupId'])) return fail('INVALID_REQUEST', 'The media finalization request is invalid.', 400, cors);
    const rows = await loadGroup(actor, String(body.groupId || ''));
    if (!rows || rows.some((row: any) => row.owner_user_id !== actor.user.id || row.status !== 'uploading')) return fail('UPLOAD_NOT_AVAILABLE', 'The media upload is not waiting for verification.', 409, cors);
    const category = rows[0].file_category;
    if (!await authorizeTarget(actor, category, rows[0].project_id, rows[0].creative_member_id)) return fail('TARGET_NOT_AUTHORIZED', 'You no longer have permission to finalize this media.', 403, cors);
    try {
      for (const row of rows) {
        const response = await signedR2Request(fetch, cfg, 'HEAD', row.external_file_id);
        const valid = response.ok && Number(response.headers.get('content-length') || 0) === Number(row.size_bytes)
          && String(response.headers.get('content-type') || '').split(';')[0].toLowerCase() === row.mime_type;
        if (!valid) throw Object.assign(new Error('R2 verification failed'), { code: 'R2_OBJECT_VERIFICATION_FAILED' });
      }
      for (const row of rows) {
        const { error } = await actor.admin.from('external_media_objects').update({ status: 'available', uploaded_bytes: row.size_bytes, upload_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), cleanup_status: 'none', cleanup_error: null }).eq('id', row.id);
        if (error) throw Object.assign(new Error('Media finalization failed'), { code: 'MEDIA_FINALIZATION_FAILED' });
      }
      const data = await loadGroup(actor, rows[0].media_group_id);
      if (!data?.length) throw Object.assign(new Error('Media finalization failed'), { code: 'MEDIA_FINALIZATION_FAILED' });
      return reply({ success: true, media: safeGroupResponse(data, category) }, 200, cors);
    } catch (error) {
      await actor.admin.from('external_media_objects').update({ status: 'error', cleanup_status: 'retry_required', cleanup_error: error?.code || 'R2_OBJECT_VERIFICATION_FAILED' }).eq('media_group_id', rows[0].media_group_id);
      return fail(error?.code || 'R2_OBJECT_VERIFICATION_FAILED', 'The uploaded website images could not be verified. Existing live media was not changed.', 502, cors);
    }
  }

  if (body.action === 'cancel') {
    if (!only(body, ['action','groupId'])) return fail('INVALID_REQUEST', 'The media cancellation request is invalid.', 400, cors);
    const rows = await loadGroup(actor, String(body.groupId || ''));
    if (!rows || rows.some((row: any) => row.owner_user_id !== actor.user.id)) return fail('UPLOAD_NOT_AVAILABLE', 'The media upload was not found.', 404, cors);
    let failed = false;
    for (const row of rows) { try { await deleteR2Object(fetch, cfg, row.external_file_id); } catch { failed = true; } }
    await actor.admin.from('external_media_objects').update({ status: failed ? 'error' : 'cancelled', cleanup_status: failed ? 'retry_required' : 'complete', cleanup_error: failed ? 'R2_CANCEL_CLEANUP_FAILED' : null }).eq('media_group_id', rows[0].media_group_id);
    return reply({ success: !failed, cancelled: !failed, cleanupRequired: failed }, failed ? 207 : 200, cors);
  }

  if (body.action === 'commit_replacement') {
    if (!only(body, ['action','groupId','oldUrl'])) return fail('INVALID_REQUEST', 'The replacement request is invalid.', 400, cors);
    const rows = await loadGroup(actor, String(body.groupId || ''));
    const oldUrl = String(body.oldUrl || '');
    if (!rows || rows.some((row: any) => row.owner_user_id !== actor.user.id || row.status !== 'available') || (oldUrl && !oldUrl.startsWith(`${cfg.publicBaseUrl}/`))) return fail('REPLACEMENT_NOT_AVAILABLE', 'The replacement cleanup request is unavailable.', 409, cors);
    if (!await authorizeTarget(actor, rows[0].file_category, rows[0].project_id, rows[0].creative_member_id)) return fail('TARGET_NOT_AUTHORIZED', 'You do not have permission to finish this replacement.', 403, cors);
    const next = safeGroupResponse(rows, rows[0].file_category);
    if (!await targetReferences(actor, rows[0], next.primaryUrl) || (oldUrl && await targetReferences(actor, rows[0], oldUrl))) return fail('REFERENCE_NOT_SWITCHED', 'The live reference has not safely switched to the replacement yet.', 409, cors);
    await actor.admin.from('external_media_objects').update({ upload_expires_at: null }).eq('provider', R2_PROVIDER).eq('media_group_id', rows[0].media_group_id);
    if (!oldUrl) return reply({ success: true, queued: 0, activated: true }, 200, cors);
    const { data: oldRow } = await actor.admin.from('external_media_objects').select(MEDIA_FIELDS).eq('provider', R2_PROVIDER).eq('public_url', oldUrl).eq('status', 'available').maybeSingle();
    if (!oldRow) return reply({ success: true, queued: 0 }, 200, cors);
    const oldRows = await loadGroup(actor, oldRow.media_group_id);
    if (!oldRows) return reply({ success: true, queued: 0 }, 200, cors);
    for (const previous of oldRows) {
      const replacement = rows.find((row: any) => row.media_variant === previous.media_variant);
      if (!replacement) continue;
      await actor.admin.from('external_media_objects').update({ replaced_by_media_object_id: replacement.id }).eq('id', previous.id);
      await actor.admin.from('external_media_objects').update({ replaces_media_object_id: previous.id }).eq('id', replacement.id);
    }
    await queueGroupCleanup(actor, cfg, oldRows, 'r2_media_replaced');
    return reply({ success: true, queued: oldRows.length }, 200, cors);
  }

  if (body.action === 'request_delete') {
    if (!only(body, ['action','publicUrl'])) return fail('INVALID_REQUEST', 'The media deletion request is invalid.', 400, cors);
    const publicUrl = String(body.publicUrl || '');
    if (!publicUrl.startsWith(`${cfg.publicBaseUrl}/`)) return fail('MEDIA_NOT_FOUND', 'The managed media item was not found.', 404, cors);
    const { data: row } = await actor.admin.from('external_media_objects').select(MEDIA_FIELDS).eq('provider', R2_PROVIDER).eq('public_url', publicUrl).maybeSingle();
    if (!row) return reply({ success: true, queued: 0, alreadyMissing: true }, 200, cors);
    if (!await authorizeTarget(actor, row.file_category, row.project_id, row.creative_member_id)) return fail('TARGET_NOT_AUTHORIZED', 'You do not have permission to remove this media.', 403, cors);
    if (await targetReferences(actor, row, publicUrl)) return fail('MEDIA_STILL_REFERENCED', 'This image is still in use and cannot be removed.', 409, cors);
    const rows = await loadGroup(actor, row.media_group_id);
    if (rows) await queueGroupCleanup(actor, cfg, rows, 'r2_media_removed');
    return reply({ success: true, queued: rows?.length || 0 }, 200, cors);
  }

  return fail('ACTION_NOT_ALLOWED', 'The requested media action is unavailable.', 400, cors);
});
