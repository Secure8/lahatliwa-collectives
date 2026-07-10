-- Apply only after an authorized worker invocation returns HTTP 200 and unauthorized returns 401/403.
-- Create Vault secrets named storage_cleanup_worker_url and storage_cleanup_worker_secret first.
create extension if not exists pg_cron; create extension if not exists pg_net;
select cron.unschedule(jobid) from cron.job where jobname='process-storage-cleanup-every-5-minutes';
select cron.schedule('process-storage-cleanup-every-5-minutes','*/5 * * * *', $$
  select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name='storage_cleanup_worker_url'),
    headers := jsonb_build_object('Content-Type','application/json','x-cleanup-worker-secret',(select decrypted_secret from vault.decrypted_secrets where name='storage_cleanup_worker_secret')),
    body := '{}'::jsonb);
$$);
select jobid,jobname,schedule,active from cron.job where jobname='process-storage-cleanup-every-5-minutes';
-- Disable: update cron.job set active=false where jobname='process-storage-cleanup-every-5-minutes';
-- Remove: select cron.unschedule(jobid) from cron.job where jobname='process-storage-cleanup-every-5-minutes';
