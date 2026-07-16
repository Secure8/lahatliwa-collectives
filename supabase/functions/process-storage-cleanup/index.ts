import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { BUCKET, classifyStorageObject, collectReferencePaths, deduplicateQueuePaths, hasActiveCleanupJob, normalizeProjectMediaPath, summarizeClassifications, unwrapReferenceScanResults } from './reconciliation.js';
import { cancelResumableDriveUpload, deleteDriveFile, fetchGoogleIdentity, refreshGoogleAccessToken, tokenGrantedScopes } from '../_shared/googleDriveApi.js';
import { deleteExternalUploadSession, readConnectionSecret, readExternalUploadSession } from '../_shared/googleDriveDatabase.ts';
import { hasRequiredGoogleScopes, oauthConfiguration } from '../_shared/googleDriveOAuth.js';
import { R2_PROVIDER, deleteR2Object, r2CleanupStatus, r2Configuration, safeR2ObjectKey } from '../_shared/r2Media.js';

const prefix = '[storage-cleanup-worker]';
const MAX_DB_ROWS_PER_SOURCE = 10000;
const DB_PAGE_SIZE = 1000;
const MAX_BUCKET_OBJECTS = 10000;
const STORAGE_PAGE_SIZE = 100;
const REFERENCE_SOURCES = ['projects', 'creative_members', 'site_settings', 'page_content', 'service_branches', 'media_assets', 'admin_users'];
const safeError = (error: any) => ({ message: error?.message || 'Unknown error', code: error?.code || 'WORKER_ERROR', details: error?.details || undefined });
const responseError = (stage: string, error: any, status = 500) => {
  console.error(prefix, JSON.stringify({ event: 'failed', stage, error: safeError(error) }));
  return Response.json({ ok: false, stage, error: stage === 'claim_jobs' ? 'Could not claim cleanup jobs' : 'Storage cleanup worker failed', code: safeError(error).code }, { status });
};

async function fetchAllRows(admin: any, table: string) {
  const rows = [];
  for (let offset = 0; offset < MAX_DB_ROWS_PER_SOURCE; offset += DB_PAGE_SIZE) {
    const { data, error } = await admin.from(table).select('*').range(offset, offset + DB_PAGE_SIZE - 1);
    if (error) throw Object.assign(new Error(`Reference query failed for ${table}: ${error.message}`), { code: error.code || 'REFERENCE_QUERY_FAILED' });
    rows.push(...(data || []));
    if ((data || []).length < DB_PAGE_SIZE) return rows;
  }
  throw Object.assign(new Error(`Reference source ${table} exceeded the safe scan limit.`), { code: 'REFERENCE_SCAN_TRUNCATED' });
}

async function collectDatabaseReferences(admin: any) {
  const sourceRows = unwrapReferenceScanResults(await Promise.allSettled(REFERENCE_SOURCES.map((table) => fetchAllRows(admin, table))));
  return { references: collectReferencePaths(...sourceRows), sourceCounts: Object.fromEntries(REFERENCE_SOURCES.map((table, index) => [table, sourceRows[index].length])) };
}

async function listBucketObjects(admin: any) {
  const folders = [''];
  const visited = new Set<string>();
  const objects: any[] = [];
  while (folders.length) {
    const folder = folders.shift() || '';
    if (visited.has(folder)) continue;
    visited.add(folder);
    for (let offset = 0; ; offset += STORAGE_PAGE_SIZE) {
      const { data, error } = await admin.storage.from(BUCKET).list(folder, { limit: STORAGE_PAGE_SIZE, offset, sortBy: { column: 'name', order: 'asc' } });
      if (error) throw Object.assign(new Error(`Bucket listing failed at ${folder || '/'}: ${error.message}`), { code: error.code || 'BUCKET_LIST_FAILED' });
      for (const item of data || []) {
        const path = folder ? `${folder}/${item.name}` : item.name;
        if (!item.id && !item.metadata) folders.push(path);
        else objects.push({ path, created_at: item.created_at, updated_at: item.updated_at, size: Number(item.metadata?.size || 0) || null });
        if (objects.length > MAX_BUCKET_OBJECTS) throw Object.assign(new Error('Bucket exceeded the safe dry-run scan limit.'), { code: 'BUCKET_SCAN_TRUNCATED' });
      }
      if ((data || []).length < STORAGE_PAGE_SIZE) break;
    }
    if (visited.size > 1000) throw Object.assign(new Error('Bucket folder traversal exceeded the safe limit.'), { code: 'BUCKET_FOLDER_LIMIT' });
  }
  return objects;
}

