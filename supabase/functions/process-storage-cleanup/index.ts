import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { BUCKET, classifyStorageObject, collectReferencePaths, deduplicateQueuePaths, hasActiveCleanupJob, normalizeProjectMediaPath, summarizeClassifications, unwrapReferenceScanResults } from './reconciliation.js';

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
    const { data: existing, error: existingError } = await admin.from('storage_cleanup_jobs').select('id, status').eq('bucket_name', BUCKET).eq('object_path', path).in('status', ['pending', 'processing', 'failed']).limit(1);
    if (existingError) throw existingError;
    if (hasActiveCleanupJob(existing || [])) { rejected.push({ path, reason: 'An active cleanup job already exists.', classification: 'duplicate' }); continue; }
    const { error: insertError } = await admin.from('storage_cleanup_jobs').insert({ bucket_name: BUCKET, object_path: path, project_id: null, reason: 'Reviewed storage reconciliation orphan', created_by: null });
    if (insertError?.code === '23505') { rejected.push({ path, reason: 'An active cleanup job already exists.', classification: 'duplicate' }); continue; }
    if (insertError) throw insertError;
    queued.push(path);
  }
  console.log(prefix, JSON.stringify({ event: 'reviewed_orphans_queued', queued: queued.length, rejected: rejected.length }));
  return Response.json({ ok: true, stage: 'queue_reviewed_orphans', queued, rejected });
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
  try {
    if (payload.action === 'dry_run_reconciliation') return await dryRun(admin, payload);
    if (payload.action === 'queue_reviewed_orphans') return await queueReviewed(admin, payload);
    if (payload.action === 'status') {
      const { data, error } = await admin.rpc('get_storage_cleanup_cron_status');
      if (error) return responseError('status', error);
      const status = data?.[0];
      return Response.json({ ok: true, stage: 'status', worker: { healthy: true }, cron: { jobName: status?.job_name, schedule: status?.schedule, active: status?.active, count: status?.schedule_count, lastRunStatus: status?.last_run_status, lastRunAt: status?.last_run_at }, vault: { projectUrlExists: status?.project_url_exists, workerSecretExists: status?.worker_secret_exists }, queue: { pending: Number(status?.pending_count || 0), processing: Number(status?.processing_count || 0), failed: Number(status?.failed_count || 0), manualReview: Number(status?.manual_review_count || 0), completed: Number(status?.completed_count || 0) } });
    }
    const workerId = crypto.randomUUID();
    const { data: jobs, error: claimError } = await admin.rpc('claim_storage_cleanup_jobs', { p_batch_size: 50, p_worker_id: workerId });
    if (claimError) return responseError('claim_jobs', claimError);
    const results = [];
    for (const job of jobs || []) {
      const valid = job.bucket_name === BUCKET && typeof job.object_path === 'string' && normalizeProjectMediaPath(job.object_path) === job.object_path;
      const deletion = valid ? await admin.storage.from(job.bucket_name).remove([job.object_path]) : { error: { message: 'Invalid cleanup path.', code: 'INVALID_PATH' } };
      const { error: finishError } = await admin.rpc('finish_storage_cleanup_job', { p_job_id: job.id, p_success: !deletion.error, p_error: deletion.error?.message || null });
      if (finishError) return responseError('finish_job', finishError);
      results.push({ id: job.id, ok: !deletion.error });
    }
    return Response.json({ ok: true, stage: 'completed', processed: results.length, results });
  } catch (error) {
    return responseError(payload.action || 'worker', error);
  }
});
