begin;

-- One-time production content reset requested for the new UX/UI. This invokes
-- the same media queue and audit path as an interactive Super Admin deletion.
do $$
declare
  project_row record;
  reset_actor uuid;
  orphan_r2 integer := 0;
  orphan_supabase integer := 0;
begin
  select user_id into reset_actor
  from public.admin_users
  where status = 'active' and role = 'super_admin'
  order by created_at nulls last
  limit 1;

  for project_row in select id from public.projects order by created_at, id
  loop
    perform private.delete_project_with_media(
      project_row.id,
      reset_actor,
      'super_admin',
      'Production UX/UI project reset'
    );
  end loop;

  -- Once the project table is empty, tracked project-category R2 objects and
  -- objects under the dedicated legacy projects/ folder are safe orphans.
  insert into public.storage_cleanup_jobs(provider,bucket_name,object_path,reason,created_by)
  select 'cloudflare_r2',destination_bucket,external_file_id,'Orphaned project media after production reset',reset_actor
  from public.external_media_objects
  where provider = 'cloudflare_r2'
    and file_category in ('project_gallery','project_cover','external_thumbnail')
    and external_file_id is not null and destination_bucket is not null and status <> 'deleted'
  on conflict do nothing;
  get diagnostics orphan_r2 = row_count;

  update public.external_media_objects
  set status = 'deleting', accounting_state = 'pending_cleanup', cleanup_status = 'pending', cleanup_error = null
  where provider = 'cloudflare_r2'
    and file_category in ('project_gallery','project_cover','external_thumbnail')
    and status <> 'deleted';

  insert into public.storage_cleanup_jobs(provider,bucket_name,object_path,reason,created_by)
  select 'supabase','project-media',name,'Orphaned legacy project media after production reset',reset_actor
  from storage.objects
  where bucket_id = 'project-media' and name like 'projects/%'
  on conflict do nothing;
  get diagnostics orphan_supabase = row_count;

  insert into public.storage_audit_events(actor_user_id,action,target_type,target_id,outcome,details)
  values (reset_actor,'production_project_reset_completed','project_reset',null,'completed',
    jsonb_build_object('queuedOrphanR2',orphan_r2,'queuedOrphanSupabase',orphan_supabase));
end;
$$;

commit;
