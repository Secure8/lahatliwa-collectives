begin;

alter table public.admin_users
  add column if not exists editorial_roles text[] not null default '{}'::text[];
alter table public.admin_users drop constraint if exists admin_users_editorial_roles_check;
alter table public.admin_users add constraint admin_users_editorial_roles_check
  check(editorial_roles <@ array['creative','writer','editor']::text[] and cardinality(editorial_roles)<=3);

create or replace function private.guard_editorial_role_assignment()
returns trigger language plpgsql security definer set search_path=public,private,pg_temp as $$
begin
  if ((tg_op='INSERT' and cardinality(new.editorial_roles)>0) or (tg_op='UPDATE' and new.editorial_roles is distinct from old.editorial_roles))
     and auth.role()<>'service_role'
     and not exists(select 1 from public.admin_users where user_id=auth.uid() and status='active' and role in('owner','super_admin'))
  then raise exception 'SUPER_ADMIN_REQUIRED' using errcode='42501'; end if;
  return new;
end;
$$;
drop trigger if exists guard_admin_user_editorial_roles on public.admin_users;
create trigger guard_admin_user_editorial_roles before insert or update of editorial_roles on public.admin_users for each row execute function private.guard_editorial_role_assignment();

-- Editorial members own their private workspace. Super Admin is the only
-- cross-account content operator; administrative taxonomy/settings access is
-- intentionally separate from content ownership.
create or replace function private.has_editorial_capability(p_user_id uuid,p_capability text)
returns boolean language plpgsql stable security definer set search_path=public,private,pg_temp as $$
declare v_role text; v_roles text[];
begin
  select case when role='owner' then 'super_admin' else role end,
    coalesce(editorial_roles,'{}'::text[]) || array[case when role='owner' then 'super_admin' else role end]
  into v_role,v_roles from public.admin_users where user_id=p_user_id and status='active' limit 1;
  if v_role is null then return false; end if;
  if p_capability in ('enter','create','edit_own','submit','publish','unpublish','archive','restore_own','delete_own','manage_sources') then
    return v_roles && array['super_admin','admin','editor','writer']::text[];
  elsif p_capability in ('review','schedule') then
    return v_roles && array['super_admin','admin','editor','writer']::text[];
  elsif p_capability='manage_homepage' then
    return v_roles && array['super_admin','admin','editor']::text[];
  elsif p_capability='edit_assigned' then
    return v_role='super_admin';
  elsif p_capability in ('manage_taxonomy','manage_contributors','manage_settings') then
    return v_role in ('super_admin','admin');
  elsif p_capability in ('manage_all','view_audit','delete_any') then
    return v_role='super_admin';
  end if;
  return false;
end;
$$;

