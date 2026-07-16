begin;

-- Retire the Supabase-to-R2 migration executor without deleting historical
-- migration records or any provider objects.
update public.storage_policies
set migration_paused = true,
    updated_at = now()
where singleton;

update public.storage_migrations
set status = 'paused',
    migration_phase = 'paused',
    task_token_hash = null,
    task_expires_at = null,
    task_actor_user_id = null,
    task_consumed_at = null,
    lock_token = null,
    locked_at = null,
    locked_by = null,
    last_error_code = 'MIGRATION_RETIRED',
    last_error_message = 'Automatic Supabase-to-R2 migration was retired. The source file remains unchanged.',
    updated_at = now()
where destination_provider = 'cloudflare_r2'
  and status in ('not_started','queued','in_progress','uploaded','verified','activated','failed');

-- Prevent previously queued migration-source cleanup from deleting a retained
-- Supabase object after the executor has been retired.
update public.storage_cleanup_jobs
set status = 'manual_review',
    last_error = 'MIGRATION_CLEANUP_RETIRED: source preserved',
    worker_id = null,
    locked_at = null,
    next_retry_at = null
where migration_id is not null
  and status in ('pending','processing','failed');

drop function if exists public.claim_one_public_media_migration(text);
drop function if exists private.claim_one_public_media_migration(text);
drop function if exists public.activate_public_media_migration(uuid,uuid,text,bigint);
drop function if exists private.activate_public_media_migration(uuid,uuid,text,bigint);
drop function if exists public.claim_public_media_migrations(integer,text);
drop function if exists private.claim_public_media_migrations(integer,text);

-- Keep the monitoring RPC, but stop querying and returning migration queues.
create or replace function private.get_storage_governance_snapshot()
returns jsonb language plpgsql stable security definer set search_path=public,private,pg_temp as $$
declare result jsonb;
begin
  if auth.role() <> 'service_role' then raise exception 'Service authorization required.' using errcode='42501'; end if;
  with media as (
    select *,coalesce(trusted_size_bytes,uploaded_bytes,size_bytes,0) trusted_bytes from public.external_media_objects
  ), cleanup as (
    select * from public.storage_cleanup_jobs where migration_id is null
  ), latest_recon as (
    select * from public.storage_reconciliation_runs order by started_at desc limit 1
  )
  select jsonb_build_object(
    'policy',(select to_jsonb(p)-'updated_by'-'migration_paused'-'migration_retention_days'-'migration_batch_size' from public.storage_policies p where singleton),
    'overview',jsonb_build_object(
      'activeR2Bytes',coalesce((select sum(trusted_bytes) from media where provider='cloudflare_r2' and accounting_state='active' and status='available'),0),
      'activeSupabaseBytes',coalesce((select sum(trusted_bytes) from media where provider='supabase' and accounting_state='legacy' and status in ('available','verification_required')),0),
      'activeDriveBytes',coalesce((select sum(trusted_bytes) from media where provider='google_drive' and accounting_state in ('active','legacy') and status='available'),0),
      'totalPublicMediaBytes',coalesce((select sum(trusted_bytes) from media where accounting_state in ('active','legacy','retained_duplicate','provisional')),0),
      'provisionalBytes',coalesce((select sum(trusted_bytes) from media where accounting_state='provisional'),0),
      'pendingCleanupBytes',coalesce((select sum(trusted_bytes) from media where accounting_state in ('pending_cleanup','reclaimable')),0),
      'failedBytes',coalesce((select sum(trusted_bytes) from media where accounting_state in ('failed','manual_review')),0),
      'r2ObjectCount',(select count(*) from media where provider='cloudflare_r2' and status<>'deleted'),
      'supabaseObjectCount',(select count(*) from media where provider='supabase' and status<>'deleted'),
      'mediaGroupCount',(select count(distinct media_group_id) from media where media_group_id is not null),
      'activeDerivativeCount',(select count(*) from media where provider='cloudflare_r2' and status='available'),
      'lastSynchronizedAt',(select max(greatest(coalesce(last_verified_at,'epoch'),coalesce(last_reconciled_at,'epoch'))) from media)
    ),
    'cleanup',jsonb_build_object(
      'queued',(select count(*) from cleanup where status='pending'),
      'pendingJobs',(select count(*) from cleanup where status='pending'),
      'retryingJobs',(select count(*) from cleanup where status='failed'),
      'manualReviewJobs',(select count(*) from cleanup where status='manual_review'),
      'oldestJobAt',(select min(created_at) from cleanup where status in ('pending','failed','manual_review')),
      'recoverableBytes',coalesce((select sum(estimated_bytes) from cleanup where status in ('pending','failed','manual_review')),0)
    ),
    'health',jsonb_build_object(
      'lastReconciliation',(select started_at from latest_recon),
      'lastReconciliationStatus',(select status from latest_recon),
      'lastSuccessfulReconciliation',(select max(completed_at) from public.storage_reconciliation_runs where status='completed'),
      'lastFailedReconciliation',(select max(completed_at) from public.storage_reconciliation_runs where status='failed'),
      'missingObjects',coalesce((select count(*) from public.storage_reconciliation_findings where finding_type in ('missing_r2_object','missing_supabase_source') and status<>'resolved'),0),
      'orphanedObjects',coalesce((select count(*) from public.storage_reconciliation_findings where finding_type in ('orphaned_r2_object','orphaned_supabase_object') and status<>'resolved'),0),
      'unclassifiedObjects',coalesce((select count(*) from public.storage_reconciliation_findings where finding_type='unclassified_provider_object' and status<>'resolved'),0),
      'unverifiedUploads',coalesce((select count(*) from media where provider='cloudflare_r2' and verification_status in ('unverified','pending') and status<>'deleted'),0),
      'failedVerifications',coalesce((select count(*) from media where verification_status='failed' and status<>'deleted'),0)
    ),
    'breakdowns',jsonb_build_object(
      'provider',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (select provider,sum(trusted_bytes) bytes,count(*) objects from media group by provider order by bytes desc)x),
      'category',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (select file_category category,sum(trusted_bytes) bytes,count(*) objects from media group by file_category order by bytes desc)x),
      'variant',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (select coalesce(media_variant,'source') variant,sum(trusted_bytes) bytes,count(*) objects from media group by media_variant order by bytes desc)x),
      'lifecycle',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (select accounting_state state,sum(trusted_bytes) bytes,count(*) objects from media group by accounting_state order by bytes desc)x)
    ),
    'largestProjects',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (select m.project_id,p.title,sum(m.trusted_bytes) bytes,count(*) objects from media m left join public.projects p on p.id=m.project_id where m.project_id is not null group by m.project_id,p.title order by bytes desc limit 10)x),
    'largestCreatives',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (select m.creative_member_id,c.name,sum(m.trusted_bytes) bytes,count(*) objects from media m left join public.creative_members c on c.id=m.creative_member_id where m.creative_member_id is not null group by m.creative_member_id,c.name order by bytes desc limit 10)x),
    'largestOwners',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (select m.owner_user_id,a.display_name,sum(m.trusted_bytes) bytes,count(*) objects,count(distinct m.media_group_id) media_groups from media m left join public.admin_users a on a.user_id=m.owner_user_id group by m.owner_user_id,a.display_name order by bytes desc limit 10)x)
  ) into result;
  return result;
end;
$$;

notify pgrst,'reload schema';
commit;
