-- Shared team visibility, direct creator publishing, and preferred inquiry creative.
-- Run after the existing team/RBAC and project-credit migrations.

alter table public.project_inquiries
  add column if not exists preferred_creative_id uuid references public.creative_members(id) on delete set null;
create index if not exists project_inquiries_preferred_creative_idx
  on public.project_inquiries(preferred_creative_id);

-- Keep the credit table compatible with older installations while allowing the
-- creator trigger below to write a primary, multi-role credit safely.
alter table public.project_creatives
  add column if not exists creative_member_id uuid references public.creative_members(id) on delete cascade,
  add column if not exists credit_roles text[] not null default '{}'::text[],
  add column if not exists is_primary boolean not null default false,
  add column if not exists display_order integer;

create or replace function private.is_active_team_member(check_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select private.has_role(check_user_id, array['super_admin', 'admin', 'editor', 'creative', 'viewer']);
$$;

-- Creators and explicitly assigned editors can update their work at every
-- lifecycle stage. Admins retain collective-wide control.
create or replace function private.can_edit_project(check_user_id uuid, check_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select private.is_active_team_member(check_user_id) and (
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
  select private.is_active_team_member(check_user_id) and (
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
    )
    on conflict (project_id, creative_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists projects_add_creator_credit on public.projects;
create trigger projects_add_creator_credit
  after insert on public.projects
  for each row execute function private.add_creator_project_credit();

alter table public.project_inquiries enable row level security;
drop policy if exists "Public can create project inquiries" on public.project_inquiries;
drop policy if exists "Admins can manage project inquiries" on public.project_inquiries;
drop policy if exists "Site admins can read project inquiries" on public.project_inquiries;
drop policy if exists "Site admins can update project inquiries" on public.project_inquiries;
drop policy if exists "Site admins can delete project inquiries" on public.project_inquiries;
drop policy if exists "Public can submit valid project inquiries" on public.project_inquiries;
drop policy if exists "Active team can read project inquiries" on public.project_inquiries;
drop policy if exists "Team admins can update project inquiries" on public.project_inquiries;
drop policy if exists "Team admins can delete project inquiries" on public.project_inquiries;

create policy "Public can submit valid project inquiries"
  on public.project_inquiries for insert to anon, authenticated
  with check (
    char_length(trim(name)) between 2 and 120
    and char_length(trim(email_or_contact)) between 3 and 200
    and char_length(trim(project_type)) between 2 and 120
    and char_length(trim(message)) between 10 and 5000
    and (organization is null or char_length(trim(organization)) <= 160)
    and (budget_range is null or char_length(trim(budget_range)) <= 120)
    and (preferred_contact is null or char_length(trim(preferred_contact)) <= 120)
    and (preferred_creative_id is null or exists (
      select 1 from public.creative_members cm
      where cm.id = preferred_creative_id and cm.is_published = true
    ))
    and status = 'new'
  );

create policy "Active team can read project inquiries"
  on public.project_inquiries for select to authenticated
  using (private.is_active_team_member(auth.uid()));
create policy "Team admins can update project inquiries"
  on public.project_inquiries for update to authenticated
  using (private.can_manage_all_content(auth.uid()))
  with check (private.can_manage_all_content(auth.uid()));
create policy "Team admins can delete project inquiries"
  on public.project_inquiries for delete to authenticated
  using (private.can_manage_all_content(auth.uid()));

alter table public.projects enable row level security;
drop policy if exists "Team can read allowed projects" on public.projects;
drop policy if exists "Team can view accessible projects" on public.projects;
drop policy if exists "Active team can read team projects" on public.projects;
drop policy if exists "Team can update allowed projects" on public.projects;
drop policy if exists "Team can update editable projects" on public.projects;

create policy "Active team can read team projects"
  on public.projects for select to authenticated
  using (private.is_active_team_member(auth.uid()));
create policy "Team can update editable projects"
  on public.projects for update to authenticated
  using (private.can_edit_project(auth.uid(), id))
  with check (private.can_edit_project(auth.uid(), id));

alter table public.project_creatives enable row level security;
drop policy if exists "Team can read accessible project credits" on public.project_creatives;
drop policy if exists "Active team can read project credits" on public.project_creatives;
create policy "Active team can read project credits"
  on public.project_creatives for select to authenticated
  using (private.is_active_team_member(auth.uid()));

grant usage on schema private to authenticated;
grant execute on function private.is_active_team_member(uuid) to authenticated;
grant execute on function private.can_edit_project(uuid, uuid) to authenticated;
grant execute on function private.can_manage_project(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