create or replace function private.transition_editorial_post(p_post_id uuid,p_action text,p_scheduled_for timestamptz default null,p_note text default '')
returns public.editorial_posts language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_post public.editorial_posts; v_from text; v_to text;
begin
  select * into v_post from public.editorial_posts where id=p_post_id for update;
  if not found then raise exception 'EDITORIAL_POST_NOT_FOUND'; end if;
  if not coalesce(private.has_editorial_capability(auth.uid(),'manage_all') or v_post.author_user_id=auth.uid(),false) then raise exception 'EDITORIAL_NOT_AUTHORIZED'; end if;
  v_from:=v_post.status;
  if p_action='submit' and v_from in('draft','needs_revision') and private.has_editorial_capability(auth.uid(),'submit') then v_to:='submitted';
  elsif p_action='start_revision' and v_from='published' and private.has_editorial_capability(auth.uid(),'edit_own') then v_to:='draft';
  elsif p_action='request_changes' and v_from='submitted' and private.has_editorial_capability(auth.uid(),'review') then v_to:='needs_revision';
  elsif p_action='approve' and v_from='submitted' and private.has_editorial_capability(auth.uid(),'review') then v_to:='approved';
  elsif p_action='schedule' and v_from='approved' and private.has_editorial_capability(auth.uid(),'schedule') and p_scheduled_for>now() then v_to:='scheduled';
  elsif p_action='publish' and v_from in('approved','scheduled') and private.has_editorial_capability(auth.uid(),'publish') then v_to:='published';
  elsif p_action='archive' and v_from in('published','expired') and private.has_editorial_capability(auth.uid(),'unpublish') then v_to:='archived';
  else raise exception 'EDITORIAL_TRANSITION_NOT_ALLOWED'; end if;
  if v_post.current_revision_id is null then raise exception 'EDITORIAL_REVISION_REQUIRED'; end if;
  perform set_config('app.editorial_workflow','1',true);
  update public.editorial_posts set status=v_to,
    published_revision_id=case when v_to='published' then current_revision_id else published_revision_id end,
    published_metadata=case when v_to='published' then private.editorial_metadata_snapshot(id) else published_metadata end,
    scheduled_revision_id=case when v_to='scheduled' then current_revision_id when v_to in('published','archived') then null else scheduled_revision_id end,
    scheduled_metadata=case when v_to='scheduled' then private.editorial_metadata_snapshot(id) when v_to in('published','archived') then null else scheduled_metadata end,
    scheduled_for=case when v_to='scheduled' then p_scheduled_for when v_to in('published','archived') then null else scheduled_for end,
    published_at=case when v_to='published' then now() else published_at end,
    archived_at=case when v_to='archived' then now() else null end,updated_at=now()
  where id=p_post_id returning * into v_post;
  insert into public.editorial_audit_events(actor_user_id,post_id,action,from_status,to_status,details)
  values(auth.uid(),p_post_id,p_action,v_from,v_to,jsonb_build_object('note',left(coalesce(p_note,''),500),'scheduledFor',p_scheduled_for,'ownershipMode',true));
  return v_post;
end;
$$;

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
declare v_post public.editorial_posts; v_revision public.editorial_revisions; v_number integer; v_from text;
begin
  select * into v_post from public.editorial_posts where id=p_post_id for update;
  if v_post.id is null
     or not coalesce(private.has_editorial_capability(auth.uid(),'manage_all') or (private.has_editorial_capability(auth.uid(),'edit_own') and v_post.author_user_id=auth.uid()),false)
  then raise exception 'EDITORIAL_NOT_AUTHORIZED'; end if;
  if v_post.status='archived' then raise exception 'EDITORIAL_REVISION_LOCKED'; end if;
  if v_post.status not in('draft','needs_revision') then
    v_from:=v_post.status;
    perform set_config('app.editorial_workflow','1',true);
    update public.editorial_posts set status='draft',scheduled_for=null,scheduled_revision_id=null,scheduled_metadata=null,archived_at=null,updated_at=now() where id=p_post_id returning * into v_post;
    insert into public.editorial_audit_events(actor_user_id,post_id,action,from_status,to_status,details) values(auth.uid(),p_post_id,'start_revision',v_from,'draft','{}'::jsonb);
  end if;
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

create or replace function public.publish_editorial_post(p_post_id uuid)
returns public.editorial_posts language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_post public.editorial_posts; v_from text;
begin
  select * into v_post from public.editorial_posts where id=p_post_id for update;
  if v_post.id is null then raise exception 'EDITORIAL_POST_NOT_FOUND'; end if;
  if not coalesce(private.has_editorial_capability(auth.uid(),'manage_all') or (private.has_editorial_capability(auth.uid(),'publish') and v_post.author_user_id=auth.uid()),false) then raise exception 'EDITORIAL_NOT_AUTHORIZED'; end if;
  if v_post.status='archived' then raise exception 'EDITORIAL_TRANSITION_NOT_ALLOWED'; end if;
  if v_post.current_revision_id is null then raise exception 'EDITORIAL_REVISION_REQUIRED'; end if;
  v_from:=v_post.status;
  perform set_config('app.editorial_workflow','1',true);
  update public.editorial_posts set status='published',published_revision_id=current_revision_id,published_metadata=private.editorial_metadata_snapshot(id),published_at=now(),scheduled_for=null,scheduled_revision_id=null,scheduled_metadata=null,archived_at=null,updated_at=now() where id=p_post_id returning * into v_post;
  insert into public.editorial_audit_events(actor_user_id,post_id,action,from_status,to_status,details) values(auth.uid(),p_post_id,'publish',v_from,'published',jsonb_build_object('ownershipMode',true));
  return v_post;
