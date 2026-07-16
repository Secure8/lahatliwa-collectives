-- Security Advisor hardening for public-media usage and inquiry RPCs.
-- This migration intentionally does not alter pg_net. The installed extension is
-- used by the cleanup cron and must be handled separately after live dependency
-- inspection in a maintenance window.

begin;

do $$
declare
  missing_objects text[] := array[]::text[];
  external_media_rls boolean;
begin
  if to_regclass('public.storage_usage_by_owner') is null then missing_objects := array_append(missing_objects, 'public.storage_usage_by_owner'); end if;
  if to_regclass('public.storage_usage_by_project') is null then missing_objects := array_append(missing_objects, 'public.storage_usage_by_project'); end if;
  if to_regclass('public.storage_usage_by_creative') is null then missing_objects := array_append(missing_objects, 'public.storage_usage_by_creative'); end if;
  if to_regprocedure('public.get_my_public_media_usage()') is null then missing_objects := array_append(missing_objects, 'public.get_my_public_media_usage()'); end if;
  if to_regprocedure('public.list_eligible_inquiry_creatives()') is null then missing_objects := array_append(missing_objects, 'public.list_eligible_inquiry_creatives()'); end if;
  if to_regprocedure('public.list_inquiry_team_members()') is null then missing_objects := array_append(missing_objects, 'public.list_inquiry_team_members()'); end if;
  if to_regprocedure('public.perform_team_inquiry_action(uuid,text,jsonb)') is null then missing_objects := array_append(missing_objects, 'public.perform_team_inquiry_action(uuid,text,jsonb)'); end if;

  if cardinality(missing_objects) > 0 then
    raise exception 'Security hardening preflight failed; missing objects: %', array_to_string(missing_objects, ', ');
  end if;

  select c.relrowsecurity
    into external_media_rls
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'external_media_objects';

  if external_media_rls is distinct from true then
    raise exception 'Security hardening preflight failed: RLS must be enabled on public.external_media_objects.';
  end if;
end;
$$;

alter view public.storage_usage_by_owner set (security_invoker = true, security_barrier = true);
alter view public.storage_usage_by_project set (security_invoker = true, security_barrier = true);
alter view public.storage_usage_by_creative set (security_invoker = true, security_barrier = true);

revoke all on table public.storage_usage_by_owner from public, anon, authenticated, service_role;
revoke all on table public.storage_usage_by_project from public, anon, authenticated, service_role;
revoke all on table public.storage_usage_by_creative from public, anon, authenticated, service_role;

create or replace function public.get_my_public_media_usage()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select pg_catalog.jsonb_build_object(
    'activeR2Bytes', coalesce(pg_catalog.sum(coalesce(media.trusted_size_bytes, media.uploaded_bytes, media.size_bytes)) filter(where media.provider = 'cloudflare_r2' and media.accounting_state = 'active' and media.status = 'available'), 0),
    'legacySupabaseBytes', coalesce(pg_catalog.sum(coalesce(media.trusted_size_bytes, media.size_bytes)) filter(where media.provider = 'supabase' and media.accounting_state = 'legacy' and media.status = 'available'), 0),
    'retainedBytes', coalesce(pg_catalog.sum(coalesce(media.trusted_size_bytes, media.size_bytes)) filter(where media.accounting_state = 'retained_duplicate'), 0),
    'provisionalBytes', coalesce(pg_catalog.sum(coalesce(media.trusted_size_bytes, media.uploaded_bytes, 0)) filter(where media.accounting_state = 'provisional'), 0),
    'pendingCleanupBytes', coalesce(pg_catalog.sum(coalesce(media.trusted_size_bytes, media.size_bytes)) filter(where media.accounting_state in ('pending_cleanup', 'reclaimable')), 0),
    'objectCount', pg_catalog.count(*),
    'mediaGroupCount', pg_catalog.count(distinct media.media_group_id)
  )
  from public.external_media_objects media
  where media.owner_user_id = auth.uid();
$$;

-- No application caller currently uses this own-usage RPC. Keep it available to
-- protected backend code only instead of exposing a definer function broadly.
revoke all on function public.get_my_public_media_usage() from public, anon, authenticated, service_role;
grant execute on function public.get_my_public_media_usage() to service_role;

