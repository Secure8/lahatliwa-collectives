create schema if not exists private;

revoke all on schema private from public;
grant usage on schema private to authenticated;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
begin
  if to_regclass('public.site_settings') is not null then
    execute 'drop policy if exists "Authenticated users can insert site settings" on public.site_settings';
    execute 'drop policy if exists "Authenticated users can update site settings" on public.site_settings';
    execute 'drop policy if exists "Authenticated users can delete site settings" on public.site_settings';
    execute 'drop policy if exists "Admins can insert site settings" on public.site_settings';
    execute 'drop policy if exists "Admins can update site settings" on public.site_settings';
    execute 'drop policy if exists "Admins can delete site settings" on public.site_settings';
    execute 'drop policy if exists "Site admins can insert site settings" on public.site_settings';
    execute 'drop policy if exists "Site admins can update site settings" on public.site_settings';
    execute 'drop policy if exists "Site admins can delete site settings" on public.site_settings';

    execute 'create policy "Site admins can insert site settings"
      on public.site_settings
      for insert
      to authenticated
      with check (private.has_role(auth.uid(), array[''super_admin'', ''admin'']))';

    execute 'create policy "Site admins can update site settings"
      on public.site_settings
      for update
      to authenticated
      using (private.has_role(auth.uid(), array[''super_admin'', ''admin'']))
      with check (private.has_role(auth.uid(), array[''super_admin'', ''admin'']))';

    execute 'create policy "Site admins can delete site settings"
      on public.site_settings
      for delete
      to authenticated
      using (private.has_role(auth.uid(), array[''super_admin'', ''admin'']))';
  end if;

  if to_regclass('public.page_content') is not null then
    execute 'drop policy if exists "Authenticated users can insert page content" on public.page_content';
    execute 'drop policy if exists "Authenticated users can update page content" on public.page_content';
    execute 'drop policy if exists "Authenticated users can delete page content" on public.page_content';
    execute 'drop policy if exists "Admins can insert page content" on public.page_content';
    execute 'drop policy if exists "Admins can update page content" on public.page_content';
    execute 'drop policy if exists "Admins can delete page content" on public.page_content';
    execute 'drop policy if exists "Site admins can insert page content" on public.page_content';
    execute 'drop policy if exists "Site admins can update page content" on public.page_content';
    execute 'drop policy if exists "Site admins can delete page content" on public.page_content';

    execute 'create policy "Site admins can insert page content"
      on public.page_content
      for insert
      to authenticated
      with check (private.has_role(auth.uid(), array[''super_admin'', ''admin'']))';

    execute 'create policy "Site admins can update page content"
      on public.page_content
      for update
      to authenticated
      using (private.has_role(auth.uid(), array[''super_admin'', ''admin'']))
      with check (private.has_role(auth.uid(), array[''super_admin'', ''admin'']))';

    execute 'create policy "Site admins can delete page content"
      on public.page_content
      for delete
      to authenticated
      using (private.has_role(auth.uid(), array[''super_admin'', ''admin'']))';
  end if;

  if to_regclass('public.media_assets') is not null then
    execute 'drop policy if exists "Authenticated users can insert media assets" on public.media_assets';
    execute 'drop policy if exists "Authenticated users can update media assets" on public.media_assets';
    execute 'drop policy if exists "Authenticated users can delete media assets" on public.media_assets';
    execute 'drop policy if exists "Admins can insert media assets" on public.media_assets';
    execute 'drop policy if exists "Admins can update media assets" on public.media_assets';
    execute 'drop policy if exists "Admins can delete media assets" on public.media_assets';
    execute 'drop policy if exists "Site admins can insert media assets" on public.media_assets';
    execute 'drop policy if exists "Site admins can update media assets" on public.media_assets';
    execute 'drop policy if exists "Site admins can delete media assets" on public.media_assets';

    execute 'create policy "Site admins can insert media assets"
      on public.media_assets
      for insert
      to authenticated
      with check (private.has_role(auth.uid(), array[''super_admin'', ''admin'']))';

    execute 'create policy "Site admins can update media assets"
      on public.media_assets
      for update
      to authenticated
      using (private.has_role(auth.uid(), array[''super_admin'', ''admin'']))
      with check (private.has_role(auth.uid(), array[''super_admin'', ''admin'']))';

    execute 'create policy "Site admins can delete media assets"
      on public.media_assets
      for delete
      to authenticated
      using (private.has_role(auth.uid(), array[''super_admin'', ''admin'']))';
  end if;

  if to_regclass('public.project_inquiries') is not null then
    execute 'drop policy if exists "Public can create project inquiries" on public.project_inquiries';
    execute 'drop policy if exists "Admins can manage project inquiries" on public.project_inquiries';
    execute 'drop policy if exists "Site admins can read project inquiries" on public.project_inquiries';
    execute 'drop policy if exists "Site admins can update project inquiries" on public.project_inquiries';
    execute 'drop policy if exists "Site admins can delete project inquiries" on public.project_inquiries';
    execute 'drop policy if exists "Public can submit valid project inquiries" on public.project_inquiries';

    execute 'create policy "Public can submit valid project inquiries"
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
        and status = ''new''
      )';

    execute 'create policy "Site admins can read project inquiries"
      on public.project_inquiries
      for select
      to authenticated
      using (private.has_role(auth.uid(), array[''super_admin'', ''admin'']))';

    execute 'create policy "Site admins can update project inquiries"
      on public.project_inquiries
      for update
      to authenticated
      using (private.has_role(auth.uid(), array[''super_admin'', ''admin'']))
      with check (private.has_role(auth.uid(), array[''super_admin'', ''admin'']))';

    execute 'create policy "Site admins can delete project inquiries"
      on public.project_inquiries
      for delete
      to authenticated
      using (private.has_role(auth.uid(), array[''super_admin'', ''admin'']))';
  end if;
end;
$$;

drop policy if exists "Public can read project media" on storage.objects;
drop policy if exists "Public can read project media objects" on storage.objects;
drop policy if exists "Authenticated users can upload project media" on storage.objects;
drop policy if exists "Authenticated users can update project media" on storage.objects;
drop policy if exists "Authenticated users can delete project media" on storage.objects;
drop policy if exists "Admins can upload project media" on storage.objects;
drop policy if exists "Admins can update project media" on storage.objects;
drop policy if exists "Admins can delete project media" on storage.objects;
drop policy if exists "Admins can upload project media objects" on storage.objects;
drop policy if exists "Admins can update project media objects" on storage.objects;
drop policy if exists "Admins can delete project media objects" on storage.objects;
drop policy if exists "Team can upload project media objects" on storage.objects;
drop policy if exists "Site admins can read project media objects" on storage.objects;
drop policy if exists "Site admins can update project media objects" on storage.objects;
drop policy if exists "Site admins can delete project media objects" on storage.objects;

create policy "Site admins can read project media objects"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'project-media'
  and private.has_role(auth.uid(), array['super_admin', 'admin'])
);

create policy "Team can upload project media objects"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'project-media'
  and private.has_role(auth.uid(), array['super_admin', 'admin', 'editor', 'creative'])
);

create policy "Site admins can update project media objects"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'project-media'
  and private.has_role(auth.uid(), array['super_admin', 'admin'])
)
with check (
  bucket_id = 'project-media'
  and private.has_role(auth.uid(), array['super_admin', 'admin'])
);

create policy "Site admins can delete project media objects"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'project-media'
  and private.has_role(auth.uid(), array['super_admin', 'admin'])
);

notify pgrst, 'reload schema';
