-- Complete the managed Google Drive lifecycle without replaying the older standalone phase scripts.
-- Pre-deployment requirement: compare the production definitions of storage_connections,
-- external_media_objects, private.is_eligible_storage_owner, and Vault helper functions.

begin;

create schema if not exists private;

alter table public.external_media_objects
  add column if not exists file_category text,
  add column if not exists project_id uuid references public.projects(id) on delete set null,
  add column if not exists creative_member_id uuid references public.creative_members(id) on delete set null,
  add column if not exists profile_media_kind text,
  add column if not exists preview_required boolean not null default false,
  add column if not exists replaces_media_object_id uuid references public.external_media_objects(id) on delete set null,
  add column if not exists replaced_by_media_object_id uuid references public.external_media_objects(id) on delete set null,
  add column if not exists original_parent_role text,
  add column if not exists archived_at timestamptz,
  add column if not exists archive_reason text,
  add column if not exists cleanup_status text not null default 'none',
  add column if not exists cleanup_attempt_count integer not null default 0,
  add column if not exists cleanup_error text,
  add column if not exists upload_expires_at timestamptz,
  add column if not exists uploaded_bytes bigint not null default 0;

update public.external_media_objects
set file_category = case
  when metadata ->> 'purpose' = 'project_gallery_original' then 'project_original'
  when metadata ->> 'purpose' = 'profile_original' then 'profile_original'
  else 'project_file'
end
where file_category is null;

alter table public.external_media_objects
  alter column file_category set default 'project_file',
  alter column file_category set not null;

alter table public.external_media_objects drop constraint if exists external_media_objects_file_category_check;
alter table public.external_media_objects add constraint external_media_objects_file_category_check
  check (file_category in ('project_original','project_file','profile_original'));
alter table public.external_media_objects drop constraint if exists external_media_objects_profile_media_kind_check;
alter table public.external_media_objects add constraint external_media_objects_profile_media_kind_check
  check (profile_media_kind is null or profile_media_kind in ('profile','cover'));
alter table public.external_media_objects drop constraint if exists external_media_objects_cleanup_status_check;
alter table public.external_media_objects add constraint external_media_objects_cleanup_status_check
  check (cleanup_status in ('none','pending','retry_required','manual_required','complete'));
alter table public.external_media_objects drop constraint if exists external_media_objects_status_check;
alter table public.external_media_objects add constraint external_media_objects_status_check
  check (status in ('pending','initiating','uploading','processing','available','verification_required','unavailable','replacing','archiving','archived','restoring','deleting','deleted','cancelled','abandoned','error'));
alter table public.external_media_objects drop constraint if exists external_media_objects_target_check;
alter table public.external_media_objects add constraint external_media_objects_target_check check (
  provider <> 'google_drive'
  or (file_category in ('project_original','project_file') and project_id is not null and creative_member_id is null)
  or (file_category = 'profile_original' and creative_member_id is not null and project_id is null)
  or (metadata ->> 'purpose' in ('project_gallery_original','admin_test_upload'))
);
alter table public.external_media_objects drop constraint if exists external_media_objects_uploaded_bytes_check;
alter table public.external_media_objects add constraint external_media_objects_uploaded_bytes_check
  check (uploaded_bytes >= 0 and uploaded_bytes <= size_bytes);
alter table public.external_media_objects drop constraint if exists external_media_objects_cleanup_attempt_count_check;
alter table public.external_media_objects add constraint external_media_objects_cleanup_attempt_count_check
  check (cleanup_attempt_count >= 0);

create index if not exists external_media_project_category_status_idx
  on public.external_media_objects(project_id, file_category, status, created_at desc)
  where project_id is not null;
create index if not exists external_media_profile_category_status_idx
  on public.external_media_objects(creative_member_id, profile_media_kind, status, created_at desc)
  where creative_member_id is not null;
create index if not exists external_media_cleanup_retry_idx
  on public.external_media_objects(cleanup_status, updated_at)
  where cleanup_status in ('pending','retry_required','manual_required');
create index if not exists external_media_abandoned_upload_idx
  on public.external_media_objects(upload_expires_at)
  where status in ('initiating','uploading');

