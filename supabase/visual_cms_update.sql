alter table public.site_settings
add column if not exists primary_text_color text,
add column if not exists secondary_text_color text,
add column if not exists accent_color text,
add column if not exists muted_text_color text,
add column if not exists divider_line_color text,
add column if not exists default_background_image_url text,
add column if not exists default_background_overlay_opacity numeric default 0.55;

alter table public.site_settings
add column if not exists show_hero_portrait boolean not null default false;

alter table public.projects
add column if not exists display_order integer;

create index if not exists projects_featured_display_order_idx
on public.projects(featured, display_order);

create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null default 'icon',
  category text,
  url text not null,
  storage_path text,
  alt_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists media_assets_type_idx on public.media_assets(type);
create index if not exists media_assets_category_idx on public.media_assets(category);

alter table public.media_assets enable row level security;

drop policy if exists "Public can read media assets" on public.media_assets;
create policy "Public can read media assets"
on public.media_assets
for select
to anon, authenticated
using (true);

drop policy if exists "Authenticated users can insert media assets" on public.media_assets;
create policy "Authenticated users can insert media assets"
on public.media_assets
for insert
to authenticated
with check (true);

drop policy if exists "Authenticated users can update media assets" on public.media_assets;
create policy "Authenticated users can update media assets"
on public.media_assets
for update
to authenticated
using (true)
with check (true);

drop policy if exists "Authenticated users can delete media assets" on public.media_assets;
create policy "Authenticated users can delete media assets"
on public.media_assets
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

drop trigger if exists media_assets_set_updated_at on public.media_assets;
create trigger media_assets_set_updated_at
before update on public.media_assets
for each row
execute function public.set_updated_at();

notify pgrst, 'reload schema';
