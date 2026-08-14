begin;

-- Lahat Liwa V1: two authenticated personas and an owned Creative Posts domain.
-- This migration is additive for creative content. Legacy Editorial tables remain
-- disabled for a separately reviewed retirement migration.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

-- Resolve legacy account roles into the two product personas while retaining
-- Auth user ids, project ownership, and creative profile links.
-- These existing guards authorize interactive account changes through
-- auth.uid(). A CLI migration has no end-user JWT, so pause only the affected
-- guards for this one-time data conversion and restore their original modes
-- immediately afterward. The surrounding transaction makes this fail-safe.
create temporary table creative_v1_admin_guard_states on commit drop as
select trigger_name, enabled_mode
from (
  select tgname as trigger_name, tgenabled as enabled_mode
  from pg_trigger
  where tgrelid = 'public.admin_users'::regclass
    and not tgisinternal
    and tgname in (
      'admin_users_guard_self_update',
      'admin_users_guard_access_changes',
      'guard_admin_user_editorial_roles'
    )
) guard_states;

do $$
declare guard record;
begin
  for guard in
    select trigger_name from creative_v1_admin_guard_states where enabled_mode <> 'D'
  loop
    execute format('alter table public.admin_users disable trigger %I', guard.trigger_name);
  end loop;
end;
$$;

update public.admin_users set role = 'super_admin' where role in ('owner', 'admin');
update public.admin_users
set role = 'creative',
    status = case when creative_member_id is null and status = 'active' then 'disabled' else status end
where role in ('editor', 'writer', 'viewer');
update public.admin_users set creative_member_id = null where role = 'super_admin';
update public.admin_users set editorial_roles = '{}'::text[] where cardinality(coalesce(editorial_roles, '{}'::text[])) > 0;

do $$
declare guard record;
begin
  for guard in select trigger_name, enabled_mode from creative_v1_admin_guard_states
  loop
    if guard.enabled_mode = 'O' then
      execute format('alter table public.admin_users enable trigger %I', guard.trigger_name);
    elsif guard.enabled_mode = 'A' then
      execute format('alter table public.admin_users enable always trigger %I', guard.trigger_name);
    elsif guard.enabled_mode = 'R' then
      execute format('alter table public.admin_users enable replica trigger %I', guard.trigger_name);
    end if;
  end loop;
end;
$$;

alter table public.admin_users drop constraint if exists admin_users_role_check;
alter table public.admin_users add constraint admin_users_role_check
  check (role in ('super_admin', 'creative'));

create or replace function private.user_role(check_user_id uuid)
returns text language sql stable security definer set search_path = public, private, pg_temp as $$
  select role from public.admin_users
  where user_id = check_user_id and status = 'active' limit 1;
$$;

create or replace function private.has_role(check_user_id uuid, allowed_roles text[])
returns boolean language sql stable security definer set search_path = public, private, pg_temp as $$
  select coalesce(private.user_role(check_user_id) = any(allowed_roles), false);
$$;

create or replace function private.can_manage_all_content(check_user_id uuid)
returns boolean language sql stable security definer set search_path = public, private, pg_temp as $$
  select private.has_role(check_user_id, array['super_admin']);
$$;

create or replace function private.is_active_team_member(check_user_id uuid)
returns boolean language sql stable security definer set search_path = public, private, pg_temp as $$
  select private.has_role(check_user_id, array['super_admin', 'creative']);
$$;

create or replace function private.current_creative_member_id()
returns uuid language sql stable security definer set search_path = public, private, pg_temp as $$
  select creative_member_id from public.admin_users
  where user_id = auth.uid() and role = 'creative' and status = 'active' limit 1;
$$;

revoke all on function private.user_role(uuid) from public, anon, authenticated;
revoke all on function private.has_role(uuid, text[]) from public, anon, authenticated;
revoke all on function private.can_manage_all_content(uuid) from public, anon, authenticated;
revoke all on function private.is_active_team_member(uuid) from public, anon, authenticated;
revoke all on function private.current_creative_member_id() from public, anon, authenticated;
grant execute on function private.user_role(uuid), private.has_role(uuid, text[]),
  private.can_manage_all_content(uuid), private.is_active_team_member(uuid),
  private.current_creative_member_id() to authenticated;

