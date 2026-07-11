-- PIN verification stays in the Edge Function. This migration provides the
-- service-role-only transactional lifecycle operation and restore snapshots.
create table if not exists public.admin_member_lifecycle_snapshots (
  admin_user_id uuid primary key references public.admin_users(id) on delete cascade,
  previous_status text not null,
  creative_member_id uuid references public.creative_members(id) on delete set null,
  creative_was_published boolean,
  project_states jsonb not null default '[]'::jsonb,
  removed_at timestamptz not null default now(),
  removed_by uuid references auth.users(id) on delete set null
);

alter table public.admin_member_lifecycle_snapshots enable row level security;
revoke all on table public.admin_member_lifecycle_snapshots from anon, authenticated;

alter table public.admin_users drop constraint if exists admin_users_status_check;
alter table public.admin_users add constraint admin_users_status_check
  check (status in ('active', 'invited', 'disabled', 'deleted'));

-- Preserve the existing browser-side guard while allowing only the service-role
-- lifecycle routine to make its verified status changes.
create or replace function private.guard_admin_user_access_changes()
returns trigger language plpgsql security definer set search_path=public,private,pg_temp as $$
declare requester_id uuid := auth.uid(); requester_role text;
declare old_role text := case when old.role='owner' then 'super_admin' else old.role end;
declare new_role text := case when new.role='owner' then 'super_admin' else new.role end;
declare other_active_super_admins integer;
begin
  if coalesce(current_setting('app.admin_member_lifecycle_authorized', true), '') = 'true'
    and auth.role() = 'service_role'
  then
    return new;
  end if;
  if requester_id is null then raise exception 'Authentication required.'; end if;
  requester_role := private.user_role(requester_id);
  if requester_role is null or requester_role not in ('super_admin','admin') then return new; end if;
  if old.user_id=requester_id and (new_role is distinct from old_role or new.status is distinct from old.status) then raise exception 'You cannot change your own role or access status.'; end if;
  if requester_role='admin' and (old_role='super_admin' or new_role='super_admin') then raise exception 'Only a Super Admin can change a Super Admin account.'; end if;
  if old_role='super_admin' and old.status='active' and (new_role<>'super_admin' or new.status<>'active') then
    perform pg_advisory_xact_lock(482910,1);
    select count(*) into other_active_super_admins from public.admin_users where id<>old.id and status='active' and role in ('super_admin','owner');
    if other_active_super_admins=0 then raise exception 'You cannot downgrade or disable the last active Super Admin.'; end if;
  end if;
  return new;
end; $$;

-- The invite/self-update guard remains unchanged for browser requests. Only the
-- transaction-local, service-role lifecycle call may pass its normal checks.
create or replace function private.guard_admin_user_self_update()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  requester_id uuid := auth.uid();
  requester_email text := lower(auth.jwt() ->> 'email');
begin
  if coalesce(current_setting('app.admin_member_lifecycle_authorized', true), '') = 'true'
    and auth.role() = 'service_role'
  then
    return new;
  end if;

  if requester_id is null then
    raise exception 'Authentication required.';
  end if;

  if private.has_role(requester_id, array['super_admin', 'admin']) then
    return new;
  end if;

  if requester_email = lower(old.email)
    and old.status in ('invited', 'active')
    and old.user_id is null
    and new.user_id = requester_id
    and lower(new.email) = lower(old.email)
  then
    new.id := old.id;
    new.email := old.email;
    new.role := old.role;
    new.status := case when old.status = 'invited' then 'active' else old.status end;
    new.creative_member_id := old.creative_member_id;
    new.invited_by := old.invited_by;
    return new;
  end if;

  if old.user_id = requester_id then
    new.id := old.id;
    new.user_id := old.user_id;
    new.email := old.email;
    new.role := old.role;
    new.status := old.status;
    new.creative_member_id := old.creative_member_id;
    new.invited_by := old.invited_by;
    return new;
  end if;

  raise exception 'Only admins can change team access fields.';
end;
$$;

revoke all on function private.guard_admin_user_access_changes() from public, anon, authenticated;
revoke all on function private.guard_admin_user_self_update() from public, anon, authenticated;

-- Preserve creative self-editing rules while permitting only the already
-- authorized, transaction-local service-role lifecycle visibility update.
create or replace function private.guard_creative_self_update()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  if coalesce(
       current_setting('app.admin_member_lifecycle_authorized', true),
       ''
     ) = 'true'
    and auth.role() = 'service_role'
  then
    return new;
  end if;

  if private.can_manage_all_content(auth.uid()) then return new; end if;
  if old.id is distinct from private.current_creative_member_id() then
    raise exception 'You can only update your own creative profile.';
  end if;
  new.id := old.id;
  new.slug := old.slug;
  new.is_published := old.is_published;
  new.is_featured := old.is_featured;
  new.display_order := old.display_order;
  new.created_at := old.created_at;
  return new;
end;
$$;

revoke all on function private.guard_creative_self_update() from public, anon, authenticated;