async function findStorageObject(admin: any, path: string) {
  const segments = path.split('/');
  const name = segments.pop() || '';
  const folder = segments.join('/');
  const { data, error } = await admin.storage.from(BUCKET).list(folder, { limit: 100, search: name });
  if (error) throw error;
  const item = (data || []).find((candidate: any) => candidate.name === name && (candidate.id || candidate.metadata));
  return item ? { path, created_at: item.created_at, updated_at: item.updated_at, size: Number(item.metadata?.size || 0) || null } : null;
}

async function dryRun(admin: any, payload: any) {
  const [{ references, sourceCounts }, objects] = await Promise.all([collectDatabaseReferences(admin), listBucketObjects(admin)]);
  const classified = objects.map((object) => ({ ...object, ...classifyStorageObject(object, references) }));
  const candidates = classified.filter((item) => item.classification === 'confirmed_orphan');
  const offset = Math.max(0, Number(payload.candidateOffset || 0));
  const limit = Math.max(1, Math.min(Number(payload.candidateLimit || 100), 100));
  console.log(prefix, JSON.stringify({ event: 'reconciliation_dry_run_completed', summary: summarizeClassifications(classified), referenceSources: sourceCounts }));
  return Response.json({ ok: true, stage: 'reconciliation_dry_run', bucket: BUCKET, safetyWindowHours: 24, summary: summarizeClassifications(classified), referenceSources: sourceCounts, candidates: candidates.slice(offset, offset + limit).map((item) => ({ path: item.path, ageMs: item.ageMs, size: item.size, reason: item.reason })), candidatePage: { offset, limit, returned: Math.min(limit, Math.max(0, candidates.length - offset)), total: candidates.length, hasMore: offset + limit < candidates.length } });
}

async function queueReviewed(admin: any, payload: any) {
  if (payload.confirmation !== 'QUEUE_REVIEWED_ORPHANS') return Response.json({ ok: false, stage: 'queue_reviewed_orphans', error: 'Explicit queue confirmation is required.', code: 'QUEUE_CONFIRMATION_REQUIRED' }, { status: 400 });
  const requested = deduplicateQueuePaths(Array.isArray(payload.paths) ? payload.paths : []);
  if (!requested.length || requested.length > 100) return Response.json({ ok: false, stage: 'queue_reviewed_orphans', error: 'Provide between 1 and 100 reviewed paths.', code: 'INVALID_QUEUE_PATHS' }, { status: 400 });
  const { references } = await collectDatabaseReferences(admin);
  const queued = [];
  const rejected = [];
  for (const path of requested) {
    const object = await findStorageObject(admin, path);
    if (!object) { rejected.push({ path, reason: 'Storage object was not found.' }); continue; }
    const classification = classifyStorageObject(object, references);
    if (classification.classification !== 'confirmed_orphan') { rejected.push({ path, reason: classification.reason, classification: classification.classification }); continue; }
    const { data: existing, error: existingError } = await admin.from('storage_cleanup_jobs').select('id, status').eq('provider', 'supabase').eq('bucket_name', BUCKET).eq('object_path', path).in('status', ['pending', 'processing', 'failed']).limit(1);
    if (existingError) throw existingError;
    if (hasActiveCleanupJob(existing || [])) { rejected.push({ path, reason: 'An active cleanup job already exists.', classification: 'duplicate' }); continue; }
    const { error: insertError } = await admin.from('storage_cleanup_jobs').insert({ provider: 'supabase', bucket_name: BUCKET, object_path: path, project_id: null, reason: 'Reviewed storage reconciliation orphan', created_by: null });
    if (insertError?.code === '23505') { rejected.push({ path, reason: 'An active cleanup job already exists.', classification: 'duplicate' }); continue; }
    if (insertError) throw insertError;
    queued.push(path);
  }
  console.log(prefix, JSON.stringify({ event: 'reviewed_orphans_queued', queued: queued.length, rejected: rejected.length }));
  return Response.json({ ok: true, stage: 'queue_reviewed_orphans', queued, rejected });
}

