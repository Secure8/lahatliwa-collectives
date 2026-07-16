import { authenticatedTeamMember, corsHeaders, edgeEnvironment, fail, reply } from '../_shared/googleDriveEdge.ts';
import {
  R2_MEDIA_CATEGORIES, R2_PROVIDER, R2_VARIANTS, createR2ObjectKey, listR2Objects,
  r2Configuration, r2PublicUrl, safeR2ObjectKey, signedR2Request, validateR2UploadRequest,
} from '../_shared/r2Media.js';
import { migrationIdentity, validateLegacyImageSource } from '../_shared/storageGovernance.js';

const BUCKET = 'project-media';
const TASK_TTL_MS = 8 * 60 * 1000;
const MAX_BROWSER_SOURCE_BYTES = 25 * 1024 * 1024;
const EXPECTED_VARIANTS = ['thumbnail', 'display', 'expanded'];
const MAX_DERIVATIVE_BYTES = Object.values(R2_VARIANTS).reduce((sum: number, rule: any) => sum + rule.maxBytes, 0);

function config() { return r2Configuration({ R2_MEDIA_ENABLED: Deno.env.get('R2_MEDIA_ENABLED'), R2_ACCOUNT_ID: Deno.env.get('R2_ACCOUNT_ID'), R2_ACCESS_KEY_ID: Deno.env.get('R2_ACCESS_KEY_ID'), R2_SECRET_ACCESS_KEY: Deno.env.get('R2_SECRET_ACCESS_KEY'), R2_BUCKET_NAME: Deno.env.get('R2_BUCKET_NAME'), R2_PUBLIC_BASE_URL: Deno.env.get('R2_PUBLIC_BASE_URL') }); }
function cleanBody(value: any) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
function isSuper(actor: any) { return actor.role === 'super_admin'; }
function contains(value: any, target: string): boolean { return typeof value === 'string' ? value === target : Array.isArray(value) ? value.some((item) => contains(item, target)) : Boolean(value && typeof value === 'object' && Object.values(value).some((item) => contains(item, target))); }
function cleanError(value: any, fallback = 'MIGRATION_FAILED') { return String(value || fallback).replace(/[^A-Z0-9_:-]/gi, '_').slice(0, 80); }

