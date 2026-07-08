create extension if not exists "pgcrypto";

create table if not exists public.site_settings (
  id uuid primary key default gen_random_uuid(),
  brand_name text not null default 'Hevv Ching',
  personal_name text not null default 'Jevin Coching',
  tagline text,
  logo_url text,
  logo_alt text,
  hero_image_url text,
  hero_image_alt text,
  contact_email text,
  github_url text,
  facebook_url text,
  instagram_url text,
  linkedin_url text,
  youtube_url text,
  tiktok_url text,
  footer_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.page_content (
  id uuid primary key default gen_random_uuid(),
  page_key text not null unique check (page_key in ('home', 'about', 'services', 'contact')),
  content jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.site_settings enable row level security;
alter table public.page_content enable row level security;

drop policy if exists "Public can read site settings" on public.site_settings;
create policy "Public can read site settings"
on public.site_settings
for select
to anon, authenticated
using (true);

drop policy if exists "Authenticated users can insert site settings" on public.site_settings;
create policy "Authenticated users can insert site settings"
on public.site_settings
for insert
to authenticated
with check (true);

drop policy if exists "Authenticated users can update site settings" on public.site_settings;
create policy "Authenticated users can update site settings"
on public.site_settings
for update
to authenticated
using (true)
with check (true);

drop policy if exists "Authenticated users can delete site settings" on public.site_settings;
create policy "Authenticated users can delete site settings"
on public.site_settings
for delete
to authenticated
using (true);

drop policy if exists "Public can read page content" on public.page_content;
create policy "Public can read page content"
on public.page_content
for select
to anon, authenticated
using (true);

drop policy if exists "Authenticated users can insert page content" on public.page_content;
create policy "Authenticated users can insert page content"
on public.page_content
for insert
to authenticated
with check (true);

drop policy if exists "Authenticated users can update page content" on public.page_content;
create policy "Authenticated users can update page content"
on public.page_content
for update
to authenticated
using (true)
with check (true);

drop policy if exists "Authenticated users can delete page content" on public.page_content;
create policy "Authenticated users can delete page content"
on public.page_content
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

drop trigger if exists site_settings_set_updated_at on public.site_settings;
create trigger site_settings_set_updated_at
before update on public.site_settings
for each row
execute function public.set_updated_at();

drop trigger if exists page_content_set_updated_at on public.page_content;
create trigger page_content_set_updated_at
before update on public.page_content
for each row
execute function public.set_updated_at();

notify pgrst, 'reload schema';
