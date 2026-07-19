begin;

-- The module is additive and remains unavailable until an administrator explicitly enables it.
alter table public.admin_users drop constraint if exists admin_users_role_check;
alter table public.admin_users add constraint admin_users_role_check
  check (role in ('super_admin','owner','admin','editor','writer','creative','viewer'));

drop policy if exists "Admins can insert team records" on public.admin_users;
create policy "Admins can insert team records" on public.admin_users for insert to authenticated with check(
  private.has_role(auth.uid(),array['super_admin']) and role in('admin','editor','writer','creative','viewer')
  and status='invited' and user_id is null and invited_by=auth.uid() and email is not null
);
drop policy if exists "Admins can update team records" on public.admin_users;
create policy "Admins can update team records" on public.admin_users for update to authenticated using(
  (private.has_role(auth.uid(),array['super_admin']) and role not in('super_admin','owner'))
  or (lower(email)=lower(auth.jwt()->>'email') and role in('admin','editor','writer','creative','viewer') and ((status='invited' and user_id is null) or user_id=auth.uid()))
) with check(
  (private.has_role(auth.uid(),array['super_admin']) and role in('admin','editor','writer','creative','viewer'))
  or (lower(email)=lower(auth.jwt()->>'email') and role in('admin','editor','writer','creative','viewer') and status='active' and user_id=auth.uid())
);

create or replace function private.editorial_role(p_user_id uuid)
returns text language sql stable security definer set search_path=public,private,pg_temp as $$
  select case when role='owner' then 'super_admin' else role end
  from public.admin_users where user_id=p_user_id and status='active' limit 1;
$$;

create or replace function private.has_editorial_capability(p_user_id uuid,p_capability text)
returns boolean language plpgsql stable security definer set search_path=public,private,pg_temp as $$
declare v_role text:=private.editorial_role(p_user_id);
begin
  if v_role is null then return false; end if;
  if p_capability in ('enter','create','edit_own','edit_assigned','submit') then
    return v_role in ('super_admin','admin','editor','writer');
  elsif p_capability in ('review','schedule','publish','unpublish','manage_homepage','manage_sources','manage_all') then
    return v_role in ('super_admin','admin','editor');
  elsif p_capability in ('manage_taxonomy','manage_contributors','manage_settings','view_audit') then
    return v_role in ('super_admin','admin');
  end if;
  return false;
end;
$$;

revoke all on function private.editorial_role(uuid) from public,anon,authenticated;
revoke all on function private.has_editorial_capability(uuid,text) from public,anon,authenticated;
grant execute on function private.editorial_role(uuid) to authenticated,service_role;
grant execute on function private.has_editorial_capability(uuid,text) to authenticated,service_role;

