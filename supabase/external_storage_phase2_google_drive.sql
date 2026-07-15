-- Phase 2 Google Drive connection management. REVIEW ONLY; DO NOT APPLY automatically.
-- Requires supabase/external_storage_phase1.sql and the Supabase Vault extension.
-- This phase creates OAuth connection metadata and managed Drive folders only. It does
-- not upload, copy, migrate, publish, or delete project/profile media.

begin;

create extension if not exists supabase_vault with schema vault;

alter table public.storage_connections
  add column if not exists granted_scopes text[] not null default '{}'::text[],
  add column if not exists folder_ids jsonb not null default '{}'::jsonb,
  add column if not exists root_folder_health text not null default 'unknown'
    check (root_folder_health in ('unknown','healthy','missing','inaccessible','ambiguous')),
  add column if not exists disconnected_at timestamptz;

drop index if exists public.storage_connections_provider_account_unique_idx;

create unique index if not exists storage_connections_google_account_owner_unique_idx
on public.storage_connections(provider, provider_account_id)
where provider = 'google_drive'
  and provider_account_id is not null
  and status not in ('revoked','disabled');

create table if not exists private.external_storage_oauth_states (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider = 'google_drive'),
  state_hash text not null unique,
  pkce_verifier_secret_id uuid not null,
  reconnect_connection_id uuid,
  return_path text not null default '/admin/storage'
    check (return_path ~ '^/admin/storage(?:\?.*)?$'),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (reconnect_connection_id, owner_user_id)
    references public.storage_connections(id, owner_user_id) on delete cascade
);

create index if not exists external_storage_oauth_states_expiry_idx
on private.external_storage_oauth_states(expires_at)
where consumed_at is null;

revoke all on private.external_storage_oauth_states from public, anon, authenticated;

create or replace function private.create_provider_secret(
  p_owner_user_id uuid,
  p_provider text,
  p_purpose text,
  p_secret text
) returns uuid
language plpgsql security definer
set search_path = pg_catalog, vault, private, public as $$
declare
  v_secret_id uuid;
begin
  if p_provider <> 'google_drive' or p_purpose not in ('refresh_token','oauth_pkce')
     or nullif(p_secret, '') is null then
    raise exception 'Invalid provider secret request.' using errcode = '22023';
  end if;
  select vault.create_secret(
    p_secret,
    format('external-storage:%s:%s:%s', p_provider, p_purpose, gen_random_uuid()),
    format('Lahat Liwa external storage secret for owner %s', p_owner_user_id)
  ) into v_secret_id;
  return v_secret_id;
end;
$$;

create or replace function private.read_provider_secret(p_secret_id uuid)
returns text
language sql security definer stable
set search_path = pg_catalog, vault as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where id = p_secret_id;
$$;

create or replace function private.delete_provider_secret(p_secret_id uuid)
returns void
language plpgsql security definer
set search_path = pg_catalog, vault as $$
begin
  if p_secret_id is not null then
    delete from vault.secrets where id = p_secret_id;
  end if;
end;
$$;

create or replace function private.replace_provider_secret(
  p_old_secret_id uuid,
  p_owner_user_id uuid,
  p_provider text,
  p_purpose text,
  p_secret text
) returns uuid
language plpgsql security definer
set search_path = pg_catalog, vault, private, public as $$
declare
  v_new_secret_id uuid;
begin
  v_new_secret_id := private.create_provider_secret(p_owner_user_id, p_provider, p_purpose, p_secret);
  perform private.delete_provider_secret(p_old_secret_id);
  return v_new_secret_id;
end;
$$;

revoke all on function private.create_provider_secret(uuid,text,text,text) from public, anon, authenticated;
revoke all on function private.read_provider_secret(uuid) from public, anon, authenticated;
revoke all on function private.delete_provider_secret(uuid) from public, anon, authenticated;
revoke all on function private.replace_provider_secret(uuid,uuid,text,text,text) from public, anon, authenticated;

