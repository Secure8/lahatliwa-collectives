-- Split public-media migration orchestration from browser-side image transformation.
-- This migration is additive and does not claim, copy, switch, or delete media.

begin;

alter table public.storage_migrations
  add column if not exists migration_phase text not null default 'queued',
  add column if not exists task_token_hash text,
  add column if not exists task_expires_at timestamptz,
  add column if not exists task_actor_user_id uuid references auth.users(id) on delete set null,
  add column if not exists task_prepared_at timestamptz,
  add column if not exists task_consumed_at timestamptz,
  add column if not exists migration_operation_id uuid,
  add column if not exists reservation_id uuid references public.storage_reservations(id) on delete set null,
  add column if not exists prepared_objects jsonb not null default '[]'::jsonb,
  add column if not exists prepared_source_reference text,
  add column if not exists browser_transform_status text,
  add column if not exists finalization_attempt_count integer not null default 0,
  add column if not exists last_finalization_error text,
  add column if not exists recoverable_at timestamptz;

alter table public.storage_migrations drop constraint if exists storage_migrations_phase_check;
alter table public.storage_migrations add constraint storage_migrations_phase_check check (migration_phase in (
  'queued','preparing','prepared','downloading','transforming','uploading','verifying','activating',
  'retained','failed','manual_review','recoverable','paused','completed'
));
alter table public.storage_migrations drop constraint if exists storage_migrations_task_hash_check;
alter table public.storage_migrations add constraint storage_migrations_task_hash_check
  check (task_token_hash is null or task_token_hash ~ '^[0-9a-f]{64}$');
alter table public.storage_migrations drop constraint if exists storage_migrations_prepared_objects_check;
alter table public.storage_migrations add constraint storage_migrations_prepared_objects_check
  check (jsonb_typeof(prepared_objects)='array' and jsonb_array_length(prepared_objects) <= 3);
alter table public.storage_migrations drop constraint if exists storage_migrations_finalization_attempt_check;
alter table public.storage_migrations add constraint storage_migrations_finalization_attempt_check
  check (finalization_attempt_count >= 0);

create index if not exists storage_migrations_task_expiry_idx
  on public.storage_migrations(task_expires_at) where task_token_hash is not null;
create index if not exists storage_migrations_phase_work_idx
  on public.storage_migrations(migration_phase,status,locked_at,created_at)
  where destination_provider='cloudflare_r2';
create index if not exists storage_migrations_recoverable_idx
  on public.storage_migrations(recoverable_at,updated_at)
  where migration_phase='recoverable';

comment on column public.storage_migrations.task_token_hash is 'SHA-256 hash of a short-lived, operation-scoped browser migration bearer token.';
comment on column public.storage_migrations.prepared_objects is 'Server-only immutable media/object identity metadata. Never return object keys to the browser.';

-- Preserve owner-readable lifecycle status while excluding task hashes, source
-- locators, reservation IDs, prepared object keys, and exact provider paths.
alter table public.storage_migrations enable row level security;
revoke select on table public.storage_migrations from authenticated;
grant select (
  id,owner_user_id,source_provider,destination_provider,status,bytes_total,bytes_transferred,
  checksum_verified,attempt_count,last_error_code,last_error_message,retain_source_until,
  started_at,verified_at,switched_at,completed_at,created_at,updated_at,migration_phase,
  browser_transform_status,finalization_attempt_count,last_finalization_error,recoverable_at,
  activated_at,source_cleanup_queued_at,source_deleted_at
) on table public.storage_migrations to authenticated;

drop function if exists public.claim_one_public_media_migration(text);
drop function if exists private.claim_one_public_media_migration(text);
create function private.claim_one_public_media_migration(p_worker_id text)
returns setof public.storage_migrations
language plpgsql security definer set search_path=public,private,pg_temp as $$
begin
  if auth.role()<>'service_role' then raise exception 'Service authorization required.' using errcode='42501'; end if;

  -- A terminated Edge request or expired browser task becomes safely retryable.
  -- Stable destination identity is deliberately retained.
  update public.storage_migrations
  set status='queued',migration_phase='recoverable',recoverable_at=now(),
      task_token_hash=null,task_expires_at=null,task_actor_user_id=null,task_consumed_at=null,
      lock_token=null,locked_at=null,locked_by=null,
      last_error_code=coalesce(last_error_code,'MIGRATION_TASK_STALE'),
      last_error_message=coalesce(last_error_message,'The prior migration task expired and can be resumed safely.'),
      updated_at=now()
  where destination_provider='cloudflare_r2'
    and status in ('in_progress','uploaded','verified')
    and ((locked_at is not null and locked_at < now()-interval '15 minutes')
      or (task_expires_at is not null and task_expires_at < now()));

  return query with candidate as (
    select id from public.storage_migrations
    where destination_provider='cloudflare_r2'
      and status in ('not_started','queued','failed')
      and lock_token is null and attempt_count < 8
    order by case when migration_phase='recoverable' then 0 else 1 end,created_at
    for update skip locked limit 1
  )
  update public.storage_migrations m
    set status='in_progress',migration_phase='preparing',lock_token=gen_random_uuid(),
        locked_at=now(),locked_by=p_worker_id,started_at=coalesce(m.started_at,now()),
        attempt_count=m.attempt_count+1,last_error_code=null,last_error_message=null,
        manual_review_reason=null,updated_at=now()
  from candidate c where m.id=c.id returning m.*;