end;
$$;

create or replace function public.archive_editorial_post(p_post_id uuid,p_note text default '')
returns public.editorial_posts language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_post public.editorial_posts; v_from text;
begin
  select * into v_post from public.editorial_posts where id=p_post_id for update;
  if v_post.id is null then raise exception 'EDITORIAL_POST_NOT_FOUND'; end if;
  if not coalesce(private.has_editorial_capability(auth.uid(),'manage_all') or (private.has_editorial_capability(auth.uid(),'archive') and v_post.author_user_id=auth.uid()),false) then raise exception 'EDITORIAL_NOT_AUTHORIZED'; end if;
  if v_post.status='archived' then return v_post; end if;
  v_from:=v_post.status;
  perform set_config('app.editorial_workflow','1',true);
  update public.editorial_posts set status='archived',archived_at=now(),scheduled_for=null,scheduled_revision_id=null,scheduled_metadata=null,updated_at=now() where id=p_post_id returning * into v_post;
  insert into public.editorial_audit_events(actor_user_id,post_id,action,from_status,to_status,details) values(auth.uid(),p_post_id,'archive',v_from,'archived',jsonb_build_object('note',left(coalesce(p_note,''),500),'ownershipMode',true));
  return v_post;
end;
$$;

create or replace function public.restore_archived_editorial_post(p_post_id uuid)
returns public.editorial_posts language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_post public.editorial_posts;
begin
  select * into v_post from public.editorial_posts where id=p_post_id for update;
  if v_post.id is null then raise exception 'EDITORIAL_POST_NOT_FOUND'; end if;
  if not coalesce(private.has_editorial_capability(auth.uid(),'manage_all') or (private.has_editorial_capability(auth.uid(),'restore_own') and v_post.author_user_id=auth.uid()),false) then raise exception 'EDITORIAL_NOT_AUTHORIZED'; end if;
  if v_post.status<>'archived' then raise exception 'EDITORIAL_RESTORE_NOT_ALLOWED'; end if;
  perform set_config('app.editorial_workflow','1',true);
  update public.editorial_posts set status='draft',archived_at=null,updated_at=now() where id=p_post_id returning * into v_post;
  insert into public.editorial_audit_events(actor_user_id,post_id,action,from_status,to_status,details) values(auth.uid(),p_post_id,'restore_to_draft','archived','draft',jsonb_build_object('ownershipMode',true,'currentRevisionId',v_post.current_revision_id,'publishedRevisionId',v_post.published_revision_id));
  return v_post;
end;
$$;

create or replace function public.restore_editorial_revision(p_post_id uuid,p_revision_id uuid)
returns public.editorial_revisions language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_source public.editorial_revisions; v_post public.editorial_posts; v_result public.editorial_revisions;
begin
  select * into v_post from public.editorial_posts where id=p_post_id for update;
  if v_post.id is null or not coalesce(private.has_editorial_capability(auth.uid(),'manage_all') or (private.has_editorial_capability(auth.uid(),'edit_own') and v_post.author_user_id=auth.uid()),false) then raise exception 'EDITORIAL_NOT_AUTHORIZED'; end if;
  select * into v_source from public.editorial_revisions where id=p_revision_id and post_id=p_post_id;
  if v_source.id is null or v_post.status in('archived','expired') then raise exception 'EDITORIAL_RESTORE_NOT_ALLOWED'; end if;
  select * into v_result from public.save_editorial_revision(p_post_id,v_source.document,v_source.seo_title,v_source.seo_description,'Restored from revision '||v_source.revision_number,v_post.current_revision_id);
  insert into public.editorial_audit_events(actor_user_id,post_id,action,from_status,to_status,details) values(auth.uid(),p_post_id,'revision_restored',v_post.status,v_post.status,jsonb_build_object('sourceRevisionId',p_revision_id,'newRevisionId',v_result.id,'ownershipMode',true));
  return v_result;