create or replace function private.is_eligible_storage_owner(check_user_id uuid)
returns boolean language sql stable security definer
set search_path = public, private, pg_temp as $$
  select exists (
    select 1
    from public.admin_users team_member
    left join public.creative_members creative on creative.id = team_member.creative_member_id
    where team_member.user_id = check_user_id
      and team_member.status = 'active'
      and (
        team_member.role in ('super_admin','owner')
        or (team_member.role = 'creative' and creative.is_published = true)
      )
  );
$$;

revoke all on function private.is_eligible_storage_owner(uuid) from public, anon;
grant execute on function private.is_eligible_storage_owner(uuid) to authenticated;

drop policy if exists "Published creatives can read own storage connections" on public.storage_connections;
drop policy if exists "Published creatives can create own pending storage connection" on public.storage_connections;
drop policy if exists "Published creatives can update safe own connection settings" on public.storage_connections;

create policy "Eligible owners can read own storage connections"
on public.storage_connections for select to authenticated
using (owner_user_id = auth.uid() and private.is_eligible_storage_owner(auth.uid()));

create policy "Eligible owners can create own pending storage connection"
on public.storage_connections for insert to authenticated
with check (
  owner_user_id = auth.uid()
  and private.is_eligible_storage_owner(auth.uid())
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

create policy "Eligible owners can update safe own connection settings"
on public.storage_connections for update to authenticated
using (owner_user_id = auth.uid() and private.is_eligible_storage_owner(auth.uid()))
with check (owner_user_id = auth.uid() and private.is_eligible_storage_owner(auth.uid()));

create or replace function private.server_create_external_storage_oauth_state(
  p_owner_user_id uuid,
  p_state_hash text,
  p_pkce_verifier text,
  p_return_path text default '/admin/storage',
  p_reconnect_connection_id uuid default null
) returns uuid
language plpgsql security definer
set search_path = pg_catalog, public, private as $$
declare
  v_state_id uuid;
  v_verifier_secret_id uuid;
begin
  if not private.is_eligible_storage_owner(p_owner_user_id) then
    raise exception 'Storage owner is not eligible.' using errcode = '42501';
  end if;
  if p_state_hash !~ '^[A-Za-z0-9_-]{43}$'
     or length(p_pkce_verifier) < 43
     or p_return_path !~ '^/admin/storage(?:\?.*)?$' then
    raise exception 'Invalid OAuth state payload.' using errcode = '22023';
  end if;
  if p_reconnect_connection_id is not null and not exists (
    select 1 from public.storage_connections
    where id = p_reconnect_connection_id and owner_user_id = p_owner_user_id and provider = 'google_drive'
  ) then
    raise exception 'Connection is unavailable.' using errcode = '22023';
  end if;

  for v_state_id, v_verifier_secret_id in
    select id, pkce_verifier_secret_id
    from private.external_storage_oauth_states
    where expires_at <= now() or consumed_at is not null
    for update
  loop
    perform private.delete_provider_secret(v_verifier_secret_id);
    delete from private.external_storage_oauth_states where id = v_state_id;
  end loop;

  v_verifier_secret_id := private.create_provider_secret(p_owner_user_id, 'google_drive', 'oauth_pkce', p_pkce_verifier);
  insert into private.external_storage_oauth_states(
    owner_user_id, provider, state_hash, pkce_verifier_secret_id,
    reconnect_connection_id, return_path, expires_at
  ) values (
    p_owner_user_id, 'google_drive', p_state_hash, v_verifier_secret_id,
    p_reconnect_connection_id, p_return_path, now() + interval '10 minutes'
  ) returning id into v_state_id;
  return v_state_id;
exception when others then
  perform private.delete_provider_secret(v_verifier_secret_id);
  raise;
end;
$$;

create or replace function private.server_consume_external_storage_oauth_state(p_state_hash text)
returns table(
  owner_user_id uuid,
  reconnect_connection_id uuid,
  return_path text,
  pkce_verifier text,
  expires_at timestamptz
)
language plpgsql security definer
set search_path = pg_catalog, public, private as $$
declare
  v_state private.external_storage_oauth_states%rowtype;
begin
  select * into v_state
  from private.external_storage_oauth_states
  where state_hash = p_state_hash
  for update;
  if not found or v_state.consumed_at is not null or v_state.expires_at <= now() then
    return;
  end if;
  update private.external_storage_oauth_states set consumed_at = now() where id = v_state.id;
  owner_user_id := v_state.owner_user_id;
  reconnect_connection_id := v_state.reconnect_connection_id;
  return_path := v_state.return_path;
  pkce_verifier := private.read_provider_secret(v_state.pkce_verifier_secret_id);
  expires_at := v_state.expires_at;
  perform private.delete_provider_secret(v_state.pkce_verifier_secret_id);
  return next;
end;
$$;

create or replace function private.server_read_storage_connection_secret(
  p_owner_user_id uuid,
  p_connection_id uuid
) returns text
language plpgsql security definer
set search_path = pg_catalog, public, private as $$
declare
  v_secret_id uuid;
begin
  select credential_secret_id into v_secret_id
  from public.storage_connections
  where id = p_connection_id and owner_user_id = p_owner_user_id and provider = 'google_drive';
  if v_secret_id is null then return null; end if;
  return private.read_provider_secret(v_secret_id);
end;
$$;

create or replace function private.server_upsert_google_drive_connection(
  p_owner_user_id uuid,
  p_connection_id uuid,
  p_provider_account_id text,
  p_provider_account_email text,
  p_display_name text,
  p_root_folder_id text,
  p_folder_ids jsonb,
  p_granted_scopes text[],
  p_refresh_token text default null
) returns uuid
language plpgsql security definer
set search_path = pg_catalog, public, private as $$
declare
  v_connection public.storage_connections%rowtype;
  v_new_secret_id uuid;
  v_result_id uuid;
begin
  if not private.is_eligible_storage_owner(p_owner_user_id) then
    raise exception 'Storage owner is not eligible.' using errcode = '42501';
  end if;
  if nullif(p_provider_account_id, '') is null or nullif(p_provider_account_email, '') is null
     or nullif(p_root_folder_id, '') is null
     or not ('https://www.googleapis.com/auth/drive.file' = any(p_granted_scopes)) then
    raise exception 'Incomplete Google Drive connection metadata.' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.storage_connections
    where provider = 'google_drive' and provider_account_id = p_provider_account_id
      and owner_user_id <> p_owner_user_id and status not in ('revoked','disabled')
  ) then
    raise exception 'Google account is already connected.' using errcode = '23505';
  end if;

  if p_connection_id is not null then
    select * into v_connection from public.storage_connections
    where id = p_connection_id and owner_user_id = p_owner_user_id and provider = 'google_drive'
    for update;
    if not found then raise exception 'Connection is unavailable.' using errcode = '22023'; end if;
    if v_connection.provider_account_id is not null
       and v_connection.provider_account_id <> p_provider_account_id then
      raise exception 'Reconnect account does not match.' using errcode = 'P0001';
    end if;
  else
    select * into v_connection from public.storage_connections
    where owner_user_id = p_owner_user_id and provider = 'google_drive'
      and status not in ('revoked','disabled')
    order by created_at desc limit 1 for update;
  end if;

  if nullif(p_refresh_token, '') is not null then
    v_new_secret_id := private.create_provider_secret(p_owner_user_id, 'google_drive', 'refresh_token', p_refresh_token);
  elsif v_connection.credential_secret_id is null then
    raise exception 'Google did not provide a refresh token.' using errcode = 'P0002';
  end if;

  if v_connection.id is null then
    insert into public.storage_connections(
      owner_user_id, provider, provider_account_id, provider_account_email, display_name,
      root_folder_id, folder_ids, root_folder_health, credential_secret_id, status,
      capabilities, granted_scopes, connected_at, last_verified_at,
      last_error_code, last_error_message, disconnected_at
    ) values (
      p_owner_user_id, 'google_drive', p_provider_account_id, lower(p_provider_account_email), p_display_name,
      p_root_folder_id, coalesce(p_folder_ids, '{}'::jsonb), 'healthy', v_new_secret_id, 'connected',
      jsonb_build_object('connect', true, 'disconnect', true, 'verifyConnection', true,
        'createRootFolder', true, 'upload', false, 'migration', false),
      p_granted_scopes, now(), now(), null, null, null
    ) returning id into v_result_id;
  else
    update public.storage_connections set
      provider_account_id = p_provider_account_id,
      provider_account_email = lower(p_provider_account_email),
      display_name = p_display_name,
      root_folder_id = p_root_folder_id,
      folder_ids = coalesce(p_folder_ids, '{}'::jsonb),
      root_folder_health = 'healthy',
      credential_secret_id = coalesce(v_new_secret_id, v_connection.credential_secret_id),
      status = 'connected',
      capabilities = jsonb_build_object('connect', true, 'disconnect', true, 'verifyConnection', true,
        'createRootFolder', true, 'upload', false, 'migration', false),
      granted_scopes = p_granted_scopes,
      connected_at = coalesce(connected_at, now()),
      last_verified_at = now(),
      last_error_code = null,
      last_error_message = null,
      disconnected_at = null
    where id = v_connection.id returning id into v_result_id;
    if v_new_secret_id is not null then
      perform private.delete_provider_secret(v_connection.credential_secret_id);
    end if;
  end if;
  return v_result_id;