-- Formal Current Work and Portfolio records are platform-managed. Creatives
-- publish through their owned post feed instead of the project CMS.
create or replace function private.can_create_project(check_user_id uuid)
returns boolean language sql stable security definer set search_path = public, private, pg_temp as $$
  select private.has_role(check_user_id,array['super_admin']);
$$;
create or replace function private.can_view_project(check_user_id uuid, check_project_id uuid)
returns boolean language sql stable security definer set search_path = public, private, pg_temp as $$
  select private.has_role(check_user_id,array['super_admin']) or exists(
    select 1 from public.projects where id=check_project_id and status='published'
  );
$$;
create or replace function private.can_edit_project(check_user_id uuid, check_project_id uuid)
returns boolean language sql stable security definer set search_path = public, private, pg_temp as $$
  select private.has_role(check_user_id,array['super_admin']);
$$;
create or replace function private.can_manage_project(check_user_id uuid, check_project_id uuid)
returns boolean language sql stable security definer set search_path = public, private, pg_temp as $$
  select private.has_role(check_user_id,array['super_admin']);
$$;
revoke all on function private.can_create_project(uuid), private.can_view_project(uuid,uuid),
  private.can_edit_project(uuid,uuid), private.can_manage_project(uuid,uuid) from public,anon,authenticated;
grant execute on function private.can_create_project(uuid), private.can_view_project(uuid,uuid),
  private.can_edit_project(uuid,uuid), private.can_manage_project(uuid,uuid) to authenticated;

-- Retire the abandoned tourism/editorial product without destroying its data.
update public.editorial_feature_flags
set module_enabled = false,
    public_portal_enabled = false,
    editorial_studio_enabled = false,
    editorial_media_uploads_enabled = false,
    homepage_tourism_enabled = false,
    updated_at = now()
where singleton = true;

create or replace function private.valid_creative_post_document(document jsonb)
returns boolean language plpgsql immutable set search_path = pg_catalog as $$
declare
  block jsonb;
  segment jsonb;
  item jsonb;
  media_id jsonb;
  block_type text;
  mark jsonb;
begin
  if jsonb_typeof(document) <> 'object'
    or document->>'version' <> '1'
    or jsonb_typeof(document->'blocks') <> 'array'
    or jsonb_array_length(document->'blocks') > 80
    or octet_length(document::text) > 150000
    or document::text ~* '"(html|rawhtml|css|javascript|script|style)"[[:space:]]*:'
  then return false; end if;

  for block in select value from jsonb_array_elements(document->'blocks') loop
    if jsonb_typeof(block) <> 'object' or octet_length(block::text) > 30000 then return false; end if;
    block_type := block->>'type';
    if block_type not in ('paragraph','heading','quote','bullet_list','numbered_list','divider','image_group','external_embed') then return false; end if;

    if block_type in ('paragraph','heading','quote') then
      if jsonb_typeof(block->'content') <> 'array' or jsonb_array_length(block->'content') > 200 then return false; end if;
      if block_type = 'heading' and coalesce((block->>'level')::integer, 2) not in (2,3) then return false; end if;
      for segment in select value from jsonb_array_elements(block->'content') loop
        if jsonb_typeof(segment) <> 'object'
          or jsonb_typeof(segment->'text') <> 'string'
          or length(segment->>'text') > 10000
          or (segment ? 'marks' and jsonb_typeof(segment->'marks') <> 'array')
        then return false; end if;
        for mark in select value from jsonb_array_elements(coalesce(segment->'marks','[]'::jsonb)) loop
          if jsonb_typeof(mark) <> 'string' or mark #>> '{}' not in ('bold','italic') then return false; end if;
        end loop;
        if segment ? 'href' and not (segment->>'href' ~ '^https://[^[:space:]<>"'']{1,2000}$') then return false; end if;
      end loop;
    elsif block_type in ('bullet_list','numbered_list') then
      if jsonb_typeof(block->'items') <> 'array' or jsonb_array_length(block->'items') not between 1 and 40 then return false; end if;
      for item in select value from jsonb_array_elements(block->'items') loop
        if jsonb_typeof(item) <> 'string' or length(item #>> '{}') > 2000 then return false; end if;
      end loop;
    elsif block_type = 'image_group' then
      if jsonb_typeof(block->'mediaIds') <> 'array' or jsonb_array_length(block->'mediaIds') > 10 then return false; end if;
      for media_id in select value from jsonb_array_elements(block->'mediaIds') loop
        if jsonb_typeof(media_id) <> 'string' or not (media_id #>> '{}') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then return false; end if;
      end loop;
    elsif block_type = 'external_embed' then
      if coalesce(block->>'url','') <> '' and not coalesce(block->>'url','') ~ '^https://[^[:space:]<>"'']{1,2000}$'
        or length(coalesce(block->>'label','')) > 160
      then return false; end if;
    end if;
  end loop;
  return true;
exception when others then return false;
end;
$$;

revoke all on function private.valid_creative_post_document(jsonb) from public, anon, authenticated;

create table public.creative_posts (
  id uuid primary key default gen_random_uuid(),
  creative_member_id uuid not null references public.creative_members(id) on delete cascade,
  author_user_id uuid not null references auth.users(id) on delete restrict,
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  document jsonb not null default '{"version":1,"blocks":[{"id":"intro","type":"paragraph","content":[]}]}'::jsonb
    check (private.valid_creative_post_document(document)),
  status text not null default 'draft' check (status in ('draft','published','archived')),
  visibility text not null default 'public' check (visibility in ('public','hidden')),
  moderation_status text not null default 'clear' check (moderation_status in ('clear','flagged','changes_requested','hidden','removed')),
  moderation_reason text,
  moderated_by uuid references auth.users(id) on delete set null,
  moderated_at timestamptz,
  project_id uuid references public.projects(id) on delete set null,
  publishing_guidelines_version text,
  guidelines_accepted_at timestamptz,
  published_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'published' or (published_at is not null and publishing_guidelines_version is not null and guidelines_accepted_at is not null))
);

create table public.creative_post_revisions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.creative_posts(id) on delete cascade,
  revision_number integer not null check (revision_number > 0),
  document jsonb not null check (private.valid_creative_post_document(document)),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (post_id, revision_number)
);

