-- Focused project visibility and publishing correction.
-- This migration intentionally does not alter project_inquiries or any inquiry policy.
-- Run after team_rbac_upgrade.sql and project_rls_cleanup_worker.sql.

alter table public.projects enable row level security;
alter table public.project_creatives
  add column if not exists creative_member_id uuid references public.creative_members(id) on delete cascade,
  add column if not exists role text,
  add column if not exists credit_roles text[] not null default '{}'::text[],
  add column if not exists is_primary boolean not null default false,
  add column if not exists display_order integer;

create or replace function private.is_active_project_team_member(check_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select private.has_role(check_user_id, array['super_admin', 'admin', 'editor', 'creative', 'viewer']);
$$;

create or replace function private.can_create_project(check_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select private.has_role(check_user_id, array['super_admin', 'admin', 'editor', 'creative']);
$$;

create or replace function private.can_edit_project(check_user_id uuid, check_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select private.is_active_project_team_member(check_user_id) and (
    private.can_manage_all_content(check_user_id)
    or exists (
      select 1 from public.projects
      where id = check_project_id
        and (owner_user_id = check_user_id or created_by = check_user_id)
    )
    or exists (
      select 1 from public.project_access
      where project_id = check_project_id
        and user_id = check_user_id
        and revoked_at is null
        and access_level in ('editor', 'manager')
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
  select private.is_active_project_team_member(check_user_id) and (
    private.can_manage_all_content(check_user_id)
    or exists (
      select 1 from public.projects
      where id = check_project_id
        and (owner_user_id = check_user_id or created_by = check_user_id)
    )
    or exists (
      select 1 from public.project_access
      where project_id = check_project_id
        and user_id = check_user_id
        and revoked_at is null
        and access_level = 'manager'
    )
  );
$$;

-- Existing ownership trigger assigns auth.uid() on insert and prevents later
-- ownership transfers. Recreate it here for installations that missed it.
create or replace function private.guard_project_ownership()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is null or not private.can_create_project(auth.uid()) then
      raise exception 'Project creation is not allowed.';
    end if;
    new.owner_user_id := auth.uid();
    new.created_by := auth.uid();
  else
    new.owner_user_id := old.owner_user_id;
    new.created_by := old.created_by;
  end if;
  return new;
end;
$$;
drop trigger if exists projects_guard_ownership on public.projects;
create trigger projects_guard_ownership
  before insert or update on public.projects
  for each row execute function private.guard_project_ownership();

create or replace function private.add_creator_project_credit()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_creator_creative_id uuid;
  v_creator_credit_role text := 'Contributor';
begin
  select au.creative_member_id
    into v_creator_creative_id
  from public.admin_users au
  where au.user_id = new.created_by
    and au.status = 'active'
  limit 1;

  if v_creator_creative_id is not null then
    insert into public.project_creatives as pc (
      project_id, creative_id, creative_member_id, credit_roles, contribution_role, role, is_primary, display_order
    ) values (
      new.id, v_creator_creative_id, v_creator_creative_id,
      array[v_creator_credit_role],
      v_creator_credit_role,
      v_creator_credit_role,
      true, 0
    ) on conflict (project_id, creative_id) do nothing;
  end if;
  return new;
end;
$$;
drop trigger if exists projects_add_creator_credit on public.projects;
create trigger projects_add_creator_credit
  after insert on public.projects
  for each row execute function private.add_creator_project_credit();

-- Remove every known legacy authenticated policy before adding the secure
-- shared-team rules. The public policy remains anon-only and published-only.
drop policy if exists "Authenticated users can read all projects" on public.projects;
drop policy if exists "Authenticated users can insert projects" on public.projects;
drop policy if exists "Authenticated users can update projects" on public.projects;
drop policy if exists "Authenticated users can delete projects" on public.projects;
drop policy if exists "Admins can read all projects" on public.projects;
drop policy if exists "Admins can insert projects" on public.projects;
drop policy if exists "Admins can update projects" on public.projects;
drop policy if exists "Admins can delete projects" on public.projects;
drop policy if exists "Team can read allowed projects" on public.projects;
drop policy if exists "Team can view accessible projects" on public.projects;
drop policy if exists "Team can insert project drafts" on public.projects;
drop policy if exists "Team can insert own projects" on public.projects;
drop policy if exists "Team can update allowed projects" on public.projects;
drop policy if exists "Team can update editable projects" on public.projects;
drop policy if exists "Admins can delete allowed projects" on public.projects;
drop policy if exists "Team can delete managed projects" on public.projects;
drop policy if exists "Active team can read team projects" on public.projects;

drop policy if exists "Active project team can read all projects" on public.projects;
create policy "Active project team can read all projects"
  on public.projects for select to authenticated
  using (private.is_active_project_team_member(auth.uid()));

drop policy if exists "Active project team can insert own projects" on public.projects;
create policy "Active project team can insert own projects"
  on public.projects for insert to authenticated
  with check (
    private.can_create_project(auth.uid())
    and owner_user_id = auth.uid()
    and created_by = auth.uid()
  );

drop policy if exists "Project owners and assigned editors can update" on public.projects;
create policy "Project owners and assigned editors can update"
  on public.projects for update to authenticated
  using (private.can_edit_project(auth.uid(), id))
  with check (private.can_edit_project(auth.uid(), id));

drop policy if exists "Project managers can delete" on public.projects;
create policy "Project managers can delete"
  on public.projects for delete to authenticated
  using (private.can_manage_project(auth.uid(), id));

grant usage on schema private to authenticated;
grant execute on function private.is_active_project_team_member(uuid) to authenticated;
grant execute on function private.can_create_project(uuid) to authenticated;
grant execute on function private.can_edit_project(uuid, uuid) to authenticated;
grant execute on function private.can_manage_project(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