exception when others then
  perform private.delete_provider_secret(v_new_secret_id);
  raise;
end;
$$;

create or replace function private.server_disconnect_google_drive_connection(
  p_owner_user_id uuid,
  p_connection_id uuid,
  p_revoked_at_provider boolean
) returns void
language plpgsql security definer
set search_path = pg_catalog, public, private as $$
declare
  v_secret_id uuid;
begin
  select credential_secret_id into v_secret_id
  from public.storage_connections
  where id = p_connection_id and owner_user_id = p_owner_user_id and provider = 'google_drive'
  for update;
  if not found then raise exception 'Connection is unavailable.' using errcode = '22023'; end if;
  update public.storage_connections set
    credential_secret_id = null,
    status = case when p_revoked_at_provider then 'revoked' else 'disabled' end,
    is_default = false,
    disconnected_at = now(),
    last_error_code = case when p_revoked_at_provider then null else 'PROVIDER_REVOCATION_FAILED' end,
    last_error_message = case when p_revoked_at_provider then null else 'Google could not confirm token revocation. The local credential was removed.' end
  where id = p_connection_id;
  perform private.delete_provider_secret(v_secret_id);
end;
$$;

-- These functions stay outside the Data API schemas. Edge Functions call them through
-- the platform-provided direct Postgres connection; browser and service-role API clients
-- cannot execute them, and no decrypted value crosses an exposed schema or view.
revoke all on function private.server_create_external_storage_oauth_state(uuid,text,text,text,uuid) from public, anon, authenticated, service_role;
revoke all on function private.server_consume_external_storage_oauth_state(text) from public, anon, authenticated, service_role;
revoke all on function private.server_read_storage_connection_secret(uuid,uuid) from public, anon, authenticated, service_role;
revoke all on function private.server_upsert_google_drive_connection(uuid,uuid,text,text,text,text,jsonb,text[],text) from public, anon, authenticated, service_role;
revoke all on function private.server_disconnect_google_drive_connection(uuid,uuid,boolean) from public, anon, authenticated, service_role;

drop view if exists public.storage_connection_operations;

create view public.storage_connection_operations
with (security_barrier = true) as
select id, owner_user_id, provider, provider_account_email, display_name, status, is_default,
       root_folder_health, connected_at, last_verified_at, disconnected_at,
       last_error_code, last_error_message, created_at, updated_at
from public.storage_connections
where private.has_role(auth.uid(), array['super_admin']);

revoke all on public.storage_connection_operations from public, anon, authenticated;
grant select on public.storage_connection_operations to authenticated;

comment on table private.external_storage_oauth_states is 'Hashed, short-lived, one-time OAuth state. PKCE verifiers are referenced from Vault and deleted on consumption.';
comment on column public.storage_connections.folder_ids is 'Private managed-folder identifiers. Excluded from operational views.';
comment on column public.storage_connections.granted_scopes is 'Server-verified Google OAuth scopes. Excluded from operational views.';

notify pgrst, 'reload schema';

commit;