end;
$$;

create or replace function public.delete_editorial_post(p_post_id uuid)
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_post public.editorial_posts;
begin
  select * into v_post from public.editorial_posts where id=p_post_id for update;
  if v_post.id is null then raise exception 'EDITORIAL_POST_NOT_FOUND'; end if;
  if not coalesce(private.has_editorial_capability(auth.uid(),'delete_any') or (private.has_editorial_capability(auth.uid(),'delete_own') and v_post.author_user_id=auth.uid()),false) then raise exception 'EDITORIAL_NOT_AUTHORIZED'; end if;
  insert into public.editorial_audit_events(actor_user_id,post_id,action,from_status,to_status,details)
  values(auth.uid(),p_post_id,'delete',v_post.status,null,jsonb_build_object('deletedPostId',v_post.id,'title',v_post.title,'contentType',v_post.content_type,'authorUserId',v_post.author_user_id,'wasPublished',v_post.published_revision_id is not null));
  delete from public.editorial_posts where id=p_post_id;
  return jsonb_build_object('id',p_post_id,'deleted',true);
end;
$$;

-- Private work is visible only to its author and Super Admin. Public snapshots
-- remain readable only through the existing public feature gate.
drop policy if exists editorial_posts_team_read on public.editorial_posts;
create policy editorial_posts_team_read on public.editorial_posts for select to authenticated using(private.has_editorial_capability(auth.uid(),'manage_all') or (private.has_editorial_capability(auth.uid(),'enter') and author_user_id=auth.uid()));
drop policy if exists editorial_posts_team_update on public.editorial_posts;
create policy editorial_posts_team_update on public.editorial_posts for update to authenticated using(status in('draft','needs_revision') and (private.has_editorial_capability(auth.uid(),'manage_all') or (private.has_editorial_capability(auth.uid(),'edit_own') and author_user_id=auth.uid()))) with check(status in('draft','needs_revision') and (private.has_editorial_capability(auth.uid(),'manage_all') or (private.has_editorial_capability(auth.uid(),'edit_own') and author_user_id=auth.uid())));
drop policy if exists editorial_revisions_team_read on public.editorial_revisions;
create policy editorial_revisions_team_read on public.editorial_revisions for select to authenticated using(exists(select 1 from public.editorial_posts p where p.id=post_id and (private.has_editorial_capability(auth.uid(),'manage_all') or (private.has_editorial_capability(auth.uid(),'enter') and p.author_user_id=auth.uid()))));
drop policy if exists editorial_revisions_public_read on public.editorial_revisions;
create policy editorial_revisions_public_read on public.editorial_revisions for select using(exists(select 1 from public.editorial_posts p where p.published_revision_id=editorial_revisions.id and p.published_at is not null and p.archived_at is null and (select module_enabled and public_portal_enabled from public.editorial_feature_flags where singleton)));
drop policy if exists editorial_autosaves_owner on public.editorial_autosaves;
create policy editorial_autosaves_owner on public.editorial_autosaves for all to authenticated using(user_id=auth.uid() and exists(select 1 from public.editorial_posts p where p.id=post_id and (p.author_user_id=auth.uid() or private.has_editorial_capability(auth.uid(),'manage_all')))) with check(user_id=auth.uid() and exists(select 1 from public.editorial_posts p where p.id=post_id and p.status<>'archived' and (p.author_user_id=auth.uid() or private.has_editorial_capability(auth.uid(),'manage_all'))));

