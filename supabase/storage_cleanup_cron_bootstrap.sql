-- One-time server-only Vault and pg_cron configuration for the cleanup worker.
create extension if not exists pg_cron; create extension if not exists pg_net; create extension if not exists supabase_vault;
create or replace function private.configure_storage_cleanup_cron(p_project_url text, p_worker_secret text)
returns table(job_name text, schedule text, active boolean, schedule_count integer)
language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_id uuid; v_jobid bigint;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required.'; end if;
  if p_project_url !~ '^https://[a-z0-9]+\.supabase\.co$' or char_length(p_worker_secret) < 32 then raise exception 'Invalid cleanup configuration.'; end if;
  select id into v_id from vault.secrets where name='storage_cleanup_worker_url' limit 1;
  if v_id is null then perform vault.create_secret(p_project_url,'storage_cleanup_worker_url','Cleanup worker URL'); else perform vault.update_secret(v_id,p_project_url,'storage_cleanup_worker_url','Cleanup worker URL'); end if;
  select id into v_id from vault.secrets where name='storage_cleanup_worker_secret' limit 1;
  if v_id is null then perform vault.create_secret(p_worker_secret,'storage_cleanup_worker_secret','Cleanup worker secret'); else perform vault.update_secret(v_id,p_worker_secret,'storage_cleanup_worker_secret','Cleanup worker secret'); end if;
  perform cron.unschedule(jobid) from cron.job where jobname='process-storage-cleanup-every-5-minutes';
  select cron.schedule('process-storage-cleanup-every-5-minutes','*/5 * * * *',$cmd$
    select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name='storage_cleanup_worker_url'), headers := jsonb_build_object('Content-Type','application/json','x-cleanup-worker-secret',(select decrypted_secret from vault.decrypted_secrets where name='storage_cleanup_worker_secret')), body := '{}'::jsonb);
  $cmd$) into v_jobid;
  return query select j.jobname,j.schedule,j.active,count(*) over()::integer from cron.job j where j.jobname='process-storage-cleanup-every-5-minutes';
end; $$;
create or replace function private.get_storage_cleanup_cron_status()
returns table(job_name text,schedule text,active boolean,schedule_count integer,last_run_status text,last_run_at timestamptz,vault_ready boolean)
language sql security definer set search_path=public,private,pg_temp as $$
  select j.jobname,j.schedule,j.active,count(*) over()::integer,
    (select status from cron.job_run_details d where d.jobid=j.jobid order by d.start_time desc limit 1),
    (select start_time from cron.job_run_details d where d.jobid=j.jobid order by d.start_time desc limit 1),
    exists(select 1 from vault.secrets where name='storage_cleanup_worker_url') and exists(select 1 from vault.secrets where name='storage_cleanup_worker_secret')
  from cron.job j where j.jobname='process-storage-cleanup-every-5-minutes';
$$;
create or replace function public.configure_storage_cleanup_cron(p_project_url text,p_worker_secret text) returns table(job_name text,schedule text,active boolean,schedule_count integer) language sql security invoker set search_path=public,private,pg_temp as $$ select * from private.configure_storage_cleanup_cron(p_project_url,p_worker_secret); $$;
create or replace function public.get_storage_cleanup_cron_status() returns table(job_name text,schedule text,active boolean,schedule_count integer,last_run_status text,last_run_at timestamptz,vault_ready boolean) language sql security invoker set search_path=public,private,pg_temp as $$ select * from private.get_storage_cleanup_cron_status(); $$;
revoke all on function public.configure_storage_cleanup_cron(text,text) from public,anon,authenticated;
revoke all on function public.get_storage_cleanup_cron_status() from public,anon,authenticated;
grant execute on function public.configure_storage_cleanup_cron(text,text) to service_role;
grant execute on function public.get_storage_cleanup_cron_status() to service_role;
