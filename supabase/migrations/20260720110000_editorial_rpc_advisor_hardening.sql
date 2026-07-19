begin;

do $$
declare
  required_function text;
begin
  foreach required_function in array array[
    'public.save_editorial_revision(uuid,jsonb,text,text,text,uuid,jsonb)',
    'public.submit_editorial_post(uuid)',
    'public.start_editorial_revision(uuid)',
    'public.request_editorial_changes(uuid,text)',
    'public.approve_editorial_post(uuid,text)',
    'public.schedule_editorial_post(uuid,timestamptz)',
    'public.publish_editorial_post(uuid)',
    'public.archive_editorial_post(uuid,text)',
    'public.restore_editorial_revision(uuid,uuid)',
    'public.restore_archived_editorial_post(uuid)'
  ] loop
    if to_regprocedure(required_function) is null then
      raise exception 'Editorial RPC hardening preflight failed; missing function: %',required_function;
    end if;
  end loop;

  if to_regclass('public.admin_member_lifecycle_snapshots') is null then
    raise exception 'Advisor hardening preflight failed; missing table: public.admin_member_lifecycle_snapshots';
  end if;
end;
$$;

create or replace function public.execute_editorial_action_as_service(
  p_actor_user_id uuid,
  p_action text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog
as $$
declare
  v_payload jsonb:=coalesce(p_payload,'{}'::jsonb);
  v_post_id uuid;
  v_result jsonb;
begin
  if auth.role()<>'service_role' then
    raise exception 'EDITORIAL_SERVICE_ROLE_REQUIRED' using errcode='42501';
  end if;
  if p_actor_user_id is null then
    raise exception 'EDITORIAL_ACTOR_REQUIRED' using errcode='22023';
  end if;
  if jsonb_typeof(v_payload)<>'object' then
    raise exception 'EDITORIAL_PAYLOAD_INVALID' using errcode='22023';
  end if;
  if p_action is null or p_action not in(
    'save_revision','submit','start_revision','request_changes','approve',
    'schedule','publish','archive','restore_revision','restore_archived'
  ) then
    raise exception 'EDITORIAL_ACTION_INVALID' using errcode='22023';
  end if;

  begin
    v_post_id:=nullif(v_payload->>'postId','')::uuid;
  exception when invalid_text_representation then
    raise exception 'EDITORIAL_POST_ID_INVALID' using errcode='22023';
  end;
  if v_post_id is null then
    raise exception 'EDITORIAL_POST_ID_INVALID' using errcode='22023';
  end if;

  perform pg_catalog.set_config('request.jwt.claim.sub',p_actor_user_id::text,true);
  perform pg_catalog.set_config('request.jwt.claim.role','authenticated',true);
  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object('sub',p_actor_user_id,'role','authenticated')::text,
    true
  );

  if p_action='save_revision' then
    select pg_catalog.to_jsonb(result) into v_result
    from public.save_editorial_revision(
      v_post_id,
      v_payload->'document',
      pg_catalog.left(coalesce(v_payload->>'seoTitle',''),180),
      pg_catalog.left(coalesce(v_payload->>'seoDescription',''),320),
      pg_catalog.left(coalesce(v_payload->>'editorNote',''),1000),
      nullif(v_payload->>'expectedCurrentRevisionId','')::uuid,
      coalesce(v_payload->'metadata','{}'::jsonb)
    ) result;
  elsif p_action='submit' then
    select pg_catalog.to_jsonb(result) into v_result from public.submit_editorial_post(v_post_id) result;
  elsif p_action='start_revision' then
    select pg_catalog.to_jsonb(result) into v_result from public.start_editorial_revision(v_post_id) result;
  elsif p_action='request_changes' then
    select pg_catalog.to_jsonb(result) into v_result from public.request_editorial_changes(v_post_id,pg_catalog.left(coalesce(v_payload->>'note',''),500)) result;
  elsif p_action='approve' then
    select pg_catalog.to_jsonb(result) into v_result from public.approve_editorial_post(v_post_id,pg_catalog.left(coalesce(v_payload->>'note',''),500)) result;
  elsif p_action='schedule' then
    select pg_catalog.to_jsonb(result) into v_result from public.schedule_editorial_post(v_post_id,nullif(v_payload->>'scheduledFor','')::timestamptz) result;
  elsif p_action='publish' then
    select pg_catalog.to_jsonb(result) into v_result from public.publish_editorial_post(v_post_id) result;
  elsif p_action='archive' then
    select pg_catalog.to_jsonb(result) into v_result from public.archive_editorial_post(v_post_id,pg_catalog.left(coalesce(v_payload->>'note',''),500)) result;
  elsif p_action='restore_revision' then
    select pg_catalog.to_jsonb(result) into v_result from public.restore_editorial_revision(v_post_id,nullif(v_payload->>'revisionId','')::uuid) result;
  elsif p_action='restore_archived' then
    select pg_catalog.to_jsonb(result) into v_result from public.restore_archived_editorial_post(v_post_id) result;
  end if;

  return v_result;
