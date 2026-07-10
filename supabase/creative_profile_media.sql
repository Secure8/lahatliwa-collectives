-- Self-managed creative profile media. Run after creative_access_contributor_requests.sql.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

-- Keep existing project uploads available to the team, but reserve profile folders for their owner.
drop policy if exists "Team can upload project media objects" on storage.objects;
create policy "Team can upload project media objects"
on storage.objects for insert to authenticated with check (
  bucket_id = 'project-media' and (
    private.has_role(auth.uid(), array['super_admin', 'admin'])
    or (name like 'projects/%' and private.has_role(auth.uid(), array['editor', 'creative']))
    or (name like ('creative-profiles/' || auth.uid()::text || '/%') and private.current_creative_member_id() is not null)
  )
);

drop policy if exists "Creatives can update own profile media" on storage.objects;
drop policy if exists "Creatives can delete own profile media" on storage.objects;
create policy "Creatives can update own profile media"
on storage.objects for update to authenticated
using (bucket_id = 'project-media' and name like ('creative-profiles/' || auth.uid()::text || '/%') and private.current_creative_member_id() is not null)
with check (bucket_id = 'project-media' and name like ('creative-profiles/' || auth.uid()::text || '/%') and private.current_creative_member_id() is not null);
create policy "Creatives can delete own profile media"
on storage.objects for delete to authenticated
using (bucket_id = 'project-media' and name like ('creative-profiles/' || auth.uid()::text || '/%') and private.current_creative_member_id() is not null);

notify pgrst, 'reload schema';