end; $$;

create function public.claim_one_public_media_migration(p_worker_id text)
returns setof public.storage_migrations language sql security invoker set search_path=public,private,pg_temp as $$
  select * from private.claim_one_public_media_migration(p_worker_id);
$$;

-- Switches the exact discovered reference and commits destination/source accounting
-- in the same database transaction. Provider HEAD verification happens before this RPC.
create or replace function private.activate_public_media_migration(
  p_migration_id uuid,p_actor_user_id uuid,p_primary_url text,p_actual_bytes bigint
) returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$
declare
  m public.storage_migrations%rowtype;
  locator jsonb; old_reference text; changed integer:=0; retention_until timestamptz;
  json_path text[]; verified_count integer; verified_bytes bigint;
begin
  if auth.role()<>'service_role' then raise exception 'Service authorization required.' using errcode='42501'; end if;
  select * into m from public.storage_migrations where id=p_migration_id for update;
  if m.id is null then raise exception 'Migration not found.' using errcode='P0002'; end if;
  if m.task_actor_user_id is distinct from p_actor_user_id or m.task_consumed_at is not null
    or m.task_expires_at is null or m.task_expires_at<=now() then
    raise exception 'Migration task is invalid, consumed, or expired.' using errcode='42501';
  end if;
  if m.status<>'in_progress' or m.migration_phase not in ('uploading','verifying','activating') then
    raise exception 'Migration is not ready to activate.' using errcode='55000';
  end if;
  select count(*),coalesce(sum(trusted_size_bytes),0) into verified_count,verified_bytes
    from public.external_media_objects where migration_id=m.id and provider='cloudflare_r2'
      and media_group_id=m.destination_media_group_id and status='available'
      and verification_status='verified' and media_variant in ('thumbnail','display','expanded');
  if verified_count<>3 or verified_bytes<>p_actual_bytes then
    raise exception 'Exactly three provider-verified variants are required.' using errcode='55000';
  end if;

  locator:=m.source_locator; old_reference:=m.prepared_source_reference;
  if old_reference is null or old_reference='' then raise exception 'Source reference is unavailable.' using errcode='55000'; end if;

  if locator->>'table'='projects' and locator->>'field'='cover_image' then
    update public.projects set cover_image=p_primary_url where id=m.source_record_id and cover_image=old_reference;
    get diagnostics changed=row_count;
  elsif locator->>'table'='projects' and locator->>'field'='gallery_images' then
    update public.projects set gallery_images=(select jsonb_agg(case when value#>>'{}'=old_reference then to_jsonb(p_primary_url) else value end order by ordinality)
      from jsonb_array_elements(gallery_images) with ordinality)
    where id=m.source_record_id and gallery_images @> jsonb_build_array(old_reference);
    get diagnostics changed=row_count;
  elsif locator->>'table'='projects' and locator->>'field'='gallery_items' then
    update public.projects set gallery_items=(select jsonb_agg(
      case when item->>'id'=locator->>'itemId' and item->>(locator->>'subfield')=old_reference
        then case when locator->>'subfield'='thumbnail_storage_path'
          then jsonb_set(jsonb_set(item,array['thumbnail_storage_path'],to_jsonb(p_primary_url),false),array['thumbnail_url'],to_jsonb(p_primary_url),true)
          else jsonb_set(item,array[locator->>'subfield'],to_jsonb(p_primary_url),false) end
        else item end order by ordinality)
      from jsonb_array_elements(gallery_items) with ordinality as x(item,ordinality))
    where id=m.source_record_id and gallery_items::text like '%'||replace(old_reference,'%','\%')||'%';
    get diagnostics changed=row_count;
  elsif locator->>'table'='creative_members' and locator->>'field' in ('profile_image_url','cover_image') then
    execute format('update public.creative_members set %I=$1 where id=$2 and %I=$3',locator->>'field',locator->>'field')
      using p_primary_url,m.source_record_id,old_reference;
    get diagnostics changed=row_count;
  elsif locator->>'table'='site_settings' and locator->>'field' ~ '^[a-z][a-z0-9_]*$' then
    execute format('update public.site_settings set %I=$1 where id=$2 and %I=$3',locator->>'field',locator->>'field')
      using p_primary_url,m.source_record_id,old_reference;
    get diagnostics changed=row_count;
  elsif locator->>'table'='service_branches' and locator->>'field' in ('icon_url','image_url') then
    execute format('update public.service_branches set %I=$1 where id=$2 and %I=$3',locator->>'field',locator->>'field')
      using p_primary_url,m.source_record_id,old_reference;
    get diagnostics changed=row_count;
  elsif locator->>'table'='media_assets' and locator->>'field' in ('url','storage_path') then
    update public.media_assets set url=p_primary_url,storage_path=null where id=m.source_record_id
      and ((locator->>'field'='url' and url=old_reference) or (locator->>'field'='storage_path' and storage_path=old_reference));
    get diagnostics changed=row_count;
  elsif locator->>'table'='page_content' and jsonb_typeof(locator->'path')='array' then
    select array_agg(value order by ordinality) into json_path
      from jsonb_array_elements_text(locator->'path') with ordinality;
    update public.page_content set content=jsonb_set(content,json_path,to_jsonb(p_primary_url),false)
      where id=m.source_record_id and content#>>json_path=old_reference;
    get diagnostics changed=row_count;
  else
    raise exception 'Source locator is unsupported.' using errcode='55000';
  end if;
  if changed<>1 then raise exception 'The original public reference changed; activation was cancelled.' using errcode='55000'; end if;

  select now()+make_interval(days=>migration_retention_days) into retention_until
    from public.storage_policies where singleton;
  update public.external_media_objects set accounting_state='active',activated_at=now(),upload_expires_at=null
    where migration_id=m.id and media_group_id=m.destination_media_group_id and provider='cloudflare_r2';
  update public.external_media_objects set accounting_state='retained_duplicate',source_retention_until=retention_until
    where id=m.source_media_object_id;
  update public.storage_migrations set status='retained_for_rollback',migration_phase='retained',
    task_consumed_at=now(),activated_at=now(),switched_at=now(),retain_source_until=retention_until,
    destination_bytes=p_actual_bytes,checksum_verified=true,verified_at=coalesce(verified_at,now()),
    lock_token=null,locked_at=null,locked_by=null,updated_at=now()
    where id=m.id;
  update public.storage_reservations set status='consumed',actual_bytes=p_actual_bytes,reconciled_at=now(),updated_at=now()
    where id=m.reservation_id and status='reserved';
  insert into public.storage_audit_events(actor_user_id,action,target_type,target_id,outcome,details)
    values(p_actor_user_id,'public_media_migration_activated','storage_migration',m.id::text,'completed',
      jsonb_build_object('mediaGroupId',m.destination_media_group_id,'verifiedBytes',p_actual_bytes,'retainedUntil',retention_until));
  return jsonb_build_object('status','retained_for_rollback','retainedUntil',retention_until,'verifiedBytes',p_actual_bytes);
end; $$;

create or replace function public.activate_public_media_migration(
  p_migration_id uuid,p_actor_user_id uuid,p_primary_url text,p_actual_bytes bigint
) returns jsonb language sql security invoker set search_path=public,private,pg_temp as $$
  select private.activate_public_media_migration(p_migration_id,p_actor_user_id,p_primary_url,p_actual_bytes);
$$;

revoke all on function private.claim_one_public_media_migration(text) from public,anon,authenticated;
revoke all on function public.claim_one_public_media_migration(text) from public,anon,authenticated;
revoke all on function private.activate_public_media_migration(uuid,uuid,text,bigint) from public,anon,authenticated;
revoke all on function public.activate_public_media_migration(uuid,uuid,text,bigint) from public,anon,authenticated;
grant execute on function private.claim_one_public_media_migration(text) to service_role;
grant execute on function public.claim_one_public_media_migration(text) to service_role;
grant execute on function private.activate_public_media_migration(uuid,uuid,text,bigint) to service_role;
grant execute on function public.activate_public_media_migration(uuid,uuid,text,bigint) to service_role;

notify pgrst,'reload schema';
commit;
