create extension if not exists "pgcrypto";
create schema if not exists private;

revoke all on schema private from public;
grant usage on schema private to authenticated;

alter table public.admin_users
add column if not exists id uuid default gen_random_uuid(),
add column if not exists email text,
add column if not exists display_name text,
add column if not exists avatar_url text,
add column if not exists status text not null default 'active',
add column if not exists creative_member_id uuid references public.creative_members(id) on delete set null,
add column if not exists invited_by uuid,
add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
    and table_name = 'admin_users'
    and constraint_name = 'admin_users_pkey'
  ) then
    alter table public.admin_users drop constraint admin_users_pkey;
  end if;

  alter table public.admin_users alter column id set not null;

  if not exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
    and table_name = 'admin_users'
    and constraint_name = 'admin_users_id_pkey'
  ) then
    alter table public.admin_users add constraint admin_users_id_pkey primary key (id);
  end if;

  alter table public.admin_users alter column user_id drop not null;
exception
  when others then
    raise notice 'admin_users primary key modernization skipped: %', sqlerrm;
end;
$$;

create unique index if not exists admin_users_user_id_unique_idx
on public.admin_users(user_id)
where user_id is not null;

create unique index if not exists admin_users_email_unique_idx
on public.admin_users(lower(email))
where email is not null;

alter table public.admin_users
drop constraint if exists admin_users_role_check;

update public.admin_users
set role = 'super_admin'
where role = 'owner';

alter table public.admin_users
add constraint admin_users_role_check
check (role in ('super_admin', 'owner', 'admin', 'editor', 'creative', 'viewer'));

alter table public.admin_users
drop constraint if exists admin_users_status_check;

alter table public.admin_users
add constraint admin_users_status_check
check (status in ('active', 'invited', 'disabled'));

-- After running this migration, set yourself as Super Admin if needed:
-- update public.admin_users set role = 'super_admin', status = 'active' where email = 'MY_EMAIL_HERE';

alter table public.projects
add column if not exists created_by uuid references auth.users(id) on delete set null,
add column if not exists updated_by uuid references auth.users(id) on delete set null,
add column if not exists owner_user_id uuid references auth.users(id) on delete set null,
add column if not exists review_status text not null default 'draft',
add column if not exists submitted_at timestamptz,
add column if not exists reviewed_by uuid references auth.users(id) on delete set null,
add column if not exists reviewed_at timestamptz,
add column if not exists review_notes text;

alter table public.projects
drop constraint if exists projects_review_status_check;

alter table public.projects
add constraint projects_review_status_check
check (review_status in ('draft', 'pending_review', 'approved', 'rejected', 'published', 'archived'));

update public.projects
set review_status = case
  when status = 'published' then 'published'
  when review_status is null then 'draft'
  else review_status
end;

alter table public.project_creatives
add column if not exists creative_member_id uuid references public.creative_members(id) on delete cascade,
add column if not exists role text,
add column if not exists is_primary boolean not null default false,
add column if not exists updated_at timestamptz not null default now();

update public.project_creatives
set creative_member_id = creative_id
where creative_member_id is null
and creative_id is not null;

alter table public.project_creatives
drop constraint if exists project_creatives_role_check;

alter table public.project_creatives
add constraint project_creatives_role_check
check (
  role is null or role in (
    'Photographer',
    'Photo Editor',
    'Videographer',
    'Video Editor',
    'Social Media Manager',
    'Content Planner',
    'Web Developer',
    'Graphic Designer',
    'Creative Director',
    'Project Lead',
    'Contributor'
  )
);

create index if not exists projects_owner_user_idx on public.projects(owner_user_id);
create index if not exists projects_review_status_idx on public.projects(review_status);
create index if not exists project_creatives_primary_idx on public.project_creatives(project_id, is_primary, display_order);
create index if not exists admin_users_role_status_idx on public.admin_users(role, status);

