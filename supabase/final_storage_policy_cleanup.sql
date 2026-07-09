drop policy if exists "Public can read project media" on storage.objects;
drop policy if exists "Public can read project media objects" on storage.objects;
drop policy if exists "Site admins can read project media objects" on storage.objects;
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
