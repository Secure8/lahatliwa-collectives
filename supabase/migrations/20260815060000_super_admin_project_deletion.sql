begin;

-- Keep project ownership simple and compatible with legacy rows. Super Admin
-- may regulate every project; a Creative may manage only a row they created or
-- own. Contributor credit alone never grants destructive authority.
create or replace function private.can_edit_project(check_user_id uuid, check_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select exists (
    select 1
    from public.admin_users account
    join public.projects project on project.id = check_project_id
    where account.user_id = check_user_id
      and account.status = 'active'
      and (
        account.role = 'super_admin'
        or (account.role = 'creative' and (project.owner_user_id = check_user_id or project.created_by = check_user_id))
      )
  );
$$;

create or replace function private.can_manage_project(check_user_id uuid, check_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select private.can_edit_project(check_user_id, check_project_id);
$$;

revoke all on function private.can_edit_project(uuid,uuid), private.can_manage_project(uuid,uuid) from public, anon, authenticated;
grant execute on function private.can_edit_project(uuid,uuid), private.can_manage_project(uuid,uuid) to authenticated;

-- Convert only legacy references from the retired Supabase project-media
-- bucket. R2 URLs are handled from the private external-media ledger below.
create or replace function private.legacy_project_media_path(value text)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select case
    when value is null or btrim(value) = '' then null
    when value ~ '^https?://' and position('/storage/v1/object/public/project-media/' in value) > 0
      then split_part(split_part(value, '/storage/v1/object/public/project-media/', 2), '?', 1)
    when value !~ '^[a-z]+://' and value !~ '(^|/)\.\.(/|$)' and value !~ '^/' and length(value) <= 1024
      then split_part(value, '?', 1)
    else null
  end;
$$;

create or replace function private.delete_project_with_media(
  target_project_id uuid,
  actor_user_id uuid,
  actor_role text,
  deletion_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  project public.projects;
  queued_external integer := 0;
  queued_legacy integer := 0;
begin
  select * into project from public.projects where id = target_project_id for update;
  if project.id is null then raise exception 'PROJECT_NOT_FOUND'; end if;

  insert into public.storage_cleanup_jobs(provider,bucket_name,object_path,project_id,reason,created_by)
  select distinct
    media.provider,
    case when media.provider = 'cloudflare_r2' then media.destination_bucket else coalesce(media.source_bucket, 'project-media') end,
    media.external_file_id,
    project.id,
    deletion_reason,
    actor_user_id
  from public.external_media_objects media
  where media.project_id = project.id
    and media.provider in ('cloudflare_r2','supabase')
    and media.external_file_id is not null
    and media.status <> 'deleted'
    and (media.provider <> 'cloudflare_r2' or media.destination_bucket is not null)
  on conflict do nothing;
  get diagnostics queued_external = row_count;

  with candidates(path) as (
    select private.legacy_project_media_path(project.cover_image)
    union
    select private.legacy_project_media_path(value #>> '{}')
      from jsonb_array_elements(case when jsonb_typeof(project.gallery_images) = 'array' then project.gallery_images else '[]'::jsonb end) value
    union
    select private.legacy_project_media_path(item ->> key)
      from jsonb_array_elements(case when jsonb_typeof(project.gallery_items) = 'array' then project.gallery_items else '[]'::jsonb end) item
      cross join (values ('url'),('thumbnail_url'),('thumbnail_storage_path')) fields(key)
  )
  insert into public.storage_cleanup_jobs(provider,bucket_name,object_path,project_id,reason,created_by)
  select 'supabase','project-media',path,project.id,deletion_reason,actor_user_id
  from candidates where path is not null and path <> '' and path not like 'creative-profiles/%'
  on conflict do nothing;
  get diagnostics queued_legacy = row_count;

  update public.external_media_objects
  set status = case when provider = 'cloudflare_r2' then 'deleting' else 'cancelled' end,
      accounting_state = 'pending_cleanup', cleanup_status = 'pending', cleanup_error = null
  where project_id = project.id and provider in ('cloudflare_r2','supabase') and status <> 'deleted';

  insert into public.storage_audit_events(actor_user_id,action,target_type,target_id,outcome,details)
  values (
    actor_user_id,
    case when actor_role = 'super_admin' then 'super_admin_project_deleted' else 'creative_project_deleted' end,
    'project', project.id::text, 'completed',
    jsonb_build_object('title',project.title,'slug',project.slug,'ownerUserId',project.owner_user_id,
      'reason',deletion_reason,'queuedMedia',queued_external + queued_legacy)
  );

  delete from public.projects where id = project.id;
  return jsonb_build_object('deleted',true,'projectId',project.id,'title',project.title,
    'queuedMedia',queued_external + queued_legacy);
end;
$$;

revoke all on function private.legacy_project_media_path(text), private.delete_project_with_media(uuid,uuid,text,text)
  from public, anon, authenticated, service_role;

create or replace function public.delete_project_with_cleanup(p_project_id uuid, p_reason text default 'Project deleted by owner')
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  account public.admin_users;
  project public.projects;
  reason text := btrim(coalesce(p_reason,''));
begin
  if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501'; end if;
  select * into account from public.admin_users where user_id = auth.uid() and status = 'active';
  select * into project from public.projects where id = p_project_id;
  if account.user_id is null or project.id is null then raise exception 'PROJECT_NOT_FOUND_OR_NOT_AUTHORIZED' using errcode = '42501'; end if;
  if account.role = 'super_admin' then
    if length(reason) not between 8 and 500 then raise exception 'DELETION_REASON_REQUIRED'; end if;
  elsif account.role = 'creative' then
    if project.owner_user_id is distinct from auth.uid() and project.created_by is distinct from auth.uid() then
      raise exception 'PROJECT_NOT_FOUND_OR_NOT_AUTHORIZED' using errcode = '42501';
    end if;
    if reason = '' then reason := 'Project deleted by owner'; end if;
  else
    raise exception 'PROJECT_NOT_FOUND_OR_NOT_AUTHORIZED' using errcode = '42501';
  end if;
  return private.delete_project_with_media(project.id, auth.uid(), account.role, reason);
end;
$$;

revoke all on function public.delete_project_with_cleanup(uuid,text) from public, anon, service_role;
grant execute on function public.delete_project_with_cleanup(uuid,text) to authenticated;

-- Remove any historic update/delete policy and restore one explicit contract.
do $$
declare policy_name text;
begin
  for policy_name in
    select policyname from pg_policies where schemaname = 'public' and tablename = 'projects' and cmd in ('UPDATE','DELETE','ALL')
  loop
    execute format('drop policy if exists %I on public.projects', policy_name);
  end loop;
end;
$$;

create policy projects_owned_or_super_admin_update on public.projects
for update to authenticated
using (private.can_edit_project(auth.uid(),id))
with check (private.can_edit_project(auth.uid(),id));

create policy projects_owned_or_super_admin_delete on public.projects
for delete to authenticated
using (private.can_manage_project(auth.uid(),id));

-- All destructive browser operations must use the audited cleanup RPC.
revoke delete on public.projects from authenticated;

notify pgrst, 'reload schema';
commit;
