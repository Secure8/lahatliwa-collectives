-- Proposed Bring Your Own Storage foundation. DO NOT apply during Phase 1 review.
-- This migration creates metadata only. It does not access, copy, move, or delete Storage objects.
-- Apply only after the application and security review is complete.

begin;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table if not exists public.storage_connections (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('google_drive','onedrive','dropbox','s3_compatible')),
  provider_account_id text,
  provider_account_email text,
  display_name text,
  root_folder_id text,
  credential_secret_id uuid,
  status text not null default 'pending' check (status in ('pending','connected','reconnect_required','revoked','disabled','error')),
  is_default boolean not null default false,
  capabilities jsonb not null default '{}'::jsonb check (jsonb_typeof(capabilities) = 'object'),
  connected_at timestamptz,
  last_verified_at timestamptz,
  last_error_code text,
  last_error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_user_id),
  check (not is_default or status = 'connected')
);

create unique index if not exists storage_connections_provider_account_unique_idx
on public.storage_connections(owner_user_id, provider, provider_account_id)
where provider_account_id is not null;
create unique index if not exists storage_connections_one_default_idx
on public.storage_connections(owner_user_id)
where is_default;
create index if not exists storage_connections_owner_status_idx
on public.storage_connections(owner_user_id, status, provider);

create table if not exists public.external_media_objects (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  storage_connection_id uuid,
  provider text not null check (provider in ('supabase','google_drive','onedrive','dropbox','s3_compatible')),
  external_file_id text,
  external_parent_id text,
  bucket text,
  storage_path text,
  filename text not null,
  mime_type text not null,
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  checksum_algorithm text,
  checksum_value text,
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  duration_seconds numeric check (duration_seconds is null or duration_seconds >= 0),
  visibility text not null default 'private' check (visibility in ('public','private','unlisted')),
  status text not null default 'pending' check (status in ('pending','uploading','available','verification_required','unavailable','deleting','deleted','error')),
  preview_provider text check (preview_provider is null or preview_provider in ('supabase','google_drive','onedrive','dropbox','s3_compatible')),
  preview_bucket text,
  preview_path text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_user_id),
  foreign key (storage_connection_id, owner_user_id)
    references public.storage_connections(id, owner_user_id) on delete restrict,
  check (
    (provider = 'supabase' and storage_connection_id is null and bucket is not null and storage_path is not null)
    or
    (provider <> 'supabase' and storage_connection_id is not null)
  ),
  check (
    (preview_provider is null and preview_bucket is null and preview_path is null)
    or
    (preview_provider is not null and preview_path is not null)
  )
);

create unique index if not exists external_media_provider_file_unique_idx
on public.external_media_objects(provider, storage_connection_id, external_file_id)
where external_file_id is not null and status <> 'deleted';
create unique index if not exists external_media_supabase_path_unique_idx
on public.external_media_objects(provider, bucket, storage_path)
where provider = 'supabase' and status <> 'deleted';
create index if not exists external_media_owner_status_idx
on public.external_media_objects(owner_user_id, status, provider);

create table if not exists public.storage_migrations (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  media_object_id uuid,
  source_provider text not null check (source_provider in ('supabase','google_drive','onedrive','dropbox','s3_compatible')),
  source_bucket text,
  source_path text,
  destination_connection_id uuid not null,
  destination_provider text not null check (destination_provider in ('google_drive','onedrive','dropbox','s3_compatible')),
  destination_file_id text,
  status text not null default 'queued' check (status in ('queued','copying','verifying','ready_to_switch','switched','retention_period','completed','failed','cancelled','rolled_back')),
  bytes_total bigint not null default 0 check (bytes_total >= 0),
  bytes_transferred bigint not null default 0 check (bytes_transferred >= 0 and bytes_transferred <= bytes_total),
  checksum_verified boolean not null default false,
  verification_details jsonb not null default '{}'::jsonb check (jsonb_typeof(verification_details) = 'object'),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error_code text,
  last_error_message text,
  retain_source_until timestamptz,
  started_at timestamptz,
  verified_at timestamptz,
  switched_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (media_object_id, owner_user_id)
    references public.external_media_objects(id, owner_user_id) on delete restrict,
  foreign key (destination_connection_id, owner_user_id)
    references public.storage_connections(id, owner_user_id) on delete restrict,
  check (source_provider <> 'supabase' or (source_bucket is not null and source_path is not null))
);

create index if not exists storage_migrations_owner_status_idx
on public.storage_migrations(owner_user_id, status, created_at);
create index if not exists storage_migrations_recovery_idx
on public.storage_migrations(status, updated_at)
where status in ('queued','copying','verifying','failed');

create or replace function private.touch_external_storage_updated_at()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists storage_connections_touch_updated_at on public.storage_connections;
create trigger storage_connections_touch_updated_at before update on public.storage_connections
for each row execute function private.touch_external_storage_updated_at();
drop trigger if exists external_media_objects_touch_updated_at on public.external_media_objects;
create trigger external_media_objects_touch_updated_at before update on public.external_media_objects
for each row execute function private.touch_external_storage_updated_at();
drop trigger if exists storage_migrations_touch_updated_at on public.storage_migrations;
create trigger storage_migrations_touch_updated_at before update on public.storage_migrations
for each row execute function private.touch_external_storage_updated_at();