do $$ declare t text; begin foreach t in array array['editorial_post_tags','editorial_event_details','editorial_place_details','editorial_activity_details','editorial_product_details'] loop
  execute format('drop policy if exists %I on public.%I',t||'_read',t);
  execute format('create policy %I on public.%I for select using (exists(select 1 from public.editorial_posts p where p.id=post_id and ((p.published_revision_id is not null and p.archived_at is null and (select module_enabled and public_portal_enabled from public.editorial_feature_flags where singleton)) or private.has_editorial_capability(auth.uid(),''manage_all'') or (private.has_editorial_capability(auth.uid(),''enter'') and p.author_user_id=auth.uid()))))',t||'_read',t);
  execute format('drop policy if exists %I on public.%I',t||'_write',t);
  execute format('create policy %I on public.%I for all to authenticated using (exists(select 1 from public.editorial_posts p where p.id=post_id and p.status in(''draft'',''needs_revision'') and (private.has_editorial_capability(auth.uid(),''manage_all'') or (private.has_editorial_capability(auth.uid(),''edit_own'') and p.author_user_id=auth.uid())))) with check (exists(select 1 from public.editorial_posts p where p.id=post_id and p.status in(''draft'',''needs_revision'') and (private.has_editorial_capability(auth.uid(),''manage_all'') or (private.has_editorial_capability(auth.uid(),''edit_own'') and p.author_user_id=auth.uid()))))',t||'_write',t);
end loop; end $$;

drop policy if exists editorial_sources_public_read on public.editorial_sources;
create policy editorial_sources_public_read on public.editorial_sources for select using(verification_status='verified' and exists(select 1 from public.editorial_posts p where p.id=post_id and p.published_revision_id is not null and p.published_at is not null and p.archived_at is null and (select module_enabled and public_portal_enabled from public.editorial_feature_flags where singleton)));
drop policy if exists editorial_sources_team_read on public.editorial_sources;
create policy editorial_sources_team_read on public.editorial_sources for select to authenticated using(exists(select 1 from public.editorial_posts p where p.id=post_id and (p.author_user_id=auth.uid() or private.has_editorial_capability(auth.uid(),'manage_all'))));
drop policy if exists editorial_sources_insert on public.editorial_sources;
create policy editorial_sources_insert on public.editorial_sources for insert to authenticated with check(created_by=auth.uid() and private.has_editorial_capability(auth.uid(),'manage_sources') and exists(select 1 from public.editorial_posts p where p.id=post_id and (p.author_user_id=auth.uid() or private.has_editorial_capability(auth.uid(),'manage_all'))));
drop policy if exists editorial_sources_update on public.editorial_sources;
create policy editorial_sources_update on public.editorial_sources for update to authenticated using(exists(select 1 from public.editorial_posts p where p.id=post_id and (p.author_user_id=auth.uid() or private.has_editorial_capability(auth.uid(),'manage_all')))) with check(exists(select 1 from public.editorial_posts p where p.id=post_id and (p.author_user_id=auth.uid() or private.has_editorial_capability(auth.uid(),'manage_all'))));
drop policy if exists editorial_sources_delete on public.editorial_sources;
create policy editorial_sources_delete on public.editorial_sources for delete to authenticated using(exists(select 1 from public.editorial_posts p where p.id=post_id and (p.author_user_id=auth.uid() or private.has_editorial_capability(auth.uid(),'manage_all'))));

