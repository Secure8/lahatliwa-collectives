begin;

create or replace function public.restore_archived_editorial_post(p_post_id uuid)
returns public.editorial_posts
language plpgsql
security definer
set search_path=public,private,pg_temp
as $$
declare
  v_post public.editorial_posts;
begin
  if not private.has_editorial_capability(auth.uid(),'manage_settings') then
    raise exception 'EDITORIAL_NOT_AUTHORIZED';
  end if;

  select * into v_post
  from public.editorial_posts
  where id=p_post_id
  for update;

  if not found then
    raise exception 'EDITORIAL_POST_NOT_FOUND';
  end if;
  if v_post.status<>'archived' then
    raise exception 'EDITORIAL_RESTORE_NOT_ALLOWED';
  end if;
  if v_post.current_revision_id is null then
    raise exception 'EDITORIAL_REVISION_REQUIRED';
  end if;

  perform set_config('app.editorial_workflow','1',true);
  update public.editorial_posts
  set status='draft',updated_at=now()
  where id=p_post_id
  returning * into v_post;

  insert into public.editorial_audit_events(actor_user_id,post_id,action,from_status,to_status,details)
  values(
    auth.uid(),
    p_post_id,
    'restore_to_draft',
    'archived',
    'draft',
    jsonb_build_object(
      'archivedAt',v_post.archived_at,
      'currentRevisionId',v_post.current_revision_id,
      'publishedRevisionId',v_post.published_revision_id
    )
  );

  return v_post;
end;
$$;

revoke all on function public.restore_archived_editorial_post(uuid) from public,anon,service_role;
grant execute on function public.restore_archived_editorial_post(uuid) to authenticated;

comment on function public.restore_archived_editorial_post(uuid) is
  'Restores one archived editorial post in place to an editable draft. Admin or Super Admin only; the archived public snapshot remains hidden until the post is published again.';

commit;