create or replace function private.is_published_creative_storage_owner(check_user_id uuid)
returns boolean language sql stable security definer
set search_path = public, private, pg_temp as $$
  select exists (
    select 1
    from public.admin_users team_member
    join public.creative_members creative on creative.id = team_member.creative_member_id
    where team_member.user_id = check_user_id
      and team_member.status = 'active'
      and team_member.role = 'creative'
      and creative.is_published = true
  );
$$;

revoke all on function private.is_published_creative_storage_owner(uuid) from public, anon;
grant execute on function private.is_published_creative_storage_owner(uuid) to authenticated;

alter table public.storage_connections enable row level security;
alter table public.external_media_objects enable row level security;
alter table public.storage_migrations enable row level security;

-- Owners can see only their own connection record. The credential_secret_id is an
-- opaque Vault reference, never an OAuth credential. Vault tables are not exposed.
create policy "Published creatives can read own storage connections"
on public.storage_connections for select to authenticated
using (owner_user_id = auth.uid() and private.is_published_creative_storage_owner(auth.uid()));

-- A client may create only its own empty pending connection request. Provider
-- identity, account metadata, status, capabilities, and secret references are set later by service-role code.
create policy "Published creatives can create own pending storage connection"
on public.storage_connections for insert to authenticated
with check (
  owner_user_id = auth.uid()
  and private.is_published_creative_storage_owner(auth.uid())
  and status = 'pending'
  and provider_account_id is null
  and provider_account_email is null
  and root_folder_id is null
  and credential_secret_id is null
  and capabilities = '{}'::jsonb
  and connected_at is null
  and last_verified_at is null
  and last_error_code is null
  and last_error_message is null
  and is_default = false
);

-- Column grants below limit owner updates to presentation/default preferences.
-- Ownership, provider identity, account identity, credentials, status, and errors are immutable from clients.
create policy "Published creatives can update safe own connection settings"
on public.storage_connections for update to authenticated
using (owner_user_id = auth.uid() and private.is_published_creative_storage_owner(auth.uid()))
with check (owner_user_id = auth.uid() and private.is_published_creative_storage_owner(auth.uid()));

create policy "Published creatives can read own external media metadata"
on public.external_media_objects for select to authenticated
using (owner_user_id = auth.uid() and private.is_published_creative_storage_owner(auth.uid()));

create policy "Published creatives can read own storage migrations"
on public.storage_migrations for select to authenticated
using (owner_user_id = auth.uid() and private.is_published_creative_storage_owner(auth.uid()));

revoke all on public.storage_connections from public, anon, authenticated;
revoke all on public.external_media_objects from public, anon, authenticated;
revoke all on public.storage_migrations from public, anon, authenticated;
grant select, insert on public.storage_connections to authenticated;
grant update (display_name, is_default) on public.storage_connections to authenticated;
grant select on public.external_media_objects to authenticated;
grant select on public.storage_migrations to authenticated;

-- Super Admin access is deliberately exposed through safe read-only views rather
-- than the base tables. These views omit credential_secret_id, provider account IDs,
-- file IDs, paths, checksums, arbitrary metadata, and verification details.
create or replace view public.storage_connection_operations
with (security_barrier = true) as
select id, owner_user_id, provider, provider_account_email, display_name, status, is_default,
       connected_at, last_verified_at, last_error_code, last_error_message, created_at, updated_at
from public.storage_connections
where private.has_role(auth.uid(), array['super_admin']);

create or replace view public.storage_migration_operations
with (security_barrier = true) as
select id, owner_user_id, source_provider, destination_provider, status,
       bytes_total, bytes_transferred, checksum_verified, attempt_count,
       last_error_code, last_error_message, retain_source_until,
       started_at, verified_at, switched_at, completed_at, created_at, updated_at
from public.storage_migrations
where private.has_role(auth.uid(), array['super_admin']);

revoke all on public.storage_connection_operations from public, anon, authenticated;
revoke all on public.storage_migration_operations from public, anon, authenticated;
grant select on public.storage_connection_operations to authenticated;
grant select on public.storage_migration_operations to authenticated;

comment on table public.storage_connections is 'Provider-neutral connection metadata. OAuth credentials live outside public tables and are referenced only by credential_secret_id.';
comment on table public.external_media_objects is 'Normalized metadata for Supabase and future externally stored media. Existing media rows do not require backfill.';
comment on table public.storage_migrations is 'Future copy/verify/switch/retain migration state. Phase 1 creates no jobs.';
comment on column public.storage_connections.credential_secret_id is 'Opaque reference to a server-only secret; never an OAuth token and never returned by operational views.';

notify pgrst, 'reload schema';

commit;