create table public.creative_post_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.creative_posts(id) on delete cascade,
  media_group_id uuid not null unique,
  display_order integer not null check (display_order between 0 and 9),
  thumbnail_url text not null,
  display_url text not null,
  expanded_url text not null,
  alt_text text not null default '' check (length(alt_text) <= 240),
  caption text not null default '' check (length(caption) <= 500),
  focal_x numeric(5,2) not null default 50 check (focal_x between 0 and 100),
  focal_y numeric(5,2) not null default 50 check (focal_y between 0 and 100),
  created_at timestamptz not null default now(),
  unique (post_id, display_order)
);

create table public.creative_post_moderation_events (
  id bigint generated always as identity primary key,
  post_id uuid references public.creative_posts(id) on delete set null,
  moderator_user_id uuid references auth.users(id) on delete set null,
  action text not null check (action in ('flag','request_changes','hide','restore','remove')),
  reason text not null check (length(btrim(reason)) between 8 and 1000),
  previous_status text not null,
  next_status text not null,
  created_at timestamptz not null default now()
);

create index creative_posts_profile_feed_idx on public.creative_posts(creative_member_id, published_at desc) where status = 'published';
create index creative_posts_author_idx on public.creative_posts(author_user_id, status, updated_at desc);
create index creative_posts_moderation_idx on public.creative_posts(moderation_status, updated_at desc) where moderation_status <> 'clear';
create index creative_post_media_post_idx on public.creative_post_media(post_id, display_order);
create index creative_post_revisions_post_idx on public.creative_post_revisions(post_id, revision_number desc);

alter table public.external_media_objects
  add column if not exists creative_post_id uuid references public.creative_posts(id) on delete set null;
create index if not exists external_media_creative_post_idx
  on public.external_media_objects(creative_post_id, provider, accounting_state)
  where creative_post_id is not null;

alter table public.external_media_objects drop constraint if exists external_media_objects_file_category_check;
alter table public.external_media_objects add constraint external_media_objects_file_category_check check (file_category in (
  'project_original','project_file','profile_original','project_gallery','project_cover','external_thumbnail',
  'profile_photo','profile_cover','site_image','service_image','editorial_cover','editorial_inline','creative_post_image'
));

