-- Read-only worker preflight.
select to_regclass('public.storage_cleanup_jobs') as cleanup_table;
select column_name,data_type,is_nullable from information_schema.columns where table_schema='public' and table_name='storage_cleanup_jobs' order by ordinal_position;
select p.proname,pg_get_function_identity_arguments(p.oid) args,pg_get_function_result(p.oid) returns from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.proname like '%storage_cleanup%' order by 1;
select policyname,cmd,roles,qual,with_check from pg_policies where schemaname='public' and tablename='projects' order by cmd,policyname;
select status,count(*) from public.storage_cleanup_jobs group by status order by status;
select count(*) as stale_processing from public.storage_cleanup_jobs where status='processing' and locked_at < now()-interval '15 minutes';
select count(*) as eligible_jobs from public.storage_cleanup_jobs where status='pending' or (status='failed' and (next_retry_at is null or next_retry_at<=now()));