function sourcePath(value: any, supabaseUrl = '') {
  const input = typeof value === 'string' ? value.trim() : '';
  if (!input || /^(data|blob|javascript):/i.test(input)) return '';
  if (!/^https?:\/\//i.test(input)) return input.replace(/\\/g, '/').replace(/^\/+/, '').replace(/^project-media\//i, '').split(/[?#]/)[0];
  try {
    const url = new URL(input); const origin = new URL(supabaseUrl);
    if (url.origin !== origin.origin) return '';
    const markers = [`/storage/v1/object/public/${BUCKET}/`, `/storage/v1/object/sign/${BUCKET}/`, `/object/public/${BUCKET}/`];
    const marker = markers.find((item) => url.pathname.includes(item));
    return marker ? decodeURIComponent(url.pathname.slice(url.pathname.indexOf(marker) + marker.length)) : '';
  } catch { return ''; }
}

function walkStrings(value: any, path: Array<string | number> = [], result: any[] = []) {
  if (typeof value === 'string') result.push({ value, path });
  else if (Array.isArray(value)) value.forEach((item, index) => walkStrings(item, [...path, index], result));
  else if (value && typeof value === 'object') Object.entries(value).forEach(([key, item]) => walkStrings(item, [...path, key], result));
  return result;
}

function valueAtPath(value: any, path: Array<string | number>) { let cursor = value; for (const part of path || []) cursor = cursor?.[part]; return cursor; }

async function collectCandidates(actor: any, limit: number) {
  const [projects, creatives, admins, settings, pages, services, assets] = await Promise.all([
    actor.admin.from('projects').select('id,owner_user_id,created_by,cover_image,gallery_images,gallery_items').limit(250),
    actor.admin.from('creative_members').select('id,profile_image_url,cover_image').limit(250),
    actor.admin.from('admin_users').select('user_id,creative_member_id').eq('status', 'active'),
    actor.admin.from('site_settings').select('*').limit(20), actor.admin.from('page_content').select('id,content').limit(100),
    actor.admin.from('service_branches').select('id,icon_url,image_url').limit(100), actor.admin.from('media_assets').select('id,url,storage_path').limit(250),
  ]);
  if ([projects, creatives, admins, settings, pages, services, assets].some((result: any) => result.error)) throw Object.assign(new Error('Public media references could not be scanned.'), { code: 'REFERENCE_SCAN_FAILED' });
  const ownerByCreative = new Map((admins.data || []).filter((row: any) => row.user_id && row.creative_member_id).map((row: any) => [row.creative_member_id, row.user_id]));
  const candidates: any[] = []; const push = (candidate: any) => { const path = sourcePath(candidate.reference, Deno.env.get('SUPABASE_URL') || ''); if (path) candidates.push({ ...candidate, path }); };
  for (const project of projects.data || []) { const owner = project.owner_user_id || project.created_by || actor.user.id; if (project.cover_image) push({ ownerUserId: owner, projectId: project.id, recordType: 'project', recordId: project.id, field: 'cover_image', locator: { table: 'projects', field: 'cover_image' }, reference: project.cover_image, category: 'project_cover' }); for (const value of project.gallery_images || []) push({ ownerUserId: owner, projectId: project.id, recordType: 'project', recordId: project.id, field: 'gallery_images', locator: { table: 'projects', field: 'gallery_images', match: value }, reference: value, category: 'project_gallery' }); for (const item of project.gallery_items || []) { if (item?.type === 'image' && item.url) push({ ownerUserId: owner, projectId: project.id, recordType: 'project', recordId: project.id, field: 'gallery_items', locator: { table: 'projects', field: 'gallery_items', itemId: item.id, subfield: 'url', match: item.url }, reference: item.url, category: 'project_gallery' }); if (item?.thumbnail_storage_path || item?.thumbnail_url) { const value = item.thumbnail_storage_path || item.thumbnail_url; push({ ownerUserId: owner, projectId: project.id, recordType: 'project', recordId: project.id, field: 'gallery_items', locator: { table: 'projects', field: 'gallery_items', itemId: item.id, subfield: item.thumbnail_storage_path ? 'thumbnail_storage_path' : 'thumbnail_url', match: value }, reference: value, category: 'external_thumbnail' }); } } }
  for (const creative of creatives.data || []) { const owner = ownerByCreative.get(creative.id) || actor.user.id; for (const [field, category] of [['profile_image_url', 'profile_photo'], ['cover_image', 'profile_cover']]) if (creative[field]) push({ ownerUserId: owner, creativeMemberId: creative.id, recordType: 'creative', recordId: creative.id, field, locator: { table: 'creative_members', field }, reference: creative[field], category }); }
  for (const row of settings.data || []) for (const [field, value] of Object.entries(row)) if (/(?:image|logo).*url/i.test(field) && typeof value === 'string') push({ ownerUserId: actor.user.id, recordType: 'site_setting', recordId: row.id, field, locator: { table: 'site_settings', field }, reference: value, category: 'site_image' });
  for (const row of pages.data || []) for (const item of walkStrings(row.content)) push({ ownerUserId: actor.user.id, recordType: 'page_content', recordId: row.id, field: 'content', locator: { table: 'page_content', field: 'content', path: item.path }, reference: item.value, category: 'site_image' });
  for (const row of services.data || []) for (const field of ['icon_url', 'image_url']) if (row[field]) push({ ownerUserId: actor.user.id, recordType: 'service_branch', recordId: row.id, field, locator: { table: 'service_branches', field }, reference: row[field], category: 'service_image' });
  for (const row of assets.data || []) { const value = row.storage_path || row.url; if (value) push({ ownerUserId: actor.user.id, recordType: 'media_asset', recordId: row.id, field: row.storage_path ? 'storage_path' : 'url', locator: { table: 'media_assets', field: row.storage_path ? 'storage_path' : 'url' }, reference: value, category: 'site_image' }); }
  const unique = new Map(); for (const item of candidates) { const key = [item.recordType, item.recordId, item.field, JSON.stringify(item.locator), item.path].join('|'); if (!unique.has(key)) unique.set(key, item); } return [...unique.values()].slice(0, Math.max(1, Math.min(limit, 100)));
}

async function discover(actor: any, limit: number) {
  const candidates = await collectCandidates(actor, limit); let created = 0; let existing = 0; let manualReview = 0;
  for (const candidate of candidates) {
    const identity = await migrationIdentity({ provider: 'supabase', bucket: BUCKET, path: candidate.path, recordType: candidate.recordType, recordId: candidate.recordId, field: candidate.field });
    const { data: known, error: knownError } = await actor.admin.from('storage_migrations').select('id').eq('migration_identity', identity).maybeSingle(); if (knownError) throw knownError; if (known) { existing += 1; continue; }
    const extension = candidate.path.split('.').pop()?.toLowerCase() || ''; const supported = ['jpg', 'jpeg', 'png', 'webp'].includes(extension);
    const { data: tracked, error: trackedError } = await actor.admin.from('external_media_objects').select('id,owner_user_id,metadata').eq('provider', 'supabase').eq('bucket', BUCKET).eq('storage_path', candidate.path).neq('status', 'deleted').maybeSingle(); if (trackedError) throw trackedError;
    const mediaId = tracked?.id || crypto.randomUUID(); const ownerUserId = tracked?.owner_user_id || candidate.ownerUserId;
    if (tracked) await actor.admin.from('external_media_objects').update({ source_provider: 'supabase', source_bucket: BUCKET, source_path: candidate.path, verification_status: 'pending', accounting_state: supported ? 'legacy' : 'manual_review', project_id: candidate.projectId || null, creative_member_id: candidate.creativeMemberId || null, metadata: { ...(tracked.metadata || {}), migration_discovery: true, source_reference: candidate.reference } }).eq('id', mediaId).throwOnError();
    else await actor.admin.from('external_media_objects').insert({ id: mediaId, owner_user_id: ownerUserId, provider: 'supabase', bucket: BUCKET, storage_path: candidate.path, filename: candidate.path.split('/').pop() || 'legacy-image', mime_type: 'application/octet-stream', size_bytes: 0, visibility: 'public', status: 'verification_required', file_category: candidate.category, project_id: candidate.projectId || null, creative_member_id: candidate.creativeMemberId || null, source_provider: 'supabase', source_bucket: BUCKET, source_path: candidate.path, verification_status: 'pending', accounting_state: supported ? 'legacy' : 'manual_review', metadata: { migration_discovery: true, source_reference: candidate.reference } }).throwOnError();
    const status = supported ? 'not_started' : 'manual_review';
    const { error } = await actor.admin.from('storage_migrations').insert({ owner_user_id: ownerUserId, media_object_id: mediaId, source_media_object_id: mediaId, source_provider: 'supabase', source_bucket: BUCKET, source_path: candidate.path, destination_provider: R2_PROVIDER, destination_connection_id: null, status, migration_phase: supported ? 'queued' : 'manual_review', bytes_total: 0, bytes_transferred: 0, migration_identity: identity, source_record_type: candidate.recordType, source_record_id: candidate.recordId, source_field: candidate.field, source_locator: candidate.locator, source_extension: extension, project_id: candidate.projectId || null, creative_member_id: candidate.creativeMemberId || null, media_category: candidate.category, manual_review_reason: supported ? null : 'Unsupported or unclassified source extension' });
    if (error) { if (error.code === '23505') { existing += 1; continue; } throw error; } created += 1; if (!supported) manualReview += 1;
  }
  return { discovered: candidates.length, created, existing, manualReview };
}

async function currentReference(actor: any, migration: any) {
  const locator = migration.source_locator || {}; let row: any = null;
  if (locator.table === 'projects') row = (await actor.admin.from('projects').select('cover_image,gallery_images,gallery_items').eq('id', migration.source_record_id).maybeSingle()).data;
  else if (locator.table === 'creative_members') row = (await actor.admin.from('creative_members').select('profile_image_url,cover_image').eq('id', migration.source_record_id).maybeSingle()).data;
  else if (locator.table === 'site_settings') row = (await actor.admin.from('site_settings').select('*').eq('id', migration.source_record_id).maybeSingle()).data;
  else if (locator.table === 'service_branches') row = (await actor.admin.from('service_branches').select('icon_url,image_url').eq('id', migration.source_record_id).maybeSingle()).data;
  else if (locator.table === 'media_assets') row = (await actor.admin.from('media_assets').select('url,storage_path').eq('id', migration.source_record_id).maybeSingle()).data;
  else if (locator.table === 'page_content') row = (await actor.admin.from('page_content').select('content').eq('id', migration.source_record_id).maybeSingle()).data;
  if (!row) return '';
  if (locator.table === 'page_content') return String(valueAtPath(row.content, locator.path || []) || '');
  if (locator.table === 'projects' && locator.field === 'gallery_images') return String((row.gallery_images || []).find((value: any) => value === locator.match) || '');
  if (locator.table === 'projects' && locator.field === 'gallery_items') return String((row.gallery_items || []).find((item: any) => item.id === locator.itemId)?.[locator.subfield] || '');
  return String(row[locator.field] || '');
}

async function sha256(value: string | Uint8Array) { const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value; const digest = await crypto.subtle.digest('SHA-256', bytes); return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join(''); }
function secureToken() { return `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll('-', ''); }
function constantEqual(left: string, right: string) { if (left.length !== right.length) return false; let difference = 0; for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index); return difference === 0; }

async function validateTask(actor: any, migrationId: string, token: string, { allowExpired = false }: any = {}) {
  const { data: migration, error } = await actor.admin.from('storage_migrations').select('*').eq('id', migrationId).eq('destination_provider', R2_PROVIDER).maybeSingle();
  if (error || !migration || migration.task_actor_user_id !== actor.user.id || !migration.task_token_hash || !constantEqual(migration.task_token_hash, await sha256(token))) throw Object.assign(new Error('The migration task is invalid.'), { code: 'MIGRATION_TASK_INVALID', status: 403 });
  if (migration.task_consumed_at) throw Object.assign(new Error('The migration task was already completed.'), { code: 'MIGRATION_TASK_CONSUMED', status: 409 });
  if (!allowExpired && Date.parse(migration.task_expires_at || '') <= Date.now()) throw Object.assign(new Error('The migration task expired. Retry the record to resume safely.'), { code: 'MIGRATION_TASK_EXPIRED', status: 409 });
  return migration;
}

async function sourceProbe(url: string, migration: any) {
  const head = await fetch(url, { method: 'HEAD', redirect: 'error' });
  if (!head.ok) throw Object.assign(new Error('The selected Supabase source is unavailable.'), { code: 'MISSING_SUPABASE_SOURCE', manual: true });
  const bytes = Number(head.headers.get('content-length') || 0); const mime = String(head.headers.get('content-type') || '').split(';')[0].toLowerCase();
  if (!Number.isSafeInteger(bytes) || bytes <= 0 || bytes > MAX_BROWSER_SOURCE_BYTES) throw Object.assign(new Error('This source is too large for safe browser migration.'), { code: 'SOURCE_TOO_LARGE_FOR_BROWSER', manual: true });
  const range = await fetch(url, { headers: { Range: 'bytes=0-31' }, redirect: 'error' });
  if (!range.ok) throw Object.assign(new Error('The selected Supabase source could not be inspected.'), { code: 'SOURCE_PROBE_FAILED', manual: true });
  const reader = range.body?.getReader(); const first = reader ? (await reader.read()).value || new Uint8Array() : new Uint8Array(); await reader?.cancel();
  const validation = validateLegacyImageSource({ path: migration.source_path, mimeType: mime, sizeBytes: bytes, signature: first.slice(0, 16) });
  if (!validation.eligible) throw Object.assign(new Error('The source image format is unsupported or does not match its signature.'), { code: cleanError(validation.reason, 'SOURCE_INVALID'), manual: true });
  return { bytes, mime: validation.mimeType };
}

async function prepareOne(actor: any, cfg: any) {
  const { data: policy } = await actor.admin.from('storage_policies').select('migration_paused').eq('singleton', true).single();
  if (policy?.migration_paused) throw Object.assign(new Error('Migration is paused.'), { code: 'MIGRATION_PAUSED', status: 409 });
  const workerId = crypto.randomUUID(); const { data: jobs, error } = await actor.admin.rpc('claim_one_public_media_migration', { p_worker_id: workerId }); if (error) throw error;
  const migration = jobs?.[0]; if (!migration) return { claimed: 0, task: null };
  let activeReservationId = '';
  try {
    const definition = R2_MEDIA_CATEGORIES[migration.media_category]; if (!definition) throw Object.assign(new Error('The migration category is unsupported.'), { code: 'CATEGORY_NOT_ALLOWED', manual: true });
    const reference = await currentReference(actor, migration); if (!reference || sourcePath(reference, Deno.env.get('SUPABASE_URL') || '') !== migration.source_path) throw Object.assign(new Error('The original public reference changed after discovery.'), { code: 'SOURCE_REFERENCE_CHANGED', manual: true });
    const { data: signed, error: signedError } = await actor.admin.storage.from(migration.source_bucket).createSignedUrl(migration.source_path, Math.floor(TASK_TTL_MS / 1000));
    if (signedError || !signed?.signedUrl) throw Object.assign(new Error('Secure source access could not be prepared.'), { code: 'SOURCE_URL_FAILED' });
    const probe = await sourceProbe(signed.signedUrl, migration);
    const targetId = migration.project_id || migration.creative_member_id || actor.user.id;
    let groupId = migration.destination_media_group_id || '';
    const found = await actor.admin.from('external_media_objects').select('*').eq('migration_id', migration.id).eq('provider', R2_PROVIDER).neq('status', 'deleted'); if (found.error) throw found.error;
    let existingRows: any[] = found.data || [];
    const knownGroups = [...new Set(existingRows.map((row: any) => row.media_group_id).filter(Boolean))];
    if (knownGroups.length > 1 || (groupId && knownGroups.length && !knownGroups.includes(groupId))) throw Object.assign(new Error('Multiple destination identities require manual review.'), { code: 'MIGRATION_IDENTITY_CONFLICT', manual: true });
    if (!groupId && knownGroups[0]) groupId = knownGroups[0];
    if (groupId) existingRows = existingRows.filter((row: any) => row.media_group_id === groupId);
    if (!groupId) groupId = crypto.randomUUID();
    let providerObjectsFound = 0; let reusableProviderObjects = 0;
    for (const row of existingRows) {
      if (!safeR2ObjectKey(row.external_file_id) || !R2_VARIANTS[row.media_variant]) continue;
      const response = await signedR2Request(fetch, cfg, 'HEAD', row.external_file_id);
      if (!response.ok) continue;
      providerObjectsFound += 1;
      const providerBytes = Number(response.headers.get('content-length') || 0); const providerMime = String(response.headers.get('content-type') || '').split(';')[0].toLowerCase();
      if (providerMime === 'image/webp' && providerBytes > 0 && providerBytes <= R2_VARIANTS[row.media_variant].maxBytes) reusableProviderObjects += 1;
    }
    const operationId = crypto.randomUUID();
    if (migration.reservation_id) await actor.admin.rpc('reconcile_storage_reservation', { p_reservation_id: migration.reservation_id, p_actual_bytes: 0, p_success: false, p_error: 'MIGRATION_REPREPARED' });
    const { data: reservation, error: reservationError } = await actor.admin.rpc('reserve_public_media_bytes', { p_operation_id: operationId, p_operation_kind: 'migration', p_owner_user_id: migration.owner_user_id, p_project_id: migration.project_id || null, p_creative_member_id: migration.creative_member_id || null, p_actor_role: actor.role, p_estimated_bytes: MAX_DERIVATIVE_BYTES, p_override: false, p_override_reason: null });
    if (reservationError || !reservation?.allowed) throw Object.assign(new Error('Storage capacity cannot currently be reserved for this migration.'), { code: reservation?.code || 'MIGRATION_BUDGET_RESTRICTED' });
    activeReservationId = reservation.reservationId;
    const prepared: any[] = [];
    for (const variant of EXPECTED_VARIANTS) {
      let row = existingRows.find((item: any) => item.media_variant === variant);
      if (row && (!safeR2ObjectKey(row.external_file_id) || row.media_group_id !== groupId)) throw Object.assign(new Error('The previous destination identity is unsafe.'), { code: 'MIGRATION_IDENTITY_INVALID', manual: true });
      if (!row) {
        const id = crypto.randomUUID(); const key = createR2ObjectKey(migration.media_category, targetId, groupId, variant);
        row = { id, owner_user_id: migration.owner_user_id, provider: R2_PROVIDER, external_file_id: key, filename: `${groupId}-${variant}.webp`, mime_type: 'image/webp', size_bytes: 0, uploaded_bytes: 0, visibility: 'public', status: 'uploading', file_category: migration.media_category, project_id: migration.project_id || null, creative_member_id: migration.creative_member_id || null, media_group_id: groupId, media_variant: variant, public_url: r2PublicUrl(cfg, key), reservation_id: reservation.reservationId, destination_bucket: cfg.bucketName, source_provider: 'supabase', source_bucket: migration.source_bucket, source_path: migration.source_path, migration_id: migration.id, verification_status: 'pending', accounting_state: 'provisional', upload_expires_at: new Date(Date.now() + TASK_TTL_MS).toISOString(), metadata: { migration_identity: migration.migration_identity, upload_transport: 'migration_task_v1' } };
        const inserted = await actor.admin.from('external_media_objects').insert(row); if (inserted.error) throw inserted.error;
      } else {
        const reset = await actor.admin.from('external_media_objects').update({ status: 'uploading', size_bytes: 0, uploaded_bytes: 0, trusted_size_bytes: null, width: null, height: null, reservation_id: reservation.reservationId, verification_status: 'pending', accounting_state: 'provisional', cleanup_status: 'none', cleanup_error: null, upload_expires_at: new Date(Date.now() + TASK_TTL_MS).toISOString() }).eq('id', row.id); if (reset.error) throw reset.error;
      }
      prepared.push({ mediaId: row.id, variant, objectKey: row.external_file_id });
    }
    const token = secureToken(); const expiresAt = new Date(Date.now() + TASK_TTL_MS).toISOString();
    const update = await actor.admin.from('storage_migrations').update({ migration_phase: 'prepared', destination_media_group_id: groupId, destination_bucket: cfg.bucketName, task_token_hash: await sha256(token), task_expires_at: expiresAt, task_actor_user_id: actor.user.id, task_prepared_at: new Date().toISOString(), task_consumed_at: null, migration_operation_id: operationId, reservation_id: reservation.reservationId, prepared_objects: prepared, prepared_source_reference: reference, browser_transform_status: 'waiting', bytes_total: probe.bytes, source_mime_type: probe.mime, last_finalization_error: null, updated_at: new Date().toISOString() }).eq('id', migration.id).eq('lock_token', migration.lock_token); if (update.error) throw update.error;
    await actor.admin.from('external_media_objects').update({ mime_type: probe.mime, size_bytes: probe.bytes, trusted_size_bytes: probe.bytes, status: 'available', verification_status: 'verified', last_verified_at: new Date().toISOString() }).eq('id', migration.source_media_object_id);
    await actor.admin.from('storage_audit_events').insert({ actor_user_id: actor.user.id, action: 'public_media_migration_prepared', target_type: 'storage_migration', target_id: migration.id, outcome: 'allowed', details: { mediaGroupId: groupId, expiresAt, sourceBytes: probe.bytes, resumed: Boolean(migration.destination_media_group_id || existingRows.length), providerObjectsFound, reusableProviderObjects, retryStrategy: existingRows.length ? 'reuse_identity_and_overwrite_verified_keys' : 'new_group' } });
    return { claimed: 1, task: { migrationId: migration.id, token, expiresAt, source: { url: signed.signedUrl, filename: String(migration.source_path).split('/').pop() || 'source-image', mimeType: probe.mime, sizeBytes: probe.bytes, maxBytes: MAX_BROWSER_SOURCE_BYTES }, mediaGroupId: groupId, category: migration.media_category, uploads: prepared.map(({ mediaId, variant }) => ({ mediaId, variant })), rules: R2_VARIANTS } };
  } catch (problem) {
    if (activeReservationId) await actor.admin.rpc('reconcile_storage_reservation', { p_reservation_id: activeReservationId, p_actual_bytes: 0, p_success: false, p_error: problem?.code || 'MIGRATION_PREPARE_FAILED' });
    const status = problem?.manual ? 'manual_review' : 'failed'; await actor.admin.from('storage_migrations').update({ status, migration_phase: problem?.manual ? 'manual_review' : 'recoverable', recoverable_at: problem?.manual ? null : new Date().toISOString(), last_error_code: problem?.code || 'MIGRATION_PREPARE_FAILED', last_error_message: String(problem?.message || 'Migration preparation failed.').slice(0, 500), manual_review_reason: problem?.manual ? String(problem.message).slice(0, 500) : null, lock_token: null, locked_at: null, locked_by: null, updated_at: new Date().toISOString() }).eq('id', migration.id); throw problem;
  }
}

async function authorizeVariants(actor: any, body: any) {
  const migration = await validateTask(actor, String(body.migrationId || ''), String(body.token || ''));
  const validation: any = validateR2UploadRequest({ category: migration.media_category, projectId: migration.project_id || '', creativeMemberId: migration.creative_member_id || '', variants: body.variants });
  if (!validation.ok) throw Object.assign(new Error(validation.message), { code: validation.code, status: 400 });
  const rows = await actor.admin.from('external_media_objects').select('id,media_variant').eq('migration_id', migration.id).eq('media_group_id', migration.destination_media_group_id).eq('provider', R2_PROVIDER); if (rows.error || rows.data?.length !== 3) throw Object.assign(new Error('The prepared destination group is incomplete.'), { code: 'MIGRATION_GROUP_INCOMPLETE' });
  for (const variant of validation.variants) { const row = rows.data.find((item: any) => item.media_variant === variant.variant); if (!row) throw Object.assign(new Error('A prepared variant is missing.'), { code: 'MIGRATION_GROUP_INCOMPLETE' }); const updated = await actor.admin.from('external_media_objects').update({ size_bytes: variant.sizeBytes, uploaded_bytes: 0, width: variant.width, height: variant.height, status: 'uploading', verification_status: 'pending' }).eq('id', row.id); if (updated.error) throw updated.error; }
  await actor.admin.from('storage_migrations').update({ migration_phase: 'uploading', browser_transform_status: 'complete', updated_at: new Date().toISOString() }).eq('id', migration.id);
  return { authorized: true, uploads: rows.data.map((row: any) => ({ mediaId: row.id, variant: row.media_variant })) };
}

async function finalizeOne(actor: any, cfg: any, body: any) {
  const migration = await validateTask(actor, String(body.migrationId || ''), String(body.token || ''));
  await actor.admin.from('storage_migrations').update({ migration_phase: 'verifying', finalization_attempt_count: Number(migration.finalization_attempt_count || 0) + 1, last_finalization_error: null, updated_at: new Date().toISOString() }).eq('id', migration.id);
  const result = await actor.admin.from('external_media_objects').select('*').eq('migration_id', migration.id).eq('media_group_id', migration.destination_media_group_id).eq('provider', R2_PROVIDER).neq('status', 'deleted'); if (result.error) throw result.error;
  const rows = result.data || []; if (rows.length !== 3 || new Set(rows.map((row: any) => row.media_variant)).size !== 3) throw Object.assign(new Error('Exactly three destination variants are required.'), { code: 'MIGRATION_GROUP_INCOMPLETE' });
  let actualBytes = 0;
  for (const row of rows) {
    const response = await signedR2Request(fetch, cfg, 'HEAD', row.external_file_id); const size = Number(response.headers.get('content-length') || 0); const mime = String(response.headers.get('content-type') || '').split(';')[0].toLowerCase(); const rule = R2_VARIANTS[row.media_variant];
    if (!response.ok || mime !== 'image/webp' || !Number.isSafeInteger(size) || size <= 0 || size > rule.maxBytes || size !== Number(row.size_bytes)) throw Object.assign(new Error(`Provider verification failed for ${row.media_variant}.`), { code: 'R2_MIGRATION_VERIFICATION_FAILED' });
    actualBytes += size; const updated = await actor.admin.from('external_media_objects').update({ status: 'available', trusted_size_bytes: size, uploaded_bytes: size, verification_status: 'verified', last_verified_at: new Date().toISOString() }).eq('id', row.id); if (updated.error) throw updated.error;
  }
  const primaryVariant = R2_MEDIA_CATEGORIES[migration.media_category]?.primaryVariant || 'display'; const primary = rows.find((row: any) => row.media_variant === primaryVariant) || rows[0];
  await actor.admin.from('storage_migrations').update({ migration_phase: 'activating', status: 'in_progress', destination_bytes: actualBytes, updated_at: new Date().toISOString() }).eq('id', migration.id);
  const { data: activated, error } = await actor.admin.rpc('activate_public_media_migration', { p_migration_id: migration.id, p_actor_user_id: actor.user.id, p_primary_url: primary.public_url, p_actual_bytes: actualBytes }); if (error) { await actor.admin.from('storage_migrations').update({ last_finalization_error: String(error.message).slice(0, 500), updated_at: new Date().toISOString() }).eq('id', migration.id); throw Object.assign(new Error('The verified media could not be activated; the original remains live.'), { code: 'ATOMIC_ACTIVATION_FAILED' }); }
  return { migrationId: migration.id, status: activated?.status || 'retained_for_rollback', retainedUntil: activated?.retainedUntil, verifiedBytes: actualBytes };
}

async function failOne(actor: any, body: any) {
  const id = String(body.migrationId || ''); const token = String(body.token || ''); let migration: any;
  try { migration = await validateTask(actor, id, token, { allowExpired: true }); } catch { const found = await actor.admin.from('storage_migrations').select('*').eq('id', id).eq('task_actor_user_id', actor.user.id).maybeSingle(); migration = found.data; }
  if (!migration) throw Object.assign(new Error('The migration task was not found.'), { code: 'MIGRATION_TASK_INVALID', status: 403 });
  if (migration.status === 'retained_for_rollback' || migration.migration_phase === 'retained') return { migrationId: migration.id, status: 'retained_for_rollback', recoverable: false };
  if (!['in_progress', 'failed'].includes(migration.status)) throw Object.assign(new Error('This migration is no longer an active browser task.'), { code: 'MIGRATION_STATE_INVALID', status: 409 });
  const code = cleanError(body.errorCode, 'BROWSER_MIGRATION_FAILED'); const stage = cleanError(body.stage, 'client'); const message = String(body.message || 'Browser migration failed.').slice(0, 500);
  if (migration.reservation_id) await actor.admin.rpc('reconcile_storage_reservation', { p_reservation_id: migration.reservation_id, p_actual_bytes: 0, p_success: false, p_error: code });
  await actor.admin.from('external_media_objects').update({ status: 'error', accounting_state: 'provisional', verification_status: 'failed', cleanup_status: 'pending', cleanup_error: `${stage}:${code}` }).eq('migration_id', migration.id).eq('provider', R2_PROVIDER).neq('status', 'available');
  await actor.admin.from('storage_migrations').update({ status: 'failed', migration_phase: 'recoverable', recoverable_at: new Date().toISOString(), task_token_hash: null, task_expires_at: null, task_consumed_at: null, browser_transform_status: 'failed', last_error_code: code, last_error_message: message, last_finalization_error: stage === 'verifying' || stage === 'activating' ? message : null, lock_token: null, locked_at: null, locked_by: null, updated_at: new Date().toISOString() }).eq('id', migration.id);
  await actor.admin.from('storage_audit_events').insert({ actor_user_id: actor.user.id, action: 'public_media_migration_failed', target_type: 'storage_migration', target_id: migration.id, outcome: 'failed', details: { code, stage, message, sourcePreserved: true } });
  return { migrationId: migration.id, status: 'failed', recoverable: true };
}

function xmlValue(value: string) { return value.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'"); }
async function reconcile(actor: any, cfg: any) {
  const { data: policy } = await actor.admin.from('storage_policies').select('reconciliation_recheck_hours').eq('singleton', true).single(); const recheckAfter = new Date(Date.now() + Number(policy?.reconciliation_recheck_hours || 24) * 3600000).toISOString();
  const { data: run, error: runError } = await actor.admin.from('storage_reconciliation_runs').insert({ requested_by: actor.user.id, status: 'running', provider_scope: [R2_PROVIDER] }).select('*').single(); if (runError) throw runError;
  const findings: any[] = [];
  try {
    const ledgerResult = await actor.admin.from('external_media_objects').select('id,external_file_id,public_url,media_group_id,media_variant,status,size_bytes,uploaded_bytes,trusted_size_bytes,accounting_state,verification_status,migration_id,upload_expires_at', { count: 'exact' }).eq('provider', R2_PROVIDER).limit(1000); if (ledgerResult.error) throw ledgerResult.error;
    const rows = ledgerResult.data || []; const ledgerTruncated = Number(ledgerResult.count || 0) > 1000; const headRows = rows.filter((row: any) => row.external_file_id).slice(0, 200);
    for (const row of headRows) { if (!safeR2ObjectKey(row.external_file_id)) { findings.push({ finding_identity: `unclassified:${row.id}`, finding_type: 'unclassified_provider_object', provider: R2_PROVIDER, severity: 'manual_review', media_object_id: row.id, migration_id: row.migration_id, status: 'manual_review', recheck_after: recheckAfter, details: { recorded: true } }); continue; } const response = await signedR2Request(fetch, cfg, 'HEAD', row.external_file_id); if (response.status === 404 && row.status !== 'deleted') findings.push({ finding_identity: `missing:${row.id}`, finding_type: 'missing_r2_object', provider: R2_PROVIDER, severity: 'critical', media_object_id: row.id, migration_id: row.migration_id, recheck_after: recheckAfter, details: {} }); else if (response.ok && row.trusted_size_bytes && Number(response.headers.get('content-length') || 0) !== Number(row.trusted_size_bytes)) findings.push({ finding_identity: `size:${row.id}`, finding_type: 'incorrect_size', provider: R2_PROVIDER, severity: 'warning', media_object_id: row.id, migration_id: row.migration_id, recheck_after: recheckAfter, details: { providerBytes: Number(response.headers.get('content-length') || 0), recordedBytes: Number(row.trusted_size_bytes) } }); }
    const activeUrls = new Map<string, any[]>(); for (const row of rows.filter((item: any) => item.status === 'available' && item.accounting_state === 'active' && item.public_url)) activeUrls.set(row.public_url, [...(activeUrls.get(row.public_url) || []), row]); for (const [url, duplicates] of activeUrls) if (duplicates.length > 1) findings.push({ finding_identity: `duplicate:${await migrationIdentity({ path: url })}`, finding_type: 'duplicate_active_reference', provider: R2_PROVIDER, severity: 'critical', media_object_id: duplicates[0].id, recheck_after: recheckAfter, details: { count: duplicates.length } });
    for (const row of rows.filter((item: any) => item.accounting_state === 'provisional' && Date.parse(item.upload_expires_at || '') <= Date.now())) findings.push({ finding_identity: `provisional:${row.id}`, finding_type: 'long_lived_provisional', provider: R2_PROVIDER, severity: 'warning', media_object_id: row.id, migration_id: row.migration_id, recheck_after: recheckAfter, details: { partial: true } });
    const migrationsResult = await actor.admin.from('storage_migrations').select('*').eq('destination_provider', R2_PROVIDER).limit(1000); if (migrationsResult.error) throw migrationsResult.error;
    for (const migration of migrationsResult.data || []) { const group = rows.filter((row: any) => row.media_group_id === migration.destination_media_group_id && row.status !== 'deleted'); const uploaded = group.filter((row: any) => Number(row.uploaded_bytes || 0) > 0).length; const verified = group.filter((row: any) => row.verification_status === 'verified').length; const detail = { phase: migration.migration_phase, variants: group.length, uploaded, verified }; if (migration.task_expires_at && Date.parse(migration.task_expires_at) <= Date.now() && !migration.task_consumed_at) findings.push({ finding_identity: `expired-task:${migration.id}`, finding_type: 'long_lived_provisional', provider: R2_PROVIDER, severity: 'warning', migration_id: migration.id, recheck_after: recheckAfter, details: { ...detail, expiredTask: true } }); if (migration.locked_at && Date.parse(migration.locked_at) <= Date.now() - 15 * 60 * 1000) findings.push({ finding_identity: `stale-lock:${migration.id}`, finding_type: 'failed_replacement', provider: R2_PROVIDER, severity: 'warning', migration_id: migration.id, recheck_after: recheckAfter, details: { ...detail, staleLock: true } }); if (['prepared', 'uploading', 'verifying'].includes(migration.migration_phase) && (group.length > 0 && group.length < 3 || uploaded > 0 && uploaded < 3 || verified > 0 && verified < 3)) findings.push({ finding_identity: `partial-group:${migration.id}`, finding_type: 'failed_replacement', provider: R2_PROVIDER, severity: 'warning', migration_id: migration.id, recheck_after: recheckAfter, details: { ...detail, partialUpload: true } }); if (migration.migration_phase === 'uploading' && uploaded === 3 && !migration.task_consumed_at) findings.push({ finding_identity: `uploaded-not-finalized:${migration.id}`, finding_type: 'failed_replacement', provider: R2_PROVIDER, severity: 'info', migration_id: migration.id, recheck_after: recheckAfter, details: { ...detail, uploadedNotFinalized: true } }); }
    const listResponse = await listR2Objects(fetch, cfg, { maxKeys: 1000 }); if (!listResponse.ok) throw Object.assign(new Error('R2 inventory scan failed.'), { code: 'R2_LIST_FAILED' }); const xml = await listResponse.text(); const listed = [...xml.matchAll(/<Contents>[\s\S]*?<Key>([\s\S]*?)<\/Key>[\s\S]*?<Size>(\d+)<\/Size>[\s\S]*?<\/Contents>/g)].map((match) => ({ key: xmlValue(match[1]), size: Number(match[2]) })); const known = new Set(rows.map((row: any) => row.external_file_id).filter(Boolean)); for (const object of listed) if (!ledgerTruncated && !known.has(object.key)) findings.push({ finding_identity: `orphan-key:${await migrationIdentity({ path: object.key })}`, finding_type: 'orphaned_r2_object', provider: R2_PROVIDER, severity: 'warning', recheck_after: recheckAfter, details: { sizeBytes: object.size } });
    if (findings.length) { const inserted = await actor.admin.from('storage_reconciliation_findings').insert(findings.map((item) => ({ ...item, run_id: run.id }))); if (inserted.error) throw inserted.error; }
    const summary = { missing: findings.filter((item) => item.finding_type === 'missing_r2_object').length, orphaned: findings.filter((item) => item.finding_type === 'orphaned_r2_object').length, recoverable: findings.filter((item) => item.details?.expiredTask || item.details?.staleLock || item.details?.partialUpload).length, ledgerTruncated, headVerified: headRows.length };
    await actor.admin.from('storage_reconciliation_runs').update({ status: 'completed', scanned_records: rows.length, scanned_objects: listed.length, finding_count: findings.length, summary, completed_at: new Date().toISOString() }).eq('id', run.id); return { runId: run.id, summary, findings: findings.length };
  } catch (error) { await actor.admin.from('storage_reconciliation_runs').update({ status: 'failed', error_code: error?.code || 'RECONCILIATION_FAILED', error_message: String(error?.message || 'Reconciliation failed').slice(0, 500), completed_at: new Date().toISOString() }).eq('id', run.id); throw error; }
}

Deno.serve(async (request) => {
  const env = edgeEnvironment(); const cors = corsHeaders(request, env.siteOrigin);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors }); if (request.method !== 'POST') return fail('METHOD_NOT_ALLOWED', 'Method not allowed.', 405, cors); if (!cors['Access-Control-Allow-Origin']) return fail('ORIGIN_NOT_ALLOWED', 'This request origin is not allowed.', 403, cors);
  const actor = await authenticatedTeamMember(request, env); if ('error' in actor) return fail(actor.error, 'Only an active Super Admin can manage public-media migration.', actor.status, cors); if (!isSuper(actor)) return fail('NOT_AUTHORIZED', 'Only the Super Admin can manage public-media migration.', 403, cors);
  const cfg = config(); if (!cfg.configured) return fail('R2_MEDIA_DISABLED', 'R2 migration is not configured.', 503, cors); const body = cleanBody(await request.json().catch(() => ({})));
  try {
    if (body.action === 'discover') return reply({ success: true, result: await discover(actor, Number(body.limit || 50)) }, 200, cors);
    if (body.action === 'prepare_one') return reply({ success: true, result: await prepareOne(actor, cfg) }, 200, cors);
    if (body.action === 'authorize_variants') return reply({ success: true, result: await authorizeVariants(actor, body) }, 200, cors);
    if (body.action === 'finalize_one') return reply({ success: true, result: await finalizeOne(actor, cfg, body) }, 200, cors);
    if (body.action === 'fail_one') return reply({ success: true, result: await failOne(actor, body) }, 200, cors);
    if (body.action === 'reconcile') return reply({ success: true, result: await reconcile(actor, cfg) }, 200, cors);
    return fail('ACTION_NOT_ALLOWED', 'The requested migration action is unavailable.', 400, cors);
  } catch (error) { return fail(error?.code || 'PUBLIC_MEDIA_MIGRATION_FAILED', String(error?.message || 'Public media migration failed.').slice(0, 300), Number(error?.status || 500), cors); }
});