async function cleanupExpiredExternalUploads(admin: any) {
  const google = oauthConfiguration({
    GOOGLE_DRIVE_OAUTH_ENABLED: Deno.env.get('GOOGLE_DRIVE_OAUTH_ENABLED'),
    GOOGLE_DRIVE_CLIENT_ID: Deno.env.get('GOOGLE_DRIVE_CLIENT_ID'),
    GOOGLE_DRIVE_CLIENT_SECRET: Deno.env.get('GOOGLE_DRIVE_CLIENT_SECRET'),
    GOOGLE_DRIVE_REDIRECT_URI: Deno.env.get('GOOGLE_DRIVE_REDIRECT_URI'),
  });
  const { data: mediaRows, error } = await admin.from('external_media_objects')
    .select('id,owner_user_id,storage_connection_id,external_file_id,cleanup_attempt_count')
    .eq('provider', 'google_drive').in('status', ['initiating','uploading','abandoned'])
    .neq('cleanup_status', 'manual_required').lt('upload_expires_at', new Date().toISOString()).limit(25);
  if (error) throw error;
  const results = [];
  for (const media of mediaRows || []) {
    try {
      const session: any = await readExternalUploadSession(media.owner_user_id, media.id);
      if (session?.upload_url) await cancelResumableDriveUpload(fetch, session.upload_url);
      await deleteExternalUploadSession(media.owner_user_id, media.id);
      if (media.external_file_id) {
        if (!google.configured) throw Object.assign(new Error('Google configuration unavailable'), { code: 'GOOGLE_CONFIGURATION_MISSING' });
        const { data: connection } = await admin.from('storage_connections').select('id,owner_user_id,provider_account_id,granted_scopes').eq('id', media.storage_connection_id).eq('owner_user_id', media.owner_user_id).maybeSingle();
        if (!connection) throw Object.assign(new Error('Connection unavailable'), { code: 'CONNECTION_NOT_FOUND' });
        const refreshToken = await readConnectionSecret(media.owner_user_id, connection.id);
        if (!refreshToken) throw Object.assign(new Error('Credential unavailable'), { code: 'TOKEN_REVOKED' });
        const tokens = await refreshGoogleAccessToken(fetch, google, refreshToken);
        const scopes = tokenGrantedScopes(tokens, connection.granted_scopes || []);
        if (!hasRequiredGoogleScopes(scopes)) throw Object.assign(new Error('Scope missing'), { code: 'SCOPE_MISSING' });
        const identity = await fetchGoogleIdentity(fetch, tokens.access_token);
        if (identity.sub !== connection.provider_account_id) throw Object.assign(new Error('Account mismatch'), { code: 'ACCOUNT_MISMATCH' });
        await deleteDriveFile(fetch, tokens.access_token, media.external_file_id);
      }
      await admin.from('external_media_objects').update({ status: 'cancelled', external_file_id: null, external_parent_id: null, upload_expires_at: null, cleanup_status: 'complete', cleanup_error: null, cleanup_attempt_count: Number(media.cleanup_attempt_count || 0) + 1 }).eq('id', media.id);
      results.push({ id: media.id, ok: true });
    } catch (cleanupError) {
      const attempts = Number(media.cleanup_attempt_count || 0) + 1;
      await admin.from('external_media_objects').update({ status: 'abandoned', cleanup_status: attempts >= 3 ? 'manual_required' : 'retry_required', cleanup_error: cleanupError?.code || 'ABANDONED_UPLOAD_CLEANUP_FAILED', cleanup_attempt_count: attempts }).eq('id', media.id);
      results.push({ id: media.id, ok: false });
    }
  }
  return results;
}

function containsExactReference(value: any, url: string): boolean {
  if (!url) return false;
  if (typeof value === 'string') return value === url;
  if (Array.isArray(value)) return value.some((item) => containsExactReference(item, url));
  return Boolean(value && typeof value === 'object' && Object.values(value).some((item) => containsExactReference(item, url)));
}

async function r2MediaStillReferenced(admin: any, media: any) {
  const { data: groupRows, error: groupError } = await admin.from('external_media_objects').select('public_url')
    .eq('provider', R2_PROVIDER).eq('media_group_id', media.media_group_id);
  if (groupError) throw groupError;
  const urls = (groupRows || []).map((row: any) => row.public_url).filter(Boolean);
  const containsGroupReference = (value: any) => urls.some((url: string) => containsExactReference(value, url));
  if (media.project_id) {
    const { data, error } = await admin.from('projects').select('cover_image,gallery_images,gallery_items').eq('id', media.project_id).maybeSingle();
    if (error) throw error;
    return containsGroupReference(data);
  }
  if (media.creative_member_id) {
    const { data, error } = await admin.from('creative_members').select('profile_image_url,cover_image').eq('id', media.creative_member_id).maybeSingle();
    if (error) throw error;
    return containsGroupReference(data);
  }
  const results = await Promise.all([
    admin.from('site_settings').select('*'), admin.from('page_content').select('content'),
    admin.from('service_branches').select('icon_url,image_url'), admin.from('media_assets').select('url,storage_path'),
  ]);
  if (results.some((result: any) => result.error)) throw Object.assign(new Error('R2 reference verification failed.'), { code: 'REFERENCE_CHECK_FAILED' });
  return results.some((result: any) => containsGroupReference(result.data));
}