create or replace function private.owns_creative_post(check_user_id uuid, check_post_id uuid)
returns boolean language sql stable security definer set search_path = public, private, pg_temp as $$
  select exists (
    select 1 from public.creative_posts p
    join public.admin_users a on a.user_id = check_user_id
    where p.id = check_post_id and p.author_user_id = check_user_id
      and p.creative_member_id = a.creative_member_id
      and a.role = 'creative' and a.status = 'active'
  );
$$;

create or replace function private.can_moderate_creative_posts(check_user_id uuid)
returns boolean language sql stable security definer set search_path = public, private, pg_temp as $$
  select private.has_role(check_user_id, array['super_admin']);
$$;

revoke all on function private.owns_creative_post(uuid,uuid), private.can_moderate_creative_posts(uuid) from public, anon, authenticated;
grant execute on function private.owns_creative_post(uuid,uuid), private.can_moderate_creative_posts(uuid) to authenticated;

create or replace function private.guard_creative_post()
returns trigger language plpgsql security definer set search_path = public, private, pg_temp as $$
begin
  if auth.role() = 'service_role' then return new; end if;
  if tg_op = 'INSERT' then
    if auth.uid() is null or new.author_user_id <> auth.uid() or new.creative_member_id is distinct from private.current_creative_member_id() then
      raise exception 'CREATIVE_POST_NOT_AUTHORIZED' using errcode = '42501';
    end if;
    new.status := 'draft'; new.visibility := 'public'; new.moderation_status := 'clear';
    new.moderation_reason := null; new.moderated_by := null; new.moderated_at := null;
    new.published_at := null; new.archived_at := null;
    return new;
  end if;
  if coalesce(current_setting('app.creative_post_moderation', true), '') = 'true' and private.can_moderate_creative_posts(auth.uid()) then return new; end if;
  if not private.owns_creative_post(auth.uid(), old.id) then raise exception 'CREATIVE_POST_NOT_AUTHORIZED' using errcode = '42501'; end if;
  new.id := old.id; new.author_user_id := old.author_user_id; new.creative_member_id := old.creative_member_id;
  new.created_at := old.created_at; new.moderation_status := old.moderation_status;
  new.moderation_reason := old.moderation_reason; new.moderated_by := old.moderated_by; new.moderated_at := old.moderated_at;
  if coalesce(current_setting('app.creative_post_lifecycle', true), '') <> 'true' then
    new.status := old.status; new.published_at := old.published_at; new.archived_at := old.archived_at;
    new.publishing_guidelines_version := old.publishing_guidelines_version; new.guidelines_accepted_at := old.guidelines_accepted_at;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function private.hydrate_creative_post_media()
returns trigger language plpgsql security definer set search_path = public, private, pg_temp as $$
declare media_count integer; media_owner uuid; media_post uuid; media_statuses integer;
declare thumbnail text; display_image text; expanded text;
begin
  if not private.owns_creative_post(auth.uid(), new.post_id) then raise exception 'CREATIVE_POST_MEDIA_NOT_AUTHORIZED' using errcode='42501'; end if;
  select count(*) into media_count from public.creative_post_media where post_id = new.post_id and id <> new.id;
  if media_count >= 10 then raise exception 'CREATIVE_POST_MEDIA_LIMIT' using errcode='P0001'; end if;
  select owner_user_id,creative_post_id into media_owner,media_post
  from public.external_media_objects
  where provider='cloudflare_r2' and media_group_id=new.media_group_id
  limit 1;
  select count(*) filter (where status='available' and verification_status='verified'),
    max(public_url) filter (where media_variant='thumbnail'),
    max(public_url) filter (where media_variant='display'),
    max(public_url) filter (where media_variant='expanded')
  into media_statuses, thumbnail, display_image, expanded
  from public.external_media_objects
  where provider='cloudflare_r2' and media_group_id=new.media_group_id;
  if media_owner is distinct from auth.uid() or media_post is distinct from new.post_id or media_statuses <> 3
    or thumbnail is null or display_image is null or expanded is null
  then raise exception 'CREATIVE_POST_MEDIA_INVALID' using errcode='P0001'; end if;
  new.thumbnail_url := thumbnail; new.display_url := display_image; new.expanded_url := expanded;
  return new;