create table if not exists private.external_upload_sessions (
  id uuid primary key default gen_random_uuid(),
  media_object_id uuid not null unique references public.external_media_objects(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  upload_url_secret_id uuid not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

revoke all on private.external_upload_sessions from public, anon, authenticated;

create or replace function private.server_create_external_upload_session(
  p_owner_user_id uuid,
  p_media_object_id uuid,
  p_upload_url text,
  p_expires_at timestamptz
) returns uuid
language plpgsql security definer
set search_path = pg_catalog, public, private as $$
declare v_secret_id uuid; v_session_id uuid;
begin
  if p_upload_url !~ '^https://www\.googleapis\.com/upload/drive/v3/files' or p_expires_at <= now() then
    raise exception 'Invalid resumable upload session.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.external_media_objects
    where id = p_media_object_id and owner_user_id = p_owner_user_id and provider = 'google_drive'
      and status in ('initiating','uploading')
  ) then raise exception 'Upload media object is unavailable.' using errcode = '22023'; end if;

  select upload_url_secret_id into v_secret_id
  from private.external_upload_sessions where media_object_id = p_media_object_id;
  if v_secret_id is not null then perform private.delete_provider_secret(v_secret_id); end if;
  v_secret_id := private.create_provider_secret(p_owner_user_id, 'google_drive', 'resumable_upload', p_upload_url);
  insert into private.external_upload_sessions(media_object_id, owner_user_id, upload_url_secret_id, expires_at)
  values (p_media_object_id, p_owner_user_id, v_secret_id, p_expires_at)
  on conflict (media_object_id) do update set
    upload_url_secret_id = excluded.upload_url_secret_id,
    expires_at = excluded.expires_at,
    created_at = now()
  returning id into v_session_id;
  return v_session_id;
end;
$$;

create or replace function private.server_read_external_upload_session(
  p_owner_user_id uuid,
  p_media_object_id uuid
) returns table(upload_url text, expires_at timestamptz)
language plpgsql security definer
set search_path = pg_catalog, private as $$
declare v_session private.external_upload_sessions%rowtype;
begin
  select * into v_session from private.external_upload_sessions
  where owner_user_id = p_owner_user_id and media_object_id = p_media_object_id;
  if not found then return; end if;
  upload_url := private.read_provider_secret(v_session.upload_url_secret_id);
  expires_at := v_session.expires_at;
  return next;
end;
$$;

create or replace function private.server_delete_external_upload_session(
  p_owner_user_id uuid,
  p_media_object_id uuid
) returns boolean
language plpgsql security definer
set search_path = pg_catalog, private as $$
declare v_secret_id uuid;
begin
  delete from private.external_upload_sessions
  where owner_user_id = p_owner_user_id and media_object_id = p_media_object_id
  returning upload_url_secret_id into v_secret_id;
  if v_secret_id is null then return false; end if;
  perform private.delete_provider_secret(v_secret_id);
  return true;
end;
$$;

revoke all on function private.server_create_external_upload_session(uuid,uuid,text,timestamptz) from public, anon, authenticated;
revoke all on function private.server_read_external_upload_session(uuid,uuid) from public, anon, authenticated;
revoke all on function private.server_delete_external_upload_session(uuid,uuid) from public, anon, authenticated;

-- Browser clients receive lifecycle records through permission-checking Edge Functions.
-- Keep provider identifiers, session capabilities, checksums, paths, and arbitrary metadata server-only.
revoke select on table public.external_media_objects from authenticated;
grant select (
  id, owner_user_id, provider, filename, mime_type, size_bytes, width, height,
  duration_seconds, visibility, status, file_category, project_id, creative_member_id,
  profile_media_kind, preview_required, preview_provider, preview_bucket, preview_path,
  replaces_media_object_id, replaced_by_media_object_id, archived_at, archive_reason,
  cleanup_status, cleanup_attempt_count, cleanup_error, uploaded_bytes, upload_expires_at,
  created_at, updated_at
) on table public.external_media_objects to authenticated;

comment on table private.external_upload_sessions is 'Server-only, Vault-backed Google resumable upload capabilities. Never exposed through PostgREST.';
comment on column public.external_media_objects.external_file_id is 'Private provider identifier; never return to browser clients.';
comment on column public.external_media_objects.file_category is 'Private original, Drive-only project file, or profile original.';
comment on column public.external_media_objects.cleanup_status is 'Provider cleanup retry state surfaced without provider identifiers.';

notify pgrst, 'reload schema';
commit;