alter function public.list_eligible_inquiry_creatives() set search_path = pg_catalog;
alter function public.list_inquiry_team_members() set search_path = pg_catalog;
alter function public.perform_team_inquiry_action(uuid, text, jsonb) set search_path = pg_catalog;

-- Frontend callers are moved to narrowly scoped Edge Function actions. The old
-- definer entry points remain for migration compatibility but are not exposed.
revoke all on function public.list_eligible_inquiry_creatives() from public, anon, authenticated, service_role;
revoke all on function public.list_inquiry_team_members() from public, anon, authenticated, service_role;
revoke all on function public.perform_team_inquiry_action(uuid, text, jsonb) from public, anon, authenticated, service_role;

create or replace function public.perform_team_inquiry_action_as_service(
  p_actor_user_id uuid,
  p_inquiry_id uuid,
  p_action text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  result jsonb;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required.' using errcode = '42501';
  end if;
  if p_actor_user_id is null then
    raise exception 'Actor user ID is required.' using errcode = '22023';
  end if;

  -- Preserve the existing transaction, row lock, action allowlist, role checks,
  -- and auth.uid()-based audit behavior while entering from a protected backend.
  perform pg_catalog.set_config('request.jwt.claim.sub', p_actor_user_id::text, true);
  perform pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object('sub', p_actor_user_id, 'role', 'authenticated')::text,
    true
  );

  result := public.perform_team_inquiry_action(p_inquiry_id, p_action, coalesce(p_payload, '{}'::jsonb));
  return result;
end;
$$;

revoke all on function public.perform_team_inquiry_action_as_service(uuid, uuid, text, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.perform_team_inquiry_action_as_service(uuid, uuid, text, jsonb) to service_role;

comment on function public.perform_team_inquiry_action_as_service(uuid, uuid, text, jsonb) is
  'Service-only bridge used by inquiry-workflow after JWT validation; delegates complete authorization to perform_team_inquiry_action under the authenticated actor identity.';

do $$
declare
  view_name text;
  view_options text[];
begin
  foreach view_name in array array['storage_usage_by_owner', 'storage_usage_by_project', 'storage_usage_by_creative'] loop
    select c.reloptions into view_options
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = view_name;
    if not ('security_invoker=true' = any(coalesce(view_options, array[]::text[]))) then
      raise exception 'Postcondition failed: public.% is not security invoker.', view_name;
    end if;
    if has_table_privilege('anon', pg_catalog.format('public.%I', view_name), 'SELECT')
       or has_table_privilege('authenticated', pg_catalog.format('public.%I', view_name), 'SELECT') then
      raise exception 'Postcondition failed: public.% remains directly readable.', view_name;
    end if;
  end loop;

  if has_function_privilege('anon', 'public.get_my_public_media_usage()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.get_my_public_media_usage()', 'EXECUTE') then
    raise exception 'Postcondition failed: get_my_public_media_usage remains broadly executable.';
  end if;
  if not has_function_privilege('service_role', 'public.get_my_public_media_usage()', 'EXECUTE') then
    raise exception 'Postcondition failed: service_role cannot execute get_my_public_media_usage.';
  end if;

  if has_function_privilege('anon', 'public.list_eligible_inquiry_creatives()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.list_eligible_inquiry_creatives()', 'EXECUTE')
     or has_function_privilege('anon', 'public.list_inquiry_team_members()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.list_inquiry_team_members()', 'EXECUTE')
     or has_function_privilege('anon', 'public.perform_team_inquiry_action(uuid,text,jsonb)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.perform_team_inquiry_action(uuid,text,jsonb)', 'EXECUTE') then
    raise exception 'Postcondition failed: an inquiry definer function remains broadly executable.';
  end if;

  if has_function_privilege('anon', 'public.perform_team_inquiry_action_as_service(uuid,uuid,text,jsonb)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.perform_team_inquiry_action_as_service(uuid,uuid,text,jsonb)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.perform_team_inquiry_action_as_service(uuid,uuid,text,jsonb)', 'EXECUTE') then
    raise exception 'Postcondition failed: service inquiry bridge grants are incorrect.';
  end if;
end;
$$;

notify pgrst, 'reload schema';
commit;
