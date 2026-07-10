import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const prefix = '[storage-cleanup-worker]';
const safeError = (error: any) => ({ message: error?.message || 'Unknown error', code: error?.code || 'WORKER_ERROR', details: error?.details || undefined });
const responseError = (stage: string, error: any, status = 500) => {
  console.error(prefix, JSON.stringify({ event: 'failed', stage, error: safeError(error) }));
  return Response.json({ ok: false, stage, error: stage === 'claim_jobs' ? 'Could not claim cleanup jobs' : 'Storage cleanup worker failed', code: safeError(error).code }, { status });
};

Deno.serve(async (request) => {
  console.log(prefix, JSON.stringify({ event: 'request_received', method: request.method }));
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const workerSecret = Deno.env.get('STORAGE_CLEANUP_WORKER_SECRET');
  const bootstrapSecret = Deno.env.get('STORAGE_CLEANUP_BOOTSTRAP_SECRET');
  if (!supabaseUrl || !serviceRole || !workerSecret) return responseError('configuration', { message: 'Required worker configuration is missing.', code: 'WORKER_CONFIGURATION_MISSING' });
  let payload: { action?: string } = {};
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
  console.log(prefix, JSON.stringify({ event: 'worker_secret_validated' }));
  const admin = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });
  console.log(prefix, JSON.stringify({ event: 'client_initialized' }));
  if (payload.action === 'status') {
    const { data, error } = await admin.rpc('get_storage_cleanup_cron_status');
    if (error) return responseError('status', error);
    const status = data?.[0];
    console.log(prefix, JSON.stringify({ event: 'status_completed', scheduleCount: status?.schedule_count || 0 }));
    return Response.json({ ok: true, stage: 'status', worker: { healthy: true }, cron: { jobName: status?.job_name, schedule: status?.schedule, active: status?.active, count: status?.schedule_count, lastRunStatus: status?.last_run_status, lastRunAt: status?.last_run_at }, vault: { projectUrlExists: status?.project_url_exists, workerSecretExists: status?.worker_secret_exists }, queue: { pending: Number(status?.pending_count || 0), processing: Number(status?.processing_count || 0), failed: Number(status?.failed_count || 0), manualReview: Number(status?.manual_review_count || 0), completed: Number(status?.completed_count || 0) } });
  }
  const workerId = crypto.randomUUID();
  console.log(prefix, JSON.stringify({ event: 'claim_started', rpc: 'claim_storage_cleanup_jobs' }));
  const { data: jobs, error: claimError } = await admin.rpc('claim_storage_cleanup_jobs', { p_batch_size: 50, p_worker_id: workerId });
  if (claimError) return responseError('claim_jobs', claimError);
  console.log(prefix, JSON.stringify({ event: 'claim_completed', jobs: jobs?.length || 0 }));
  const results = [];
  for (const job of jobs || []) {
    const valid = job.bucket_name === 'project-media' && typeof job.object_path === 'string' && job.object_path.length > 0 && !job.object_path.includes('..') && !/^https?:/i.test(job.object_path);
    console.log(prefix, JSON.stringify({ event: 'storage_delete_started', jobId: job.id }));
    const deletion = valid ? await admin.storage.from(job.bucket_name).remove([job.object_path]) : { error: { message: 'Invalid cleanup path.', code: 'INVALID_PATH' } };
    const { error: finishError } = await admin.rpc('finish_storage_cleanup_job', { p_job_id: job.id, p_success: !deletion.error, p_error: deletion.error?.message || null });
    if (finishError) return responseError('finish_job', finishError);
    console.log(prefix, JSON.stringify({ event: deletion.error ? 'job_scheduled_for_retry' : 'job_completed', jobId: job.id }));
    results.push({ id: job.id, ok: !deletion.error });
  }
  console.log(prefix, JSON.stringify({ event: 'worker_completed', jobs: results.length }));
  return Response.json({ ok: true, stage: 'completed', processed: results.length, results });
});