end;
$$;

revoke all on function public.save_editorial_revision(uuid,jsonb,text,text,text,uuid,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.submit_editorial_post(uuid) from public,anon,authenticated,service_role;
revoke all on function public.start_editorial_revision(uuid) from public,anon,authenticated,service_role;
revoke all on function public.request_editorial_changes(uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.approve_editorial_post(uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.schedule_editorial_post(uuid,timestamptz) from public,anon,authenticated,service_role;
revoke all on function public.publish_editorial_post(uuid) from public,anon,authenticated,service_role;
revoke all on function public.archive_editorial_post(uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.restore_editorial_revision(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.restore_archived_editorial_post(uuid) from public,anon,authenticated,service_role;
revoke all on function public.execute_editorial_action_as_service(uuid,text,jsonb) from public,anon,authenticated,service_role;

grant execute on function public.save_editorial_revision(uuid,jsonb,text,text,text,uuid,jsonb) to service_role;
grant execute on function public.submit_editorial_post(uuid) to service_role;
grant execute on function public.start_editorial_revision(uuid) to service_role;
grant execute on function public.request_editorial_changes(uuid,text) to service_role;
grant execute on function public.approve_editorial_post(uuid,text) to service_role;
grant execute on function public.schedule_editorial_post(uuid,timestamptz) to service_role;
grant execute on function public.publish_editorial_post(uuid) to service_role;
grant execute on function public.archive_editorial_post(uuid,text) to service_role;
grant execute on function public.restore_editorial_revision(uuid,uuid) to service_role;
grant execute on function public.restore_archived_editorial_post(uuid) to service_role;
grant execute on function public.execute_editorial_action_as_service(uuid,text,jsonb) to service_role;

drop policy if exists admin_member_lifecycle_snapshots_deny_clients on public.admin_member_lifecycle_snapshots;
create policy admin_member_lifecycle_snapshots_deny_clients
on public.admin_member_lifecycle_snapshots
as restrictive
for all
to anon,authenticated
using(false)
with check(false);

do $$
declare
  hardened_function text;
begin
  foreach hardened_function in array array[
    'public.save_editorial_revision(uuid,jsonb,text,text,text,uuid,jsonb)',
    'public.submit_editorial_post(uuid)',
    'public.start_editorial_revision(uuid)',
    'public.request_editorial_changes(uuid,text)',
    'public.approve_editorial_post(uuid,text)',
    'public.schedule_editorial_post(uuid,timestamptz)',
    'public.publish_editorial_post(uuid)',
    'public.archive_editorial_post(uuid,text)',
    'public.restore_editorial_revision(uuid,uuid)',
    'public.restore_archived_editorial_post(uuid)'
  ] loop
    if pg_catalog.has_function_privilege('anon',hardened_function,'EXECUTE')
       or pg_catalog.has_function_privilege('authenticated',hardened_function,'EXECUTE')
       or not pg_catalog.has_function_privilege('service_role',hardened_function,'EXECUTE') then
      raise exception 'Editorial RPC hardening postcondition failed: %',hardened_function;
    end if;
  end loop;

  if pg_catalog.has_function_privilege('anon','public.execute_editorial_action_as_service(uuid,text,jsonb)','EXECUTE')
     or pg_catalog.has_function_privilege('authenticated','public.execute_editorial_action_as_service(uuid,text,jsonb)','EXECUTE')
     or not pg_catalog.has_function_privilege('service_role','public.execute_editorial_action_as_service(uuid,text,jsonb)','EXECUTE') then
    raise exception 'Editorial service bridge grants are incorrect.';
  end if;
end;
$$;

comment on function public.execute_editorial_action_as_service(uuid,text,jsonb) is
  'Service-only bridge for the editorial-workflow Edge Function. It restores the verified actor identity before delegating to the existing capability-checked editorial RPCs.';

notify pgrst,'reload schema';
commit;
