# Storage Cleanup Worker

Run the cleanup migrations, then run `npm.cmd run worker:setup`. The setup script deploys the worker and requires an authorized HTTP 2xx response plus an unauthorized 401/403 response before it reports readiness.

Run `supabase/storage_cleanup_worker_preflight.sql` in the SQL editor to confirm queue/RPC state. Only after the worker is healthy, create Vault secrets `storage_cleanup_worker_url` and `storage_cleanup_worker_secret`, then apply `supabase/storage_cleanup_worker_cron.sql`.

The worker uses server-side Supabase credentials only. Never put the worker secret or service role key in frontend environment variables. Check function logs in the Supabase Dashboard for `[storage-cleanup-worker]` events. Failed jobs retry automatically; jobs that reach eight attempts move to `manual_review`.
