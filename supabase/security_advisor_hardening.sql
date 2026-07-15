-- Supabase Security Advisor hardening for Lahat Liwa Collectives.
-- REVIEW ONLY: do not apply without explicit production approval.
-- Idempotent against the production schema audited on 2026-07-15.

begin;

do $preflight$
begin
  if to_regclass('public.storage_connection_operations') is null
    or to_regclass('public.storage_migration_operations') is null
    or to_regclass('public.storage_connections') is null
    or to_regclass('public.storage_migrations') is null
  then
    raise exception 'Required external-storage relations are missing.';
  end if;

  if to_regprocedure('public.list_eligible_inquiry_creatives()') is null
    or to_regprocedure('public.list_inquiry_team_members()') is null
    or to_regprocedure('public.perform_team_inquiry_action(uuid,text,jsonb)') is null
    or to_regprocedure('private.user_role(uuid)') is null
    or to_regprocedure('private.has_role(uuid,text[])') is null
    or to_regprocedure('private.is_active_inquiry_team_member(uuid)') is null
  then
    raise exception 'Required inquiry authorization functions are missing.';
  end if;
end;
$preflight$;

-- These views intentionally expose only operational fields to Super Admins. Make
-- the caller's RLS policies authoritative instead of relying on the view owner.
alter view public.storage_connection_operations
  set (security_invoker = true, security_barrier = true);

alter view public.storage_migration_operations
  set (security_invoker = true, security_barrier = true);

drop policy if exists "Super Admins can read storage connection operations"
  on public.storage_connections;
create policy "Super Admins can read storage connection operations"
  on public.storage_connections
  for select
  to authenticated
  using ((select private.has_role(auth.uid(), array['super_admin'])));

drop policy if exists "Super Admins can read storage migration operations"
  on public.storage_migrations;
create policy "Super Admins can read storage migration operations"
  on public.storage_migrations
  for select
  to authenticated
  using ((select private.has_role(auth.uid(), array['super_admin'])));

-- An invoker view requires underlying SELECT privileges. Keep the Phase 3 safe
-- connection fields and prevent direct reads of provider IDs, Vault references,
-- managed-folder IDs, and granted-scope internals.
revoke select on table public.storage_connections from authenticated;
revoke select (
  provider_account_id,
  root_folder_id,
  credential_secret_id,
  folder_ids,
  granted_scopes
) on table public.storage_connections from authenticated;
grant select (
  id,
  owner_user_id,
  provider,
  provider_account_email,
  display_name,
  status,
  is_default,
  capabilities,
  connected_at,
  last_verified_at,
  last_error_code,
  last_error_message,
  created_at,
  updated_at,
  root_folder_health,
  disconnected_at
) on table public.storage_connections to authenticated;

-- No application code reads storage_migrations directly. Restrict authenticated
-- reads to the operational view's fields before allowing Super Admin RLS access.
revoke select on table public.storage_migrations from authenticated;
revoke select (
  media_object_id,
  destination_connection_id,
  source_bucket,
  source_path,
  destination_file_id,
  verification_details
) on table public.storage_migrations from authenticated;
grant select (
  id,
  owner_user_id,
  source_provider,
  destination_provider,
  status,
  bytes_total,
  bytes_transferred,
  checksum_verified,
  attempt_count,
  last_error_code,
  last_error_message,
  retain_source_until,
  started_at,
  verified_at,
  switched_at,
  completed_at,
  created_at,
  updated_at
) on table public.storage_migrations to authenticated;

revoke all on table public.storage_connection_operations
  from public, anon, authenticated, service_role;
revoke all on table public.storage_migration_operations
  from public, anon, authenticated, service_role;
grant select on table public.storage_connection_operations to authenticated;
grant select on table public.storage_migration_operations to authenticated;

-- Each relation and helper referenced by these SECURITY DEFINER functions is
-- schema-qualified. An empty search_path removes caller-controlled resolution.
alter function private.user_role(uuid) set search_path = '';
alter function private.has_role(uuid, text[]) set search_path = '';
alter function private.is_active_inquiry_team_member(uuid) set search_path = '';
alter function public.list_eligible_inquiry_creatives() set search_path = '';
alter function public.list_inquiry_team_members() set search_path = '';
alter function public.perform_team_inquiry_action(uuid, text, jsonb) set search_path = '';

-- Public inquiry choices must work for signed-out and signed-in visitors. Team
-- RPCs remain authenticated entry points and perform their own active-Team and
-- action-specific authorization checks. No Edge Function calls these RPCs.
revoke all on function public.list_eligible_inquiry_creatives()
  from public, anon, authenticated, service_role;