end;
$$;

drop trigger if exists creative_posts_guard on public.creative_posts;
create trigger creative_posts_guard before insert or update on public.creative_posts
for each row execute function private.guard_creative_post();
drop trigger if exists creative_post_media_hydrate on public.creative_post_media;
create trigger creative_post_media_hydrate before insert or update on public.creative_post_media
for each row execute function private.hydrate_creative_post_media();

create or replace function public.create_creative_post()
returns public.creative_posts language plpgsql security definer set search_path = public, private, pg_temp as $$
declare result public.creative_posts; creative_id uuid := private.current_creative_member_id(); post_id uuid := gen_random_uuid();
begin
  if creative_id is null then raise exception 'CREATIVE_PROFILE_REQUIRED' using errcode='42501'; end if;
  insert into public.creative_posts(id, creative_member_id, author_user_id, slug)
  values(post_id, creative_id, auth.uid(), 'post-' || replace(post_id::text, '-', '')) returning * into result;
  return result;
end;
$$;

create or replace function public.save_creative_post(p_post_id uuid, p_document jsonb, p_expected_updated_at timestamptz default null)
returns public.creative_posts language plpgsql security definer set search_path = public, private, pg_temp as $$
declare post public.creative_posts; revision_number integer;
begin
  select * into post from public.creative_posts where id=p_post_id for update;
  if post.id is null or not private.owns_creative_post(auth.uid(),post.id) then raise exception 'CREATIVE_POST_NOT_AUTHORIZED' using errcode='42501'; end if;
  if post.status='archived' or post.moderation_status='removed' then raise exception 'CREATIVE_POST_LOCKED'; end if;
  if p_expected_updated_at is not null and post.updated_at is distinct from p_expected_updated_at then raise exception 'CREATIVE_POST_CONFLICT'; end if;
  if not private.valid_creative_post_document(p_document) then raise exception 'CREATIVE_POST_DOCUMENT_INVALID'; end if;
  select coalesce(max(r.revision_number),0)+1 into revision_number from public.creative_post_revisions r where r.post_id=post.id;
  insert into public.creative_post_revisions(post_id,revision_number,document,created_by) values(post.id,revision_number,p_document,auth.uid());
  update public.creative_posts set document=p_document,updated_at=now() where id=post.id returning * into post;
  return post;
end;
$$;

create or replace function public.publish_creative_post(p_post_id uuid, p_guidelines_version text)
returns public.creative_posts language plpgsql security definer set search_path = public, private, pg_temp as $$
declare post public.creative_posts; media_count integer; referenced_count integer; missing_count integer;
begin
  select * into post from public.creative_posts where id=p_post_id for update;
  if post.id is null or not private.owns_creative_post(auth.uid(),post.id) then raise exception 'CREATIVE_POST_NOT_AUTHORIZED' using errcode='42501'; end if;
  if post.status='archived' or post.moderation_status in ('hidden','removed') then raise exception 'CREATIVE_POST_LOCKED'; end if;
  if length(btrim(coalesce(p_guidelines_version,''))) not between 1 and 40 then raise exception 'PUBLISHING_GUIDELINES_REQUIRED'; end if;
  select count(*) into media_count from public.creative_post_media where post_id=post.id;
  if media_count > 10 then raise exception 'CREATIVE_POST_MEDIA_LIMIT'; end if;
  with refs as (
    select distinct media.value::uuid id
    from jsonb_array_elements(post.document->'blocks') block
    cross join lateral jsonb_array_elements_text(coalesce(block->'mediaIds','[]'::jsonb)) media(value)
    where block->>'type'='image_group'
  )
  select count(*), count(*) filter (where m.id is null) into referenced_count,missing_count
  from refs left join public.creative_post_media m on m.id=refs.id and m.post_id=post.id;
  if missing_count > 0 or referenced_count <> media_count then raise exception 'CREATIVE_POST_MEDIA_REFERENCES_INVALID'; end if;
  if exists(select 1 from public.creative_post_media where post_id=post.id and length(btrim(alt_text))=0) then
    raise exception 'CREATIVE_POST_IMAGE_DESCRIPTION_REQUIRED';
  end if;
  if referenced_count=0 and not exists (
    select 1 from jsonb_array_elements(post.document->'blocks') block
    where (block->>'type' in ('paragraph','heading','quote') and exists (
      select 1 from jsonb_array_elements(coalesce(block->'content','[]'::jsonb)) segment
      where length(btrim(coalesce(segment->>'text',''))) > 0
    )) or (block->>'type' in ('bullet_list','numbered_list') and exists (
      select 1 from jsonb_array_elements_text(coalesce(block->'items','[]'::jsonb)) item
      where length(btrim(item)) > 0
    )) or (block->>'type'='external_embed' and length(btrim(coalesce(block->>'url',''))) > 0)
  ) then raise exception 'CREATIVE_POST_EMPTY'; end if;
  perform set_config('app.creative_post_lifecycle','true',true);
  update public.creative_posts set status='published',visibility='public',published_at=coalesce(published_at,now()),archived_at=null,
    publishing_guidelines_version=p_guidelines_version,guidelines_accepted_at=now(),updated_at=now()
  where id=post.id returning * into post;
  return post;
