create extension if not exists "pgcrypto";

alter table public.admin_users
add column if not exists role text not null default 'admin',
add column if not exists display_name text,
add column if not exists avatar_url text;

alter table public.admin_users
drop constraint if exists admin_users_role_check;

alter table public.admin_users
add constraint admin_users_role_check
check (role in ('owner', 'admin', 'editor', 'creative'));

create schema if not exists private;

revoke all on schema private from public;
grant usage on schema private to authenticated;

do $$
begin
  if to_regprocedure('private.is_admin(uuid)') is null then
    execute $fn$
      create function private.is_admin(check_user_id uuid)
      returns boolean
      language sql
      stable
      security definer
      set search_path = public, private, pg_temp
      as $body$
        select exists (
          select 1
          from public.admin_users
          where user_id = check_user_id
          and role in ('owner', 'admin')
        );
      $body$;
    $fn$;
  end if;

  if to_regprocedure('private.is_owner(uuid)') is null then
    execute $fn$
      create function private.is_owner(check_user_id uuid)
      returns boolean
      language sql
      stable
      security definer
      set search_path = public, private, pg_temp
      as $body$
        select exists (
          select 1
          from public.admin_users
          where user_id = check_user_id
          and role = 'owner'
        );
      $body$;
    $fn$;
  end if;
end;
$$;

revoke all on function private.is_admin(uuid) from public;
revoke all on function private.is_owner(uuid) from public;
grant execute on function private.is_admin(uuid) to authenticated;
grant execute on function private.is_owner(uuid) to authenticated;

create table if not exists public.creative_members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  role text not null,
  short_bio text,
  full_bio text,
  profile_image_url text,
  skills jsonb not null default '[]'::jsonb,
  social_links jsonb not null default '[]'::jsonb,
  availability_status text,
  is_featured boolean not null default false,
  is_published boolean not null default false,
  display_order integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.service_branches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  included_services jsonb not null default '[]'::jsonb,
  icon_url text,
  image_url text,
  cta_label text,
  cta_url text,
  display_order integer,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_inquiries (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email_or_contact text not null,
  organization text,
  project_type text not null,
  budget_range text,
  deadline date,
  preferred_contact text,
  message text not null,
  status text not null default 'new' check (status in ('new', 'reviewed', 'contacted', 'accepted', 'declined', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_creatives (
  project_id uuid not null references public.projects(id) on delete cascade,
  creative_id uuid not null references public.creative_members(id) on delete cascade,
  contribution_role text,
  credit_roles text[] not null default '{}'::text[],
  display_order integer,
  created_at timestamptz not null default now(),
  primary key (project_id, creative_id)
);

create index if not exists creative_members_published_order_idx on public.creative_members(is_published, display_order);
create index if not exists service_branches_published_order_idx on public.service_branches(is_published, display_order);
create index if not exists project_inquiries_status_idx on public.project_inquiries(status);
create index if not exists project_creatives_project_idx on public.project_creatives(project_id);
create index if not exists project_creatives_creative_idx on public.project_creatives(creative_id);

alter table public.creative_members enable row level security;
alter table public.service_branches enable row level security;
alter table public.project_inquiries enable row level security;
alter table public.project_creatives enable row level security;

drop policy if exists "Public can read published creative members" on public.creative_members;
create policy "Public can read published creative members"
on public.creative_members
for select
to anon, authenticated
using (is_published = true);

drop policy if exists "Admins can manage creative members" on public.creative_members;
create policy "Admins can manage creative members"
on public.creative_members
for all
to authenticated
using (private.is_admin(auth.uid()))
with check (private.is_admin(auth.uid()));

drop policy if exists "Public can read published service branches" on public.service_branches;
create policy "Public can read published service branches"
on public.service_branches
for select
to anon, authenticated
using (is_published = true);

drop policy if exists "Admins can manage service branches" on public.service_branches;
create policy "Admins can manage service branches"
on public.service_branches
for all
to authenticated
using (private.is_admin(auth.uid()))
with check (private.is_admin(auth.uid()));

drop policy if exists "Public can create project inquiries" on public.project_inquiries;
create policy "Public can create project inquiries"
on public.project_inquiries
for insert
to anon, authenticated
with check (
  char_length(trim(name)) between 2 and 120
  and char_length(trim(email_or_contact)) between 3 and 200
  and char_length(trim(project_type)) between 2 and 120
  and char_length(trim(message)) between 10 and 5000
  and (organization is null or char_length(trim(organization)) <= 160)
  and (budget_range is null or char_length(trim(budget_range)) <= 120)
  and (preferred_contact is null or char_length(trim(preferred_contact)) <= 120)
  and status = 'new'
);

drop policy if exists "Admins can manage project inquiries" on public.project_inquiries;
create policy "Admins can manage project inquiries"
on public.project_inquiries
for all
to authenticated
using (private.is_admin(auth.uid()))
with check (private.is_admin(auth.uid()));

drop policy if exists "Public can read project creative links" on public.project_creatives;
create policy "Public can read project creative links"
on public.project_creatives
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.projects
    where projects.id = project_creatives.project_id
    and projects.status = 'published'
  )
);

drop policy if exists "Admins can manage project creative links" on public.project_creatives;
create policy "Admins can manage project creative links"
on public.project_creatives
for all
to authenticated
using (private.is_admin(auth.uid()))
with check (private.is_admin(auth.uid()));

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists creative_members_set_updated_at on public.creative_members;
create trigger creative_members_set_updated_at
before update on public.creative_members
for each row
execute function public.set_updated_at();

drop trigger if exists service_branches_set_updated_at on public.service_branches;
create trigger service_branches_set_updated_at
before update on public.service_branches
for each row
execute function public.set_updated_at();

drop trigger if exists project_inquiries_set_updated_at on public.project_inquiries;
create trigger project_inquiries_set_updated_at
before update on public.project_inquiries
for each row
execute function public.set_updated_at();

insert into public.service_branches (name, slug, description, included_services, display_order, is_published, cta_label, cta_url)
values
  ('Lahat Liwa Studio', 'lahat-liwa-studio', 'Photography, photo editing, and video coverage for events, campaigns, and visual stories.', '["Photography", "Photo editing", "Video shoot/editing", "Event highlights"]'::jsonb, 100, true, 'Start a studio project', '/start-a-project'),
  ('Lahat Liwa Social', 'lahat-liwa-social', 'Social media management, content planning, page rebuilding, and digital marketing support.', '["Social media management", "Content planning", "Page rebuilding", "Digital marketing support"]'::jsonb, 200, true, 'Plan social content', '/start-a-project'),
  ('Lahat Liwa Web', 'lahat-liwa-web', 'Portfolio websites, business websites, CMS systems, and landing pages for growing teams.', '["Portfolio websites", "Business websites", "CMS systems", "Landing pages"]'::jsonb, 300, true, 'Build a website', '/start-a-project'),
  ('Lahat Liwa Tech', 'lahat-liwa-tech', 'Simple technical help for devices, software setup, and everyday computer support.', '["IT Technician Services", "Computer Support", "Software / System Assistance", "Device Setup"]'::jsonb, 400, true, 'Get tech support', '/start-a-project')
on conflict (slug) do nothing;

notify pgrst, 'reload schema';