grant execute on function public.list_eligible_inquiry_creatives()
  to anon, authenticated;

revoke all on function public.list_inquiry_team_members()
  from public, anon, authenticated, service_role;
grant execute on function public.list_inquiry_team_members()
  to authenticated;

revoke all on function public.perform_team_inquiry_action(uuid, text, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.perform_team_inquiry_action(uuid, text, jsonb)
  to authenticated;

-- This private helper is used by authenticated RLS policies. Its implicit PUBLIC
-- execute grant was unnecessary; the private schema is not exposed to the API.
revoke all on function private.is_active_inquiry_team_member(uuid)
  from public, anon, authenticated, service_role;
grant execute on function private.is_active_inquiry_team_member(uuid)
  to authenticated;

do $postconditions$
declare
  connection_options text[];
  migration_options text[];
begin
  select coalesce(c.reloptions, '{}'::text[])
  into connection_options
  from pg_class c
  where c.oid = 'public.storage_connection_operations'::regclass;

  select coalesce(c.reloptions, '{}'::text[])
  into migration_options
  from pg_class c
  where c.oid = 'public.storage_migration_operations'::regclass;

  if not ('security_invoker=true' = any(connection_options))
    or not ('security_invoker=true' = any(migration_options))
  then
    raise exception 'Operational views are not security invokers.';
  end if;

  if has_table_privilege('anon', 'public.storage_connection_operations', 'select')
    or has_table_privilege('anon', 'public.storage_migration_operations', 'select')
    or has_table_privilege('service_role', 'public.storage_connection_operations', 'select')
    or has_table_privilege('service_role', 'public.storage_migration_operations', 'select')
    or not has_table_privilege('authenticated', 'public.storage_connection_operations', 'select')
    or not has_table_privilege('authenticated', 'public.storage_migration_operations', 'select')
  then
    raise exception 'Operational view grants do not match the intended access matrix.';
  end if;

  if has_column_privilege('authenticated', 'public.storage_connections', 'credential_secret_id', 'select')
    or has_column_privilege('authenticated', 'public.storage_connections', 'root_folder_id', 'select')
    or has_column_privilege('authenticated', 'public.storage_migrations', 'source_path', 'select')
    or has_column_privilege('authenticated', 'public.storage_migrations', 'destination_file_id', 'select')
  then
    raise exception 'Sensitive storage columns remain selectable by authenticated.';
  end if;

  if not has_function_privilege('anon', 'public.list_eligible_inquiry_creatives()', 'execute')
    or not has_function_privilege('authenticated', 'public.list_eligible_inquiry_creatives()', 'execute')
    or has_function_privilege('anon', 'public.list_inquiry_team_members()', 'execute')
    or not has_function_privilege('authenticated', 'public.list_inquiry_team_members()', 'execute')
    or has_function_privilege('anon', 'public.perform_team_inquiry_action(uuid,text,jsonb)', 'execute')
    or not has_function_privilege('authenticated', 'public.perform_team_inquiry_action(uuid,text,jsonb)', 'execute')
    or has_function_privilege('service_role', 'public.list_eligible_inquiry_creatives()', 'execute')
    or has_function_privilege('service_role', 'public.list_inquiry_team_members()', 'execute')
    or has_function_privilege('service_role', 'public.perform_team_inquiry_action(uuid,text,jsonb)', 'execute')
    or has_function_privilege('anon', 'private.is_active_inquiry_team_member(uuid)', 'execute')
    or has_function_privilege('service_role', 'private.is_active_inquiry_team_member(uuid)', 'execute')
  then
    raise exception 'Inquiry RPC grants do not match the intended access matrix.';
  end if;
end;
$postconditions$;

comment on view public.storage_connection_operations is
  'Security-invoker operational connection metadata for active Super Admins; underlying RLS is authoritative.';
comment on view public.storage_migration_operations is
  'Security-invoker operational migration metadata for active Super Admins; underlying RLS is authoritative.';
comment on function public.list_eligible_inquiry_creatives() is
  'Intentional public inquiry RPC. Returns only published creatives linked to active Team accounts.';
comment on function public.list_inquiry_team_members() is
  'Intentional authenticated Team RPC. Non-Team callers receive no rows.';
comment on function public.perform_team_inquiry_action(uuid, text, jsonb) is
  'Intentional authenticated Team command boundary with active-Team and action-specific authorization.';

notify pgrst, 'reload schema';

commit;
