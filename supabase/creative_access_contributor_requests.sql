create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create unique index if not exists admin_users_active_creative_member_unique_idx
on public.admin_users(creative_member_id)
where creative_member_id is not null and status in ('active', 'invited');

update public.projects
set owner_user_id = created_by
where owner_user_id is null and created_by is not null;

create table if not exists public.project_access (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  access_level text not null check (access_level in ('viewer', 'editor', 'manager')),
  granted_by uuid not null references auth.users(id) on delete restrict,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, user_id)
);

create table if not exists public.contributor_requests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  creative_member_id uuid not null references public.creative_members(id) on delete restrict,
  requester_user_id uuid not null references auth.users(id) on delete restrict,
  requested_roles text[] not null,
  message text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (cardinality(requested_roles) > 0),
  check (message is null or char_length(message) <= 1000)
);

create unique index if not exists contributor_requests_pending_unique_idx
on public.contributor_requests(project_id, creative_member_id)
where status = 'pending';
create index if not exists contributor_requests_project_status_idx on public.contributor_requests(project_id, status, created_at desc);
create index if not exists contributor_requests_requester_status_idx on public.contributor_requests(requester_user_id, status, created_at desc);
create index if not exists project_access_user_active_idx on public.project_access(user_id, project_id) where revoked_at is null;

create or replace function private.current_creative_member_id()
returns uuid language sql stable security definer set search_path = public, private, pg_temp as $$
  select creative_member_id from public.admin_users
  where user_id = auth.uid() and status = 'active' limit 1;
$$;

create or replace function private.normalize_credit_roles(input_roles text[])
returns text[] language sql immutable set search_path = pg_catalog as $$
  select coalesce(array_agg(role order by ordinality), '{}'::text[])
  from (
    select distinct on (lower(role)) role, ordinality
    from (
      select regexp_replace(btrim(value), '\s+', ' ', 'g') as role, ordinality
      from unnest(coalesce(input_roles, '{}'::text[])) with ordinality as roles(value, ordinality)
      where btrim(value) <> ''
    ) cleaned
    order by lower(role), ordinality
  ) normalized;
$$;

create or replace function private.can_view_project(check_user_id uuid, check_project_id uuid)
returns boolean language sql stable security definer set search_path = public, private, pg_temp as $$
  select private.can_manage_all_content(check_user_id)
  or exists (select 1 from public.projects where id = check_project_id and (owner_user_id = check_user_id or created_by = check_user_id))
  or exists (select 1 from public.project_access where project_id = check_project_id and user_id = check_user_id and revoked_at is null)
  or exists (
    select 1 from public.project_creatives pc
    join public.admin_users au on au.creative_member_id = coalesce(pc.creative_member_id, pc.creative_id)
    where pc.project_id = check_project_id and au.user_id = check_user_id and au.status = 'active'
  );
$$;

create or replace function private.can_edit_project(check_user_id uuid, check_project_id uuid)
returns boolean language sql stable security definer set search_path = public, private, pg_temp as $$
  select private.can_manage_all_content(check_user_id)
  or exists (select 1 from public.projects where id = check_project_id and (owner_user_id = check_user_id or created_by = check_user_id))
  or exists (
    select 1 from public.project_access
    where project_id = check_project_id and user_id = check_user_id and revoked_at is null
    and access_level in ('editor', 'manager')
  );
$$;

create or replace function private.can_manage_project(check_user_id uuid, check_project_id uuid)
returns boolean language sql stable security definer set search_path = public, private, pg_temp as $$
  select private.can_manage_all_content(check_user_id)
  or exists (select 1 from public.projects where id = check_project_id and (owner_user_id = check_user_id or created_by = check_user_id))
  or exists (
    select 1 from public.project_access
    where project_id = check_project_id and user_id = check_user_id and revoked_at is null and access_level = 'manager'
  );
$$;

create or replace function private.guard_creative_self_update()
returns trigger language plpgsql security definer set search_path = public, private, pg_temp as $$
begin
  if private.can_manage_all_content(auth.uid()) then return new; end if;
  if old.id is distinct from private.current_creative_member_id() then raise exception 'You can only update your own creative profile.'; end if;
  new.id := old.id; new.slug := old.slug; new.is_published := old.is_published; new.is_featured := old.is_featured;
  new.display_order := old.display_order; new.created_at := old.created_at;
  return new;
end;
$$;