end;
$$;

create or replace function public.archive_creative_post(p_post_id uuid)
returns public.creative_posts language plpgsql security definer set search_path = public, private, pg_temp as $$
declare post public.creative_posts;
begin
  select * into post from public.creative_posts where id=p_post_id for update;
  if post.id is null or not private.owns_creative_post(auth.uid(),post.id) then raise exception 'CREATIVE_POST_NOT_AUTHORIZED' using errcode='42501'; end if;
  perform set_config('app.creative_post_lifecycle','true',true);
  update public.creative_posts set status='archived',archived_at=now(),updated_at=now() where id=post.id returning * into post;
  return post;
end;
$$;

create or replace function public.restore_creative_post(p_post_id uuid)
returns public.creative_posts language plpgsql security definer set search_path = public, private, pg_temp as $$
declare post public.creative_posts;
begin
  select * into post from public.creative_posts where id=p_post_id for update;
  if post.id is null or not private.owns_creative_post(auth.uid(),post.id) or post.status<>'archived' then raise exception 'CREATIVE_POST_NOT_AUTHORIZED' using errcode='42501'; end if;
  perform set_config('app.creative_post_lifecycle','true',true);
  update public.creative_posts set status='draft',archived_at=null,updated_at=now() where id=post.id returning * into post;
  return post;
end;
$$;

create or replace function public.delete_creative_post(p_post_id uuid)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare post public.creative_posts; queued integer;
begin
  select * into post from public.creative_posts where id=p_post_id for update;
  if post.id is null or not private.owns_creative_post(auth.uid(),post.id) or post.status<>'archived' then raise exception 'CREATIVE_POST_ARCHIVE_REQUIRED' using errcode='42501'; end if;
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

create or replace function public.moderate_creative_post(p_post_id uuid,p_action text,p_reason text)
returns public.creative_posts language plpgsql security definer set search_path = public, private, pg_temp as $$
declare post public.creative_posts; previous text; next text;
begin
  if not private.can_moderate_creative_posts(auth.uid()) then raise exception 'SUPER_ADMIN_REQUIRED' using errcode='42501'; end if;
  if length(btrim(coalesce(p_reason,''))) not between 8 and 1000 then raise exception 'MODERATION_REASON_REQUIRED'; end if;
  select * into post from public.creative_posts where id=p_post_id for update;
  if post.id is null then raise exception 'CREATIVE_POST_NOT_FOUND'; end if;
  previous:=post.moderation_status;
  next:=case p_action when 'flag' then 'flagged' when 'request_changes' then 'changes_requested' when 'hide' then 'hidden' when 'restore' then 'clear' when 'remove' then 'removed' else null end;
  if next is null then raise exception 'MODERATION_ACTION_INVALID'; end if;
  perform set_config('app.creative_post_moderation','true',true);
  update public.creative_posts set moderation_status=next,moderation_reason=case when next='clear' then null else btrim(p_reason) end,
    moderated_by=auth.uid(),moderated_at=now(),updated_at=now() where id=post.id returning * into post;
  insert into public.creative_post_moderation_events(post_id,moderator_user_id,action,reason,previous_status,next_status)
  values(post.id,auth.uid(),p_action,btrim(p_reason),previous,next);
  return post;
