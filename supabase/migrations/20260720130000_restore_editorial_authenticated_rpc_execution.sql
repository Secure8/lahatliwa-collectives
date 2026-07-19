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
      raise exception 'Editorial authenticated RPC grant preflight failed; missing function: %', required_function;
    end if;
  end loop;

  if to_regprocedure('public.execute_editorial_action_as_service(uuid,text,jsonb)') is null then
    raise exception 'Editorial authenticated RPC grant preflight failed; missing service bridge.';
  end if;
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

grant execute on function public.save_editorial_revision(uuid,jsonb,text,text,text,uuid,jsonb) to authenticated;
grant execute on function public.submit_editorial_post(uuid) to authenticated;
grant execute on function public.start_editorial_revision(uuid) to authenticated;
grant execute on function public.request_editorial_changes(uuid,text) to authenticated;
grant execute on function public.approve_editorial_post(uuid,text) to authenticated;
grant execute on function public.schedule_editorial_post(uuid,timestamptz) to authenticated;
grant execute on function public.publish_editorial_post(uuid) to authenticated;
grant execute on function public.archive_editorial_post(uuid,text) to authenticated;
grant execute on function public.restore_editorial_revision(uuid,uuid) to authenticated;
grant execute on function public.restore_archived_editorial_post(uuid) to authenticated;

revoke all on function public.execute_editorial_action_as_service(uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.execute_editorial_action_as_service(uuid,text,jsonb) to service_role;

do $$
declare
  authenticated_function text;
begin
  foreach authenticated_function in array array[
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
    if pg_catalog.has_function_privilege('anon', authenticated_function, 'EXECUTE')
       or not pg_catalog.has_function_privilege('authenticated', authenticated_function, 'EXECUTE')
       or pg_catalog.has_function_privilege('service_role', authenticated_function, 'EXECUTE') then
      raise exception 'Editorial authenticated RPC grant postcondition failed: %', authenticated_function;
    end if;
  end loop;

  if pg_catalog.has_function_privilege('anon', 'public.execute_editorial_action_as_service(uuid,text,jsonb)', 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', 'public.execute_editorial_action_as_service(uuid,text,jsonb)', 'EXECUTE')
     or not pg_catalog.has_function_privilege('service_role', 'public.execute_editorial_action_as_service(uuid,text,jsonb)', 'EXECUTE') then
    raise exception 'Editorial service bridge grants are incorrect.';
  end if;
end;
$$;

comment on function public.save_editorial_revision(uuid,jsonb,text,text,text,uuid,jsonb) is
  'Authenticated Editorial revision RPC. The function retains role, ownership, status, document, metadata, and revision-conflict validation.';

notify pgrst, 'reload schema';

commit;