create or replace function private.submit_contributor_request(p_project_id uuid, p_roles text[], p_message text default null)
returns uuid language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v_creative_id uuid := private.current_creative_member_id(); v_roles text[] := private.normalize_credit_roles(p_roles); v_existing text[]; v_id uuid;
begin
  if auth.uid() is null or v_creative_id is null then raise exception 'Your account is not linked to an approved creative profile.'; end if;
  if cardinality(v_roles) = 0 then raise exception 'Choose at least one contributor role.'; end if;
  if not private.can_view_project(auth.uid(), p_project_id) then raise exception 'You cannot request credit on this project.'; end if;
  if not exists (select 1 from public.creative_members where id = v_creative_id and is_published) then raise exception 'Your creative profile is not approved.'; end if;
  select private.normalize_credit_roles(coalesce(credit_roles, array[coalesce(role, contribution_role, 'Contributor')])) into v_existing
  from public.project_creatives where project_id = p_project_id and creative_id = v_creative_id;
  if v_existing is not null and not exists (select 1 from unnest(v_roles) r where not r = any(v_existing)) then
    raise exception 'You already have these contributor roles on this project.';
  end if;
  insert into public.contributor_requests(project_id, creative_member_id, requester_user_id, requested_roles, message)
  values (p_project_id, v_creative_id, auth.uid(), v_roles, nullif(btrim(p_message), '')) returning id into v_id;
  return v_id;
end;
$$;

create or replace function private.review_contributor_request(p_request_id uuid, p_decision text, p_roles text[] default null)
returns void language plpgsql security definer set search_path = public, private, pg_temp as $$
declare r public.contributor_requests%rowtype; v_roles text[]; v_existing text[]; v_legacy text;
begin
  select * into r from public.contributor_requests where id = p_request_id for update;
  if not found then raise exception 'Contributor request not found.'; end if;
  if not private.can_manage_project(auth.uid(), r.project_id) then raise exception 'You cannot review this contributor request.'; end if;
  if r.status <> 'pending' then
    if r.status = p_decision then return; end if;
    raise exception 'This contributor request has already been reviewed.';
  end if;
  if p_decision = 'rejected' then
    update public.contributor_requests set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now() where id = r.id;
    return;
  end if;
  if p_decision <> 'approved' then raise exception 'Review decision must be approved or rejected.'; end if;
  v_roles := private.normalize_credit_roles(coalesce(p_roles, r.requested_roles));
  if cardinality(v_roles) = 0 then raise exception 'Choose at least one contributor role.'; end if;
  select private.normalize_credit_roles(coalesce(credit_roles, array[coalesce(role, contribution_role, 'Contributor')])) into v_existing
  from public.project_creatives where project_id = r.project_id and creative_id = r.creative_member_id for update;
  v_roles := private.normalize_credit_roles(coalesce(v_existing, '{}'::text[]) || v_roles);
  select role into v_legacy from unnest(v_roles) role where role in ('Photographer','Photo Editor','Videographer','Video Editor','Social Media Manager','Content Planner','Web Developer','Graphic Designer','Creative Director','Project Lead','Contributor') limit 1;
  v_legacy := coalesce(v_legacy, 'Contributor');
  insert into public.project_creatives(project_id, creative_id, creative_member_id, credit_roles, contribution_role, role, is_primary, display_order)
  values (r.project_id, r.creative_member_id, r.creative_member_id, v_roles, v_legacy, v_legacy, false, 9999)
  on conflict (project_id, creative_id) do update set credit_roles = excluded.credit_roles, contribution_role = excluded.contribution_role, role = excluded.role;
  update public.contributor_requests set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now() where id = r.id;
end;
$$;

create or replace function private.cancel_contributor_request(p_request_id uuid)
returns void language plpgsql security definer set search_path = public, private, pg_temp as $$
begin
  update public.contributor_requests set status = 'cancelled'
  where id = p_request_id and requester_user_id = auth.uid() and status = 'pending';
  if not found then raise exception 'Only your pending requests can be cancelled.'; end if;
end;
$$;

create or replace function private.grant_project_access(p_project_id uuid, p_user_id uuid, p_level text)
returns void language plpgsql security definer set search_path = public, private, pg_temp as $$
begin
  if not private.can_manage_project(auth.uid(), p_project_id) then raise exception 'You cannot manage project access.'; end if;
  if p_level not in ('viewer','editor','manager') then raise exception 'Invalid project access level.'; end if;
  insert into public.project_access(project_id, user_id, access_level, granted_by, revoked_at)
  values (p_project_id, p_user_id, p_level, auth.uid(), null)
  on conflict (project_id, user_id) do update set access_level = excluded.access_level, granted_by = excluded.granted_by, revoked_at = null;