end;
$$;

revoke all on function public.create_creative_post(), public.save_creative_post(uuid,jsonb,timestamptz),
  public.publish_creative_post(uuid,text), public.archive_creative_post(uuid), public.restore_creative_post(uuid),
  public.delete_creative_post(uuid), public.moderate_creative_post(uuid,text,text) from public, anon, service_role;
grant execute on function public.create_creative_post(), public.save_creative_post(uuid,jsonb,timestamptz),
  public.publish_creative_post(uuid,text), public.archive_creative_post(uuid), public.restore_creative_post(uuid),
  public.delete_creative_post(uuid), public.moderate_creative_post(uuid,text,text) to authenticated;

alter table public.creative_posts enable row level security;
alter table public.creative_post_revisions enable row level security;
alter table public.creative_post_media enable row level security;
alter table public.creative_post_moderation_events enable row level security;

create policy creative_posts_public_read on public.creative_posts for select to anon, authenticated using (
  status='published' and visibility='public' and moderation_status='clear'
  and exists(select 1 from public.creative_members c where c.id=creative_member_id and c.is_published=true)
);
create policy creative_posts_owner_read on public.creative_posts for select to authenticated using (private.owns_creative_post(auth.uid(),id));
create policy creative_posts_moderator_read on public.creative_posts for select to authenticated using (private.can_moderate_creative_posts(auth.uid()));
create policy creative_posts_owner_insert on public.creative_posts for insert to authenticated with check (
  author_user_id=auth.uid() and creative_member_id=private.current_creative_member_id()
);
create policy creative_posts_owner_update on public.creative_posts for update to authenticated
  using(private.owns_creative_post(auth.uid(),id)) with check(private.owns_creative_post(auth.uid(),id));
create policy creative_posts_owner_delete on public.creative_posts for delete to authenticated
  using(private.owns_creative_post(auth.uid(),id) and status='archived');

create policy creative_post_revisions_owner_read on public.creative_post_revisions for select to authenticated using (
  exists(select 1 from public.creative_posts p where p.id=post_id and (private.owns_creative_post(auth.uid(),p.id) or private.can_moderate_creative_posts(auth.uid())))
);
create policy creative_post_media_public_read on public.creative_post_media for select to anon, authenticated using (
  exists(select 1 from public.creative_posts p join public.creative_members c on c.id=p.creative_member_id
    where p.id=post_id and p.status='published' and p.visibility='public' and p.moderation_status='clear' and c.is_published=true)
);
create policy creative_post_media_owner_read on public.creative_post_media for select to authenticated using (private.owns_creative_post(auth.uid(),post_id));
create policy creative_post_media_owner_insert on public.creative_post_media for insert to authenticated with check (private.owns_creative_post(auth.uid(),post_id));
create policy creative_post_media_owner_update on public.creative_post_media for update to authenticated
  using(private.owns_creative_post(auth.uid(),post_id)) with check(private.owns_creative_post(auth.uid(),post_id));
create policy creative_post_media_owner_delete on public.creative_post_media for delete to authenticated using (private.owns_creative_post(auth.uid(),post_id));
create policy creative_post_moderation_owner_read on public.creative_post_moderation_events for select to authenticated using (
  private.can_moderate_creative_posts(auth.uid()) or exists(select 1 from public.creative_posts p where p.id=post_id and private.owns_creative_post(auth.uid(),p.id))
);

grant select,insert,update,delete on public.creative_posts to authenticated;
grant select on public.creative_posts to anon;
grant select on public.creative_post_revisions to authenticated;
grant select,insert,update,delete on public.creative_post_media to authenticated;
grant select on public.creative_post_media to anon;
grant select on public.creative_post_moderation_events to authenticated;
grant usage,select on sequence public.creative_post_moderation_events_id_seq to authenticated;

-- Global inquiry records now belong to the platform-maintenance persona.
drop policy if exists "Active team can read project inquiries" on public.project_inquiries;
create policy "Super Admin can read project inquiries" on public.project_inquiries for select to authenticated
  using (private.has_role(auth.uid(),array['super_admin']));

notify pgrst, 'reload schema';
commit;