create table if not exists public.editorial_feature_flags (
  singleton boolean primary key default true check(singleton),
  module_enabled boolean not null default false,
  public_portal_enabled boolean not null default false,
  editorial_studio_enabled boolean not null default false,
  public_inquiries_enabled boolean not null default false,
  editorial_media_uploads_enabled boolean not null default false,
  homepage_tourism_enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
insert into public.editorial_feature_flags(singleton) values(true) on conflict(singleton) do nothing;

create table if not exists public.editorial_settings (
  singleton boolean primary key default true check(singleton),
  portal_name text not null default 'Aklan Tourism',
  portal_description text not null default '',
  default_social_image_url text,
  contact_email text,
  correction_email text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
insert into public.editorial_settings(singleton) values(true) on conflict(singleton) do nothing;

create table if not exists public.editorial_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check(length(btrim(name)) between 2 and 80),
  slug text not null unique check(slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  description text not null default '',
  content_type text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.editorial_tags (
  id uuid primary key default gen_random_uuid(),
  name text not null check(length(btrim(name)) between 2 and 80),
  slug text not null unique check(slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  created_at timestamptz not null default now()
);

create table if not exists public.editorial_municipalities (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check(length(btrim(name)) between 2 and 100),
  slug text not null unique check(slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  description text not null default '',
  hero_image_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.editorial_contributors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  display_name text not null check(length(btrim(display_name)) between 2 and 120),
  slug text not null unique check(slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  bio text not null default '',
  avatar_url text,
  website_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.editorial_posts (
  id uuid primary key default gen_random_uuid(),
  content_type text not null check(content_type in ('journal','event','place','activity','local_product')),
  title text not null check(length(btrim(title)) between 2 and 180),
  slug text not null unique check(slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  summary text not null default '' check(length(summary)<=500),
  status text not null default 'draft' check(status in ('draft','submitted','needs_revision','approved','scheduled','published','expired','archived')),
  author_user_id uuid not null references auth.users(id) on delete restrict,
  assigned_editor_user_id uuid references auth.users(id) on delete set null,
  contributor_id uuid references public.editorial_contributors(id) on delete set null,
  category_id uuid references public.editorial_categories(id) on delete set null,
  municipality_id uuid references public.editorial_municipalities(id) on delete set null,
  cover_image_url text,
  cover_image_alt text not null default '',
  current_revision_id uuid,
  published_revision_id uuid,
  scheduled_revision_id uuid,
  published_metadata jsonb,
  scheduled_metadata jsonb,
  scheduled_for timestamptz,
  published_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint editorial_publish_state check(
    (status<>'published' or published_revision_id is not null)
    and (status<>'scheduled' or (scheduled_for is not null and scheduled_revision_id is not null))
    and (status<>'published' or published_at is not null)
  )
);

create or replace function private.valid_editorial_document(p_document jsonb)
returns boolean language plpgsql immutable set search_path=pg_catalog as $$
declare v_block jsonb; v_image jsonb; v_item jsonb; v_type text; v_url text;
begin
  if jsonb_typeof(p_document)<>'object' or p_document->>'version'<>'1'
     or jsonb_typeof(p_document->'blocks')<>'array' or jsonb_array_length(p_document->'blocks')>200 then return false; end if;
  for v_block in select value from jsonb_array_elements(p_document->'blocks') loop
    if jsonb_typeof(v_block)<>'object' or octet_length(v_block::text)>200000
       or v_block::text ~* '"(html|rawHtml|css|javascript|script)"[[:space:]]*:' then return false; end if;
    v_type:=v_block->>'type';
    if v_type not in ('paragraph','heading','quote','image','gallery','facts','callout','divider') then return false; end if;
    if v_type='paragraph' and (jsonb_typeof(v_block->'text')<>'string' or length(v_block->>'text')>10000) then return false;
    elsif v_type='heading' and (jsonb_typeof(v_block->'text')<>'string' or length(v_block->>'text')>240 or coalesce((v_block->>'level')::int,2) not in(2,3,4)) then return false;
    elsif v_type='quote' and (jsonb_typeof(v_block->'text')<>'string' or length(v_block->>'text')>3000 or length(coalesce(v_block->>'attribution',''))>240) then return false;
    elsif v_type='image' then
      v_url:=coalesce(v_block->>'url','');
      if not (v_url ~ '^https://[^[:space:]<>"'']+$' or v_url ~ '^/([^/]|$)') or length(coalesce(v_block->>'alt',''))>240 or length(coalesce(v_block->>'caption',''))>500 then return false; end if;
    elsif v_type='gallery' then
      if jsonb_typeof(v_block->'images')<>'array' or jsonb_array_length(v_block->'images')>12 then return false; end if;
      for v_image in select value from jsonb_array_elements(v_block->'images') loop
        v_url:=coalesce(v_image->>'url','');
        if jsonb_typeof(v_image)<>'object' or not (v_url ~ '^https://[^[:space:]<>"'']+$' or v_url ~ '^/([^/]|$)') or length(coalesce(v_image->>'alt',''))>240 or length(coalesce(v_image->>'caption',''))>500 then return false; end if;
      end loop;
    elsif v_type='facts' then
      if jsonb_typeof(v_block->'items')<>'array' or jsonb_array_length(v_block->'items')>20 then return false; end if;
      for v_item in select value from jsonb_array_elements(v_block->'items') loop
        if jsonb_typeof(v_item)<>'object' or length(coalesce(v_item->>'label','')) not between 1 and 100 or length(coalesce(v_item->>'value','')) not between 1 and 500 then return false; end if;
      end loop;
    elsif v_type='callout' and (coalesce(v_block->>'tone','note') not in('note','tip','warning') or length(coalesce(v_block->>'title',''))>160 or length(coalesce(v_block->>'text',''))>2000 or length(coalesce(v_block->>'linkLabel',''))>80 or (coalesce(v_block->>'linkUrl','')<>'' and not ((v_block->>'linkUrl') ~ '^https://[^[:space:]<>"'']+$' or (v_block->>'linkUrl') ~ '^/([^/]|$)'))) then return false;
    end if;
  end loop;
  return true;
exception when others then return false;
end;
$$;

create table if not exists public.editorial_revisions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.editorial_posts(id) on delete cascade,
  revision_number integer not null check(revision_number>0),
  document jsonb not null default '{"version":1,"blocks":[]}'::jsonb check(private.valid_editorial_document(document)),
  seo_title text not null default '' check(length(seo_title)<=180),
  seo_description text not null default '' check(length(seo_description)<=320),
  editor_note text not null default '' check(length(editor_note)<=2000),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(post_id,revision_number)
);

alter table public.editorial_posts drop constraint if exists editorial_posts_current_revision_id_fkey;
alter table public.editorial_posts add constraint editorial_posts_current_revision_id_fkey foreign key(current_revision_id) references public.editorial_revisions(id) on delete set null;
alter table public.editorial_posts drop constraint if exists editorial_posts_published_revision_id_fkey;
alter table public.editorial_posts add constraint editorial_posts_published_revision_id_fkey foreign key(published_revision_id) references public.editorial_revisions(id) on delete restrict;
alter table public.editorial_posts drop constraint if exists editorial_posts_scheduled_revision_id_fkey;
alter table public.editorial_posts add constraint editorial_posts_scheduled_revision_id_fkey foreign key(scheduled_revision_id) references public.editorial_revisions(id) on delete set null;

create table if not exists public.editorial_autosaves (
  post_id uuid not null references public.editorial_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  document jsonb not null check(private.valid_editorial_document(document)),
  metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(metadata)='object'),
  base_revision_id uuid references public.editorial_revisions(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key(post_id,user_id)
);

create table if not exists public.editorial_post_tags (
  post_id uuid not null references public.editorial_posts(id) on delete cascade,
  tag_id uuid not null references public.editorial_tags(id) on delete cascade,
  primary key(post_id,tag_id)
);

create table if not exists public.editorial_event_details (
  post_id uuid primary key references public.editorial_posts(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz,
  venue_name text not null default '',
  location_text text not null default '',
  organizer text not null default '',
  official_contact text not null default '',
  official_url text,
  price_note text not null default '',
  event_status text not null default 'scheduled' check(event_status in('scheduled','ongoing','completed','postponed','cancelled','expired')),
  cancelled_at timestamptz,
  postponed_at timestamptz,
  check(ends_at is null or ends_at>=starts_at),
  check(official_url is null or official_url ~ '^https://')
);

create table if not exists public.editorial_place_details (
  post_id uuid primary key references public.editorial_posts(id) on delete cascade,
  address_text text not null default '',
  latitude numeric(9,6),
  longitude numeric(9,6),
  opening_hours_note text not null default '',
  contact_note text not null default '',
  accessibility_note text not null default '',
  place_type text not null default '',
  verification_status text not null default 'unverified' check(verification_status in('unverified','verified','needs_review','unavailable')),
  official_url text,
  check(latitude is null or latitude between -90 and 90),
  check(longitude is null or longitude between -180 and 180),
  check(official_url is null or official_url ~ '^https://')
);

create table if not exists public.editorial_activity_details (
  post_id uuid primary key references public.editorial_posts(id) on delete cascade,
  duration_note text not null default '',
  difficulty text not null default '' check(difficulty in ('','easy','moderate','challenging','varies')),
  meeting_point text not null default '',
  safety_note text not null default '',
  activity_type text not null default '',
  availability_note text not null default '',
  contact_note text not null default '',
  verification_status text not null default 'unverified' check(verification_status in('unverified','verified','needs_review','unavailable')),
  official_url text check(official_url is null or official_url ~ '^https://')
);

create table if not exists public.editorial_product_details (
  post_id uuid primary key references public.editorial_posts(id) on delete cascade,
  maker_name text not null default '',
  purchase_location text not null default '',
  price_note text not null default '',
  product_type text not null default '',
  contact_note text not null default '',
  verification_status text not null default 'unverified' check(verification_status in('unverified','verified','needs_review','unavailable')),
  official_url text check(official_url is null or official_url ~ '^https://')
);

create table if not exists public.editorial_homepage_sections (
  id uuid primary key default gen_random_uuid(),
  section_key text not null unique check(section_key ~ '^[a-z][a-z0-9_-]{1,59}$'),
  heading text not null default '',
  description text not null default '',
  sort_order integer not null default 0,
  is_visible boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create table if not exists public.editorial_homepage_items (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.editorial_homepage_sections(id) on delete cascade,
  post_id uuid not null references public.editorial_posts(id) on delete cascade,
  sort_order integer not null default 0,
  label text not null default '',
  unique(section_id,post_id)
);

create table if not exists public.editorial_corrections (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.editorial_posts(id) on delete cascade,
  revision_id uuid references public.editorial_revisions(id) on delete set null,
  summary text not null check(length(btrim(summary)) between 5 and 1000),
  corrected_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id) on delete restrict
);

create table if not exists public.editorial_sources (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.editorial_posts(id) on delete cascade,
  source_name text not null check(length(btrim(source_name)) between 2 and 180),
  source_url text check(source_url is null or source_url ~ '^https://[^[:space:]<>"'']+$'),
  official_contact text not null default '' check(length(official_contact)<=500),
  verification_status text not null default 'unverified' check(verification_status in('unverified','verified','needs_review','unavailable')),
  verified_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now()
);

create table if not exists public.editorial_audit_events (
  id bigint generated always as identity primary key,
  actor_user_id uuid references auth.users(id) on delete set null,
  post_id uuid references public.editorial_posts(id) on delete set null,
  action text not null,
  from_status text,
  to_status text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists editorial_posts_public_idx on public.editorial_posts(content_type,published_at desc) where status='published';
create index if not exists editorial_posts_author_idx on public.editorial_posts(author_user_id,status,updated_at desc);
create index if not exists editorial_posts_editor_idx on public.editorial_posts(assigned_editor_user_id,status,updated_at desc);
create index if not exists editorial_posts_municipality_idx on public.editorial_posts(municipality_id,content_type,published_at desc);
create index if not exists editorial_revisions_post_idx on public.editorial_revisions(post_id,revision_number desc);
create index if not exists editorial_events_start_idx on public.editorial_event_details(starts_at);
create index if not exists editorial_audit_post_idx on public.editorial_audit_events(post_id,created_at desc);
create index if not exists editorial_sources_post_idx on public.editorial_sources(post_id,verification_status);

alter table public.external_media_objects add column if not exists editorial_post_id uuid references public.editorial_posts(id) on delete set null;
create index if not exists external_media_editorial_idx on public.external_media_objects(editorial_post_id,provider,accounting_state) where editorial_post_id is not null;
alter table public.external_media_objects drop constraint if exists external_media_objects_file_category_check;
alter table public.external_media_objects add constraint external_media_objects_file_category_check check(file_category in(
  'project_original','project_file','profile_original','project_gallery','project_cover','external_thumbnail','profile_photo','profile_cover','site_image','service_image','editorial_cover','editorial_inline'
));
alter table public.external_media_objects drop constraint if exists external_media_objects_target_check;
alter table public.external_media_objects add constraint external_media_objects_target_check check(
  (provider='google_drive' and (
    (file_category in('project_original','project_file') and project_id is not null and creative_member_id is null and editorial_post_id is null)
    or (file_category='profile_original' and creative_member_id is not null and project_id is null and editorial_post_id is null)
    or (metadata->>'purpose' in('project_gallery_original','admin_test_upload'))
  ))
  or (provider<>'google_drive' and (
    file_category not in('editorial_cover','editorial_inline')
    or (editorial_post_id is not null and project_id is null and creative_member_id is null)
    or status in('deleted','cancelled')
  ))
);

create or replace function private.guard_editorial_post_workflow_fields()
returns trigger language plpgsql security definer set search_path=public,private,pg_temp as $$
begin
  if tg_op='UPDATE' and current_setting('app.editorial_workflow',true)<>'1' and (
    new.status is distinct from old.status or new.current_revision_id is distinct from old.current_revision_id
    or new.published_revision_id is distinct from old.published_revision_id or new.scheduled_revision_id is distinct from old.scheduled_revision_id
    or new.published_metadata is distinct from old.published_metadata or new.scheduled_metadata is distinct from old.scheduled_metadata
    or new.published_at is distinct from old.published_at or new.scheduled_for is distinct from old.scheduled_for or new.archived_at is distinct from old.archived_at
    or new.author_user_id is distinct from old.author_user_id or new.assigned_editor_user_id is distinct from old.assigned_editor_user_id
  ) then raise exception 'EDITORIAL_WORKFLOW_FIELDS_REQUIRE_RPC'; end if;
  return new;
end;
$$;
drop trigger if exists guard_editorial_post_workflow_fields on public.editorial_posts;
create trigger guard_editorial_post_workflow_fields before update on public.editorial_posts for each row execute function private.guard_editorial_post_workflow_fields();

create or replace function public.save_editorial_revision(p_post_id uuid,p_document jsonb,p_seo_title text default '',p_seo_description text default '',p_editor_note text default '',p_expected_current_revision_id uuid default null,p_metadata jsonb default '{}'::jsonb)
returns public.editorial_revisions language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_post public.editorial_posts; v_revision public.editorial_revisions; v_number integer;
begin
  select * into v_post from public.editorial_posts where id=p_post_id for update;
  if found and v_post.status='published' and (v_post.author_user_id=auth.uid() or private.has_editorial_capability(auth.uid(),'manage_all')) then
    perform set_config('app.editorial_workflow','1',true);
    update public.editorial_posts set status='draft',updated_at=now() where id=p_post_id returning * into v_post;
    insert into public.editorial_audit_events(actor_user_id,post_id,action,from_status,to_status,details) values(auth.uid(),p_post_id,'start_revision','published','draft','{}'::jsonb);
  end if;
  if not found or v_post.status not in('draft','needs_revision') or not (private.has_editorial_capability(auth.uid(),'manage_all') or v_post.author_user_id=auth.uid() or v_post.assigned_editor_user_id=auth.uid()) then raise exception 'EDITORIAL_NOT_AUTHORIZED'; end if;
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

create or replace function private.editorial_metadata_snapshot(p_post_id uuid)
returns jsonb language sql stable security definer set search_path=public,private,pg_temp as $$
  select jsonb_build_object(
    'title',p.title,'summary',p.summary,'slug',p.slug,'coverImageUrl',p.cover_image_url,
    'coverImageAlt',p.cover_image_alt,'categoryId',p.category_id,'municipalityId',p.municipality_id,
    'details',case p.content_type
      when 'event' then (select to_jsonb(d)-'post_id' from public.editorial_event_details d where d.post_id=p.id)
      when 'place' then (select to_jsonb(d)-'post_id' from public.editorial_place_details d where d.post_id=p.id)
      when 'activity' then (select to_jsonb(d)-'post_id' from public.editorial_activity_details d where d.post_id=p.id)
      when 'local_product' then (select to_jsonb(d)-'post_id' from public.editorial_product_details d where d.post_id=p.id)
      else null end
  ) from public.editorial_posts p where p.id=p_post_id
$$;

create or replace function private.transition_editorial_post(p_post_id uuid,p_action text,p_scheduled_for timestamptz default null,p_note text default '')
returns public.editorial_posts language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_post public.editorial_posts; v_from text; v_to text;
begin
  select * into v_post from public.editorial_posts where id=p_post_id for update;
  if not found then raise exception 'EDITORIAL_POST_NOT_FOUND'; end if;
  v_from:=v_post.status;
  if p_action='submit' and v_from in('draft','needs_revision') and (v_post.author_user_id=auth.uid() or v_post.assigned_editor_user_id=auth.uid() or private.has_editorial_capability(auth.uid(),'manage_all')) then v_to:='submitted';
  elsif p_action='start_revision' and v_from='published' and (v_post.author_user_id=auth.uid() or private.has_editorial_capability(auth.uid(),'manage_all')) then v_to:='draft';
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
  values(auth.uid(),p_post_id,p_action,v_from,v_to,jsonb_build_object('note',left(coalesce(p_note,''),500),'scheduledFor',p_scheduled_for));
  return v_post;
end;
$$;

create or replace function public.submit_editorial_post(p_post_id uuid) returns public.editorial_posts language sql security definer set search_path=public,private,pg_temp as $$select private.transition_editorial_post(p_post_id,'submit')$$;
create or replace function public.start_editorial_revision(p_post_id uuid) returns public.editorial_posts language sql security definer set search_path=public,private,pg_temp as $$select private.transition_editorial_post(p_post_id,'start_revision')$$;
create or replace function public.request_editorial_changes(p_post_id uuid,p_note text default '') returns public.editorial_posts language sql security definer set search_path=public,private,pg_temp as $$select private.transition_editorial_post(p_post_id,'request_changes',null,p_note)$$;
create or replace function public.approve_editorial_post(p_post_id uuid,p_note text default '') returns public.editorial_posts language sql security definer set search_path=public,private,pg_temp as $$select private.transition_editorial_post(p_post_id,'approve',null,p_note)$$;
create or replace function public.schedule_editorial_post(p_post_id uuid,p_scheduled_for timestamptz) returns public.editorial_posts language sql security definer set search_path=public,private,pg_temp as $$select private.transition_editorial_post(p_post_id,'schedule',p_scheduled_for)$$;
create or replace function public.publish_editorial_post(p_post_id uuid) returns public.editorial_posts language sql security definer set search_path=public,private,pg_temp as $$select private.transition_editorial_post(p_post_id,'publish')$$;
create or replace function public.archive_editorial_post(p_post_id uuid,p_note text default '') returns public.editorial_posts language sql security definer set search_path=public,private,pg_temp as $$select private.transition_editorial_post(p_post_id,'archive',null,p_note)$$;

create or replace function public.restore_editorial_revision(p_post_id uuid,p_revision_id uuid)
returns public.editorial_revisions language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_source public.editorial_revisions; v_post public.editorial_posts; v_result public.editorial_revisions;
begin
  if not private.has_editorial_capability(auth.uid(),'review') then raise exception 'EDITORIAL_NOT_AUTHORIZED'; end if;
  select * into v_post from public.editorial_posts where id=p_post_id for update;
  select * into v_source from public.editorial_revisions where id=p_revision_id and post_id=p_post_id;
  if v_post.id is null or v_source.id is null or v_post.status in('archived','expired') then raise exception 'EDITORIAL_RESTORE_NOT_ALLOWED'; end if;
  select * into v_result from public.save_editorial_revision(p_post_id,v_source.document,v_source.seo_title,v_source.seo_description,'Restored from revision '||v_source.revision_number,v_post.current_revision_id);
  insert into public.editorial_audit_events(actor_user_id,post_id,action,from_status,to_status,details) values(auth.uid(),p_post_id,'revision_restored',v_post.status,v_post.status,jsonb_build_object('sourceRevisionId',p_revision_id,'newRevisionId',v_result.id));
  return v_result;
end;
$$;

create or replace function private.publish_due_editorial_posts()
returns integer language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_count integer;
begin
  perform set_config('app.editorial_workflow','1',true);
  with due as (
    update public.editorial_posts set status='published',published_revision_id=scheduled_revision_id,published_metadata=scheduled_metadata,published_at=now(),scheduled_for=null,scheduled_revision_id=null,scheduled_metadata=null,updated_at=now()
    where status='scheduled' and scheduled_for<=now() and scheduled_revision_id is not null returning id
  ), audit as (
    insert into public.editorial_audit_events(post_id,action,from_status,to_status,details)
    select id,'scheduled_publish','scheduled','published','{}'::jsonb from due returning 1
  ) select count(*) into v_count from audit;
  return v_count;
end;
$$;

create or replace function private.expire_due_editorial_events()
returns integer language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_count integer;
begin
  perform set_config('app.editorial_workflow','1',true);
  update public.editorial_event_details e set event_status='expired'
  from public.editorial_posts p where e.post_id=p.id and p.status='published' and e.ends_at is not null and e.ends_at<now();
  with expired as (
    update public.editorial_posts p set status='expired',published_metadata=jsonb_set(coalesce(published_metadata,'{}'::jsonb),'{details,event_status}','"expired"'::jsonb,true),updated_at=now()
    from public.editorial_event_details e where e.post_id=p.id and p.status='published' and e.ends_at is not null and e.ends_at<now() returning p.id
  ), audit as (
    insert into public.editorial_audit_events(post_id,action,from_status,to_status,details) select id,'event_expired','published','expired','{}'::jsonb from expired returning 1
  ) select count(*) into v_count from audit;
  return v_count;
end;
$$;

revoke all on function public.save_editorial_revision(uuid,jsonb,text,text,text,uuid,jsonb) from public,anon;
revoke all on function private.editorial_metadata_snapshot(uuid) from public,anon,authenticated;
revoke all on function private.transition_editorial_post(uuid,text,timestamptz,text) from public,anon,authenticated;
grant execute on function private.transition_editorial_post(uuid,text,timestamptz,text) to service_role;
grant execute on function public.save_editorial_revision(uuid,jsonb,text,text,text,uuid,jsonb) to authenticated,service_role;
grant execute on function public.submit_editorial_post(uuid) to authenticated;
grant execute on function public.start_editorial_revision(uuid) to authenticated;
grant execute on function public.request_editorial_changes(uuid,text) to authenticated;
grant execute on function public.approve_editorial_post(uuid,text) to authenticated;
grant execute on function public.schedule_editorial_post(uuid,timestamptz) to authenticated;
grant execute on function public.publish_editorial_post(uuid) to authenticated;
grant execute on function public.archive_editorial_post(uuid,text) to authenticated;
grant execute on function public.restore_editorial_revision(uuid,uuid) to authenticated;
revoke all on function private.publish_due_editorial_posts() from public,anon,authenticated;
grant execute on function private.publish_due_editorial_posts() to service_role;
revoke all on function private.expire_due_editorial_events() from public,anon,authenticated;
grant execute on function private.expire_due_editorial_events() to service_role;

do $$ declare t text; begin foreach t in array array['editorial_feature_flags','editorial_settings','editorial_categories','editorial_tags','editorial_municipalities','editorial_contributors','editorial_posts','editorial_revisions','editorial_autosaves','editorial_post_tags','editorial_event_details','editorial_place_details','editorial_activity_details','editorial_product_details','editorial_homepage_sections','editorial_homepage_items','editorial_corrections','editorial_sources','editorial_audit_events'] loop execute format('alter table public.%I enable row level security',t); end loop; end $$;

create policy editorial_flags_public_read on public.editorial_feature_flags for select using(true);
create policy editorial_flags_admin_write on public.editorial_feature_flags for all to authenticated using(private.has_editorial_capability(auth.uid(),'manage_settings')) with check(private.has_editorial_capability(auth.uid(),'manage_settings'));
create policy editorial_settings_public_read on public.editorial_settings for select using((select module_enabled and public_portal_enabled from public.editorial_feature_flags where singleton));
create policy editorial_settings_admin_write on public.editorial_settings for all to authenticated using(private.has_editorial_capability(auth.uid(),'manage_settings')) with check(private.has_editorial_capability(auth.uid(),'manage_settings'));

do $$ declare t text; begin foreach t in array array['editorial_categories','editorial_tags','editorial_municipalities','editorial_contributors'] loop
  execute format('create policy %I on public.%I for select using ((select module_enabled and public_portal_enabled from public.editorial_feature_flags where singleton) or private.has_editorial_capability(auth.uid(),''enter''))',t||'_read',t);
  execute format('create policy %I on public.%I for all to authenticated using (private.has_editorial_capability(auth.uid(),''manage_taxonomy'')) with check (private.has_editorial_capability(auth.uid(),''manage_taxonomy''))',t||'_manage',t);
end loop; end $$;

create policy editorial_posts_public_read on public.editorial_posts for select using(published_revision_id is not null and published_at is not null and archived_at is null and (select module_enabled and public_portal_enabled from public.editorial_feature_flags where singleton));
create policy editorial_posts_team_read on public.editorial_posts for select to authenticated using(private.has_editorial_capability(auth.uid(),'manage_all') or author_user_id=auth.uid() or assigned_editor_user_id=auth.uid());
create policy editorial_posts_team_insert on public.editorial_posts for insert to authenticated with check(private.has_editorial_capability(auth.uid(),'create') and author_user_id=auth.uid() and status='draft');
create policy editorial_posts_team_update on public.editorial_posts for update to authenticated using(status in('draft','needs_revision') and (private.has_editorial_capability(auth.uid(),'manage_all') or author_user_id=auth.uid() or assigned_editor_user_id=auth.uid())) with check(status in('draft','needs_revision') and (private.has_editorial_capability(auth.uid(),'manage_all') or author_user_id=auth.uid() or assigned_editor_user_id=auth.uid()));

create policy editorial_revisions_public_read on public.editorial_revisions for select using(exists(select 1 from public.editorial_posts p where p.published_revision_id=editorial_revisions.id and p.published_at is not null and p.archived_at is null));
create policy editorial_revisions_team_read on public.editorial_revisions for select to authenticated using(exists(select 1 from public.editorial_posts p where p.id=post_id and (private.has_editorial_capability(auth.uid(),'manage_all') or p.author_user_id=auth.uid() or p.assigned_editor_user_id=auth.uid())));
create policy editorial_autosaves_owner on public.editorial_autosaves for all to authenticated using(user_id=auth.uid() and exists(select 1 from public.editorial_posts p where p.id=post_id and (p.author_user_id=auth.uid() or p.assigned_editor_user_id=auth.uid() or private.has_editorial_capability(auth.uid(),'manage_all')))) with check(user_id=auth.uid() and exists(select 1 from public.editorial_posts p where p.id=post_id and p.status in('draft','needs_revision') and (p.author_user_id=auth.uid() or p.assigned_editor_user_id=auth.uid() or private.has_editorial_capability(auth.uid(),'manage_all'))));

do $$ declare t text; begin foreach t in array array['editorial_post_tags','editorial_event_details','editorial_place_details','editorial_activity_details','editorial_product_details'] loop
  execute format('create policy %I on public.%I for select using (exists(select 1 from public.editorial_posts p where p.id=post_id and (p.status=''published'' or private.has_editorial_capability(auth.uid(),''manage_all'') or p.author_user_id=auth.uid() or p.assigned_editor_user_id=auth.uid())))',t||'_read',t);
  execute format('create policy %I on public.%I for all to authenticated using (exists(select 1 from public.editorial_posts p where p.id=post_id and p.status in(''draft'',''needs_revision'') and (private.has_editorial_capability(auth.uid(),''manage_all'') or p.author_user_id=auth.uid() or p.assigned_editor_user_id=auth.uid()))) with check (exists(select 1 from public.editorial_posts p where p.id=post_id and p.status in(''draft'',''needs_revision'') and (private.has_editorial_capability(auth.uid(),''manage_all'') or p.author_user_id=auth.uid() or p.assigned_editor_user_id=auth.uid())))',t||'_write',t);
end loop; end $$;

create policy editorial_homepage_sections_read on public.editorial_homepage_sections for select using((select module_enabled and public_portal_enabled and homepage_tourism_enabled from public.editorial_feature_flags where singleton) or private.has_editorial_capability(auth.uid(),'enter'));
create policy editorial_homepage_items_read on public.editorial_homepage_items for select using((select module_enabled and public_portal_enabled and homepage_tourism_enabled from public.editorial_feature_flags where singleton) or private.has_editorial_capability(auth.uid(),'enter'));
create policy editorial_homepage_sections_manage on public.editorial_homepage_sections for all to authenticated using(private.has_editorial_capability(auth.uid(),'manage_homepage')) with check(private.has_editorial_capability(auth.uid(),'manage_homepage'));
create policy editorial_homepage_items_manage on public.editorial_homepage_items for all to authenticated using(private.has_editorial_capability(auth.uid(),'manage_homepage')) with check(private.has_editorial_capability(auth.uid(),'manage_homepage'));
create policy editorial_corrections_public_read on public.editorial_corrections for select using(exists(select 1 from public.editorial_posts p where p.id=post_id and p.status='published'));
create policy editorial_corrections_manage on public.editorial_corrections for all to authenticated using(private.has_editorial_capability(auth.uid(),'review')) with check(private.has_editorial_capability(auth.uid(),'review') and created_by=auth.uid());
create policy editorial_sources_public_read on public.editorial_sources for select using(verification_status='verified' and exists(select 1 from public.editorial_posts p where p.id=post_id and p.published_revision_id is not null and p.published_at is not null and p.archived_at is null));
create policy editorial_sources_insert on public.editorial_sources for insert to authenticated with check(private.has_editorial_capability(auth.uid(),'manage_sources') and created_by=auth.uid());
create policy editorial_sources_update on public.editorial_sources for update to authenticated using(private.has_editorial_capability(auth.uid(),'manage_sources')) with check(private.has_editorial_capability(auth.uid(),'manage_sources'));
create policy editorial_sources_delete on public.editorial_sources for delete to authenticated using(private.has_editorial_capability(auth.uid(),'manage_sources'));
create policy editorial_audit_admin_read on public.editorial_audit_events for select to authenticated using(private.has_editorial_capability(auth.uid(),'view_audit'));

grant select on public.editorial_feature_flags,public.editorial_settings,public.editorial_categories,public.editorial_tags,public.editorial_municipalities,public.editorial_contributors,public.editorial_posts,public.editorial_revisions,public.editorial_post_tags,public.editorial_event_details,public.editorial_place_details,public.editorial_activity_details,public.editorial_product_details,public.editorial_homepage_sections,public.editorial_homepage_items,public.editorial_corrections,public.editorial_sources to anon,authenticated;
grant select,insert,update,delete on public.editorial_autosaves to authenticated;
grant insert,update,delete on public.editorial_feature_flags,public.editorial_settings,public.editorial_categories,public.editorial_tags,public.editorial_municipalities,public.editorial_contributors,public.editorial_posts,public.editorial_post_tags,public.editorial_event_details,public.editorial_place_details,public.editorial_activity_details,public.editorial_product_details,public.editorial_homepage_sections,public.editorial_homepage_items,public.editorial_corrections,public.editorial_sources to authenticated;
grant select on public.editorial_audit_events to authenticated;

comment on table public.editorial_posts is 'Tourism/editorial content metadata. The rendered body lives in immutable validated revisions.';
comment on column public.editorial_revisions.document is 'Versioned allowlisted block document. Raw HTML, CSS, and JavaScript are forbidden.';
comment on table public.editorial_feature_flags is 'Fail-closed release controls; every flag defaults to false.';

commit;
