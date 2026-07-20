begin;

create or replace function public.delete_editorial_post(p_post_id uuid)
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_post public.editorial_posts;
begin
  select * into v_post from public.editorial_posts where id=p_post_id for update;
  if v_post.id is null then raise exception 'EDITORIAL_POST_NOT_FOUND'; end if;
  if not coalesce(private.has_editorial_capability(auth.uid(),'delete_any') or (private.has_editorial_capability(auth.uid(),'delete_own') and v_post.author_user_id=auth.uid()),false) then raise exception 'EDITORIAL_NOT_AUTHORIZED'; end if;

  insert into public.storage_cleanup_jobs(provider,bucket_name,object_path,project_id,reason,created_by)
  select distinct m.provider,m.destination_bucket,m.external_file_id,null,'Editorial post deleted',auth.uid()
  from public.external_media_objects m
  where m.editorial_post_id=p_post_id and m.provider='cloudflare_r2'
    and m.external_file_id is not null and m.destination_bucket is not null and m.status<>'deleted'
  on conflict do nothing;

  update public.external_media_objects set status='cancelled',accounting_state='pending_cleanup',cleanup_status='pending',cleanup_error=null
  where editorial_post_id=p_post_id and provider='cloudflare_r2' and status<>'deleted';

  insert into public.editorial_audit_events(actor_user_id,post_id,action,from_status,to_status,details)
  values(auth.uid(),p_post_id,'delete',v_post.status,null,jsonb_build_object('deletedPostId',v_post.id,'title',v_post.title,'contentType',v_post.content_type,'authorUserId',v_post.author_user_id,'wasPublished',v_post.published_revision_id is not null));
  delete from public.editorial_posts where id=p_post_id;
  return jsonb_build_object('id',p_post_id,'deleted',true);
end;
$$;

revoke all on function public.delete_editorial_post(uuid) from public,anon,service_role;
grant execute on function public.delete_editorial_post(uuid) to authenticated;
comment on function public.delete_editorial_post(uuid) is 'Deletes an owned Editorial post transactionally and queues its managed R2 media for cleanup; Super Admin retains cross-account authority.';
notify pgrst,'reload schema';
commit;