end;
$$;

create or replace function public.submit_contributor_request(p_project_id uuid, p_roles text[], p_message text default null)
returns uuid language sql security invoker set search_path = public, private, pg_temp as $$ select private.submit_contributor_request(p_project_id, p_roles, p_message); $$;
create or replace function public.review_contributor_request(p_request_id uuid, p_decision text, p_roles text[] default null)
returns void language sql security invoker set search_path = public, private, pg_temp as $$ select private.review_contributor_request(p_request_id, p_decision, p_roles); $$;
create or replace function public.cancel_contributor_request(p_request_id uuid)
returns void language sql security invoker set search_path = public, private, pg_temp as $$ select private.cancel_contributor_request(p_request_id); $$;
create or replace function public.grant_project_access(p_project_id uuid, p_user_id uuid, p_level text)
returns void language sql security invoker set search_path = public, private, pg_temp as $$ select private.grant_project_access(p_project_id, p_user_id, p_level); $$;

grant execute on function private.current_creative_member_id() to authenticated;
grant execute on function private.can_view_project(uuid, uuid) to authenticated;
grant execute on function private.can_edit_project(uuid, uuid) to authenticated;
grant execute on function private.can_manage_project(uuid, uuid) to authenticated;
grant execute on function private.submit_contributor_request(uuid, text[], text) to authenticated;
grant execute on function private.review_contributor_request(uuid, text, text[]) to authenticated;
grant execute on function private.cancel_contributor_request(uuid) to authenticated;
grant execute on function private.grant_project_access(uuid, uuid, text) to authenticated;
grant execute on function public.submit_contributor_request(uuid, text[], text) to authenticated;
grant execute on function public.review_contributor_request(uuid, text, text[]) to authenticated;
grant execute on function public.cancel_contributor_request(uuid) to authenticated;
grant execute on function public.grant_project_access(uuid, uuid, text) to authenticated;

alter table public.creative_members enable row level security;
drop policy if exists "Admins can manage creative members" on public.creative_members;
drop policy if exists "Creative members can update their own profile" on public.creative_members;
drop policy if exists "Creatives can read their own profile" on public.creative_members;
create policy "Creatives can read their own profile" on public.creative_members for select to authenticated using (id = private.current_creative_member_id());
create policy "Creative members can update their own profile" on public.creative_members for update to authenticated using (id = private.current_creative_member_id()) with check (id = private.current_creative_member_id());
create policy "Admins can manage creative members" on public.creative_members for all to authenticated using (private.can_manage_all_content(auth.uid())) with check (private.can_manage_all_content(auth.uid()));
drop trigger if exists creative_members_guard_self_update on public.creative_members;
create trigger creative_members_guard_self_update before update on public.creative_members for each row execute function private.guard_creative_self_update();

drop policy if exists "Team can read allowed projects" on public.projects;
drop policy if exists "Team can view accessible projects" on public.projects;
drop policy if exists "Team can update allowed projects" on public.projects;
create policy "Team can view accessible projects" on public.projects for select to authenticated using (private.can_view_project(auth.uid(), id));
create policy "Team can update allowed projects" on public.projects for update to authenticated using (private.can_edit_project(auth.uid(), id)) with check (private.can_edit_project(auth.uid(), id));

drop policy if exists "Team can manage project creative links" on public.project_creatives;
drop policy if exists "Team can read accessible project credits" on public.project_creatives;
create policy "Team can read accessible project credits" on public.project_creatives for select to authenticated using (private.can_view_project(auth.uid(), project_id));
create policy "Team can manage project creative links" on public.project_creatives for all to authenticated using (private.can_manage_project(auth.uid(), project_id)) with check (private.can_manage_project(auth.uid(), project_id));

alter table public.project_access enable row level security;
create policy "Users can read their project access" on public.project_access for select to authenticated using (user_id = auth.uid() or private.can_manage_project(auth.uid(), project_id));

alter table public.contributor_requests enable row level security;
create policy "Requesters and managers can read contributor requests" on public.contributor_requests for select to authenticated using (requester_user_id = auth.uid() or private.can_manage_project(auth.uid(), project_id));

notify pgrst, 'reload schema';