begin;

create or replace function private.validate_editorial_homepage_slide()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare selected_post public.editorial_posts%rowtype;
begin
  new.eyebrow := btrim(coalesce(new.eyebrow,''));
  new.description := btrim(coalesce(new.description,''));
  new.updated_at := now();
  new.updated_by := auth.uid();
  if new.post_id is null then new.enabled := false; return new; end if;
  select * into selected_post from public.editorial_posts where id = new.post_id;
  if not found or selected_post.content_type <> new.slot_type then
    raise exception using errcode='22023', message='The selected story does not match this slideshow slot.';
  end if;
  if selected_post.published_revision_id is null or selected_post.published_at is null
     or selected_post.archived_at is not null or selected_post.status <> 'published' then
    raise exception using errcode='22023', message='Only a currently published story can be selected.';
  end if;
  return new;
end;
$$;

create or replace function public.delete_editorial_post(p_post_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_post public.editorial_posts%rowtype;
  v_cleared_slides integer := 0;
  v_cleanup_jobs integer := 0;
begin
  select * into v_post from public.editorial_posts where id=p_post_id for update;
  if v_post.id is null then raise exception using errcode='P0002',message='EDITORIAL_POST_NOT_FOUND'; end if;
  if not coalesce(
    private.has_editorial_capability(auth.uid(),'delete_any')
    or (private.has_editorial_capability(auth.uid(),'delete_own') and v_post.author_user_id=auth.uid()),
    false
  ) then raise exception using errcode='42501',message='EDITORIAL_NOT_AUTHORIZED'; end if;
  if v_post.status <> 'archived' then raise exception using errcode='P0001',message='EDITORIAL_ARCHIVE_REQUIRED'; end if;

  update public.editorial_homepage_slides set post_id=null,enabled=false where post_id=p_post_id;
  get diagnostics v_cleared_slides = row_count;

  insert into public.storage_cleanup_jobs(provider,bucket_name,object_path,project_id,reason,created_by)
  select distinct m.provider,m.destination_bucket,m.external_file_id,null::uuid,'Editorial story deleted',auth.uid()
  from public.external_media_objects m
  where m.editorial_post_id=p_post_id and m.provider='cloudflare_r2'
    and m.external_file_id is not null and m.destination_bucket is not null and m.status<>'deleted'
  on conflict do nothing;
  get diagnostics v_cleanup_jobs = row_count;

  update public.external_media_objects
  set status='cancelled',accounting_state='pending_cleanup',cleanup_status='pending',cleanup_error=null
  where editorial_post_id=p_post_id and provider='cloudflare_r2' and status<>'deleted';

  insert into public.editorial_audit_events(actor_user_id,post_id,action,from_status,to_status,details)
  values(auth.uid(),null,'delete','archived',null,jsonb_build_object(
    'deletedPostId',v_post.id,
    'title',v_post.title,
    'contentType',v_post.content_type,
    'authorUserId',v_post.author_user_id,
    'wasPublished',v_post.published_revision_id is not null,
    'homepageSlidesCleared',v_cleared_slides,
    'mediaCleanupJobsQueued',v_cleanup_jobs
  ));

  update public.editorial_posts
  set current_revision_id=null,published_revision_id=null,scheduled_revision_id=null
  where id=p_post_id;
  delete from public.editorial_posts where id=p_post_id;
  return jsonb_build_object('id',p_post_id,'deleted',true,'homepageSlidesCleared',v_cleared_slides,'mediaCleanupJobsQueued',v_cleanup_jobs);
exception
  when foreign_key_violation then
    raise exception using errcode='23503',message='EDITORIAL_RELATED_RECORDS';
end;
$$;

revoke all on function public.delete_editorial_post(uuid) from public,anon,service_role;
grant execute on function public.delete_editorial_post(uuid) to authenticated;
revoke all on function private.validate_editorial_homepage_slide() from public,anon,authenticated;

comment on function public.delete_editorial_post(uuid) is
  'Deletes an archived Editorial story for its active owner or Super Admin, clears homepage references, preserves a sanitized audit marker, and queues managed R2 media cleanup.';

notify pgrst,'reload schema';
commit;