async function cleanupExpiredR2Uploads(admin: any, r2: any) {
  const { data: mediaRows, error } = await admin.from('external_media_objects')
    .select('id,external_file_id,public_url,project_id,creative_member_id,media_group_id,status,cleanup_attempt_count')
    .eq('provider', R2_PROVIDER).in('status', ['uploading','available','error'])
    .neq('cleanup_status', 'manual_required').lt('upload_expires_at', new Date().toISOString()).limit(50);
  if (error) throw error;
  const results = [];
  for (const media of mediaRows || []) {
    try {
      if (media.status === 'available' && await r2MediaStillReferenced(admin, media)) {
        await admin.from('external_media_objects').update({ upload_expires_at: null, cleanup_status: 'none', cleanup_error: null }).eq('id', media.id);
        results.push({ id: media.id, ok: true, retained: true });
        continue;
      }
      if (!r2.configured || safeR2ObjectKey(media.external_file_id) !== media.external_file_id) {
        throw Object.assign(new Error('R2 cleanup configuration is unavailable.'), { code: 'R2_CONFIGURATION_MISSING' });
      }
      await deleteR2Object(fetch, r2, media.external_file_id);
      await admin.from('external_media_objects').update({ status: 'deleted', external_file_id: null, public_url: null, upload_expires_at: null, cleanup_status: 'complete', cleanup_error: null, cleanup_attempt_count: Number(media.cleanup_attempt_count || 0) + 1 }).eq('id', media.id);
      results.push({ id: media.id, ok: true });
    } catch (cleanupError) {
      const attempts = Number(media.cleanup_attempt_count || 0) + 1;
      await admin.from('external_media_objects').update({ status: 'error', cleanup_status: r2CleanupStatus(attempts), cleanup_error: cleanupError?.code || 'R2_ABANDONED_UPLOAD_CLEANUP_FAILED', cleanup_attempt_count: attempts }).eq('id', media.id);
      results.push({ id: media.id, ok: false });
    }
  }
  return results;
}