create or replace function public.execute_editorial_action_as_service(p_actor_user_id uuid,p_action text,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_payload jsonb:=coalesce(p_payload,'{}'::jsonb); v_post_id uuid; v_result jsonb;
begin
  if auth.role()<>'service_role' then raise exception 'EDITORIAL_SERVICE_ROLE_REQUIRED' using errcode='42501'; end if;
  if p_actor_user_id is null then raise exception 'EDITORIAL_ACTOR_REQUIRED' using errcode='22023'; end if;
  if jsonb_typeof(v_payload)<>'object' then raise exception 'EDITORIAL_PAYLOAD_INVALID' using errcode='22023'; end if;
  if p_action is null or p_action not in('save_revision','submit','start_revision','request_changes','approve','schedule','publish','archive','restore_revision','restore_archived','delete') then raise exception 'EDITORIAL_ACTION_INVALID' using errcode='22023'; end if;
  begin v_post_id:=nullif(v_payload->>'postId','')::uuid; exception when invalid_text_representation then raise exception 'EDITORIAL_POST_ID_INVALID' using errcode='22023'; end;
  if v_post_id is null then raise exception 'EDITORIAL_POST_ID_INVALID' using errcode='22023'; end if;
  perform pg_catalog.set_config('request.jwt.claim.sub',p_actor_user_id::text,true);
  perform pg_catalog.set_config('request.jwt.claim.role','authenticated',true);
  perform pg_catalog.set_config('request.jwt.claims',pg_catalog.jsonb_build_object('sub',p_actor_user_id,'role','authenticated')::text,true);
  if p_action='save_revision' then select pg_catalog.to_jsonb(result) into v_result from public.save_editorial_revision(v_post_id,v_payload->'document',pg_catalog.left(coalesce(v_payload->>'seoTitle',''),180),pg_catalog.left(coalesce(v_payload->>'seoDescription',''),320),pg_catalog.left(coalesce(v_payload->>'editorNote',''),1000),nullif(v_payload->>'expectedCurrentRevisionId','')::uuid,coalesce(v_payload->'metadata','{}'::jsonb)) result;
  elsif p_action='submit' then select pg_catalog.to_jsonb(result) into v_result from public.submit_editorial_post(v_post_id) result;
  elsif p_action='start_revision' then select pg_catalog.to_jsonb(result) into v_result from public.start_editorial_revision(v_post_id) result;
  elsif p_action='request_changes' then select pg_catalog.to_jsonb(result) into v_result from public.request_editorial_changes(v_post_id,pg_catalog.left(coalesce(v_payload->>'note',''),500)) result;
  elsif p_action='approve' then select pg_catalog.to_jsonb(result) into v_result from public.approve_editorial_post(v_post_id,pg_catalog.left(coalesce(v_payload->>'note',''),500)) result;
  elsif p_action='schedule' then select pg_catalog.to_jsonb(result) into v_result from public.schedule_editorial_post(v_post_id,nullif(v_payload->>'scheduledFor','')::timestamptz) result;
  elsif p_action='publish' then select pg_catalog.to_jsonb(result) into v_result from public.publish_editorial_post(v_post_id) result;
  elsif p_action='archive' then select pg_catalog.to_jsonb(result) into v_result from public.archive_editorial_post(v_post_id,pg_catalog.left(coalesce(v_payload->>'note',''),500)) result;
  elsif p_action='restore_revision' then select pg_catalog.to_jsonb(result) into v_result from public.restore_editorial_revision(v_post_id,nullif(v_payload->>'revisionId','')::uuid) result;
  elsif p_action='restore_archived' then select pg_catalog.to_jsonb(result) into v_result from public.restore_archived_editorial_post(v_post_id) result;
  elsif p_action='delete' then select public.delete_editorial_post(v_post_id) into v_result;
  end if;
  return v_result;
end;
$$;

revoke all on function public.delete_editorial_post(uuid) from public,anon,service_role;
grant execute on function public.delete_editorial_post(uuid) to authenticated;
revoke all on function public.execute_editorial_action_as_service(uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.execute_editorial_action_as_service(uuid,text,jsonb) to service_role;

comment on function public.delete_editorial_post(uuid) is 'Deletes an Editorial post and its cascading private content for its active author or Super Admin. A sanitized audit marker remains.';
comment on function private.has_editorial_capability(uuid,text) is 'Editorial role capabilities. Content autonomy is ownership-scoped; only Super Admin has cross-account content access.';
notify pgrst,'reload schema';
commit;
