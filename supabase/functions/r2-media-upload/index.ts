import { R2_MEDIA_CATEGORIES, R2_PROVIDER, r2Configuration, r2ProfilePermissionAllowed, r2ProjectPermissionAllowed, r2SitePermissionAllowed, uploadR2Object, validR2DerivativeFile } from '../_shared/r2Media.js';
import { authenticatedTeamMember, corsHeaders, edgeEnvironment, fail, reply } from '../_shared/googleDriveEdge.ts';

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

async function tokenHash(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function constantEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

async function authorizeProject(actor: any, projectId: string) {
  const { data: project } = await actor.admin.from('projects').select('id,owner_user_id,created_by').eq('id', projectId).maybeSingle();
  if (!project) return false;
  if (r2ProjectPermissionAllowed({ role: actor.role, userId: actor.user.id, project })) return true;
  const { data: access } = await actor.admin.from('project_access').select('access_level').eq('project_id', projectId).eq('user_id', actor.user.id).is('revoked_at', null).maybeSingle();
  return r2ProjectPermissionAllowed({ role: actor.role, userId: actor.user.id, project, accessLevel: access?.access_level });
}

async function authorizedForRow(actor: any, row: any) {
  const definition = R2_MEDIA_CATEGORIES[row.file_category];
  if (!definition) return false;
  if (definition.target === 'project') return authorizeProject(actor, row.project_id);
  if (definition.target === 'profile') {
    if (!r2ProfilePermissionAllowed({ role: actor.role, creativeMemberId: actor.teamMember.creative_member_id, targetCreativeMemberId: row.creative_member_id })) return false;
    const { data } = await actor.admin.from('creative_members').select('id').eq('id', row.creative_member_id).maybeSingle();
    return Boolean(data);
  }
  return r2SitePermissionAllowed(actor.role);
}

Deno.serve(async (request) => {
  const env = edgeEnvironment();
  const cors = corsHeaders(request, env.siteOrigin);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return fail('METHOD_NOT_ALLOWED', 'Method not allowed.', 405, cors);
  if (!cors['Access-Control-Allow-Origin']) return fail('ORIGIN_NOT_ALLOWED', 'This request origin is not allowed.', 403, cors);

  const cfg = config();
  if (!cfg.configured) return fail('R2_MEDIA_DISABLED', 'Managed website media is not enabled on the server.', 503, cors);
  const actor = await authenticatedTeamMember(request, env);
  if ('error' in actor) return fail(actor.error, actor.status === 401 ? 'Your session has expired. Please sign in again.' : 'Your account cannot manage website media.', actor.status, cors);

  let form: FormData;
  try { form = await request.formData(); } catch { return fail('INVALID_UPLOAD', 'The website image upload is invalid.', 400, cors); }
  const mediaId = String(form.get('mediaId') || '');
  const groupId = String(form.get('groupId') || '');
  const migrationId = String(form.get('migrationId') || '');
  const migrationToken = String(form.get('migrationToken') || '');
  const file = form.get('file');
  if (!(file instanceof File) || !mediaId || !groupId) return fail('INVALID_UPLOAD', 'The website image upload is incomplete.', 400, cors);

  const { data: row, error } = await actor.admin.from('external_media_objects')
    .select('id,owner_user_id,provider,external_file_id,mime_type,size_bytes,status,file_category,project_id,creative_member_id,media_group_id,media_variant,migration_id')
    .eq('id', mediaId).eq('media_group_id', groupId).eq('provider', R2_PROVIDER).maybeSingle();
  if (error || !row || row.status !== 'uploading') return fail('UPLOAD_NOT_AVAILABLE', 'The prepared website image upload was not found.', 404, cors);

  if (migrationId || migrationToken) {
    if (actor.role !== 'super_admin' || !migrationId || !migrationToken || row.migration_id !== migrationId) return fail('MIGRATION_UPLOAD_NOT_AUTHORIZED', 'The migration upload authorization is invalid.', 403, cors);
    const { data: migration } = await actor.admin.from('storage_migrations')
      .select('id,status,migration_phase,destination_media_group_id,task_token_hash,task_expires_at,task_actor_user_id,task_consumed_at')
      .eq('id', migrationId).eq('destination_provider', R2_PROVIDER).maybeSingle();
    const valid = migration?.status === 'in_progress' && migration?.migration_phase === 'uploading'
      && migration?.destination_media_group_id === groupId && migration?.task_actor_user_id === actor.user.id
      && !migration?.task_consumed_at && Date.parse(migration?.task_expires_at || '') > Date.now()
      && constantEqual(String(migration?.task_token_hash || ''), await tokenHash(migrationToken));
    if (!valid) return fail('MIGRATION_TASK_INVALID', 'The migration task is invalid, consumed, or expired.', 403, cors);
  } else {
    if (row.owner_user_id !== actor.user.id) return fail('UPLOAD_NOT_AVAILABLE', 'The prepared website image upload was not found.', 404, cors);
    if (!await authorizedForRow(actor, row)) return fail('TARGET_NOT_AUTHORIZED', 'You no longer have permission to upload this media.', 403, cors);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!validR2DerivativeFile({ variant: row.media_variant, filename: file.name.toLowerCase(), mimeType: file.type, sizeBytes: file.size, expectedBytes: row.size_bytes, signature: bytes.slice(0, 12) })) {
    return fail('DERIVATIVE_INVALID', 'The website image does not match the prepared WebP format or size.', 400, cors);
  }

  try {
    const response = await uploadR2Object(fetch, cfg, row.external_file_id, row.mime_type, bytes);
    if (!response.ok) throw Object.assign(new Error('R2 upload failed'), { status: response.status });
    await actor.admin.from('external_media_objects').update({ uploaded_bytes: file.size, metadata: { upload_transport: migrationId ? 'migration_task_v1' : 'authenticated_edge_proxy_v1', uploaded_at: new Date().toISOString() } }).eq('id', row.id);
    return reply({ success: true, mediaId: row.id, variant: row.media_variant }, 200, cors);
  } catch {
    return fail('R2_UPLOAD_FAILED', 'The website image could not be stored. Existing live media was not changed.', 502, cors);
  }
});
