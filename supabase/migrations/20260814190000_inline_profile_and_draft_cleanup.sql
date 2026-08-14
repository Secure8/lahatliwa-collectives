begin;

alter table public.creative_members
  add column if not exists professional_details jsonb not null default '{"education":[],"experience":[],"achievements":[]}'::jsonb;

alter table public.creative_members drop constraint if exists creative_members_professional_details_object;
alter table public.creative_members add constraint creative_members_professional_details_object
  check (jsonb_typeof(professional_details) = 'object');

-- Private drafts can be discarded directly. Published work must still be
-- archived before permanent deletion.
create or replace function public.delete_creative_post(p_post_id uuid)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare post public.creative_posts; queued integer;
begin
  select * into post from public.creative_posts where id=p_post_id for update;
  if post.id is null or not private.owns_creative_post(auth.uid(),post.id) then
    raise exception 'CREATIVE_POST_NOT_AUTHORIZED' using errcode='42501';
  end if;
  if post.status not in ('draft','archived') then
    raise exception 'CREATIVE_POST_ARCHIVE_REQUIRED' using errcode='42501';
  end if;
  insert into public.storage_cleanup_jobs(provider,bucket_name,object_path,reason,created_by)
  select distinct 'cloudflare_r2',destination_bucket,external_file_id,'Creative post deleted',auth.uid()
  from public.external_media_objects where creative_post_id=post.id and provider='cloudflare_r2'
    and external_file_id is not null and destination_bucket is not null and status<>'deleted'
  on conflict do nothing;
  get diagnostics queued = row_count;
  update public.external_media_objects set status='cancelled',accounting_state='pending_cleanup',cleanup_status='pending',cleanup_error=null
  where creative_post_id=post.id and provider='cloudflare_r2' and status<>'deleted';
  delete from public.creative_posts where id=post.id;
  return jsonb_build_object('deleted',true,'queued',queued);
end;
$$;

revoke all on function public.delete_creative_post(uuid) from public, anon, service_role;
grant execute on function public.delete_creative_post(uuid) to authenticated;

drop policy if exists creative_posts_owner_delete on public.creative_posts;
create policy creative_posts_owner_delete on public.creative_posts for delete to authenticated
  using(private.owns_creative_post(auth.uid(),id) and status in ('draft','archived'));

notify pgrst, 'reload schema';
commit;
