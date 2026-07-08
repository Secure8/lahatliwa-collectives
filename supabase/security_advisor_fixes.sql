create schema if not exists private;

revoke all on schema private from public;
grant usage on schema private to authenticated;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function private.is_admin(check_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select exists (
    select 1
    from public.admin_users
    where user_id = check_user_id
  );
$$;

create or replace function private.is_owner(check_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select exists (
    select 1
    from public.admin_users
    where user_id = check_user_id
    and role = 'owner'
  );
$$;

revoke all on function private.is_admin(uuid) from public;
revoke all on function private.is_owner(uuid) from public;
grant execute on function private.is_admin(uuid) to authenticated;
grant execute on function private.is_owner(uuid) to authenticated;

do $$
begin
  if to_regprocedure('public.is_admin(uuid)') is not null then
    execute 'alter function public.is_admin(uuid) set search_path = public, pg_temp';
    execute 'revoke execute on function public.is_admin(uuid) from anon';
    execute 'revoke execute on function public.is_admin(uuid) from authenticated';
    execute 'revoke execute on function public.is_admin(uuid) from public';
  end if;

  if to_regprocedure('public.is_owner(uuid)') is not null then
    execute 'alter function public.is_owner(uuid) set search_path = public, pg_temp';
    execute 'revoke execute on function public.is_owner(uuid) from anon';
    execute 'revoke execute on function public.is_owner(uuid) from authenticated';
    execute 'revoke execute on function public.is_owner(uuid) from public';
  end if;
end;
$$;

drop policy if exists "Admins can read admin users" on public.admin_users;
create policy "Admins can read admin users"
on public.admin_users
for select
to authenticated
using (private.is_admin(auth.uid()) or user_id = auth.uid());

drop policy if exists "Owners can insert admin users" on public.admin_users;
create policy "Owners can insert admin users"
on public.admin_users
for insert
to authenticated
with check (private.is_owner(auth.uid()));

drop policy if exists "Owners can update admin users" on public.admin_users;
create policy "Owners can update admin users"
on public.admin_users
for update
to authenticated
using (private.is_owner(auth.uid()))
with check (private.is_owner(auth.uid()));

drop policy if exists "Owners can delete admin users" on public.admin_users;
create policy "Owners can delete admin users"
on public.admin_users
for delete
to authenticated
using (private.is_owner(auth.uid()));

drop policy if exists "Authenticated users can read all projects" on public.projects;
drop policy if exists "Authenticated users can insert projects" on public.projects;
drop policy if exists "Authenticated users can update projects" on public.projects;
drop policy if exists "Authenticated users can delete projects" on public.projects;
drop policy if exists "Admins can read all projects" on public.projects;
drop policy if exists "Admins can insert projects" on public.projects;
drop policy if exists "Admins can update projects" on public.projects;
drop policy if exists "Admins can delete projects" on public.projects;

create policy "Admins can read all projects"
on public.projects
for select
to authenticated
using (private.is_admin(auth.uid()));

create policy "Admins can insert projects"
on public.projects
for insert
to authenticated
with check (private.is_admin(auth.uid()));

create policy "Admins can update projects"
on public.projects
for update
to authenticated
using (private.is_admin(auth.uid()))
with check (private.is_admin(auth.uid()));

create policy "Admins can delete projects"
on public.projects
for delete
to authenticated
using (private.is_admin(auth.uid()));

drop policy if exists "Authenticated users can insert site settings" on public.site_settings;
drop policy if exists "Authenticated users can update site settings" on public.site_settings;
drop policy if exists "Authenticated users can delete site settings" on public.site_settings;
drop policy if exists "Admins can insert site settings" on public.site_settings;
drop policy if exists "Admins can update site settings" on public.site_settings;
drop policy if exists "Admins can delete site settings" on public.site_settings;

create policy "Admins can insert site settings"
on public.site_settings
for insert
to authenticated
with check (private.is_admin(auth.uid()));

create policy "Admins can update site settings"
on public.site_settings
for update
to authenticated
using (private.is_admin(auth.uid()))
with check (private.is_admin(auth.uid()));

create policy "Admins can delete site settings"
on public.site_settings
for delete
to authenticated
using (private.is_admin(auth.uid()));

drop policy if exists "Authenticated users can insert page content" on public.page_content;
drop policy if exists "Authenticated users can update page content" on public.page_content;
drop policy if exists "Authenticated users can delete page content" on public.page_content;
drop policy if exists "Admins can insert page content" on public.page_content;
drop policy if exists "Admins can update page content" on public.page_content;
drop policy if exists "Admins can delete page content" on public.page_content;

create policy "Admins can insert page content"
on public.page_content
for insert
to authenticated
with check (private.is_admin(auth.uid()));

create policy "Admins can update page content"
on public.page_content
for update
to authenticated
using (private.is_admin(auth.uid()))
with check (private.is_admin(auth.uid()));

create policy "Admins can delete page content"
on public.page_content
for delete
to authenticated
using (private.is_admin(auth.uid()));

drop policy if exists "Authenticated users can insert media assets" on public.media_assets;
drop policy if exists "Authenticated users can update media assets" on public.media_assets;
drop policy if exists "Authenticated users can delete media assets" on public.media_assets;
drop policy if exists "Admins can insert media assets" on public.media_assets;
drop policy if exists "Admins can update media assets" on public.media_assets;
drop policy if exists "Admins can delete media assets" on public.media_assets;

create policy "Admins can insert media assets"
on public.media_assets
for insert
to authenticated
with check (private.is_admin(auth.uid()));

create policy "Admins can update media assets"
on public.media_assets
for update
to authenticated
using (private.is_admin(auth.uid()))
with check (private.is_admin(auth.uid()));

create policy "Admins can delete media assets"
on public.media_assets
for delete
to authenticated
using (private.is_admin(auth.uid()));

drop policy if exists "Public can read project media" on storage.objects;
drop policy if exists "Admins can read project media objects" on storage.objects;
drop policy if exists "Admins can upload project media objects" on storage.objects;
drop policy if exists "Admins can update project media objects" on storage.objects;
drop policy if exists "Admins can delete project media objects" on storage.objects;
drop policy if exists "Authenticated users can upload project media" on storage.objects;
drop policy if exists "Authenticated users can update project media" on storage.objects;
drop policy if exists "Authenticated users can delete project media" on storage.objects;
drop policy if exists "Admins can upload project media" on storage.objects;
drop policy if exists "Admins can update project media" on storage.objects;
drop policy if exists "Admins can delete project media" on storage.objects;

create policy "Admins can read project media objects"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'project-media'
  and private.is_admin(auth.uid())
);

create policy "Admins can upload project media objects"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'project-media'
  and private.is_admin(auth.uid())
);

create policy "Admins can update project media objects"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'project-media'
  and private.is_admin(auth.uid())
)
with check (
  bucket_id = 'project-media'
  and private.is_admin(auth.uid())
);

create policy "Admins can delete project media objects"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'project-media'
  and private.is_admin(auth.uid())
);

notify pgrst, 'reload schema';
