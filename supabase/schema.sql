create extension if not exists "pgcrypto";

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  category text not null,
  description text not null,
  tools jsonb not null default '[]'::jsonb,
  cover_image text,
  gallery_images jsonb not null default '[]'::jsonb,
  gallery_items jsonb not null default '[]'::jsonb,
  video_url text,
  social_post_url text,
  live_url text,
  github_url text,
  project_date date,
  status text not null default 'draft' check (status in ('draft', 'published')),
  featured boolean not null default false,
  display_order integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists projects_status_idx on public.projects(status);
create index if not exists projects_featured_idx on public.projects(featured);
create index if not exists projects_featured_display_order_idx on public.projects(featured, display_order);
create index if not exists projects_gallery_items_idx on public.projects using gin(gallery_items);
create index if not exists projects_slug_idx on public.projects(slug);

alter table public.projects enable row level security;

drop policy if exists "Public can read published projects" on public.projects;
create policy "Public can read published projects"
on public.projects
for select
to anon
using (status = 'published');

drop policy if exists "Authenticated users can read all projects" on public.projects;
create policy "Authenticated users can read all projects"
on public.projects
for select
to authenticated
using (true);

drop policy if exists "Authenticated users can insert projects" on public.projects;
create policy "Authenticated users can insert projects"
on public.projects
for insert
to authenticated
with check (true);

drop policy if exists "Authenticated users can update projects" on public.projects;
create policy "Authenticated users can update projects"
on public.projects
for update
to authenticated
using (true)
with check (true);

drop policy if exists "Authenticated users can delete projects" on public.projects;
create policy "Authenticated users can delete projects"
on public.projects
for delete
to authenticated
using (true);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at
before update on public.projects
for each row
execute function public.set_updated_at();


drop policy if exists "Public can read project media" on storage.objects;
create policy "Public can read project media"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'project-media');

drop policy if exists "Authenticated users can upload project media" on storage.objects;
create policy "Authenticated users can upload project media"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'project-media');

drop policy if exists "Authenticated users can update project media" on storage.objects;
create policy "Authenticated users can update project media"
on storage.objects
for update
to authenticated
using (bucket_id = 'project-media')
with check (bucket_id = 'project-media');

drop policy if exists "Authenticated users can delete project media" on storage.objects;
create policy "Authenticated users can delete project media"
on storage.objects
for delete
to authenticated
using (bucket_id = 'project-media');

notify pgrst, 'reload schema';
