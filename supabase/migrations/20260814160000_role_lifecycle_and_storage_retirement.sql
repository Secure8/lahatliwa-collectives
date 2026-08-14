begin;

-- Keep permanent member deletion deterministic. The loop variable must not
-- share a name with project_creatives.project_id.
create or replace function public.execute_admin_member_lifecycle(
  p_action text,
  p_target_admin_user_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  target public.admin_users%rowtype;
  active_super_admins integer;
  snapshot public.admin_member_lifecycle_snapshots%rowtype;
  linked_project_ids uuid[];
  v_project_id uuid;
  remaining_credits integer;
begin
  if auth.role()<>'service_role' then raise exception 'Service role required'; end if;
  if p_action not in ('remove_access','restore_access','permanent_delete') then raise exception 'Invalid action'; end if;

  select * into target from public.admin_users where id=p_target_admin_user_id for update;
  if not found or target.status='deleted' then raise exception 'Team member not found'; end if;
  if not exists(
    select 1 from public.admin_users
    where user_id=p_actor_user_id and status='active' and role in ('super_admin','owner')
  ) then raise exception 'Only an active Super Admin may perform this action'; end if;

  if target.role in ('super_admin','owner') and target.status='active' and p_action in ('remove_access','permanent_delete') then
    select count(*) into active_super_admins
    from public.admin_users
    where status='active' and role in ('super_admin','owner');
    if active_super_admins<=1 then raise exception 'The last active Super Admin cannot be removed or deleted'; end if;
  end if;

  perform set_config('app.admin_member_lifecycle_authorized','true',true);

  if p_action='remove_access' then
    if target.status='disabled' then return jsonb_build_object('status','disabled'); end if;
    select coalesce(array_agg(pc.project_id),'{}'::uuid[])
      into linked_project_ids
      from public.project_creatives pc
      where coalesce(pc.creative_member_id,pc.creative_id)=target.creative_member_id;

    insert into public.admin_member_lifecycle_snapshots(
      admin_user_id,previous_status,creative_member_id,creative_was_published,project_states,removed_by
    ) values(
      target.id,
      target.status,
      target.creative_member_id,
      (select is_published from public.creative_members where id=target.creative_member_id),
      coalesce((
        select jsonb_agg(jsonb_build_object('id',p.id,'status',p.status,'review_status',p.review_status))
        from public.projects p where p.id=any(linked_project_ids)
      ),'[]'::jsonb),
      p_actor_user_id
    )
    on conflict(admin_user_id) do update set
      previous_status=excluded.previous_status,
      creative_member_id=excluded.creative_member_id,
      creative_was_published=excluded.creative_was_published,
      project_states=excluded.project_states,
      removed_at=now(),
      removed_by=excluded.removed_by;

    update public.admin_users set status='disabled',updated_at=now() where id=target.id;
    update public.creative_members set is_published=false,updated_at=now() where id=target.creative_member_id;
    update public.projects set status='draft',review_status='draft',updated_at=now() where id=any(linked_project_ids);
    return jsonb_build_object('status','disabled');
  end if;

  if p_action='restore_access' then
    select * into snapshot
      from public.admin_member_lifecycle_snapshots
      where admin_user_id=target.id for update;
    if not found then raise exception 'No access-removal snapshot exists'; end if;

    update public.admin_users
      set status=case when user_id is null then 'invited' else 'active' end,updated_at=now()
      where id=target.id;
    update public.creative_members
      set is_published=coalesce(snapshot.creative_was_published,false),updated_at=now()
      where id=snapshot.creative_member_id;
    update public.projects p
      set status=s.value->>'status',review_status=coalesce(s.value->>'review_status','draft'),updated_at=now()
      from jsonb_array_elements(snapshot.project_states) s
      where p.id=(s.value->>'id')::uuid;
    delete from public.admin_member_lifecycle_snapshots where admin_user_id=target.id;
    return jsonb_build_object('status',case when target.user_id is null then 'invited' else 'active' end);
  end if;

  select coalesce(array_agg(distinct pc.project_id),'{}'::uuid[])
    into linked_project_ids
    from public.project_creatives pc
    where coalesce(pc.creative_member_id,pc.creative_id)=target.creative_member_id;
  update public.project_inquiries set preferred_creative_id=null,updated_at=now() where preferred_creative_id=target.creative_member_id;
  delete from public.project_creatives where coalesce(creative_member_id,creative_id)=target.creative_member_id;

  foreach v_project_id in array linked_project_ids loop
    select count(*) into remaining_credits
      from public.project_creatives pc
      where pc.project_id=v_project_id;
    if remaining_credits=0 then
      update public.projects
        set status='draft',review_status='archived',owner_user_id=null,updated_at=now()
        where id=v_project_id;
    end if;
  end loop;

  update public.projects set created_by=null where created_by=target.user_id;
  update public.projects set updated_by=null where updated_by=target.user_id;
  update public.projects set owner_user_id=null,status='draft',review_status='archived',updated_at=now() where owner_user_id=target.user_id;
  delete from public.contributor_requests where creative_member_id=target.creative_member_id or requester_user_id=target.user_id;
  delete from public.admin_member_lifecycle_snapshots where admin_user_id=target.id;
  delete from public.creative_members where id=target.creative_member_id;
  update public.admin_users
    set user_id=null,email='deleted-'||id::text||'@invalid.local',display_name='Deleted member',avatar_url=null,
        creative_member_id=null,status='deleted',updated_at=now()
    where id=target.id;
  return jsonb_build_object('status','deleted');
end;
$$;

revoke all on function public.execute_admin_member_lifecycle(text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.execute_admin_member_lifecycle(text,uuid,uuid) to service_role;

-- Keep the active cleanup scheduler lint-clean; cron.schedule performs the
-- required side effect and its returned job id does not need to be retained.
create or replace function private.configure_storage_cleanup_cron(p_project_url text, p_worker_secret text)
returns table(job_name text, schedule text, active boolean, schedule_count integer)
language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_id uuid; v_worker_url text;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required.'; end if;
  if p_project_url !~ '^https://[a-z0-9]+\.supabase\.co$' or char_length(p_worker_secret) < 32 then raise exception 'Invalid cleanup configuration.'; end if;
  v_worker_url := p_project_url || '/functions/v1/process-storage-cleanup';
  select id into v_id from vault.secrets where name='storage_cleanup_worker_url' limit 1;
  if v_id is null then perform vault.create_secret(v_worker_url,'storage_cleanup_worker_url','Cleanup worker URL'); else perform vault.update_secret(v_id,v_worker_url,'storage_cleanup_worker_url','Cleanup worker URL'); end if;
  select id into v_id from vault.secrets where name='storage_cleanup_worker_secret' limit 1;
  if v_id is null then perform vault.create_secret(p_worker_secret,'storage_cleanup_worker_secret','Cleanup worker secret'); else perform vault.update_secret(v_id,p_worker_secret,'storage_cleanup_worker_secret','Cleanup worker secret'); end if;
  perform cron.unschedule(jobid) from cron.job where jobname='process-storage-cleanup-every-5-minutes';
  perform cron.schedule('process-storage-cleanup-every-5-minutes','*/5 * * * *',$cmd$
    select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name='storage_cleanup_worker_url'), headers := jsonb_build_object('Content-Type','application/json','x-cleanup-worker-secret',(select decrypted_secret from vault.decrypted_secrets where name='storage_cleanup_worker_secret')), body := '{}'::jsonb);
  $cmd$);
  return query select j.jobname,j.schedule,j.active,count(*) over()::integer from cron.job j where j.jobname='process-storage-cleanup-every-5-minutes';
end; $$;

-- The Storage dashboard and emergency Supabase upload path were retired from
-- the R2-only product. Keep media ledgers and cleanup safeguards used by R2.
drop function if exists public.get_provider_storage_usage();
drop function if exists public.get_storage_governance_snapshot();
drop function if exists private.get_storage_governance_snapshot();

update public.storage_policies
set emergency_supabase_fallback_enabled=false,
    updated_at=now()
where singleton=true;

notify pgrst,'reload schema';
commit;