create or replace function private.user_role(check_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select case
    when role = 'owner' then 'super_admin'
    else role
  end
  from public.admin_users
  where user_id = check_user_id
  and status = 'active'
  limit 1;
$$;

create or replace function private.has_role(check_user_id uuid, allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select coalesce(private.user_role(check_user_id) = any(allowed_roles), false);
$$;

create or replace function private.is_admin(check_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select private.has_role(check_user_id, array['super_admin', 'admin']);
$$;

create or replace function private.is_owner(check_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select private.has_role(check_user_id, array['super_admin']);
$$;

create or replace function private.can_manage_all_content(check_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select private.has_role(check_user_id, array['super_admin', 'admin']);
$$;

create or replace function private.can_manage_project(check_user_id uuid, check_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select coalesce(private.can_manage_all_content(check_user_id), false)
  or exists (
    select 1
    from public.projects p
    where p.id = check_project_id
    and (
      p.owner_user_id = check_user_id
      or p.created_by = check_user_id
      or exists (
        select 1
        from public.admin_users au
        join public.project_creatives pc on pc.creative_member_id = au.creative_member_id
        where au.user_id = check_user_id
        and pc.project_id = p.id
      )
    )
  );
$$;

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
  if requester_id is null then
    raise exception 'Authentication required.';
  end if;

  if private.has_role(requester_id, array['super_admin', 'admin']) then
    return new;
  end if;

  if requester_email = lower(old.email)
    and old.status = 'invited'
    and old.user_id is null
    and new.user_id = requester_id
    and lower(new.email) = lower(old.email)
  then
    new.id := old.id;
    new.email := old.email;
    new.role := old.role;
    new.status := 'active';
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

revoke all on function private.user_role(uuid) from public;
revoke all on function private.has_role(uuid, text[]) from public;
revoke all on function private.can_manage_all_content(uuid) from public;
revoke all on function private.can_manage_project(uuid, uuid) from public;
revoke all on function private.is_admin(uuid) from public;
revoke all on function private.is_owner(uuid) from public;
revoke all on function private.guard_admin_user_self_update() from public;
grant execute on function private.user_role(uuid) to authenticated;
grant execute on function private.has_role(uuid, text[]) to authenticated;
grant execute on function private.can_manage_all_content(uuid) to authenticated;
grant execute on function private.can_manage_project(uuid, uuid) to authenticated;
grant execute on function private.is_admin(uuid) to authenticated;
grant execute on function private.is_owner(uuid) to authenticated;

alter table public.admin_users enable row level security;

drop policy if exists "Team members can read team records" on public.admin_users;
create policy "Team members can read team records"
on public.admin_users
for select
to authenticated
using (
  private.has_role(auth.uid(), array['super_admin', 'admin'])
  or user_id = auth.uid()
  or lower(email) = lower(auth.jwt() ->> 'email')
);

drop policy if exists "Admins can insert team records" on public.admin_users;
create policy "Admins can insert team records"
on public.admin_users
for insert
to authenticated
with check (private.has_role(auth.uid(), array['super_admin', 'admin']));

drop policy if exists "Admins can update team records" on public.admin_users;
create policy "Admins can update team records"
on public.admin_users
for update
to authenticated
using (
  private.has_role(auth.uid(), array['super_admin', 'admin'])
  or lower(email) = lower(auth.jwt() ->> 'email')
)
with check (
  private.has_role(auth.uid(), array['super_admin', 'admin'])
  or (
    lower(email) = lower(auth.jwt() ->> 'email')
    and user_id = auth.uid()
    and status in ('active', 'invited')
  )
);

drop policy if exists "Super admins can delete team records" on public.admin_users;
create policy "Super admins can delete team records"
on public.admin_users
for delete
to authenticated
using (private.is_owner(auth.uid()) and user_id is distinct from auth.uid());

drop policy if exists "Admins can read all projects" on public.projects;
drop policy if exists "Admins can insert projects" on public.projects;
drop policy if exists "Admins can update projects" on public.projects;
drop policy if exists "Admins can delete projects" on public.projects;

create policy "Team can read allowed projects"
on public.projects
for select
to authenticated
using (
  private.can_manage_all_content(auth.uid())
  or private.can_manage_project(auth.uid(), id)
);

create policy "Team can insert project drafts"
on public.projects
for insert
to authenticated
with check (
  private.has_role(auth.uid(), array['super_admin', 'admin', 'editor', 'creative'])
  and coalesce(owner_user_id, auth.uid()) = auth.uid()
);

create policy "Team can update allowed projects"
on public.projects
for update
to authenticated
using (
  private.can_manage_all_content(auth.uid())
  or (
    private.can_manage_project(auth.uid(), id)
    and review_status in ('draft', 'pending_review', 'rejected')
    and status <> 'published'
  )
)
with check (
  private.can_manage_all_content(auth.uid())
  or (
    private.can_manage_project(auth.uid(), id)
    and review_status in ('draft', 'pending_review', 'rejected')
    and status <> 'published'
  )
);

create policy "Admins can delete allowed projects"
on public.projects
for delete
to authenticated
using (private.can_manage_all_content(auth.uid()));

drop policy if exists "Admins can manage project creative links" on public.project_creatives;
drop policy if exists "Team can manage project creative links" on public.project_creatives;
create policy "Team can manage project creative links"
on public.project_creatives
for all
to authenticated
using (
  private.can_manage_all_content(auth.uid())
  or private.can_manage_project(auth.uid(), project_id)
)
with check (
  private.can_manage_all_content(auth.uid())
  or private.can_manage_project(auth.uid(), project_id)
);

drop trigger if exists admin_users_set_updated_at on public.admin_users;
create trigger admin_users_set_updated_at
before update on public.admin_users
for each row execute function public.set_updated_at();

drop trigger if exists admin_users_guard_self_update on public.admin_users;
create trigger admin_users_guard_self_update
before update on public.admin_users
for each row execute function private.guard_admin_user_self_update();

drop trigger if exists project_creatives_set_updated_at on public.project_creatives;
create trigger project_creatives_set_updated_at
before update on public.project_creatives
for each row execute function public.set_updated_at();

notify pgrst, 'reload schema';
