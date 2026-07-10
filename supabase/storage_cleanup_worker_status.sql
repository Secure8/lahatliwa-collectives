-- Additive safe status endpoint data for the server-side cleanup worker.
drop function if exists public.get_storage_cleanup_cron_status();
drop function if exists private.get_storage_cleanup_cron_status();

create function private.get_storage_cleanup_cron_status()
returns table(
  job_name text, schedule text, active boolean, schedule_count integer,
  last_run_status text, last_run_at timestamptz,
  project_url_exists boolean, worker_secret_exists boolean,
  pending_count bigint, processing_count bigint, failed_count bigint,
  manual_review_count bigint, completed_count bigint
)
language sql security definer set search_path=public,private,pg_temp as $$
  with matching as (
    select jobid, jobname, schedule, active from cron.job
    where jobname = 'process-storage-cleanup-every-5-minutes'
  ), latest as (
    select d.status, d.start_time from cron.job_run_details d
    join matching m on m.jobid = d.jobid order by d.start_time desc limit 1
  ), queue as (
    select count(*) filter (where status='pending') pending_count,
      count(*) filter (where status='processing') processing_count,
      count(*) filter (where status='failed') failed_count,
      count(*) filter (where status='manual_review') manual_review_count,
      count(*) filter (where status='completed') completed_count
    from public.storage_cleanup_jobs
  )
  select coalesce((select jobname from matching limit 1), 'process-storage-cleanup-every-5-minutes'),
    coalesce((select schedule from matching limit 1), ''),
    coalesce((select active from matching limit 1), false),
    (select count(*)::integer from matching),
    (select status from latest), (select start_time from latest),
    exists(select 1 from vault.secrets where name='storage_cleanup_worker_url'),
    exists(select 1 from vault.secrets where name='storage_cleanup_worker_secret'),
    queue.pending_count,queue.processing_count,queue.failed_count,queue.manual_review_count,queue.completed_count from queue;
$$;

create function public.get_storage_cleanup_cron_status()
returns table(
  job_name text, schedule text, active boolean, schedule_count integer,
  last_run_status text, last_run_at timestamptz,
  project_url_exists boolean, worker_secret_exists boolean,
  pending_count bigint, processing_count bigint, failed_count bigint,
  manual_review_count bigint, completed_count bigint
)
language sql security invoker set search_path=public,private,pg_temp as $$
  select * from private.get_storage_cleanup_cron_status();
$$;
revoke all on function private.get_storage_cleanup_cron_status() from public,anon,authenticated;
revoke all on function public.get_storage_cleanup_cron_status() from public,anon,authenticated;
grant execute on function private.get_storage_cleanup_cron_status() to service_role;
grant execute on function public.get_storage_cleanup_cron_status() to service_role;
