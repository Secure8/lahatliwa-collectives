begin;

-- Fix a SQL three-valued-logic gap in the Save Draft authorization check.
-- When assigned_editor_user_id was NULL, NOT(false OR false OR NULL) evaluated
-- to NULL and the IF branch did not reject an unrelated authenticated account.
create or replace function public.save_editorial_revision(
  p_post_id uuid,
  p_document jsonb,
  p_seo_title text default '',
  p_seo_description text default '',
  p_editor_note text default '',
  p_expected_current_revision_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns public.editorial_revisions
language plpgsql
security definer
set search_path=public,private,pg_temp
as $$
declare v_post public.editorial_posts; v_revision public.editorial_revisions; v_number integer;
begin
  select * into v_post from public.editorial_posts where id=p_post_id for update;
  if v_post.id is not null and v_post.status='published' and coalesce(v_post.author_user_id=auth.uid() or private.has_editorial_capability(auth.uid(),'manage_all'),false) then
    perform set_config('app.editorial_workflow','1',true);
    update public.editorial_posts set status='draft',updated_at=now() where id=p_post_id returning * into v_post;
    insert into public.editorial_audit_events(actor_user_id,post_id,action,from_status,to_status,details) values(auth.uid(),p_post_id,'start_revision','published','draft','{}'::jsonb);
  end if;
  if v_post.id is null or v_post.status not in('draft','needs_revision')
     or not coalesce(private.has_editorial_capability(auth.uid(),'manage_all') or v_post.author_user_id=auth.uid() or v_post.assigned_editor_user_id=auth.uid(),false)
  then raise exception 'EDITORIAL_NOT_AUTHORIZED'; end if;
  if v_post.status in ('published','archived') then raise exception 'EDITORIAL_REVISION_LOCKED'; end if;
  if v_post.current_revision_id is distinct from p_expected_current_revision_id then raise exception 'EDITORIAL_REVISION_CONFLICT'; end if;
  if not private.valid_editorial_document(p_document) then raise exception 'EDITORIAL_DOCUMENT_INVALID'; end if;
  if p_metadata='{}'::jsonb then p_metadata:=jsonb_build_object('title',v_post.title,'slug',v_post.slug,'summary',v_post.summary,'coverImageUrl',v_post.cover_image_url,'coverImageAlt',v_post.cover_image_alt,'categoryId',v_post.category_id,'municipalityId',v_post.municipality_id,'assignedEditorUserId',v_post.assigned_editor_user_id); end if;
  if jsonb_typeof(p_metadata)<>'object' or length(btrim(coalesce(p_metadata->>'title',''))) not between 2 and 180
     or coalesce(p_metadata->>'slug','') !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' or length(coalesce(p_metadata->>'summary',''))>500
     or length(coalesce(p_metadata->>'coverImageAlt',''))>240 or (coalesce(p_metadata->>'coverImageUrl','')<>'' and not ((p_metadata->>'coverImageUrl') ~ '^https://[^[:space:]<>"'']+$' or (p_metadata->>'coverImageUrl') ~ '^/([^/]|$)')) then raise exception 'EDITORIAL_METADATA_INVALID'; end if;
  perform set_config('app.editorial_workflow','1',true);
  update public.editorial_posts set title=btrim(p_metadata->>'title'),slug=p_metadata->>'slug',summary=coalesce(p_metadata->>'summary',''),
    cover_image_url=nullif(p_metadata->>'coverImageUrl',''),cover_image_alt=coalesce(p_metadata->>'coverImageAlt',''),
    category_id=nullif(p_metadata->>'categoryId','')::uuid,municipality_id=nullif(p_metadata->>'municipalityId','')::uuid,
    assigned_editor_user_id=nullif(p_metadata->>'assignedEditorUserId','')::uuid,updated_at=now() where id=p_post_id;
  select coalesce(max(revision_number),0)+1 into v_number from public.editorial_revisions where post_id=p_post_id;
  insert into public.editorial_revisions(post_id,revision_number,document,seo_title,seo_description,editor_note,created_by)
  values(p_post_id,v_number,p_document,left(coalesce(p_seo_title,''),180),left(coalesce(p_seo_description,''),320),left(coalesce(p_editor_note,''),2000),auth.uid()) returning * into v_revision;
  perform set_config('app.editorial_workflow','1',true);
  update public.editorial_posts set current_revision_id=v_revision.id,updated_at=now() where id=p_post_id;
  insert into public.editorial_audit_events(actor_user_id,post_id,action,from_status,to_status,details) values(auth.uid(),p_post_id,'revision_saved',v_post.status,v_post.status,jsonb_build_object('revision',v_number));
  return v_revision;
end;
$$;

revoke all on function public.save_editorial_revision(uuid,jsonb,text,text,text,uuid,jsonb) from public,anon,service_role;
grant execute on function public.save_editorial_revision(uuid,jsonb,text,text,text,uuid,jsonb) to authenticated;

comment on function public.save_editorial_revision(uuid,jsonb,text,text,text,uuid,jsonb) is
  'Creates immutable Editorial revisions after a null-safe active-role, author, or assignee authorization check.';

-- Rollback: restore the preceding function body only after confirming the
-- replacement retains this null-safe authorization check. No row rollback is
-- necessary because this migration changes no Editorial records.

commit;
