begin;

-- Creatives publish their own work. Super Admin can remove work for moderation,
-- but cannot create or edit Creative-owned projects.
create or replace function private.can_create_project(check_user_id uuid)
returns boolean language sql stable security definer set search_path = public, private, pg_temp as $$
  select exists(select 1 from public.admin_users where user_id=check_user_id and status='active' and role='creative');
$$;

create or replace function private.can_edit_project(check_user_id uuid, check_project_id uuid)
returns boolean language sql stable security definer set search_path = public, private, pg_temp as $$
  select exists(
    select 1 from public.admin_users account
    join public.projects project on project.id=check_project_id
    where account.user_id=check_user_id and account.status='active' and account.role='creative'
      and (project.owner_user_id=check_user_id or project.created_by=check_user_id or exists(
        select 1 from public.project_creatives credit
        where credit.project_id=check_project_id
          and coalesce(credit.creative_member_id,credit.creative_id)=account.creative_member_id
          and credit.is_primary=true
      ))
  );
$$;

create or replace function private.can_manage_project(check_user_id uuid, check_project_id uuid)
returns boolean language sql stable security definer set search_path = public, private, pg_temp as $$
  select exists(select 1 from public.admin_users where user_id=check_user_id and status='active' and role='super_admin')
    or private.can_edit_project(check_user_id,check_project_id);
$$;

revoke all on function private.can_create_project(uuid), private.can_edit_project(uuid,uuid), private.can_manage_project(uuid,uuid) from public,anon,authenticated;
grant execute on function private.can_create_project(uuid), private.can_edit_project(uuid,uuid), private.can_manage_project(uuid,uuid) to authenticated;

create table if not exists public.creative_join_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 100),
  email text not null,
  portfolio_url text,
  message text check (message is null or char_length(message) <= 1500),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists creative_join_requests_one_pending_email
  on public.creative_join_requests (lower(email)) where status = 'pending';

alter table public.creative_join_requests enable row level security;
revoke all on public.creative_join_requests from public, anon, authenticated;

create policy creative_join_requests_super_admin_read
  on public.creative_join_requests for select to authenticated
  using (exists (
    select 1 from public.admin_users account
    where account.user_id = auth.uid() and account.role = 'super_admin' and account.status = 'active'
  ));

create or replace function public.submit_creative_join_request(
  p_name text,
  p_email text,
  p_portfolio_url text default null,
  p_message text default null
) returns uuid
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  normalized_email text := lower(btrim(coalesce(p_email,'')));
  request_id uuid;
begin
  if char_length(btrim(coalesce(p_name,''))) not between 2 and 100 then
    raise exception 'Enter your name.';
  end if;
  if normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Enter a valid email address.';
  end if;
  if char_length(coalesce(p_message,'')) > 1500 then
    raise exception 'Keep your introduction within 1500 characters.';
  end if;
  if exists(select 1 from public.admin_users where lower(email)=normalized_email and status <> 'deleted') then
    raise exception 'An account or invitation already exists for this email.';
  end if;
  if exists(select 1 from public.creative_join_requests where lower(email)=normalized_email and status='pending') then
    raise exception 'A request from this email is already waiting for review.';
  end if;
  insert into public.creative_join_requests(name,email,portfolio_url,message)
  values(btrim(p_name),normalized_email,nullif(btrim(coalesce(p_portfolio_url,'')),''),nullif(btrim(coalesce(p_message,'')),''))
  returning id into request_id;
  return request_id;
end;
$$;

revoke all on function public.submit_creative_join_request(text,text,text,text) from public;
grant execute on function public.submit_creative_join_request(text,text,text,text) to anon, authenticated;

notify pgrst, 'reload schema';
commit;