Deno.serve(async (request) => {
  console.log(prefix, JSON.stringify({ event: 'request_received', method: request.method }));
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const workerSecret = Deno.env.get('STORAGE_CLEANUP_WORKER_SECRET');
  const bootstrapSecret = Deno.env.get('STORAGE_CLEANUP_BOOTSTRAP_SECRET');
  if (!supabaseUrl || !serviceRole || !workerSecret) return responseError('configuration', { message: 'Required worker configuration is missing.', code: 'WORKER_CONFIGURATION_MISSING' });
  let payload: any = {};
  try { payload = await request.json(); } catch { payload = {}; }
  if (payload.action === 'configure_schedule') {
    if (!bootstrapSecret || request.headers.get('x-cleanup-bootstrap-secret') !== bootstrapSecret) return Response.json({ ok: false, stage: 'schedule_configuration', error: 'Unauthorized', code: 'BOOTSTRAP_UNAUTHORIZED' }, { status: 401 });
    const { data, error } = await createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } }).rpc('configure_storage_cleanup_cron', { p_project_url: supabaseUrl, p_worker_secret: workerSecret });
    if (error) return responseError('schedule_configuration', error);
    const status = data?.[0];
    return Response.json({ ok: true, stage: 'schedule_configured', jobName: status?.job_name, schedule: status?.schedule, active: status?.active, scheduleCount: status?.schedule_count });
  }
  if (request.headers.get('x-cleanup-worker-secret') !== workerSecret) {
    console.warn(prefix, JSON.stringify({ event: 'worker_secret_rejected' }));
    return Response.json({ ok: false, stage: 'authorization', error: 'Unauthorized', code: 'WORKER_UNAUTHORIZED' }, { status: 401 });
  }
  const admin = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });
  const r2 = r2Configuration({
    R2_MEDIA_ENABLED: Deno.env.get('R2_MEDIA_ENABLED'), R2_ACCOUNT_ID: Deno.env.get('R2_ACCOUNT_ID'),
    R2_ACCESS_KEY_ID: Deno.env.get('R2_ACCESS_KEY_ID'), R2_SECRET_ACCESS_KEY: Deno.env.get('R2_SECRET_ACCESS_KEY'),
    R2_BUCKET_NAME: Deno.env.get('R2_BUCKET_NAME'), R2_PUBLIC_BASE_URL: Deno.env.get('R2_PUBLIC_BASE_URL'),
  });
  try {
    if (payload.action === 'dry_run_reconciliation') return await dryRun(admin, payload);
    if (payload.action === 'queue_reviewed_orphans') return await queueReviewed(admin, payload);
    if (payload.action === 'status') {
      const { data, error } = await admin.rpc('get_storage_cleanup_cron_status');
      if (error) return responseError('status', error);
      const status = data?.[0];
      return Response.json({ ok: true, stage: 'status', worker: { healthy: true }, cron: { jobName: status?.job_name, schedule: status?.schedule, active: status?.active, count: status?.schedule_count, lastRunStatus: status?.last_run_status, lastRunAt: status?.last_run_at }, vault: { projectUrlExists: status?.project_url_exists, workerSecretExists: status?.worker_secret_exists }, queue: { pending: Number(status?.pending_count || 0), processing: Number(status?.processing_count || 0), failed: Number(status?.failed_count || 0), manualReview: Number(status?.manual_review_count || 0), completed: Number(status?.completed_count || 0) } });
    }
    const [externalResults, r2UploadResults] = await Promise.all([cleanupExpiredExternalUploads(admin), cleanupExpiredR2Uploads(admin, r2)]);
    const workerId = crypto.randomUUID();
    const { data: jobs, error: claimError } = await admin.rpc('claim_storage_cleanup_jobs', { p_batch_size: 50, p_worker_id: workerId });
    if (claimError) return responseError('claim_jobs', claimError);
    const results = [];
    for (const job of jobs || []) {
      const provider = job.provider || 'supabase';
      let deletion: any = { error: null };
      if (provider === R2_PROVIDER) {
        const valid = r2.configured && job.bucket_name === r2.bucketName && safeR2ObjectKey(job.object_path) === job.object_path;
        if (!valid) deletion = { error: { message: 'Invalid R2 cleanup target.', code: 'INVALID_R2_PATH' } };
        else {
          try { await deleteR2Object(fetch, r2, job.object_path); }
          catch (error) { deletion = { error }; }
        }
      } else {
        const valid = provider === 'supabase' && job.bucket_name === BUCKET && typeof job.object_path === 'string' && normalizeProjectMediaPath(job.object_path) === job.object_path;
        deletion = valid ? await admin.storage.from(job.bucket_name).remove([job.object_path]) : { error: { message: 'Invalid cleanup path.', code: 'INVALID_PATH' } };
      }
      const { error: finishError } = await admin.rpc('finish_storage_cleanup_job', { p_job_id: job.id, p_success: !deletion.error, p_error: deletion.error?.message || null });
      if (finishError) return responseError('finish_job', finishError);
      if (!deletion.error && provider === R2_PROVIDER) {
        await admin.from('external_media_objects').update({ status: 'deleted', external_file_id: null, public_url: null, cleanup_status: 'complete', cleanup_error: null }).eq('provider', R2_PROVIDER).eq('external_file_id', job.object_path);
      } else if (deletion.error && provider === R2_PROVIDER) {
        await admin.from('external_media_objects').update({ cleanup_status: r2CleanupStatus(Number(job.attempt_count || 0) + 1), cleanup_error: deletion.error?.code || 'R2_DELETE_FAILED', cleanup_attempt_count: Number(job.attempt_count || 0) + 1 }).eq('provider', R2_PROVIDER).eq('external_file_id', job.object_path);
      }
      results.push({ id: job.id, provider, ok: !deletion.error });
    }
    return Response.json({ ok: true, stage: 'completed', processed: results.length, results, externalUploads: { processed: externalResults.length, failed: externalResults.filter((item) => !item.ok).length }, r2Uploads: { processed: r2UploadResults.length, failed: r2UploadResults.filter((item) => !item.ok).length } });
  } catch (error) {
    return responseError(payload.action || 'worker', error);
  }
});