create or replace function public.execute_admin_member_lifecycle(
  p_action text,
  p_target_admin_user_id uuid,
  p_actor_user_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target public.admin_users%rowtype;
  active_super_admins integer;
  snapshot public.admin_member_lifecycle_snapshots%rowtype;
  linked_project_ids uuid[];
  project_id uuid;
  remaining_credits integer;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required'; end if;
  if p_action not in ('remove_access', 'restore_access', 'permanent_delete') then raise exception 'Invalid action'; end if;

  select * into target from public.admin_users where id = p_target_admin_user_id for update;
  if not found or target.status = 'deleted' then raise exception 'Team member not found'; end if;
  if not exists (select 1 from public.admin_users where user_id = p_actor_user_id and status = 'active' and role in ('super_admin', 'owner')) then
    raise exception 'Only an active Super Admin may perform this action';
  end if;

  if target.role in ('super_admin', 'owner') and target.status = 'active' and p_action in ('remove_access', 'permanent_delete') then
    select count(*) into active_super_admins from public.admin_users where status = 'active' and role in ('super_admin', 'owner');
    if active_super_admins <= 1 then raise exception 'The last active Super Admin cannot be removed or deleted'; end if;
  end if;

  perform set_config(
    'app.admin_member_lifecycle_authorized',
    'true',
    true
  );

  if p_action = 'remove_access' then
    if target.status = 'disabled' then return jsonb_build_object('status', 'disabled'); end if;
    select coalesce(array_agg(pc.project_id), '{}'::uuid[]) into linked_project_ids
      from public.project_creatives pc where coalesce(pc.creative_member_id, pc.creative_id) = target.creative_member_id;
    insert into public.admin_member_lifecycle_snapshots(admin_user_id, previous_status, creative_member_id, creative_was_published, project_states, removed_by)
    values (target.id, target.status, target.creative_member_id,
      (select is_published from public.creative_members where id = target.creative_member_id),
      coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'status', p.status, 'review_status', p.review_status)) from public.projects p where p.id = any(linked_project_ids)), '[]'::jsonb),
      p_actor_user_id)
    on conflict (admin_user_id) do update set previous_status=excluded.previous_status, creative_member_id=excluded.creative_member_id,
      creative_was_published=excluded.creative_was_published, project_states=excluded.project_states, removed_at=now(), removed_by=excluded.removed_by;
    update public.admin_users set status='disabled', updated_at=now() where id=target.id;
    update public.creative_members set is_published=false, updated_at=now() where id=target.creative_member_id;
    update public.projects set status='draft', review_status='draft', updated_at=now() where id=any(linked_project_ids);
    return jsonb_build_object('status', 'disabled');
  end if;

  if p_action = 'restore_access' then
    select * into snapshot from public.admin_member_lifecycle_snapshots where admin_user_id=target.id for update;
    if not found then raise exception 'No access-removal snapshot exists'; end if;
    update public.admin_users set status=case when user_id is null then 'invited' else 'active' end, updated_at=now() where id=target.id;
    update public.creative_members set is_published=coalesce(snapshot.creative_was_published,false), updated_at=now() where id=snapshot.creative_member_id;
    update public.projects p set status=s.value->>'status', review_status=coalesce(s.value->>'review_status','draft'), updated_at=now()
      from jsonb_array_elements(snapshot.project_states) s where p.id=(s.value->>'id')::uuid;
    delete from public.admin_member_lifecycle_snapshots where admin_user_id=target.id;
    return jsonb_build_object('status', case when target.user_id is null then 'invited' else 'active' end);
  end if;

  select coalesce(array_agg(distinct pc.project_id), '{}'::uuid[]) into linked_project_ids
    from public.project_creatives pc where coalesce(pc.creative_member_id, pc.creative_id) = target.creative_member_id;
  update public.project_inquiries set preferred_creative_id=null, updated_at=now() where preferred_creative_id=target.creative_member_id;
  delete from public.project_creatives where coalesce(creative_member_id, creative_id)=target.creative_member_id;
  foreach project_id in array linked_project_ids loop
    select count(*) into remaining_credits from public.project_creatives where project_creatives.project_id=project_id;
    if remaining_credits=0 then update public.projects set status='draft', review_status='archived', owner_user_id=null, updated_at=now() where id=project_id; end if;
  end loop;
  update public.projects set created_by=null where created_by=target.user_id;
  update public.projects set updated_by=null where updated_by=target.user_id;
  update public.projects set owner_user_id=null, status='draft', review_status='archived', updated_at=now() where owner_user_id=target.user_id;
  delete from public.contributor_requests where creative_member_id=target.creative_member_id or requester_user_id=target.user_id;
  delete from public.admin_member_lifecycle_snapshots where admin_user_id=target.id;
  delete from public.creative_members where id=target.creative_member_id;
  update public.admin_users set user_id=null, email='deleted-'||id::text||'@invalid.local', display_name='Deleted member', avatar_url=null,
    creative_member_id=null, status='deleted', updated_at=now() where id=target.id;
  return jsonb_build_object('status','deleted');
end;
$$;

revoke all on function public.execute_admin_member_lifecycle(text,uuid,uuid) from public, anon, authenticated;
grant execute on function public.execute_admin_member_lifecycle(text,uuid,uuid) to service_role;
notify pgrst, 'reload schema';
